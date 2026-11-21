import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { normalizePhone } from '../../auth/identifiers.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AnnouncementStatus as DbStatus } from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel } from '../academics/academic-format.js';
import { MemberPermissions } from '../students/member-permissions.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import {
  type Audience,
  CommsAudienceService,
  kindFromDb,
  kindToDb,
  labelOf,
} from './comms-audience.service.js';
import {
  CHANNELS,
  EVENTS,
  MAX_SMS_PAGES,
  channelLabel,
  channelToDb,
  smsLength,
  smsSafe,
  sortChannels,
  type Channel,
  type ChannelTemplate,
} from './comms-catalog.js';
import { CommsDispatchService } from './comms-dispatch.service.js';
import { channelStats } from './comms-stats.js';
import {
  LOCAL_STAMP,
  atLabel,
  fromLocalStamp,
  hhmm,
  inWindow,
  localDay,
  localStamp,
} from './comms-time.js';
import type { AnnouncementDto, AnnouncementQuery, AudiencePreviewDto } from './dto/comms.dto.js';
import { DEFAULT_SENDER, SmsLedgerService } from './sms-ledger.service.js';

export type AnnouncementStatusLabel = 'Draft' | 'Scheduled' | 'Sent' | 'Withdrawn' | 'Expired';
type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const STATUS_LABEL: Record<DbStatus, AnnouncementStatusLabel> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  SENT: 'Sent',
  WITHDRAWN: 'Withdrawn',
};

const include = {
  audienceArms: { include: { arm: { include: { level: { select: { name: true } } } } } },
  audienceBranch: { select: { name: true } },
  message: { select: { id: true } },
} satisfies Prisma.AnnouncementInclude;
type Row = Prisma.AnnouncementGetPayload<{ include: typeof include }>;

const fail = (field: string, message: string) => AppException.validation({ [field]: message });
const conflict = (message: string, code: string) =>
  new AppException(HttpStatus.CONFLICT, message, code);
const count = (n: number) => n.toLocaleString('en-NG');
const NOT_FOUND = 'Announcement not found';

/** Students only use the portal; everyone else can get any channel. */
const reachable = (role: string, channels: Channel[]) =>
  role === 'STUDENT' ? channels.filter((c) => c === 'In-app') : channels;

