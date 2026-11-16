import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { paginated, toSkipTake } from '../../common/pagination/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  SupportTeam,
  TicketMessageKind,
  TicketStatus,
  Tone,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { PlatformAlertsService } from '../alerts/platform-alerts.service.js';
import { addDays, formatShortDay, formatShortStamp } from '../shared/format.js';
import { nextPlatformNumber } from '../shared/platform-sequence.js';
import { PlatformAuditService } from '../shared/platform-audit.service.js';
import { permissionsOf, unprocessable } from '../shared/staff.js';
import type {
  CreateIssueDto,
  IssueListQuery,
  IssueMessageDto,
  IssueTransitionDto,
  IssueView,
  UpdateIssueDto,
} from './dto/support.dto.js';
import {
  AUTO_CLOSE_DAYS,
  CATEGORY_BY_LABEL,
  CATEGORY_LABEL,
  CLOSE_REASONS,
  DONE,
  ESCALATION_TARGETS,
  HOLD_REASONS,
  isDone,
  isOverdue,
  isPaused,
  NEXT,
  PAUSED,
  PRIORITY_BY_LABEL,
  PRIORITY_LABEL,
  resolutionDue,
  RESOLUTION_TYPES,
  routeTeam,
  slaOf,
  STATUS_BY_LABEL,
  STATUS_LABEL,
  TEAM_LABEL,
  TONE_LABEL,
} from './support-desk.js';
import { workingMsBetween, type Holidays } from './working-time.js';

export const ISSUE_NOT_FOUND = 'That issue doesn’t exist.';
const DAY = 86_400_000;
/** Attachments: PNG, JPEG or PDF, 10 MB at most. */
const MAX_ATTACHMENT = 10 * 1024 * 1024;
const HOLIDAY_CACHE_MS = 10 * 60_000;

