import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketTopic,
} from '../../generated/prisma/enums.js';
import { nextPlatformNumber } from '../../platform/shared/platform-sequence.js';
import {
  durationText,
  parseSupportAttachment,
  routeTeam,
  SLA_HOURS,
  TEAM_LABEL,
  TONE_LABEL,
} from '../../platform/support/support-desk.js';
import { SupportNoticesService } from '../../platform/support/support-notices.service.js';
import { addWorkingMs, workingMsBetween } from '../../platform/support/working-time.js';
import { StorageService } from '../../storage/storage.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

const HOUR = 3_600_000;

/** School Admin's categories (its `TICKET_CATEGORIES`): the school's topic and the desk's triage. */
const TOPICS: Record<string, { topic: TicketTopic; category: TicketCategory }> = {
  'Results & report cards': { topic: 'RESULTS_AND_REPORT_CARDS', category: 'ACADEMIC' },
  'Fees & payments': { topic: 'FEES_AND_PAYMENTS', category: 'FINANCE' },
  Communication: { topic: 'COMMUNICATION', category: 'TECHNICAL' },
  'Students & admissions': { topic: 'STUDENTS_AND_ADMISSIONS', category: 'ACADEMIC' },
  'Account & billing': { topic: 'ACCOUNT_AND_BILLING', category: 'BILLING' },
  'Something else': { topic: 'SOMETHING_ELSE', category: 'OTHER' },
};
const TOPIC_LABEL = Object.fromEntries(
  Object.entries(TOPICS).map(([label, t]) => [t.topic, label]),
) as Record<TicketTopic, string>;
/** For tickets EduTrack raised (no topic), the label closest to the desk's category. */
const CATEGORY_TOPIC: Record<TicketCategory, string> = {
  ACCOUNT: 'Account & billing',
  BILLING: 'Account & billing',
  SUBSCRIPTION: 'Account & billing',
  TECHNICAL: 'Communication',
  ACADEMIC: 'Results & report cards',
  FINANCE: 'Fees & payments',
  ACCESS: 'Account & billing',
  OTHER: 'Something else',
};