/**
 * Communication › Announcements: drafts, scheduled and sent announcements to the whole school, a
 * branch, staff or chosen classes, by in-app, email and SMS. Sending goes through the messaging
 * core (Delivery Logs show each recipient); in-app posts can be withdrawn from the portals.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audiences: CommsAudienceService,
    private readonly dispatch: CommsDispatchService,
    private readonly ledger: SmsLedgerService,
    private readonly audit: SchoolAuditService,
    private readonly permissions: MemberPermissions,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /** The tenant client where helpers take a transaction client (same object, still scoped). */
  private get tx() {
    return this.db as unknown as Prisma.TransactionClient;
  }

  private schoolId() {
    return RequestContext.schoolId()!;
  }

  /* ---------------- Options ---------------- */

  async options() {
    const [branches, classes] = await Promise.all([
      this.audiences.branches(),
      this.audiences.classOptions(),
    ]);
    return {
      branches,
      classes: classes.map(({ label, level, branchId, students }) => ({
        label,
        level,
        branchId,
        students,
      })),
      events: EVENTS.map((e) => ({ key: e.key, label: e.label })),
    };
  }

  /* ---------------- Reading ---------------- */

  private statusOf(a: { status: DbStatus; expiresOn: Date | null }): AnnouncementStatusLabel {
    const today = localDay(this.clock.now());
    if (a.status === 'SENT' && a.expiresOn && a.expiresOn.toISOString().slice(0, 10) < today)
      return 'Expired';
    return STATUS_LABEL[a.status];
  }

  private audienceOf(a: Row): Audience {
    return {
      kind: kindFromDb(a.audienceKind),
      classes: [
        ...new Set(a.audienceArms.map((x) => armLabel(x.arm.level.name, x.arm.name))),
      ].sort(),
      branchId: a.audienceBranchId,
    };
  }

  private audienceLabel(a: Row) {
    return `${labelOf(this.audienceOf(a))} · ${a.audienceBranch?.name ?? 'All branches'}`;
  }

  private async names(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    if (!wanted.length) return new Map<string, string>();
    const users = await this.db.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  }

  private rowOf(a: Row, names: Map<string, string>) {
    const status = this.statusOf(a);
    const at = a.sentAt ?? a.scheduledFor ?? a.updatedAt;
    const label = atLabel(at, this.clock.now());
    return {
      id: a.id,
      title: a.title || 'Untitled draft',
      snippet: a.body.length > 90 ? `${a.body.slice(0, 90).trimEnd()}…` : a.body,
      audience: this.audienceLabel(a),
      channels: sortChannels(a.channels.map(channelLabel)),
      by: names.get(a.createdById ?? '') ?? 'EduTrack',
      date: localStamp(at),
      dateLabel:
        status === 'Scheduled'
          ? `Scheduled ${label}`
          : status === 'Draft'
            ? `Edited ${label}`
            : label,
      status,
      recipients: a.recipientCount,
    };
  }

  async list(q: AnnouncementQuery) {
    const schoolId = this.schoolId();
    const all = await this.db.announcement.findMany({ include });
    const names = await this.names(all.map((a) => a.createdById));
    const rows = all.map((a) => this.rowOf(a, names)).sort((a, b) => b.date.localeCompare(a.date));
    const counts: Record<AnnouncementStatusLabel | 'All', number> = {
      All: rows.length,
      Draft: 0,
      Scheduled: 0,
      Sent: 0,
      Withdrawn: 0,
      Expired: 0,
    };
    for (const r of rows) counts[r.status]++;
    const needle = (q.search ?? '').trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (!q.status || r.status === q.status) &&
        (!needle || `${r.title} ${r.snippet} ${r.audience} ${r.by}`.toLowerCase().includes(needle)),
    );
    const pageSize = q.pageSize;
    const total = filtered.length;
    await this.ledger.addTermAllowance(schoolId);
    const [settings, termStart] = await Promise.all([
      this.ledger.read(this.tx, schoolId),
      this.termStart(),
    ]);
    return {
      rows: filtered.slice((q.page - 1) * pageSize, q.page * pageSize),
      meta: {
        page: q.page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      counts,
      sentThisTerm: all.filter((a) => a.sentAt && (!termStart || a.sentAt >= termStart)).length,
      smsCredit: settings.smsBalanceUnits,
    };
  }

  private async termStart() {
    const termId = await this.ledger.currentTermId(this.tx, this.schoolId());
    if (!termId) return null;
    const t = await this.db.term.findFirst({ where: { id: termId }, select: { startsOn: true } });
    return t?.startsOn ?? null;
  }

  private async find(id: string) {
    const a = await this.db.announcement.findFirst({ where: { id }, include });
    if (!a) throw AppException.notFound(NOT_FOUND);
    return a;
  }

  async get(id: string) {
    return this.detail(await this.find(id));
  }

  private async detail(a: Row) {
    const status = this.statusOf(a);
    const now = this.clock.now();
    const [names, events, stats] = await Promise.all([
      this.names([a.createdById]),
      this.db.auditEvent.findMany({
        where: { entityType: 'Announcement', entityId: a.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      a.message ? channelStats(this.db, a.message.id) : [],
    ]);
    const channels = sortChannels(a.channels.map(channelLabel));
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      smsText: a.smsText,
      audience: this.audienceOf(a),
      channels,
      scheduledFor: a.scheduledFor ? localStamp(a.scheduledFor) : null,
      expiresOn: a.expiresOn ? a.expiresOn.toISOString().slice(0, 10) : null,
      action: status === 'Scheduled' ? 'schedule' : status === 'Draft' ? 'draft' : 'send',
      status,
      audienceLabel: this.audienceLabel(a),
      createdBy: names.get(a.createdById ?? '') ?? 'EduTrack',
      createdAt: localStamp(a.createdAt),
      sentAt: a.sentAt ? localStamp(a.sentAt) : null,
      withdrawnAt: a.withdrawnAt ? localStamp(a.withdrawnAt) : null,
      withdrawReason: a.withdrawReason ?? '',
      recipients: a.recipientCount,
      smsUnits: a.smsUnits,
      messageId: a.message?.id ?? null,
      stats,
      history: events.map((e) => ({
        id: e.id,
        title: e.summary,
        detail: [e.actorName ?? 'EduTrack', e.detail].filter(Boolean).join(' · '),
        when: atLabel(e.createdAt, now),
        ...((e.after as { tone?: Tone } | null)?.tone && {
          tone: (e.after as { tone: Tone }).tone,
        }),
      })),
      canEdit: status === 'Draft' || status === 'Scheduled',
      canWithdraw: status === 'Sent' && channels.includes('In-app'),
      canCancel: status === 'Scheduled',
      canDelete: status === 'Draft',
    };
  }

  /* ---------------- Preview ---------------- */

  async preview(dto: AudiencePreviewDto) {
    const { audience, armIds } = await this.audiences.check(dto.audience);
    return this.previewOf(audience, armIds, sortChannels(dto.channels ?? []), dto.smsText ?? '');
  }

  private async previewOf(
    audience: Audience,
    armIds: string[],
    channels: Channel[],
    smsText: string,
  ) {
    const schoolId = this.schoolId();
    const { recipients, noGuardian } = await this.audiences.recipients(audience, armIds);
    const reach: Record<Channel, number> = { 'In-app': 0, Email: 0, SMS: 0 };
    const byRole = new Map<string, number>();
    let noEmail = 0;
    let noPhone = 0;
    let noPortal = 0;
    for (const r of recipients) {
      const role =
        r.role === 'PARENT'
          ? 'Parent'
          : r.role === 'STUDENT'
            ? 'Student'
            : r.role === 'TEACHER'
              ? 'Teacher'
              : 'Staff';
      byRole.set(role, (byRole.get(role) ?? 0) + 1);
      const can = reachable(r.role, CHANNELS);
      if (r.userId) reach['In-app']++;
      else if (r.role !== 'STUDENT') noPortal++;
      if (can.includes('Email')) {
        if (r.email) reach.Email++;
        else noEmail++;
      }
      if (can.includes('SMS')) {
        if (r.phone && normalizePhone(r.phone)) reach.SMS++;
        else noPhone++;
      }
    }
    const pages = smsText.trim() ? smsLength(smsSafe(smsText)).pages : 0;
    const units = channels.includes('SMS') ? reach.SMS * pages : 0;
    const students = byRole.get('Student') ?? 0;
    const gaps: string[] = [];
    if (noGuardian)
      gaps.push(
        `${count(noGuardian)} students have no guardian linked, so no parent hears about them.`,
      );
    if (channels.includes('Email') && noEmail)
      gaps.push(`${count(noEmail)} have no email address on record.`);
    if (channels.includes('SMS') && noPhone)
      gaps.push(`${count(noPhone)} have no valid phone number on record.`);
    if (channels.includes('In-app') && noPortal)
      gaps.push(
        `${count(noPortal)} haven’t activated their portal account; they see it once they do.`,
      );
    if (students && channels.some((c) => c !== 'In-app'))
      gaps.push('Students only receive In-app messages, in the Student Portal.');
    await this.ledger.addTermAllowance(schoolId);
    const [settings, sender] = await Promise.all([
      this.ledger.read(this.tx, schoolId),
      this.ledger.sender(this.tx, schoolId),
    ]);
    const credit = settings.smsBalanceUnits;
    const start = hhmm(settings.quietHoursStart);
    const end = hhmm(settings.quietHoursEnd);
    const quietNow =
      settings.quietHoursEnabled &&
      inWindow(localStamp(this.clock.now()).slice(11, 16), start, end);
    const pending = settings.senderIdStatus === 'PENDING_APPROVAL' && settings.senderId;
    const enough = units <= credit;
    return {
      label: `${labelOf(audience)} · ${
        audience.branchId
          ? ((await this.audiences.branches()).find((b) => b.id === audience.branchId)?.name ??
            'Removed branch')
          : 'All branches'
      }`,
      recipients: recipients.length,
      byRole: [...byRole.entries()].map(([role, n]) => ({ role, count: n })),
      reach,
      gaps,
      smsPages: pages,
      smsUnits: units,
      credit,
      enough,
      /** How many SMS go out with the units left (the rest are marked "out of SMS units"). */
      smsSendable: pages ? Math.min(reach.SMS, Math.floor(credit / pages)) : reach.SMS,
      sender,
      senderNote:
        sender !== DEFAULT_SENDER && !pending
          ? ''
          : pending
            ? `Sender ID “${settings.senderId}” is awaiting approval, so SMS goes out from “${sender}” until then.`
            : sender === DEFAULT_SENDER
              ? 'SMS goes out from “EDUTRACK” until your school’s sender ID is approved.'
              : '',
      quietHoursNote: settings.quietHoursEnabled
        ? quietNow
          ? `It’s quiet hours (${start}–${end}). SMS sent now is held until ${end}; in-app and email go straight away.`
          : `SMS isn’t sent during quiet hours (${start}–${end}).`
        : '',
    };
  }

  /* ---------------- Writing ---------------- */

  private async validate(dto: AnnouncementDto) {
    const action = dto.action;
    const final = action !== 'draft';
    const title = (dto.title ?? '').trim();
    if (!title) throw fail('title', 'Add a title.');
    if (title.length > 120) throw fail('title', 'Keep the title to 120 characters.');
    const body = (dto.body ?? '').trim();
    if (final && !body) throw fail('body', 'Write the message.');
    if (body.length > 2000) throw fail('body', 'Keep the message to 2,000 characters.');
    const channels = sortChannels([...new Set(dto.channels ?? [])]);
    if (final && !channels.length) throw fail('channels', 'Choose at least one channel.');
    const { audience, armIds } = await this.audiences.check(dto.audience);
    if (audience.kind !== 'classes' && !(await this.permissions.has('comms.school')))
      throw AppException.forbidden(
        'You can send announcements to classes only. Ask an admin with school-wide messaging to send this.',
      );
    const smsText = (dto.smsText ?? '').trim();
    if (channels.includes('SMS')) {
      if (final && !smsText) throw fail('smsText', 'Write the SMS version of the message.');
      if (smsLength(smsSafe(smsText)).pages > MAX_SMS_PAGES)
        throw fail('smsText', `Keep the SMS to ${MAX_SMS_PAGES} pages (459 characters).`);
    }
    if (final && audience.kind === 'students' && !channels.includes('In-app'))
      throw fail(
        'channels',
        'Students only receive In-app messages. Add In-app, or choose another audience.',
      );
    const now = this.clock.now();
    let scheduledFor: Date | null = null;
    if (action === 'schedule') {
      const s = (dto.scheduledFor ?? '').slice(0, 16);
      if (!LOCAL_STAMP.test(s)) throw fail('scheduledFor', 'Choose the date and time to send it.');
      scheduledFor = fromLocalStamp(s);
      if (Number.isNaN(scheduledFor.getTime()))
        throw fail('scheduledFor', 'Choose the date and time to send it.');
      if (scheduledFor.getTime() < now.getTime() + 5 * 60_000)
        throw fail('scheduledFor', 'Schedule it at least 5 minutes from now, or send it now.');
      if (scheduledFor.getTime() > now.getTime() + 90 * 86_400_000)
        throw fail('scheduledFor', 'You can schedule up to 90 days ahead.');
    }
    const expiresOn = dto.expiresOn || null;
    if (expiresOn) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(expiresOn)))
        throw fail('expiresOn', 'Enter a valid expiry date.');
      const sendDay = localDay(scheduledFor ?? now);
      if (final && expiresOn < sendDay)
        throw fail('expiresOn', 'The expiry date can’t be before it goes out.');
    }
    let recipients = 0;
    if (final) {
      recipients = (await this.audiences.recipients(audience, armIds)).recipients.length;
      if (!recipients)
        throw fail(
          'audience',
          'Nobody is in this audience yet. Choose another audience or branch.',
        );
    }
    return {
      action,
      title,
      body,
      smsText,
      channels,
      audience,
      armIds,
      scheduledFor,
      expiresOn,
      recipients,
    };
  }

  private async history(
    id: string,
    title: string,
    detail: string | null,
    tone?: Tone,
    db?: Prisma.TransactionClient,
  ) {
    await this.audit.record(
      {
        action: 'announcement.update',
        area: 'Communication',
        entity: 'Announcement',
        entityId: id,
        summary: title,
        detail,
        ...(tone && { after: { tone } }),
      },
      db,
    );
  }

  /** Saves the fields and arms, and moves the announcement to its new state. */
  private async apply(
    auth: AuthUserContext,
    a: { id: string; status: DbStatus },
    v: Awaited<ReturnType<AnnouncementsService['validate']>>,
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.announcement.update({
        where: { id: a.id },
        data: {
          // Times follow the app clock (the database would stamp real time).
          updatedAt: this.clock.now(),
          title: v.title,
          body: v.body,
          smsText: v.smsText,
          channels: v.channels.map(channelToDb),
          audienceKind: kindToDb(v.audience.kind),
          audienceBranchId: v.audience.branchId,
          expiresOn: v.expiresOn ? new Date(`${v.expiresOn}T00:00:00.000Z`) : null,
          status: v.action === 'draft' ? 'DRAFT' : v.action === 'schedule' ? 'SCHEDULED' : a.status,
          scheduledFor: v.action === 'schedule' ? v.scheduledFor : null,
          // "Edited …" labels read this against the app clock, so stamp it from the clock too.
          updatedAt: this.clock.now(),
        },
      });
      await tx.announcementArm.deleteMany({ where: { announcementId: a.id } });
      if (v.armIds.length)
        await tx.announcementArm.createMany({
          data: v.armIds.map((armId) => ({
            schoolId: this.schoolId(),
            announcementId: a.id,
            armId,
          })),
        });
      if (v.action === 'draft' && a.status === 'SCHEDULED')
        await this.history(a.id, 'Schedule cancelled · back to draft', null, undefined, asTx(tx));
      if (v.action === 'schedule')
        await this.history(
          a.id,
          `Scheduled for ${atLabel(v.scheduledFor!, this.clock.now())}`,
          `about ${count(v.recipients)} recipients`,
          'info',
          asTx(tx),
        );
    });
    if (v.action === 'send') await this.sendNow(a.id, auth.userId, false);
  }

  async create(auth: AuthUserContext, dto: AnnouncementDto) {
    const v = await this.validate(dto);
    const a = await this.db.announcement.create({
      data: {
        // Times follow the app clock (the database would stamp real time).
        updatedAt: this.clock.now(),
        schoolId: this.schoolId(),
        title: v.title,
        body: v.body,
        audienceKind: kindToDb(v.audience.kind),
        channels: [],
        createdById: auth.userId,
        createdAt: this.clock.now(),
      },
    });
    await this.history(a.id, 'Created', null);
    await this.apply(auth, a, v);
    return this.get(a.id);
  }

  async update(auth: AuthUserContext, id: string, dto: AnnouncementDto) {
    const a = await this.find(id);
    if (a.status !== 'DRAFT' && a.status !== 'SCHEDULED')
      throw conflict(
        'Only drafts and scheduled announcements can be edited. Duplicate it to send a new version.',
        'ANNOUNCEMENT_NOT_EDITABLE',
      );
    await this.requireManage(a);
    const v = await this.validate(dto);
    if (a.status === 'DRAFT' || v.action !== 'draft') await this.history(a.id, 'Edited', null);
    await this.apply(auth, a, v);
    return this.get(a.id);
  }

  /** Section admins only manage announcements to their sections' classes. */
  private async requireManage(a: Row) {
    await this.audiences.requireSections(
      kindFromDb(a.audienceKind),
      await this.sectionIdsOf(a.audienceArms.map((x) => x.armId)),
    );
  }

  private async sectionIdsOf(armIds: string[]) {
    if (!armIds.length) return [];
    const arms = await this.db.classArm.findMany({
      where: { id: { in: armIds } },
      select: { level: { select: { sectionId: true } } },
    });
    return [...new Set(arms.map((x) => x.level.sectionId))];
  }

  /**
   * Sends an announcement now: resolves its audience, records the message and deliveries,
   * marks it Sent, then hands email and SMS to the transports.
   */
  private async sendNow(id: string, userId: string | null, scheduled: boolean) {
    const a = await this.find(id);
    const audience = this.audienceOf(a);
    const armIds = a.audienceArms.map((x) => x.armId);
    const { recipients } = await this.audiences.recipients(audience, armIds);
    const school = await this.db.school.findUniqueOrThrow({
      where: { id: this.schoolId() },
      select: { name: true },
    });
    const channels = sortChannels(a.channels.map(channelLabel));
    const content: Partial<Record<Channel, ChannelTemplate>> = {
      'In-app': { subject: a.title, body: a.body },
      Email: { subject: a.title, body: `${a.body}\n\n${school.name}` },
      SMS: { subject: '', body: a.smsText },
    };
    const now = this.clock.now();
    const result = await this.db.$transaction(
      async (tx) => {
        const r = await this.dispatch.dispatch(asTx(tx), this.schoolId(), {
          event: 'announcement',
          title: a.title,
          audienceLabel: this.audienceLabel(a),
          recipients,
          createdById: userId,
          channels,
          content,
          announcementId: a.id,
          source: { type: 'Announcement', id: a.id },
          inApp: { category: 'announcements', link: '/announcements' },
        });
        await tx.announcement.update({
          where: { id: a.id },
          data: {
            // Times follow the app clock (the database would stamp real time).
            updatedAt: this.clock.now(),
            status: 'SENT',
            sentAt: now,
            scheduledFor: scheduled ? a.scheduledFor : null,
            recipientCount: r.recipients,
            smsUnits: r.smsUnits,
          },
        });
        const notSent = r.messageId
          ? await tx.messageDelivery.count({
              where: { messageId: r.messageId, channel: 'SMS', waitingForCredit: true },
            })
          : 0;
        await this.history(
          a.id,
          scheduled ? 'Sent as scheduled' : 'Sent',
          `${count(r.recipients)} recipients${notSent ? ` · ${count(notSent)} SMS not sent: out of SMS units` : ''}`,
          notSent ? 'warning' : 'success',
          asTx(tx),
        );
        return r;
      },
      { timeout: 60_000 },
    );
    await result.flush();
    return result;
  }

  async cancel(id: string) {
    const a = await this.find(id);
    if (a.status !== 'SCHEDULED')
      throw conflict(
        'Only a scheduled announcement can be cancelled.',
        'ANNOUNCEMENT_NOT_SCHEDULED',
      );
    await this.requireManage(a);
    await this.db.announcement.update({
      where: { id },
      data: { status: 'DRAFT', scheduledFor: null, updatedAt: this.clock.now() },
    });
    await this.history(id, 'Schedule cancelled · back to draft', null, 'warning');
    return this.get(id);
  }

  async withdraw(id: string, reasonInput?: string) {
    const a = await this.find(id);
    if (this.statusOf(a) !== 'Sent')
      throw conflict(
        'Only a sent announcement that hasn’t expired can be withdrawn.',
        'ANNOUNCEMENT_NOT_WITHDRAWABLE',
      );
    if (!a.channels.includes('IN_APP'))
      throw conflict(
        'This went out by email or SMS only, which can’t be recalled.',
        'ANNOUNCEMENT_NOT_RECALLABLE',
      );
    await this.requireManage(a);
    const reason = (reasonInput ?? '').trim();
    if (reason.length > 300) throw fail('reason', 'Keep the reason to 300 characters.');
    await this.db.$transaction(async (tx) => {
      await tx.announcement.update({
        where: { id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: this.clock.now(),
          withdrawReason: reason,
          updatedAt: this.clock.now(),
        },
      });
      // Out of every portal: the in-app notifications it created go.
      if (a.message) {
        const inApp = await tx.messageDelivery.findMany({
          where: { messageId: a.message.id, channel: 'IN_APP' },
          select: { id: true },
        });
        await tx.notification.deleteMany({ where: { deliveryId: { in: inApp.map((d) => d.id) } } });
      }
      await this.history(id, 'Withdrawn from the portals', reason || null, 'warning', asTx(tx));
    });
    return this.get(id);
  }

  async duplicate(auth: AuthUserContext, id: string) {
    const src = await this.find(id);
    await this.requireManage(src);
    const today = localDay(this.clock.now());
    const keepExpiry = src.expiresOn && src.expiresOn.toISOString().slice(0, 10) >= today;
    const copy = await this.db.$transaction(async (tx) => {
      const a = await tx.announcement.create({
        data: {
          // Times follow the app clock (the database would stamp real time).
          updatedAt: this.clock.now(),
          schoolId: this.schoolId(),
          title: src.title.slice(0, 120),
          body: src.body,
          smsText: src.smsText,
          audienceKind: src.audienceKind,
          audienceBranchId: src.audienceBranchId,
          channels: src.channels,
          expiresOn: keepExpiry ? src.expiresOn : null,
          createdById: auth.userId,
          createdAt: this.clock.now(),
        },
      });
      if (src.audienceArms.length)
        await tx.announcementArm.createMany({
          data: src.audienceArms.map((x) => ({
            schoolId: this.schoolId(),
            announcementId: a.id,
            armId: x.armId,
          })),
        });
      await this.history(a.id, `Copied from “${src.title}”`, null, undefined, asTx(tx));
      return a;
    });
    return this.get(copy.id);
  }

  async remove(id: string) {
    const a = await this.find(id);
    if (a.status !== 'DRAFT')
      throw conflict('Only drafts can be deleted.', 'ANNOUNCEMENT_NOT_DRAFT');
    await this.requireManage(a);
    await this.db.announcement.delete({ where: { id } });
    await this.audit.record({
      action: 'announcement.delete',
      area: 'Communication',
      entity: 'Announcement',
      entityId: id,
      summary: `Draft “${a.title || 'Untitled draft'}” deleted`,
    });
    return { ok: true };
  }

  /* ---------------- Scheduled ---------------- */

  /** Sends this school's scheduled announcements that are due (the comms job). */
  async sendDue() {
    const due = await this.db.announcement.findMany({
      where: { status: 'SCHEDULED', scheduledFor: { lte: this.clock.now() } },
      select: { id: true, title: true, createdById: true },
      orderBy: { scheduledFor: 'asc' },
    });
    for (const a of due) {
      const r = await this.sendNow(a.id, a.createdById, true);
      if (a.createdById)
        await this.db.notification.create({
          data: {
            userId: a.createdById,
            schoolId: this.schoolId(),
            category: 'communication',
            title: `Scheduled announcement sent: ${a.title}`,
            body: `Communication · ${count(r.recipients)} recipients`,
            link: `/communication/announcements/${a.id}`,
            entityType: 'Announcement',
            entityId: a.id,
            createdAt: this.clock.now(),
          },
        });
    }
    return due.length;
  }
}