const ticketInclude = {
  school: { select: { id: true, name: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.SupportTicketInclude;
type TicketRow = Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>;

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;
const open = { status: { notIn: DONE } } satisfies Prisma.SupportTicketWhereInput;

interface Agent {
  id: string;
  name: string;
  team: SupportTeam | null;
  open: number;
}

/** What one step changes on the ticket, and the history entry it writes. */
interface Step {
  data: Prisma.SupportTicketUncheckedUpdateInput;
  title: string;
  tone?: Tone;
  internal?: boolean;
  /** A reply to the school written as part of the step. */
  message?: string;
}

/**
 * The back office's support desk: tickets schools raise (and ones staff raise for them), worked
 * through a fixed set of statuses with working-hours SLA clocks. School-facing replies and
 * internal notes share the conversation; the timeline marks what the school can see.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private holidayCache?: { at: number; days: Set<string> };

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: PlatformAuditService,
    private readonly alerts: PlatformAlertsService,
    private readonly clock: Clock,
  ) {}

  private me(): string {
    const id = RequestContext.get()?.userId;
    if (!id) throw AppException.unauthorized();
    return id;
  }

  /** Nigerian public holidays (the SLA clock skips them). Cached for a few minutes. */
  async holidays(): Promise<Holidays> {
    if (this.holidayCache && Date.now() - this.holidayCache.at < HOLIDAY_CACHE_MS)
      return this.holidayCache.days;
    const rows = await this.prisma.publicHoliday.findMany({
      where: { country: 'NG' },
      select: { date: true },
    });
    const days = new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
    this.holidayCache = { at: Date.now(), days };
    return days;
  }

  /* ---------- Agents ---------- */

  /** Active staff whose role can work tickets, with their team and open tickets. */
  async agents(): Promise<Agent[]> {
    const [staff, load] = await Promise.all([
      this.prisma.platformStaff.findMany({
        where: { status: 'ACTIVE', user: { status: 'ACTIVE', deletedAt: null } },
        select: {
          supportTeam: true,
          role: { select: { permissions: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.supportTicket.groupBy({
        by: ['assigneeUserId'],
        where: { ...open, assigneeUserId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(load.map((l) => [l.assigneeUserId, l._count._all]));
    return staff
      .filter((s) => permissionsOf(s.role).has('Support.Edit'))
      .map((s) => ({
        id: s.user.id,
        name: fullName(s.user),
        team: s.supportTeam,
        open: counts.get(s.user.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async agentList() {
    return (await this.agents()).map((a) => ({
      ...a,
      team: a.team ? TEAM_LABEL[a.team] : null,
    }));
  }

  private async agent(id: string, agents?: Agent[]) {
    const found = (agents ?? (await this.agents())).find((a) => a.id === id.toLowerCase());
    if (!found) throw unprocessable('Choose someone who can work support tickets.', 'NOT_AN_AGENT');
    return found;
  }

  /* ---------- Reading ---------- */

  private view(t: TicketRow, now: Date, holidays: Holidays, names: Map<string, string>) {
    return {
      id: t.number,
      schoolId: t.schoolId,
      schoolName: t.school.name,
      subject: t.subject,
      category: CATEGORY_LABEL[t.category],
      priority: PRIORITY_LABEL[t.priority],
      status: STATUS_LABEL[t.status],
      assignee: t.assignee ? fullName(t.assignee) : null,
      assigneeId: t.assigneeUserId,
      team: TEAM_LABEL[t.team],
      requester: t.requesterName,
      createdAt: formatShortDay(t.createdAt, now),
      updatedAt: formatShortDay(t.updatedAt, now),
      resolution: t.resolution,
      resolutionType: t.resolutionType,
      sla: slaOf(t, now, holidays),
      escalatedTo: t.escalatedTo,
      escalatedFrom: t.escalatedFromUserId ? (names.get(t.escalatedFromUserId) ?? null) : null,
      holdReason: t.holdReason,
      reopenCount: t.reopenCount,
      rating:
        t.ratingScore === null ? null : { score: t.ratingScore, comment: t.ratingComment ?? '' },
    };
  }

  private async views(rows: TicketRow[]) {
    const ids = [...new Set(rows.map((r) => r.escalatedFromUserId).filter((x) => x !== null))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, fullName(u)]));
    const now = this.clock.now();
    const holidays = await this.holidays();
    return rows.map((r) => this.view(r, now, holidays, names));
  }

  private viewWhere(view: IssueView, me: string): Prisma.SupportTicketWhereInput {
    switch (view) {
      case 'all':
        return {};
      case 'unassigned':
        return { ...open, assigneeUserId: null };
      case 'mine':
        return { ...open, assigneeUserId: me };
      case 'waiting':
        return { status: { in: PAUSED } };
      case 'escalated':
        return { status: 'ESCALATED' };
      case 'resolved':
        return { status: 'RESOLVED' };
      case 'closed':
        return { status: 'CLOSED' };
      default:
        return open;
    }
  }

  async list(query: IssueListQuery) {
    const me = this.me();
    const view = query.view ?? 'open';
    const search = query.search?.trim();
    const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
    const equals = (value: string) => ({ equals: value, mode: 'insensitive' as const });
    const lagos = (day: string) => new Date(`${day}T00:00:00+01:00`);
    const assignee = query.assignee?.trim();
    const where: Prisma.SupportTicketWhereInput = {
      AND: [
        this.viewWhere(view, me),
        query.priority ? { priority: PRIORITY_BY_LABEL[query.priority] } : {},
        query.category ? { category: CATEGORY_BY_LABEL[query.category] } : {},
        query.schoolId ? { schoolId: query.schoolId.toLowerCase() } : {},
        assignee === 'Unassigned'
          ? { assigneeUserId: null }
          : assignee
            ? {
                assignee: {
                  firstName: equals(assignee.split(' ')[0]!),
                  lastName: equals(assignee.split(' ').slice(1).join(' ')),
                },
              }
            : {},
        query.dateFrom ? { createdAt: { gte: lagos(query.dateFrom) } } : {},
        query.dateTo ? { createdAt: { lt: addDays(lagos(query.dateTo), 1) } } : {},
        search
          ? {
              OR: [
                { number: contains(search) },
                { subject: contains(search) },
                { school: { name: contains(search) } },
              ],
            }
          : {},
      ],
    };
    const orderBy = [{ createdAt: 'desc' as const }, { number: 'desc' as const }];

    if (view === 'overdue') {
      // The SLA clocks are worked out in code, so overdue tickets are filtered after loading.
      const now = this.clock.now();
      const holidays = await this.holidays();
      const rows = (
        await this.prisma.supportTicket.findMany({
          where: { AND: [where, open] },
          include: ticketInclude,
          orderBy,
        })
      ).filter((t) => isOverdue(t, now, holidays));
      const { skip, take } = toSkipTake(query);
      return paginated(await this.views(rows.slice(skip, skip + take)), rows.length, query);
    }
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: ticketInclude,
        orderBy,
        ...toSkipTake(query),
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return paginated(await this.views(rows), total, query);
  }

  private async load(ref: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { number: ref.trim().toUpperCase() },
      include: ticketInclude,
    });
    if (!ticket) throw AppException.notFound(ISSUE_NOT_FOUND);
    return ticket;
  }

  async get(ref: string) {
    const ticket = await this.load(ref);
    const [messages, events] = await Promise.all([
      this.prisma.supportTicketMessage.findMany({
        where: { schoolId: ticket.schoolId, ticketId: ticket.id },
        // uuid v7 ids rise with time, so they settle ties at the same millisecond.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { attachments: { include: { file: true } } },
      }),
      this.prisma.supportTicketEvent.findMany({
        where: { schoolId: ticket.schoolId, ticketId: ticket.id },
        // uuid v7 ids rise with time, so they settle ties at the same millisecond.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const actorIds = [...new Set(events.map((e) => e.actorUserId).filter((x) => x !== null))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const actorName = new Map(actors.map((a) => [a.id, fullName(a)]));
    const now = this.clock.now();
    const [base] = await this.views([ticket]);
    return {
      ...base!,
      messages: await Promise.all(
        messages.map(async (m) => ({
          id: m.id,
          author: m.authorName,
          authorRole: m.authorRole,
          when: formatShortStamp(m.createdAt, now),
          text: m.body,
          kind: m.kind.toLowerCase() as 'school' | 'agent' | 'note',
          attachments: await Promise.all(
            m.attachments
              .filter((a) => !a.file.deletedAt)
              .map(async (a) => ({
                name: a.file.originalName,
                url: await this.storage.getDownloadUrl(a.file.storageKey, 3600),
              })),
          ),
        })),
      ),
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        detail:
          e.detail ??
          `${e.actorUserId ? (actorName.get(e.actorUserId) ?? 'Staff') : 'EduTrack'} · ${
            e.visibleToSchool ? 'school can see' : 'internal'
          }`,
        when: formatShortStamp(e.createdAt, now),
        tone: TONE_LABEL[e.tone],
      })),
    };
  }

  /* ---------- Summary ---------- */

  async summary() {
    const me = this.me();
    const now = this.clock.now();
    const holidays = await this.holidays();
    // "Most issues · 30 days" and the category split cover the last 30 days.
    const since = new Date(now.getTime() - 30 * DAY);
    const weekStart = mondayLagos(now);
    const firstWeek = new Date(weekStart.getTime() - 4 * 7 * DAY);
    const [active, rated, recent] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where: open,
        select: {
          priority: true,
          status: true,
          createdAt: true,
          firstReplyAt: true,
          pausedSeconds: true,
          slaMissed: true,
          assigneeUserId: true,
        },
      }),
      this.prisma.supportTicket.aggregate({
        where: { ratingScore: { not: null } },
        _avg: { ratingScore: true },
        _count: { ratingScore: true },
      }),
      this.prisma.supportTicket.findMany({
        where: { createdAt: { gte: since < firstWeek ? since : firstWeek } },
        select: { createdAt: true, category: true, school: { select: { name: true } } },
      }),
    ]);
    const unassigned = active.filter((t) => !t.assigneeUserId).length;
    const overdue = active.filter((t) => isOverdue(t, now, holidays)).length;
    const mine = active.filter((t) => t.assigneeUserId === me).length;

    const weeklyVolume = Array.from({ length: 5 }, (_, i) => {
      const start = new Date(firstWeek.getTime() + i * 7 * DAY);
      const end = new Date(start.getTime() + 7 * DAY);
      return {
        label: `Wk ${isoWeek(start)}`,
        value: recent.filter((t) => t.createdAt >= start && t.createdAt < end).length,
      };
    });
    const last30 = recent.filter((t) => t.createdAt >= since);
    const byCategory = countBy(last30, (t) => CATEGORY_LABEL[t.category]).map(([label, n]) => ({
      label,
      percent: Math.round((n / last30.length) * 100),
    }));
    const topSchools = countBy(last30, (t) => t.school.name)
      .slice(0, 4)
      .map(([label, value]) => ({ label, value }));

    return {
      open: active.length,
      unassigned,
      overdue,
      escalated: active.filter((t) => t.status === 'ESCALATED').length,
      satisfaction:
        rated._avg.ratingScore === null ? null : Math.round(rated._avg.ratingScore * 10) / 10,
      ratings: rated._count.ratingScore,
      views: { open: active.length, unassigned, mine, overdue },
      weeklyVolume,
      byCategory,
      topSchools,
    };
  }

  /* ---------- Writing ---------- */

  private parseAttachment(dataUrl: string) {
    const match =
      /^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
    const bad = () => unprocessable('Attach a PNG, JPG or PDF file.', 'ATTACHMENT_TYPE');
    if (!match) throw bad();
    const mime = match[1]!;
    const bytes = Buffer.from(match[2]!, 'base64');
    const magic =
      mime === 'image/png'
        ? [0x89, 0x50, 0x4e, 0x47]
        : mime === 'image/jpeg'
          ? [0xff, 0xd8, 0xff]
          : [0x25, 0x50, 0x44, 0x46];
    if (!magic.every((b, i) => bytes[i] === b)) throw bad();
    if (bytes.length > MAX_ATTACHMENT)
      throw unprocessable('The attachment is larger than 10 MB.', 'ATTACHMENT_TOO_LARGE');
    const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'pdf';
    return { bytes, mime, ext };
  }

  async create(dto: CreateIssueDto) {
    const me = this.me();
    const school = await this.prisma.school.findUnique({
      where: { id: dto.schoolId.toLowerCase() },
      select: { id: true, name: true },
    });
    if (!school) throw unprocessable('Choose a school.', 'SCHOOL_NOT_FOUND');
    const agents = await this.agents();
    const owner = dto.assignee ? await this.agent(dto.assignee, agents) : null;
    const category = CATEGORY_BY_LABEL[dto.category]!;
    const priority = PRIORITY_BY_LABEL[dto.priority]!;
    const team = owner?.team ?? routeTeam(category);
    const file = dto.attachment ? this.parseAttachment(dto.attachment) : null;
    const now = this.clock.now();
    const [author = dto.requester, role = 'School'] = dto.requester.split(' · ');
    const myName = agents.find((a) => a.id === me)?.name ?? (await this.nameOf(me));

    let upload: { fileId: string; storageKey: string } | null = null;
    if (file) {
      const fileId = randomUUID();
      const storageKey = `schools/${school.id}/support/${fileId}.${file.ext}`;
      await this.storage.upload(storageKey, file.bytes, file.mime);
      upload = { fileId, storageKey };
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const n = await nextPlatformNumber(tx, 'TICKET');
      const row = await tx.supportTicket.create({
        data: {
          schoolId: school.id,
          number: `SUP-${String(n).padStart(4, '0')}`,
          subject: dto.subject,
          description: dto.description,
          category,
          priority,
          team,
          status: owner ? 'ASSIGNED' : 'OPEN',
          requesterName: dto.requester,
          assigneeUserId: owner?.id ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
      const message = await tx.supportTicketMessage.create({
        data: {
          schoolId: school.id,
          ticketId: row.id,
          kind: 'SCHOOL',
          authorName: author,
          authorRole: `${role} · ${school.name}`,
          body: dto.description,
          createdAt: now,
        },
      });
      if (upload && file) {
        await tx.storedFile.create({
          data: {
            id: upload.fileId,
            schoolId: school.id,
            storageKey: upload.storageKey,
            originalName: dto.attachmentName || `attachment.${file.ext}`,
            mimeType: file.mime,
            sizeBytes: BigInt(file.bytes.length),
            sha256: createHash('sha256').update(file.bytes).digest('hex'),
            uploadedById: me,
          },
        });
        await tx.supportTicketAttachment.create({
          data: { schoolId: school.id, messageId: message.id, fileId: upload.fileId },
        });
      }
      await tx.supportTicketEvent.create({
        data: {
          schoolId: school.id,
          ticketId: row.id,
          title: 'Created',
          detail: `Raised by ${myName} for ${author} · routed to ${TEAM_LABEL[team]}`,
          tone: 'INFO',
          toStatus: 'OPEN',
          actorUserId: me,
          createdAt: now,
        },
      });
      if (owner)
        await tx.supportTicketEvent.create({
          data: {
            schoolId: school.id,
            ticketId: row.id,
            title: `Assigned to ${owner.name} · ${TEAM_LABEL[team]}${owner.id === me ? ' (self-assigned)' : ''}`,
            tone: 'INFO',
            fromStatus: 'OPEN',
            toStatus: 'ASSIGNED',
            actorUserId: me,
            createdAt: now,
          },
        });
      await this.audit.record(
        {
          action: 'issue.create',
          entity: 'Issue',
          entityId: row.id,
          schoolId: school.id,
          summary: `Support issue created · ${row.number}`,
          next: owner ? 'Assigned' : 'Open',
        },
        tx,
      );
      return row;
    });

    const alert = {
      detail: `${school.name} · ${dto.subject}`,
      link: `/support/${ticket.number}`,
      entityType: 'Issue',
      entityId: ticket.id,
    };
    await this.alerts.tryNotify(
      'issue.created',
      { ...alert, title: `New support issue ${ticket.number}` },
      { permission: 'Support.View', exclude: [me] },
    );
    if (priority === 'URGENT')
      await this.alerts.tryNotify(
        'issue.urgent',
        { ...alert, title: `Urgent support issue ${ticket.number}` },
        { permission: 'Support.View', exclude: [me] },
      );
    return (await this.views([await this.load(ticket.number)]))[0]!;
  }

  private async nameOf(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return u ? fullName(u) : 'EduTrack';
  }

  /** Saves a step: the ticket change, its history entry, an optional reply, and the audit. */
  private async save(
    t: TicketRow,
    step: Step,
    audit: { action: string; summary: string; previous: string; next: string } | null,
  ) {
    const me = RequestContext.get()?.userId ?? null;
    const now = this.clock.now();
    const authorName = me ? await this.nameOf(me) : 'EduTrack';
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.supportTicket.updateMany({
        where: { id: t.id, updatedAt: t.updatedAt },
        data: { ...step.data, updatedAt: now } as Prisma.SupportTicketUncheckedUpdateManyInput,
      });
      if (changed.count === 0)
        throw AppException.conflict(
          'Someone else just changed this ticket. Refresh and try again.',
          'ISSUE_CHANGED',
        );
      if (step.message)
        await tx.supportTicketMessage.create({
          data: {
            schoolId: t.schoolId,
            ticketId: t.id,
            kind: 'AGENT',
            authorUserId: me,
            authorName,
            authorRole: 'Support',
            body: step.message,
            createdAt: now,
          },
        });
      const to = (step.data.status as TicketStatus | undefined) ?? null;
      await tx.supportTicketEvent.create({
        data: {
          schoolId: t.schoolId,
          ticketId: t.id,
          title: step.title,
          tone: step.tone ?? 'INFO',
          fromStatus: to ? t.status : null,
          toStatus: to,
          actorUserId: me,
          visibleToSchool: !step.internal,
          createdAt: now,
        },
      });
      if (audit)
        await this.audit.record(
          {
            action: audit.action,
            entity: 'Issue',
            entityId: t.id,
            schoolId: t.schoolId,
            summary: `${audit.summary} · ${t.number}`,
            previous: audit.previous,
            next: audit.next,
          },
          tx,
        );
    });
  }

  /** The bookkeeping for moving to `to`: paused working time, resolution and reopening. */
  private statusData(
    t: TicketRow,
    to: TicketStatus,
    now: Date,
    holidays: Holidays,
  ): Prisma.SupportTicketUncheckedUpdateInput {
    const data: Prisma.SupportTicketUncheckedUpdateInput = { status: to };
    let pausedSeconds = t.pausedSeconds;
    if (isPaused(t.status) && !isPaused(to) && t.pausedSince) {
      pausedSeconds += Math.round(workingMsBetween(t.pausedSince, now, holidays) / 1000);
      data.pausedSeconds = pausedSeconds;
      data.pausedSince = null;
    }
    if (isPaused(to) && !isPaused(t.status)) data.pausedSince = now;
    if (!isPaused(to)) data.holdReason = null;
    if (to === 'RESOLVED' && !isDone(t.status)) {
      data.slaMissed = now > resolutionDue({ ...t, pausedSeconds }, holidays);
      data.resolvedAt = now;
      data.autoCloseAt = new Date(now.getTime() + AUTO_CLOSE_DAYS * DAY);
    }
    if (to === 'CLOSED') {
      data.closedAt = now;
      data.autoCloseAt = null;
    }
    if (to === 'REOPENED') {
      Object.assign(data, {
        reopenCount: t.reopenCount + 1,
        slaMissed: false,
        ratingScore: null,
        ratingComment: null,
        escalatedTo: null,
        resolution: null,
        resolutionType: null,
        resolvedAt: null,
        closedAt: null,
        autoCloseAt: null,
      });
    }
    return data;
  }

  /** Assign, reassign, and change priority or category. */
  async update(ref: string, dto: UpdateIssueDto) {
    const me = this.me();
    let t = await this.load(ref);
    const now = () => this.clock.now();
    const holidays = await this.holidays();
    const priority = dto.priority ? PRIORITY_BY_LABEL[dto.priority]! : undefined;
    const category = dto.category ? CATEGORY_BY_LABEL[dto.category]! : undefined;
    const assigning = dto.assignee !== undefined && dto.assignee !== t.assigneeUserId;

    if (assigning) {
      if (isDone(t.status))
        throw AppException.conflict(
          `${t.number} is ${STATUS_LABEL[t.status].toLowerCase()}. Reopen it first.`,
          'ISSUE_DONE',
        );
      if (!dto.assignee) throw unprocessable('Choose who should own the ticket.');
      const owner = await this.agent(dto.assignee);
      const from = t.assignee ? fullName(t.assignee) : null;
      if (from && !dto.reason) throw unprocessable('Say why it’s being reassigned.');
      const team = owner.team ?? t.team;
      const data: Prisma.SupportTicketUncheckedUpdateInput = {
        assigneeUserId: owner.id,
        team,
        ...((t.status === 'OPEN' || t.status === 'REOPENED') &&
          this.statusData(t, 'ASSIGNED', now(), holidays)),
      };
      const self = owner.id === me && !from ? ' (self-assigned)' : '';
      await this.save(
        t,
        {
          data,
          title:
            (from ? `Reassigned from ${from} to ` : 'Assigned to ') +
            `${owner.name} · ${TEAM_LABEL[team]}${self}${dto.reason ? ` · ${dto.reason}` : ''}`,
        },
        {
          action: from ? 'issue.reassign' : 'issue.assign',
          summary: from ? 'Ticket reassigned' : 'Ticket assigned',
          previous: from ?? 'Unassigned',
          next: owner.name,
        },
      );
      t = await this.load(ref);
    }
    if (priority && priority !== t.priority) {
      await this.save(
        t,
        {
          data: { priority },
          title: `Priority ${PRIORITY_LABEL[t.priority]} → ${PRIORITY_LABEL[priority]}`,
          tone: 'WARNING',
          internal: true,
        },
        {
          action: 'issue.priority',
          summary: 'Priority changed',
          previous: PRIORITY_LABEL[t.priority],
          next: PRIORITY_LABEL[priority],
        },
      );
      if (priority === 'URGENT' && !isDone(t.status))
        await this.alerts.tryNotify(
          'issue.urgent',
          {
            title: `${t.number} is now urgent`,
            detail: `${t.school.name} · ${t.subject}`,
            link: `/support/${t.number}`,
            entityType: 'Issue',
            entityId: t.id,
          },
          { permission: 'Support.View', exclude: [me] },
        );
      t = await this.load(ref);
    }
    if (category && category !== t.category) {
      await this.save(
        t,
        {
          data: { category },
          title: `Category ${CATEGORY_LABEL[t.category]} → ${CATEGORY_LABEL[category]}`,
          internal: true,
        },
        {
          action: 'issue.category',
          summary: 'Category changed',
          previous: CATEGORY_LABEL[t.category],
          next: CATEGORY_LABEL[category],
        },
      );
    }
    return this.get(ref).then(({ messages: _m, events: _e, ...issue }) => issue);
  }

  /** A reply to the school or an internal note. The first reply picks up an unworked ticket. */
  async message(ref: string, dto: IssueMessageDto) {
    const me = this.me();
    const t = await this.load(ref);
    if (t.status === 'CLOSED')
      throw AppException.conflict('This ticket is closed. Reopen it to reply.', 'ISSUE_CLOSED');
    const now = this.clock.now();
    const name = await this.nameOf(me);
    const kind: TicketMessageKind = dto.kind === 'note' ? 'NOTE' : 'AGENT';
    const pickUp = kind === 'AGENT' && (t.status === 'OPEN' || t.status === 'REOPENED');
    let owner = t.assigneeUserId;
    let team = t.team;
    if (pickUp && !owner) {
      const mine = (await this.agents()).find((a) => a.id === me);
      owner = me;
      team = mine?.team ?? t.team;
    }
    const ownerName = owner === me ? name : t.assignee ? fullName(t.assignee) : name;
    const holidays = await this.holidays();

    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicketMessage.create({
        data: {
          schoolId: t.schoolId,
          ticketId: t.id,
          kind,
          authorUserId: me,
          authorName: name,
          authorRole: kind === 'NOTE' ? 'Internal note' : 'Support',
          body: dto.text,
          createdAt: now,
        },
      });
      await tx.supportTicket.update({
        where: { id: t.id },
        data: {
          updatedAt: now,
          ...(kind === 'AGENT' && !t.firstReplyAt && { firstReplyAt: now }),
          ...(pickUp && {
            ...this.statusData(t, 'IN_PROGRESS', now, holidays),
            assigneeUserId: owner,
            team,
          }),
        } as Prisma.SupportTicketUncheckedUpdateInput,
      });
      if (pickUp)
        await tx.supportTicketEvent.create({
          data: {
            schoolId: t.schoolId,
            ticketId: t.id,
            title: `Picked up by ${ownerName} · first reply sent`,
            tone: 'INFO',
            fromStatus: t.status,
            toStatus: 'IN_PROGRESS',
            actorUserId: me,
            createdAt: now,
          },
        });
    });
    return { ok: true };
  }

  async transition(ref: string, dto: IssueTransitionDto) {
    const me = this.me();
    const t = await this.load(ref);
    const to = STATUS_BY_LABEL[dto.to]!;
    const from = t.status;
    if (!NEXT[from].includes(to))
      throw AppException.conflict(
        `A ${STATUS_LABEL[from].toLowerCase()} ticket can’t move to ${dto.to}.`,
        'ISSUE_TRANSITION',
      );
    const now = this.clock.now();
    const holidays = await this.holidays();
    const myName = await this.nameOf(me);
    const note = () => dto.note?.trim() || undefined;
    const need = (value: string | undefined, message: string) => {
      if (!value) throw unprocessable(message);
      return value;
    };
    const pick = (options: string[], message: string) => {
      if (!dto.option || !options.includes(dto.option)) throw unprocessable(message);
      return dto.option;
    };
    const data = this.statusData(t, to, now, holidays);
    let step: Step;

    switch (to) {
      case 'IN_PROGRESS': {
        const who = t.assignee ? fullName(t.assignee) : myName;
        data.assigneeUserId = t.assigneeUserId ?? me;
        if (!t.firstReplyAt) data.firstReplyAt = now;
        step = {
          data,
          title:
            from === 'ESCALATED'
              ? `Escalation accepted by ${who}`
              : isPaused(from)
                ? 'Work resumed · SLA running'
                : `Work started by ${who}`,
        };
        break;
      }
      case 'WAITING_FOR_SCHOOL': {
        const message = need(note(), 'Write the question for the school.');
        if (!t.firstReplyAt) data.firstReplyAt = now;
        step = { data, title: 'Waiting for the school · SLA paused', message };
        break;
      }
      case 'ON_HOLD': {
        const reason = pick(HOLD_REASONS, 'Choose what it’s waiting on.');
        const message = need(note(), 'Add a note for the school.');
        data.holdReason = reason;
        step = { data, title: `On hold · ${reason} · SLA paused`, message };
        break;
      }
      case 'ESCALATED': {
        const target = ESCALATION_TARGETS.find((x) => TEAM_LABEL[x.team] === dto.option);
        if (!target) throw unprocessable('Choose who to escalate to.');
        const why = need(note(), 'Say why it needs escalating.');
        const owner = (await this.agents())
          .filter((a) => a.team === target.team && a.id !== t.assigneeUserId)
          .sort((a, b) => a.open - b.open || a.name.localeCompare(b.name))[0];
        Object.assign(data, {
          escalatedFromUserId: t.assigneeUserId,
          escalatedTo: target.label,
          assigneeUserId: owner?.id ?? null,
          team: target.team,
        });
        step = {
          data,
          title: `Escalated to ${target.label} (${owner?.name ?? `${TEAM_LABEL[target.team]} queue`}) by ${myName} · ${why}`,
          tone: 'ERROR',
        };
        break;
      }
      case 'RESOLVED': {
        const type = pick(RESOLUTION_TYPES, 'Choose how it was resolved.');
        const summary = need(note(), 'Add a resolution summary.');
        Object.assign(data, { resolution: summary, resolutionType: type });
        if (!t.firstReplyAt) data.firstReplyAt = now;
        step = {
          data,
          title: `Resolved · ${type} · “${summary}”`,
          tone: 'SUCCESS',
          message: summary,
        };
        break;
      }
      case 'CLOSED': {
        if (from === 'RESOLVED') {
          step = { data, title: `Closed by ${myName}` };
        } else {
          const reason = pick(CLOSE_REASONS, 'Choose why it’s being closed.');
          const message = need(note(), 'Add a note for the school.');
          Object.assign(data, { resolution: message, resolutionType: reason });
          step = { data, title: `Closed without resolving · ${reason}`, message };
        }
        break;
      }
      case 'REOPENED': {
        const why = need(note(), 'Give a reason for reopening.');
        step = { data, title: `Reopened by ${myName} · ${why}`, tone: 'WARNING' };
        break;
      }
      default:
        throw AppException.conflict(
          `A ticket can’t move to ${dto.to} this way.`,
          'ISSUE_TRANSITION',
        );
    }
    await this.save(t, step, {
      action: 'issue.status',
      summary: `Ticket ${dto.to.toLowerCase()}`,
      previous: STATUS_LABEL[from],
      next: dto.to,
    });
    return this.get(ref).then(({ messages: _m, events: _e, ...issue }) => issue);
  }

  /** Daily: closes resolved tickets the school didn't answer within the auto-close window. */
  async autoClose(): Promise<number> {
    const now = this.clock.now();
    const due = await this.prisma.supportTicket.findMany({
      where: { status: 'RESOLVED', autoCloseAt: { lte: now } },
      include: ticketInclude,
    });
    let closed = 0;
    for (const t of due) {
      try {
        await this.save(
          t,
          {
            data: { status: 'CLOSED', closedAt: now, autoCloseAt: null },
            title: `Closed automatically · no reply from the school in ${AUTO_CLOSE_DAYS} days`,
          },
          {
            action: 'issue.status',
            summary: 'Ticket closed automatically',
            previous: 'Resolved',
            next: 'Closed',
          },
        );
        closed++;
      } catch (error) {
        this.logger.warn({ msg: 'Ticket not auto-closed', ticket: t.number, error: String(error) });
      }
    }
    return closed;
  }
}

/** Monday 00:00 Lagos of the week holding `now`. */
function mondayLagos(now: Date): Date {
  const local = new Date(now.getTime() + 3_600_000);
  const day = (local.getUTCDay() + 6) % 7;
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnight - day * DAY - 3_600_000);
}

/** ISO week number of a Lagos week start. */
function isoWeek(weekStart: Date): number {
  const local = new Date(weekStart.getTime() + 3_600_000);
  const thursday = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 3),
  );
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - yearStart) / DAY + 1) / 7);
}

/** `[label, count]` pairs, most first. */
function countBy<T>(rows: T[], key: (row: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