const PRIORITY: Record<string, TicketPriority> = {
  Normal: 'NORMAL',
  High: 'HIGH',
  Urgent: 'URGENT',
};
const PRIORITY_LABEL: Record<TicketPriority, 'Normal' | 'High' | 'Urgent'> = {
  LOW: 'Normal',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

type SchoolStatus = 'Open' | 'In progress' | 'Waiting for School' | 'Resolved' | 'Closed';
/** The desk's statuses as the school sees them. */
const SCHOOL_STATUS: Record<TicketStatus, SchoolStatus> = {
  OPEN: 'Open',
  REOPENED: 'Open',
  ASSIGNED: 'In progress',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'In progress',
  ESCALATED: 'In progress',
  WAITING_FOR_SCHOOL: 'Waiting for School',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};
const STATUS_LINE: Record<SchoolStatus, string> = {
  Open: 'Awaiting support',
  'In progress': 'In progress',
  'Waiting for School': 'Waiting on you',
  Resolved: 'Resolved · confirm',
  Closed: 'Closed',
};
const OPEN_STATUSES: TicketStatus[] = [
  'OPEN',
  'REOPENED',
  'ASSIGNED',
  'IN_PROGRESS',
  'ON_HOLD',
  'ESCALATED',
  'WAITING_FOR_SCHOOL',
];
const LIMITS = { subject: 120, descriptionMin: 20, text: 5000, attachments: 3 };

export interface AttachmentInput {
  name: string;
  type: string;
  bytes: number;
  dataUrl: string | null;
}

const include = {
  assignee: { select: { firstName: true, lastName: true } },
  school: { select: { name: true } },
} satisfies Prisma.SupportTicketInclude;
type Row = Prisma.SupportTicketGetPayload<{ include: typeof include }>;

const fail = (message: string, code = 'VALIDATION', status = HttpStatus.UNPROCESSABLE_ENTITY) =>
  new AppException(status, message, code);

/**
 * School Admin › Support: the school's admins raise tickets with EduTrack and follow them. Only
 * replies and events marked visible reach the school (internal notes and desk triage never do).
 * Shapes follow School Admin's mock (`school-admin/src/api/mock/handlers/support.ts`); the
 * ticket number (SUP-1042) is its id. Teachers, parents and students don't raise tickets.
 */
@Injectable()
export class SchoolSupportService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly storage: StorageService,
    private readonly notices: SupportNoticesService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private async downloadUrl(key: string) {
    try {
      return await this.storage.getDownloadUrl(key, 3600);
    } catch {
      return null;
    }
  }

  private async holidays() {
    const rows = await this.db.publicHoliday.findMany({
      where: { country: 'NG' },
      select: { date: true },
    });
    return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
  }

  /** The first-reply clock in support working hours, as School Admin shows it. */
  private sla(t: Row, holidays: Set<string>, now: Date) {
    const targetHours = SLA_HOURS[t.priority][0];
    const due = addWorkingMs(t.createdAt, targetHours * HOUR, holidays);
    const base = { due: due.toISOString(), targetHours };
    if (t.firstReplyAt) {
      const took = durationText(workingMsBetween(t.createdAt, t.firstReplyAt, holidays));
      return t.firstReplyAt <= due
        ? { ...base, state: 'met' as const, label: `First reply in ${took}` }
        : { ...base, state: 'late' as const, label: `First reply took ${took}` };
    }
    if (t.status === 'CLOSED')
      return { ...base, state: 'met' as const, label: 'Closed before a reply' };
    const left = due.getTime() - now.getTime();
    if (left < 0)
      return { ...base, state: 'over' as const, label: `Reply overdue by ${durationText(left)}` };
    return {
      ...base,
      state: left < targetHours * HOUR * 0.25 ? ('soon' as const) : ('ok' as const),
      label: `Reply due in ${durationText(left)}`,
    };
  }

  private row(t: Row, holidays: Set<string>, now: Date) {
    const status = SCHOOL_STATUS[t.status];
    return {
      id: t.number,
      subject: t.subject,
      category: t.topic ? TOPIC_LABEL[t.topic] : CATEGORY_TOPIC[t.category],
      priority: PRIORITY_LABEL[t.priority],
      status,
      statusLabel: STATUS_LINE[status],
      assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : null,
      team: TEAM_LABEL[t.team],
      requester: t.requesterName,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      sla: this.sla(t, holidays, now),
      needsYou: status === 'Waiting for School' || status === 'Resolved',
    };
  }

  async list(q: { tab?: string; search?: string; page?: number; pageSize?: number }) {
    const tab = ['open', 'closed', 'all'].includes(q.tab ?? '') ? q.tab! : 'open';
    const needle = (q.search ?? '').trim();
    const search: Prisma.SupportTicketWhereInput = needle
      ? {
          OR: [
            { number: { contains: needle, mode: 'insensitive' } },
            { subject: { contains: needle, mode: 'insensitive' } },
          ],
        }
      : {};
    const inTab: Prisma.SupportTicketWhereInput =
      tab === 'all'
        ? {}
        : tab === 'open'
          ? { status: { in: OPEN_STATUSES } }
          : { status: { notIn: OPEN_STATUSES } };
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 10, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const [rows, total, open, all, attention, holidays] = await Promise.all([
      this.db.supportTicket.findMany({
        where: { ...inTab, ...search },
        include,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.supportTicket.count({ where: { ...inTab, ...search } }),
      this.db.supportTicket.count({ where: { status: { in: OPEN_STATUSES } } }),
      this.db.supportTicket.count(),
      this.db.supportTicket.findMany({
        where: { status: { in: ['WAITING_FOR_SCHOOL', 'RESOLVED'] } },
        orderBy: { updatedAt: 'desc' },
        select: { number: true, subject: true, status: true },
      }),
      this.holidays(),
    ]);
    const now = this.clock.now();
    return {
      rows: rows.map((t) => this.row(t, holidays, now)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      counts: { open, closed: all - open, all },
      attention: attention.map((t) => ({
        id: t.number,
        subject: t.subject,
        status: SCHOOL_STATUS[t.status],
      })),
    };
  }

  /** The school's ticket by number; another school's is "not found", so numbers can't be probed. */
  private async load(number: string) {
    const t = await this.db.supportTicket.findFirst({ where: { number }, include });
    if (!t)
      throw AppException.notFound(
        'This ticket doesn’t exist or isn’t for your school.',
        'NOT_FOUND',
      );
    return t;
  }

  async get(number: string) {
    const t = await this.load(number);
    const [messages, events, followUps, followUpOf, holidays] = await Promise.all([
      this.db.supportTicketMessage.findMany({
        where: { ticketId: t.id, kind: { not: 'NOTE' } },
        include: { attachments: { include: { file: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.supportTicketEvent.findMany({
        where: { ticketId: t.id, visibleToSchool: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.supportTicket.findMany({ where: { followUpOfId: t.id }, select: { number: true } }),
      t.followUpOfId
        ? this.db.supportTicket.findFirst({
            where: { id: t.followUpOfId },
            select: { number: true },
          })
        : null,
      this.holidays(),
    ]);
    const now = this.clock.now();
    const row = this.row(t, holidays, now);
    const open = OPEN_STATUSES.includes(t.status);
    return {
      ...row,
      messages: await Promise.all(
        messages.map(async (m) => ({
          id: m.id,
          author: m.authorName,
          authorRole: m.authorRole,
          from: m.kind === 'SCHOOL' ? ('school' as const) : ('support' as const),
          at: m.createdAt.toISOString(),
          text: m.body,
          attachments: await Promise.all(
            m.attachments
              .filter((a) => !a.file.deletedAt)
              .map(async (a) => ({
                name: a.file.originalName,
                type: a.file.mimeType,
                bytes: Number(a.file.sizeBytes),
                dataUrl: await this.downloadUrl(a.file.storageKey),
              })),
          ),
        })),
      ),
      events: events.map((e) => ({
        id: e.id,
        at: e.createdAt.toISOString(),
        title: e.title,
        detail: e.detail ?? undefined,
        tone: TONE_LABEL[e.tone],
      })),
      resolution: t.resolution,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      autoCloseAt: t.status === 'RESOLVED' ? (t.autoCloseAt?.toISOString() ?? null) : null,
      closedAt: t.closedAt?.toISOString() ?? null,
      rating: t.ratingScore,
      followUpOf: followUpOf?.number ?? null,
      followUps: followUps.map((f) => f.number),
      reopenCount: t.reopenCount,
      can: {
        reply: open,
        confirm: t.status === 'RESOLVED',
        reopen: t.status === 'RESOLVED',
        close: open,
        followUp: t.status === 'CLOSED',
      },
    };
  }

  /* ---------------- Validation ---------------- */

  private static text(value: unknown, label: string, min: number, max: number) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) throw fail(`Add ${label}.`);
    if (v.length < min)
      throw fail(`Write at least ${min} characters for ${label} so support can act on it.`);
    if (v.length > max) throw fail(`Keep ${label} to ${max.toLocaleString('en-NG')} characters.`);
    return v;
  }

  private static files(list: AttachmentInput[] | undefined) {
    const files = list ?? [];
    if (files.length > LIMITS.attachments) throw fail(`Attach up to ${LIMITS.attachments} files.`);
    return files.map((f) => {
      const name = (f.name ?? '').trim();
      if (!name) throw fail('Each attachment needs a file name.');
      if (!f.dataUrl) throw fail(`“${name}” didn’t upload. Attach it again.`);
      return { name, ...parseSupportAttachment(f.dataUrl) };
    });
  }

  /** Who is writing: their name and how the desk sees them ("Principal · School Admin · Greenfield"). */
  private async author(auth: AuthUserContext, schoolName: string) {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        staff: { select: { positionTitle: true } },
      },
    });
    const name = m ? `${m.user.firstName} ${m.user.lastName}` : 'School administrator';
    return { name, role: `${m?.staff?.positionTitle ?? 'School Admin'} · ${schoolName}` };
  }

  /** Stores the files on a message (inside the transaction that writes it). */
  private async attach(
    tx: Prisma.TransactionClient,
    schoolId: string,
    messageId: string,
    userId: string,
    files: ReturnType<typeof SchoolSupportService.files>,
  ) {
    for (const f of files) {
      const fileId = randomUUID();
      const storageKey = `schools/${schoolId}/support/${fileId}.${f.ext}`;
      await this.storage.upload(storageKey, f.bytes, f.mime);
      await tx.storedFile.create({
        data: {
          id: fileId,
          schoolId,
          storageKey,
          originalName: f.name,
          mimeType: f.mime,
          sizeBytes: BigInt(f.bytes.length),
          sha256: createHash('sha256').update(f.bytes).digest('hex'),
          uploadedById: userId,
        },
      });
      await tx.supportTicketAttachment.create({ data: { schoolId, messageId, fileId } });
    }
  }

  private event(
    tx: Prisma.TransactionClient,
    t: { id: string; schoolId: string },
    title: string,
    detail: string | null,
    tone: 'INFO' | 'SUCCESS' | 'WARNING' | 'NEUTRAL',
    userId: string,
    statuses: { from?: TicketStatus; to?: TicketStatus } = {},
  ) {
    return tx.supportTicketEvent.create({
      data: {
        schoolId: t.schoolId,
        ticketId: t.id,
        title,
        detail,
        tone,
        fromStatus: statuses.from ?? null,
        toStatus: statuses.to ?? null,
        actorUserId: userId,
        visibleToSchool: true,
        createdAt: this.clock.now(),
      },
    });
  }

  /* ---------------- Actions ---------------- */

  async create(
    auth: AuthUserContext,
    body: {
      category: string;
      priority?: string;
      subject: string;
      description: string;
      attachments?: AttachmentInput[];
      followUpOf?: string;
    },
  ) {
    const schoolId = auth.schoolId!;
    const map = TOPICS[body.category];
    if (!map) throw fail('Choose a category.');
    const priority = PRIORITY[body.priority ?? 'Normal'];
    if (!priority) throw fail('Choose a priority.');
    const subject = SchoolSupportService.text(body.subject, 'a subject', 1, LIMITS.subject);
    const description = SchoolSupportService.text(
      body.description,
      'a description',
      LIMITS.descriptionMin,
      LIMITS.text,
    );
    const files = SchoolSupportService.files(body.attachments);
    let previous: Row | null = null;
    if (body.followUpOf) {
      previous = await this.db.supportTicket.findFirst({
        where: { number: body.followUpOf },
        include,
      });
      if (!previous)
        throw AppException.notFound('The ticket you’re following up doesn’t exist.', 'NOT_FOUND');
      if (previous.status !== 'CLOSED')
        throw fail(
          `${previous.number} is still active. Reply on it instead.`,
          'TICKET_ACTIVE',
          HttpStatus.CONFLICT,
        );
    }
    const now = this.clock.now();
    // A double-click or a re-sent form shouldn't raise the same ticket twice.
    const dup = await this.db.supportTicket.findFirst({
      where: {
        requesterUserId: auth.userId,
        subject,
        description,
        createdAt: { gte: new Date(now.getTime() - 60_000) },
      },
    });
    if (dup)
      throw fail(`You just raised this as ${dup.number}.`, 'TICKET_DUPLICATE', HttpStatus.CONFLICT);
    const school = await this.db.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });
    const who = await this.author(auth, school?.name ?? '');
    const team = routeTeam(map.category);
    const ticket = await this.db.$transaction(async (raw) => {
      const tx = raw as unknown as Prisma.TransactionClient;
      const n = await nextPlatformNumber(tx, 'TICKET');
      const t = await tx.supportTicket.create({
        data: {
          schoolId,
          number: `SUP-${String(n).padStart(4, '0')}`,
          subject,
          description,
          topic: map.topic,
          category: map.category,
          priority,
          team,
          status: 'OPEN',
          requesterUserId: auth.userId,
          requesterName: who.name,
          followUpOfId: previous?.id ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const message = await tx.supportTicketMessage.create({
        data: {
          schoolId,
          ticketId: t.id,
          kind: 'SCHOOL',
          authorUserId: auth.userId,
          authorName: who.name,
          authorRole: who.role,
          body: description,
          createdAt: now,
        },
      });
      await this.attach(tx, schoolId, message.id, auth.userId, files);
      await this.event(tx, t, 'Ticket raised', who.name, 'INFO', auth.userId, { to: 'OPEN' });
      await this.event(tx, t, `Routed to ${TEAM_LABEL[team]}`, null, 'NEUTRAL', auth.userId);
      if (previous) {
        await this.event(tx, t, `Follow-up to ${previous.number}`, null, 'NEUTRAL', auth.userId);
        await this.event(
          tx,
          previous,
          `Follow-up raised as ${t.number}`,
          who.name,
          'INFO',
          auth.userId,
        );
      }
      return t;
    });
    await this.notices.toDesk(ticket, 'created', school?.name ?? 'A school');
    return this.get(ticket.number);
  }

  async reply(
    auth: AuthUserContext,
    number: string,
    body: { text: string; attachments?: AttachmentInput[] },
  ) {
    const t = await this.load(number);
    if (t.status === 'CLOSED')
      throw fail(
        'This ticket is closed. Open a follow-up ticket instead.',
        'TICKET_CLOSED',
        HttpStatus.CONFLICT,
      );
    if (t.status === 'RESOLVED')
      throw fail(
        'Support marked this resolved. Confirm the fix or reopen the ticket.',
        'TICKET_RESOLVED',
        HttpStatus.CONFLICT,
      );
    const text = SchoolSupportService.text(body.text, 'a message', 1, LIMITS.text);
    const files = SchoolSupportService.files(body.attachments);
    const who = await this.author(auth, t.school.name);
    const now = this.clock.now();
    await this.db.$transaction(async (raw) => {
      const tx = raw as unknown as Prisma.TransactionClient;
      const message = await tx.supportTicketMessage.create({
        data: {
          schoolId: t.schoolId,
          ticketId: t.id,
          kind: 'SCHOOL',
          authorUserId: auth.userId,
          authorName: who.name,
          authorRole: who.role,
          body: text,
          createdAt: now,
        },
      });
      await this.attach(tx, t.schoolId, message.id, auth.userId, files);
      // Answering a question puts the ticket back with support and restarts its clock.
      if (t.status === 'WAITING_FOR_SCHOOL') {
        const paused = t.pausedSince
          ? Math.round(workingMsBetween(t.pausedSince, now, await this.holidays()) / 1000)
          : 0;
        await tx.supportTicket.update({
          where: { id: t.id },
          data: {
            status: 'IN_PROGRESS',
            pausedSince: null,
            pausedSeconds: t.pausedSeconds + paused,
            updatedAt: now,
          },
        });
        await this.event(
          tx,
          t,
          'School replied · back with support',
          who.name,
          'INFO',
          auth.userId,
          {
            from: 'WAITING_FOR_SCHOOL',
            to: 'IN_PROGRESS',
          },
        );
      } else await tx.supportTicket.update({ where: { id: t.id }, data: { updatedAt: now } });
    });
    await this.notices.toDesk(t, 'reply', t.school.name);
    return this.get(number);
  }

  async confirm(auth: AuthUserContext, number: string, rating: number | null | undefined) {
    const t = await this.load(number);
    if (t.status !== 'RESOLVED')
      throw fail(
        'Only a resolved ticket can be confirmed.',
        'TICKET_NOT_RESOLVED',
        HttpStatus.CONFLICT,
      );
    if (
      rating !== undefined &&
      rating !== null &&
      !(Number.isInteger(rating) && rating >= 1 && rating <= 5)
    )
      throw fail('Rate the support from 1 to 5.');
    const who = await this.author(auth, t.school.name);
    const now = this.clock.now();
    await this.db.$transaction(async (raw) => {
      const tx = raw as unknown as Prisma.TransactionClient;
      await tx.supportTicket.update({
        where: { id: t.id },
        data: {
          status: 'CLOSED',
          closedAt: now,
          autoCloseAt: null,
          ratingScore: rating ?? null,
          updatedAt: now,
        },
      });
      await this.event(
        tx,
        t,
        `School confirmed the fix${rating ? ` · rated ${rating} of 5` : ''}`,
        who.name,
        'SUCCESS',
        auth.userId,
        { from: 'RESOLVED', to: 'CLOSED' },
      );
    });
    await this.notices.toDesk(t, 'confirmed', t.school.name);
    return this.get(number);
  }

  async reopen(auth: AuthUserContext, number: string, reason: string) {
    const t = await this.load(number);
    if (t.status === 'CLOSED')
      throw fail(
        'Closed tickets can’t be reopened. Open a follow-up ticket.',
        'TICKET_CLOSED',
        HttpStatus.CONFLICT,
      );
    if (t.status !== 'RESOLVED')
      throw fail('This ticket is still open.', 'TICKET_OPEN', HttpStatus.CONFLICT);
    const why = SchoolSupportService.text(reason, 'what still isn’t working', 10, LIMITS.text);
    const who = await this.author(auth, t.school.name);
    const now = this.clock.now();
    await this.db.$transaction(async (raw) => {
      const tx = raw as unknown as Prisma.TransactionClient;
      await tx.supportTicket.update({
        where: { id: t.id },
        data: {
          status: 'REOPENED',
          reopenCount: t.reopenCount + 1,
          resolvedAt: null,
          autoCloseAt: null,
          resolution: null,
          resolutionType: null,
          slaMissed: false,
          updatedAt: now,
        },
      });
      await tx.supportTicketMessage.create({
        data: {
          schoolId: t.schoolId,
          ticketId: t.id,
          kind: 'SCHOOL',
          authorUserId: auth.userId,
          authorName: who.name,
          authorRole: who.role,
          body: why,
          createdAt: now,
        },
      });
      await this.event(tx, t, 'School reopened the ticket', who.name, 'WARNING', auth.userId, {
        from: 'RESOLVED',
        to: 'REOPENED',
      });
    });
    await this.notices.toDesk(t, 'reopened', t.school.name);
    return this.get(number);
  }

  async close(auth: AuthUserContext, number: string, reason: string) {
    const t = await this.load(number);
    if (!OPEN_STATUSES.includes(t.status))
      throw fail(
        t.status === 'CLOSED' ? 'This ticket is already closed.' : 'Confirm the fix instead.',
        'TICKET_NOT_OPEN',
        HttpStatus.CONFLICT,
      );
    const why = SchoolSupportService.text(reason, 'a reason', 3, 500);
    const who = await this.author(auth, t.school.name);
    const now = this.clock.now();
    await this.db.$transaction(async (raw) => {
      const tx = raw as unknown as Prisma.TransactionClient;
      await tx.supportTicket.update({
        where: { id: t.id },
        data: {
          status: 'CLOSED',
          closedAt: now,
          autoCloseAt: null,
          pausedSince: null,
          updatedAt: now,
        },
      });
      await this.event(
        tx,
        t,
        'School closed the ticket',
        `${who.name} · ${why}`,
        'NEUTRAL',
        auth.userId,
        {
          from: t.status,
          to: 'CLOSED',
        },
      );
    });
    await this.notices.toDesk(t, 'closed', t.school.name);
    return this.get(number);
  }
}
