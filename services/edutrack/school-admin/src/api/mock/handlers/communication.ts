/** Communication: announcements, delivery logs, templates, notification settings and the inbox. */
import { MockHttpError, mock, paginate, type MockRequest } from '@edutrack/web-core/mock';

import type {
  AnnouncementDetail,
  AnnouncementPayload,
  AnnouncementRow,
  AnnouncementStatus,
  Audience,
  AudiencePreview,
  Channel,
  ChannelStats,
  ChannelTemplate,
  CommsSettings,
  DeliveryDetail,
  DeliveryRow,
  DeliveryStatus,
  EventSetting,
  EventSettingsPayload,
  InboxItem,
  RecipientRole,
  TemplateDetail,
  TemplateRow,
} from '@/types';

import {
  EVENTS,
  GLOBAL_VARS,
  eventDef,
  render,
  smsLength,
  smsSafe,
  variablesIn,
} from '../comms-catalog';
import {
  LOW_CREDIT,
  SMS_UNIT_PRICE,
  addMinutes,
  atLabel,
  audienceLabel,
  audienceRecipients,
  channelsFor,
  commsFor,
  localNow,
  logSetting,
  nextCommsId,
  retryMessage,
  retryableIn,
  sendAnnouncement,
  smsSender,
  templatesOf,
  unitsUsedThisTerm,
  type AnnouncementRec,
  type CommsData,
  type MessageRec,
} from '../comms-db';
import { notifications } from '../db';
import { financeData } from '../finance-db';
import { isoToday } from '../finance-ledger';
import { schoolData } from '../school-db';
import { classOf, financeSnapshot } from './finance-shared';
import { currentUser, requireText } from './shared';

const CHANNELS: Channel[] = ['In-app', 'Email', 'SMS'];
const MAX_SMS_PAGES = 3;

function commsCtx(req: Pick<MockRequest, 'headers'>) {
  const user = currentUser(req);
  return {
    c: commsFor(user.schoolId),
    schoolId: user.schoolId,
    actor: `${user.firstName} ${user.lastName}`,
  };
}

const fail = (message: string, status = 422): never => {
  throw new MockHttpError(status, message);
};

/* ---------------- Options ---------------- */

function classOptions(schoolId: string) {
  const fin = financeData[schoolId];
  const map = new Map<
    string,
    { label: string; level: string; branchId: string; students: number }
  >();
  for (const s of fin?.studentIndex().values() ?? []) {
    if (!s.active || !s.arm) continue;
    const label = classOf(s);
    const k = `${s.branchId}|${label}`;
    const cur = map.get(k);
    if (cur) cur.students++;
    else map.set(k, { label, level: s.level, branchId: s.branchId, students: 1 });
  }
  return [...map.values()];
}

mock.get('/v1/comms/options', (req) => {
  const { schoolId } = commsCtx(req);
  return {
    branches: (schoolData[schoolId]?.branches ?? [])
      .filter((b) => b.status === 'Active')
      .map((b) => ({ id: b.id, name: b.name })),
    classes: classOptions(schoolId),
    events: EVENTS.map((e) => ({ key: e.key, label: e.label })),
    smsUnitPrice: SMS_UNIT_PRICE,
  };
});

/* ---------------- Stats ---------------- */

function statsOf(msg: MessageRec | null | undefined): ChannelStats[] {
  if (!msg) return [];
  return msg.channels
    .map((channel) => {
      const s: ChannelStats = {
        channel,
        recipients: 0,
        delivered: 0,
        read: 0,
        queued: 0,
        sent: 0,
        failed: 0,
      };
      for (const rec of msg.recipients) {
        const o = rec.out[channel];
        if (!o) continue;
        s.recipients++;
        if (o.status === 'Delivered') s.delivered++;
        else if (o.status === 'Read') {
          s.delivered++;
          s.read++;
        } else if (o.status === 'Queued') s.queued++;
        else if (o.status === 'Sent') s.sent++;
        else s.failed++;
      }
      return s;
    })
    .filter((s) => s.recipients);
}

/* ---------------- Announcements ---------------- */

const today = () => isoToday();

function statusOf(a: AnnouncementRec): AnnouncementStatus {
  if (a.status === 'Sent' && a.expiresOn && a.expiresOn < today()) return 'Expired';
  return a.status;
}

function rowOf(c: CommsData, a: AnnouncementRec): AnnouncementRow {
  const status = statusOf(a);
  const date = a.sentAt ?? a.scheduledFor ?? a.updatedAt;
  return {
    id: a.id,
    title: a.title || 'Untitled draft',
    snippet: a.body.length > 90 ? `${a.body.slice(0, 90).trimEnd()}…` : a.body,
    audience: audienceLabel(c.schoolId, a.audience),
    channels: a.channels,
    by: a.createdBy,
    date,
    dateLabel:
      status === 'Scheduled'
        ? `Scheduled ${atLabel(date)}`
        : status === 'Draft'
          ? `Edited ${atLabel(date)}`
          : atLabel(date),
    status,
    recipients: a.recipients,
  };
}

function detailOf(c: CommsData, a: AnnouncementRec): AnnouncementDetail {
  const status = statusOf(a);
  const msg = a.messageId ? c.messages.find((m) => m.id === a.messageId) : null;
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    smsText: a.smsText,
    audience: a.audience,
    channels: a.channels,
    scheduledFor: a.scheduledFor,
    expiresOn: a.expiresOn,
    action: status === 'Scheduled' ? 'schedule' : status === 'Draft' ? 'draft' : 'send',
    status,
    audienceLabel: audienceLabel(c.schoolId, a.audience),
    createdBy: a.createdBy,
    createdAt: a.createdAt,
    sentAt: a.sentAt,
    withdrawnAt: a.withdrawnAt,
    withdrawReason: a.withdrawReason,
    recipients: a.recipients,
    smsUnits: a.smsUnits,
    messageId: a.messageId,
    stats: statsOf(msg),
    history: [...a.history].reverse(),
    canEdit: status === 'Draft' || status === 'Scheduled',
    canWithdraw: status === 'Sent' && a.channels.includes('In-app'),
    canCancel: status === 'Scheduled',
    canDelete: status === 'Draft',
  };
}

const findAnnouncement = (c: CommsData, id: string) =>
  c.announcements.find((a) => a.id === id) ?? fail('Announcement not found', 404);

mock.get('/v1/comms/announcements', (req) => {
  const { c } = commsCtx(req);
  const all = [...c.announcements]
    .map((a) => rowOf(c, a))
    .sort((a, b) => b.date.localeCompare(a.date));
  const counts = {
    All: all.length,
    Draft: 0,
    Scheduled: 0,
    Sent: 0,
    Withdrawn: 0,
    Expired: 0,
  } as Record<AnnouncementStatus | 'All', number>;
  for (const a of all) counts[a.status]++;
  const status = req.query.status;
  const rows = status ? all.filter((a) => a.status === status) : all;
  const { data, meta } = paginate(
    rows,
    { ...req.query, pageSize: req.query.pageSize ?? '20' },
    (a) => `${a.title} ${a.snippet} ${a.audience} ${a.by}`,
  );
  const termStart = termStartOf(c.schoolId);
  return {
    rows: data,
    meta,
    counts,
    sentThisTerm: c.announcements.filter((a) => a.sentAt && a.sentAt >= termStart).length,
    smsCredit: c.credit,
  };
});

function termStartOf(schoolId: string) {
  const snap = financeSnapshot(schoolId);
  const t = snap.terms
    .filter((x) => x.start <= today())
    .sort((a, b) => b.start.localeCompare(a.start))[0];
  return t?.start ?? today();
}

mock.get('/v1/comms/announcements/:id', (req) => {
  const { c } = commsCtx(req);
  return detailOf(c, findAnnouncement(c, req.params.id!));
});

function checkAudience(c: CommsData, a: Partial<Audience> | undefined): Audience {
  const kinds = ['everyone', 'parents', 'students', 'teachers', 'staff', 'classes'];
  if (!a || !kinds.includes(a.kind as string)) fail('Choose who the announcement is for.');
  const branchId = a!.branchId ?? null;
  if (
    branchId &&
    !schoolData[c.schoolId]?.branches.some((b) => b.id === branchId && b.status === 'Active')
  )
    fail('Choose an active branch, or All branches.');
  let classes: string[] = [];
  if (a!.kind === 'classes') {
    classes = [...new Set((a!.classes ?? []).filter((x) => typeof x === 'string'))];
    if (!classes.length) fail('Choose at least one class.');
    const known = new Set(
      classOptions(c.schoolId)
        .filter((o) => !branchId || o.branchId === branchId)
        .map((o) => o.label),
    );
    const missing = classes.filter((x) => !known.has(x));
    if (missing.length)
      fail(
        `${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no active students in this branch.`,
      );
  }
  return { kind: a!.kind as Audience['kind'], classes, branchId };
}

function preview(
  c: CommsData,
  audience: Audience,
  channels: Channel[],
  smsText: string,
): AudiencePreview {
  const { recipients, noGuardian } = audienceRecipients(c.schoolId, audience);
  const reach: Record<Channel, number> = { 'In-app': 0, Email: 0, SMS: 0 };
  const byRole = new Map<RecipientRole, number>();
  let noEmail = 0;
  let noPhone = 0;
  let noPortal = 0;
  for (const rec of recipients) {
    byRole.set(rec.role, (byRole.get(rec.role) ?? 0) + 1);
    const can = channelsFor(rec, CHANNELS);
    if (can.includes('In-app') && rec.portal) reach['In-app']++;
    else if (rec.role !== 'Student') noPortal++;
    if (can.includes('Email')) {
      if (rec.email) reach.Email++;
      else noEmail++;
    }
    if (can.includes('SMS')) {
      if (rec.phone && /^(\+234|0)[789][01]\d{8}$/.test(rec.phone.replace(/[\s-]/g, '')))
        reach.SMS++;
      else noPhone++;
    }
  }
  const pages = smsText.trim() ? smsLength(smsSafe(smsText)).pages : 0;
  const units = channels.includes('SMS') ? reach.SMS * pages : 0;
  const students = byRole.get('Student') ?? 0;
  const gaps: string[] = [];
  if (noGuardian)
    gaps.push(
      `${noGuardian.toLocaleString('en-NG')} students have no guardian linked, so no parent hears about them.`,
    );
  if (channels.includes('Email') && noEmail)
    gaps.push(`${noEmail.toLocaleString('en-NG')} have no email address on record.`);
  if (channels.includes('SMS') && noPhone)
    gaps.push(`${noPhone.toLocaleString('en-NG')} have no valid phone number on record.`);
  if (channels.includes('In-app') && noPortal)
    gaps.push(
      `${noPortal.toLocaleString('en-NG')} haven’t activated their portal account; they see it once they do.`,
    );
  if (students && channels.some((ch) => ch !== 'In-app'))
    gaps.push(`Students only receive In-app messages, in the Student Portal.`);
  const hhmm = localNow().slice(11, 16);
  const q = c.quietHours;
  const quietNow =
    q.enabled &&
    (q.start <= q.end ? hhmm >= q.start && hhmm < q.end : hhmm >= q.start || hhmm < q.end);
  return {
    label: audienceLabel(c.schoolId, audience),
    recipients: recipients.length,
    byRole: [...byRole.entries()].map(([role, count]) => ({ role, count })),
    reach,
    gaps,
    smsPages: pages,
    smsUnits: units,
    smsCost: units * SMS_UNIT_PRICE,
    credit: c.credit,
    enough: units <= c.credit,
    sender: smsSender(c),
    senderNote:
      c.senderId.status === 'Approved'
        ? ''
        : c.senderId.status === 'Pending approval'
          ? `Sender ID “${c.senderId.name}” is awaiting approval, so SMS goes out from “EDUTRACK” until then.`
          : 'SMS goes out from “EDUTRACK” until your school’s sender ID is approved.',
    quietHoursNote: q.enabled
      ? quietNow
        ? `It’s quiet hours (${q.start}–${q.end}). SMS sent now is held until ${q.end}; in-app and email go straight away.`
        : `SMS isn’t sent during quiet hours (${q.start}–${q.end}).`
      : '',
  };
}

mock.post('/v1/comms/announcements/preview', (req) => {
  const { c } = commsCtx(req);
  const p = (req.body ?? {}) as Partial<AnnouncementPayload>;
  const audience = checkAudience(c, p.audience);
  const channels = (p.channels ?? []).filter((ch) => CHANNELS.includes(ch));
  return preview(c, audience, channels, p.smsText ?? '');
});

function validate(c: CommsData, body: unknown) {
  const p = (body ?? {}) as Partial<AnnouncementPayload>;
  const action = p.action;
  if (action !== 'draft' && action !== 'send' && action !== 'schedule')
    fail('Choose what to do with the announcement.');
  const final = action !== 'draft';
  const title = (p.title ?? '').trim();
  if (!title) fail('Add a title.');
  if (title.length > 120) fail('Keep the title to 120 characters.');
  const text = (p.body ?? '').trim();
  if (final && !text) fail('Write the message.');
  if (text.length > 2000) fail('Keep the message to 2,000 characters.');
  const channels = [...new Set((p.channels ?? []).filter((ch) => CHANNELS.includes(ch)))];
  if (final && !channels.length) fail('Choose at least one channel.');
  const audience = checkAudience(c, p.audience);
  const smsText = (p.smsText ?? '').trim();
  if (channels.includes('SMS')) {
    if (final && !smsText) fail('Write the SMS version of the message.');
    if (smsLength(smsSafe(smsText)).pages > MAX_SMS_PAGES)
      fail(`Keep the SMS to ${MAX_SMS_PAGES} pages (459 characters).`);
  }
  if (final && audience.kind === 'students' && !channels.includes('In-app'))
    fail('Students only receive In-app messages. Add In-app, or choose another audience.');
  let scheduledFor: string | null = null;
  const now = localNow();
  if (action === 'schedule') {
    scheduledFor = (p.scheduledFor ?? '').slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledFor))
      fail('Choose the date and time to send it.');
    if (scheduledFor < addMinutes(now, 5))
      fail('Schedule it at least 5 minutes from now, or send it now.');
    if (scheduledFor > addMinutes(now, 90 * 24 * 60)) fail('You can schedule up to 90 days ahead.');
  } else if (action === 'draft' && p.scheduledFor) scheduledFor = null;
  const expiresOn = p.expiresOn || null;
  if (expiresOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) fail('Enter a valid expiry date.');
    const sendDay = (scheduledFor ?? now).slice(0, 10);
    if (final && expiresOn < sendDay) fail('The expiry date can’t be before it goes out.');
  }
  let pv: AudiencePreview | null = null;
  if (final) {
    pv = preview(c, audience, channels, smsText);
    if (!pv.recipients) fail('Nobody is in this audience yet. Choose another audience or branch.');
    if (!pv.enough)
      fail(
        `This needs ${pv.smsUnits.toLocaleString('en-NG')} SMS units but your school has ${pv.credit.toLocaleString('en-NG')}. Remove SMS, shorten the SMS text, narrow the audience, or ask EduTrack support to top up.`,
      );
  }
  return {
    action: action!,
    title,
    body: text,
    smsText,
    channels,
    audience,
    scheduledFor,
    expiresOn,
    preview: pv,
  };
}

function apply(c: CommsData, a: AnnouncementRec, v: ReturnType<typeof validate>, actor: string) {
  Object.assign(a, {
    title: v.title,
    body: v.body,
    smsText: v.smsText,
    channels: v.channels,
    audience: v.audience,
    expiresOn: v.expiresOn,
    updatedAt: localNow(),
  });
  if (v.action === 'draft') {
    if (a.status === 'Scheduled')
      a.history.push({
        id: `ah${a.history.length + 1}`,
        title: 'Schedule cancelled · back to draft',
        detail: actor,
        when: atLabel(localNow()),
      });
    a.status = 'Draft';
    a.scheduledFor = null;
  } else if (v.action === 'schedule') {
    a.status = 'Scheduled';
    a.scheduledFor = v.scheduledFor;
    a.history.push({
      id: `ah${a.history.length + 1}`,
      title: `Scheduled for ${atLabel(v.scheduledFor!)}`,
      detail: `${actor} · about ${v.preview!.recipients.toLocaleString('en-NG')} recipients`,
      when: atLabel(localNow()),
      tone: 'info',
    });
  } else {
    a.scheduledFor = null;
    sendAnnouncement(c, a, actor);
  }
}

mock.post('/v1/comms/announcements', (req) => {
  const { c, actor } = commsCtx(req);
  const v = validate(c, req.body);
  const now = localNow();
  const a: AnnouncementRec = {
    id: nextCommsId(c, 'an'),
    title: '',
    body: '',
    smsText: '',
    audience: v.audience,
    channels: [],
    status: 'Draft',
    scheduledFor: null,
    expiresOn: null,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    withdrawnAt: null,
    withdrawReason: '',
    recipients: null,
    smsUnits: 0,
    messageId: null,
    history: [{ id: 'ah0', title: 'Created', detail: actor, when: atLabel(now) }],
  };
  c.announcements.unshift(a);
  apply(c, a, v, actor);
  return detailOf(c, a);
});

mock.put('/v1/comms/announcements/:id', (req) => {
  const { c, actor } = commsCtx(req);
  const a = findAnnouncement(c, req.params.id!);
  if (a.status !== 'Draft' && a.status !== 'Scheduled')
    fail(
      'Only drafts and scheduled announcements can be edited. Duplicate it to send a new version.',
      409,
    );
  const v = validate(c, req.body);
  if (a.status === 'Draft' || v.action !== 'draft')
    a.history.push({
      id: `ah${a.history.length + 1}`,
      title: 'Edited',
      detail: actor,
      when: atLabel(localNow()),
    });
  apply(c, a, v, actor);
  return detailOf(c, a);
});

mock.post('/v1/comms/announcements/:id/cancel', (req) => {
  const { c, actor } = commsCtx(req);
  const a = findAnnouncement(c, req.params.id!);
  if (a.status !== 'Scheduled') fail('Only a scheduled announcement can be cancelled.', 409);
  a.status = 'Draft';
  a.scheduledFor = null;
  a.updatedAt = localNow();
  a.history.push({
    id: `ah${a.history.length + 1}`,
    title: 'Schedule cancelled · back to draft',
    detail: actor,
    when: atLabel(localNow()),
    tone: 'warning',
  });
  return detailOf(c, a);
});

mock.post('/v1/comms/announcements/:id/withdraw', (req) => {
  const { c, actor } = commsCtx(req);
  const a = findAnnouncement(c, req.params.id!);
  if (statusOf(a) !== 'Sent')
    fail('Only a sent announcement that hasn’t expired can be withdrawn.', 409);
  if (!a.channels.includes('In-app'))
    fail('This went out by email or SMS only, which can’t be recalled.', 409);
  const reason = ((req.body as { reason?: string } | undefined)?.reason ?? '').trim();
  if (reason.length > 300) fail('Keep the reason to 300 characters.');
  a.status = 'Withdrawn';
  a.withdrawnAt = localNow();
  a.withdrawReason = reason;
  a.history.push({
    id: `ah${a.history.length + 1}`,
    title: 'Withdrawn from the portals',
    detail: `${actor}${reason ? ` · ${reason}` : ''}`,
    when: atLabel(localNow()),
    tone: 'warning',
  });
  return detailOf(c, a);
});

mock.post('/v1/comms/announcements/:id/duplicate', (req) => {
  const { c, actor } = commsCtx(req);
  const src = findAnnouncement(c, req.params.id!);
  const now = localNow();
  const a: AnnouncementRec = {
    ...structuredClone(src),
    id: nextCommsId(c, 'an'),
    title: `${src.title}`.slice(0, 120),
    status: 'Draft',
    scheduledFor: null,
    expiresOn: src.expiresOn && src.expiresOn >= today() ? src.expiresOn : null,
    createdBy: actor,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    withdrawnAt: null,
    withdrawReason: '',
    recipients: null,
    smsUnits: 0,
    messageId: null,
    history: [
      { id: 'ah0', title: `Copied from “${src.title}”`, detail: actor, when: atLabel(now) },
    ],
  };
  c.announcements.unshift(a);
  return detailOf(c, a);
});

mock.delete('/v1/comms/announcements/:id', (req) => {
  const { c } = commsCtx(req);
  const a = findAnnouncement(c, req.params.id!);
  if (a.status !== 'Draft') fail('Only drafts can be deleted.', 409);
  c.announcements = c.announcements.filter((x) => x !== a);
  return { ok: true };
});

/* ---------------- Delivery logs ---------------- */

function deliveryRows(c: CommsData): DeliveryRow[] {
  const rows: DeliveryRow[] = [];
  for (const m of c.messages) {
    const def = eventDef(m.event);
    for (const s of statsOf(m)) {
      const single = s.recipients === 1 ? m.recipients.find((x) => x.out[s.channel]) : null;
      const o = single?.out[s.channel];
      let status: DeliveryStatus;
      let detail: string;
      if (o) {
        status = o.status;
        detail = o.detail;
      } else {
        status =
          s.failed === s.recipients
            ? 'Failed'
            : s.queued === s.recipients
              ? 'Queued'
              : s.sent
                ? 'Sent'
                : s.read === s.recipients
                  ? 'Read'
                  : 'Delivered';
        const parts = [
          s.failed &&
            `${s.failed.toLocaleString('en-NG')} of ${s.recipients.toLocaleString('en-NG')} failed`,
          s.queued && `${s.queued.toLocaleString('en-NG')} queued`,
          s.sent && `${s.sent.toLocaleString('en-NG')} awaiting receipt`,
          s.read &&
            s.channel !== 'SMS' &&
            `${s.read.toLocaleString('en-NG')} ${s.channel === 'Email' ? 'opened' : 'read'}`,
        ].filter(Boolean);
        detail = parts.join(' · ');
      }
      const roles = new Set(m.recipients.filter((x) => x.out[s.channel]).map((x) => x.role));
      rows.push({
        id: `${m.id}~${s.channel}`,
        messageId: m.id,
        title: m.title,
        event: m.event,
        eventLabel: def?.label ?? m.event,
        recipient: single
          ? single.name
          : `${s.recipients.toLocaleString('en-NG')} ${roles.size === 1 ? roleNoun([...roles][0]!) : 'recipients'}`,
        recipients: s.recipients,
        channel: s.channel,
        status,
        failed: s.failed,
        detail,
        at: m.at,
        atLabel: atLabel(m.at),
      });
    }
  }
  return rows;
}

const roleNoun = (role: RecipientRole) =>
  ({ Parent: 'parents', Student: 'students', Teacher: 'teachers', Staff: 'staff' })[role];

mock.get('/v1/comms/deliveries', (req) => {
  const { c } = commsCtx(req);
  const q = req.query;
  const all = deliveryRows(c);
  const rows = all.filter(
    (row) =>
      (!q.channel || row.channel === q.channel) &&
      (!q.event || row.event === q.event) &&
      (!q.status || (q.status === 'Failed' ? row.failed > 0 : row.status === q.status)),
  );
  const { data, meta } = paginate(
    rows,
    { ...q, pageSize: q.pageSize ?? '20' },
    (row) => `${row.title} ${row.recipient} ${row.eventLabel} ${row.detail}`,
  );
  const now = localNow();
  const weekAgo = addMinutes(now, -7 * 24 * 60);
  let today = 0;
  let ok = 0;
  let attempted = 0;
  let failed = 0;
  let queued = 0;
  for (const m of c.messages)
    for (const rec of m.recipients)
      for (const o of Object.values(rec.out)) {
        if (!o) continue;
        if (o.status === 'Queued') queued++;
        if (m.at.slice(0, 10) === now.slice(0, 10)) today++;
        if (m.at < weekAgo) continue;
        if (o.status !== 'Queued') attempted++;
        if (o.status === 'Delivered' || o.status === 'Read' || o.status === 'Sent') ok++;
        if (o.status === 'Failed') failed++;
      }
  return {
    rows: data,
    meta,
    summary: {
      today,
      deliveredRate: attempted ? Math.round((ok / attempted) * 1000) / 10 : null,
      failed,
      retryable: c.messages.reduce((n, m) => n + retryableIn(m), 0),
      queued,
    },
  };
});

const findMessage = (c: CommsData, id: string) =>
  c.messages.find((m) => m.id === id) ?? fail('Message not found', 404);

mock.get('/v1/comms/deliveries/:id', (req): DeliveryDetail => {
  const { c } = commsCtx(req);
  const m = findMessage(c, req.params.id!);
  const q = req.query;
  const rows = m.recipients
    .map((rec) => ({
      key: rec.key,
      name: rec.name,
      role: rec.role,
      outcomes: m.channels
        .filter((ch) => rec.out[ch])
        .map((ch) => {
          const o = rec.out[ch]!;
          return {
            channel: ch,
            address: o.address,
            status: o.status,
            detail: o.detail,
            retryable: !!o.retryable && (o.status === 'Failed' || !!o.waitingCredit),
            fix: o.status === 'Failed' && !o.retryable && ch !== 'In-app' ? rec.fix : null,
          };
        }),
    }))
    .filter(
      (row) =>
        (!q.channel || row.outcomes.some((o) => o.channel === q.channel)) &&
        (!q.status ||
          row.outcomes.some(
            (o) => (!q.channel || o.channel === q.channel) && o.status === q.status,
          )),
    );
  const { data, meta } = paginate(
    rows,
    { ...q, pageSize: q.pageSize ?? '20' },
    (row) => `${row.name} ${row.outcomes.map((o) => o.address).join(' ')}`,
  );
  const first = m.recipients[0];
  const vars = first?.vars ?? {};
  return {
    id: m.id,
    title: m.title,
    event: m.event,
    eventLabel: eventDef(m.event)?.label ?? m.event,
    by: m.by,
    at: m.at,
    atLabel: atLabel(m.at),
    audience: m.audience,
    sender: m.sender,
    source: m.source,
    stats: statsOf(m),
    smsUnits: m.recipients.reduce((n, x) => n + (x.out.SMS?.units ?? 0), 0),
    retryable: retryableIn(m),
    content: m.channels.map((ch) => {
      const t = m.content[ch] ?? { subject: '', body: '' };
      const body = render(t.body, vars);
      return {
        channel: ch,
        subject: render(t.subject, vars),
        body: ch === 'SMS' ? smsSafe(body) : body,
      };
    }),
    rows: data,
    meta,
  };
});

mock.post('/v1/comms/deliveries/:id/retry', (req) => {
  const { c } = commsCtx(req);
  const m = findMessage(c, req.params.id!);
  if (!retryableIn(m))
    fail('Nothing here can be retried. Fix the contact details shown, then send again.', 409);
  const retried = retryMessage(c, m);
  return { retried, stillFailed: retryableIn(m), credit: c.credit };
});

mock.post('/v1/comms/deliveries/retry-failed', (req) => {
  const { c } = commsCtx(req);
  const targets = c.messages.filter((m) => retryableIn(m));
  if (!targets.length) fail('There are no failed messages that can be retried.', 409);
  let retried = 0;
  for (const m of targets) retried += retryMessage(c, m);
  return {
    retried,
    stillFailed: c.messages.reduce((n, m) => n + retryableIn(m), 0),
    credit: c.credit,
  };
});

/* ---------------- Templates ---------------- */

const editable = EVENTS.filter((e) => e.key !== 'announcement');

mock.get('/v1/comms/templates', (req): TemplateRow[] => {
  const { c } = commsCtx(req);
  return editable.map((e) => ({
    event: e.key,
    label: e.label,
    channels: e.available.filter((ch) => c.events[e.key]?.channels.includes(ch)),
    variables: e.variables.map((v) => v.name),
    customised: !!c.templates[e.key],
  }));
});

function templateDetail(c: CommsData, key: string): TemplateDetail {
  const e = eventDef(key);
  if (!e || key === 'announcement') fail('Template not found', 404);
  const custom = c.templates[key];
  return {
    event: e!.key,
    label: e!.label,
    description: e!.description,
    variables: [
      ...e!.variables,
      ...GLOBAL_VARS.filter((g) => !e!.variables.some((v) => v.name === g.name)),
    ],
    available: e!.available,
    enabled: e!.available.filter((ch) => c.events[key]?.channels.includes(ch)),
    templates: templatesOf(c, e!.key),
    defaults: e!.templates,
    customised: !!custom,
    updatedBy: custom?.by ?? '',
    updatedAt: custom?.at ?? null,
  };
}

mock.get('/v1/comms/templates/:event', (req) => {
  const { c } = commsCtx(req);
  return templateDetail(c, req.params.event!);
});

mock.put('/v1/comms/templates/:event', (req) => {
  const { c, actor } = commsCtx(req);
  const d = templateDetail(c, req.params.event!);
  const p = (req.body ?? {}) as Partial<Record<Channel, Partial<ChannelTemplate>>>;
  const known = new Set(d.variables.map((v) => v.name));
  const next: Partial<Record<Channel, ChannelTemplate>> = {};
  const sample = Object.fromEntries(d.variables.map((v) => [v.name, v.sample]));
  for (const ch of d.available) {
    const t = p[ch];
    if (!t) {
      next[ch] = d.templates[ch] ?? d.defaults[ch]!;
      continue;
    }
    const subject = (t.subject ?? '').trim();
    const body = (t.body ?? '').trim();
    if (!body) fail(`Write the ${ch} message.`);
    if (ch === 'Email' && !subject) fail('Write the email subject.');
    if (ch === 'In-app' && !subject) fail('Write the in-app title.');
    if (subject.length > 150)
      fail(`Keep the ${ch} ${ch === 'Email' ? 'subject' : 'title'} to 150 characters.`);
    if (body.length > 5000) fail(`Keep the ${ch} message to 5,000 characters.`);
    const unknown = [...variablesIn(subject), ...variablesIn(body)].filter((x) => !known.has(x));
    if (unknown.length)
      fail(
        `[${unknown[0]}] isn’t a variable for this message. Use one of: ${[...known].map((x) => `[${x}]`).join(' ')}.`,
      );
    if (ch === 'SMS' && smsLength(smsSafe(render(body, sample))).pages > MAX_SMS_PAGES)
      fail(`With sample details the SMS runs past ${MAX_SMS_PAGES} pages. Shorten it.`);
    next[ch] = { subject: ch === 'SMS' ? '' : subject, body };
  }
  const changed = d.available.filter(
    (ch) => JSON.stringify(next[ch]) !== JSON.stringify(d.templates[ch]),
  );
  if (!changed.length) return d;
  c.templates[d.event] = { channels: next, by: actor, at: localNow() };
  logSetting(c, actor, `${d.label} template edited`, changed.join(', '));
  return templateDetail(c, d.event);
});

mock.post('/v1/comms/templates/:event/reset', (req) => {
  const { c, actor } = commsCtx(req);
  const d = templateDetail(c, req.params.event!);
  if (!c.templates[d.event]) fail('This template already uses the default wording.', 409);
  delete c.templates[d.event];
  logSetting(c, actor, `${d.label} template reset to default`, '');
  return templateDetail(c, d.event);
});

/* ---------------- Events & settings ---------------- */

function eventSettings(c: CommsData): EventSetting[] {
  return EVENTS.map((e) => ({
    key: e.key,
    label: e.label,
    description: e.description,
    who: e.who,
    available: e.available,
    channels:
      e.key === 'announcement'
        ? e.available
        : e.available.filter((ch) => c.events[e.key]?.channels.includes(ch)),
    active: e.key === 'announcement' || !!c.events[e.key]?.active,
    locked: e.locked,
    trigger: e.trigger,
  }));
}

mock.get('/v1/comms/events', (req) => eventSettings(commsCtx(req).c));

function settingsOf(c: CommsData): CommsSettings {
  return {
    events: eventSettings(c),
    senderId: c.senderId,
    sender: smsSender(c),
    credit: {
      units: c.credit,
      usedThisTerm: unitsUsedThisTerm(c.schoolId),
      low: c.credit < LOW_CREDIT,
      unitPrice: SMS_UNIT_PRICE,
    },
    quietHours: c.quietHours,
    history: c.history.map((h) => ({ ...h, atLabel: atLabel(h.at) })),
  };
}

mock.get('/v1/comms/settings', (req) => settingsOf(commsCtx(req).c));

mock.put('/v1/comms/settings/events', (req) => {
  const { c, actor } = commsCtx(req);
  const p = (req.body ?? {}) as EventSettingsPayload;
  const changes: string[] = [];
  const next: Record<string, { active: boolean; channels: Channel[] }> = {};
  for (const [key, val] of Object.entries(p)) {
    const e = eventDef(key);
    if (!e) fail(`Unknown event: ${key}`);
    if (key === 'announcement') continue;
    const channels = e!.available.filter((ch) => val.channels?.includes(ch));
    const active = !!val.active;
    if (e!.locked && !active) fail(`${e!.label} can’t be switched off. ${e!.locked}`);
    if (e!.required && !channels.includes(e!.required))
      fail(`${e!.label} must keep ${e!.required} on. ${e!.locked}`);
    if (active && !channels.length)
      fail(`Choose at least one channel for ${e!.label}, or switch it off.`);
    next[key] = { active, channels };
  }
  for (const [key, val] of Object.entries(next)) {
    const cur = c.events[key]!;
    const e = eventDef(key)!;
    const before = cur.active ? cur.channels.join(', ') || 'none' : 'Off';
    const after = val.active ? val.channels.join(', ') : 'Off';
    if (before !== after || cur.active !== val.active) {
      changes.push(e.label);
      logSetting(c, actor, `${e.label} notifications changed`, `${before} → ${after}`);
    }
    c.events[key] = val;
  }
  if (!changes.length) fail('Nothing changed.', 409);
  return settingsOf(c);
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

mock.put('/v1/comms/settings/quiet-hours', (req) => {
  const { c, actor } = commsCtx(req);
  const p = (req.body ?? {}) as { enabled?: boolean; start?: string; end?: string };
  const enabled = !!p.enabled;
  const start = p.start ?? c.quietHours.start;
  const end = p.end ?? c.quietHours.end;
  if (!HHMM.test(start) || !HHMM.test(end)) fail('Enter times as HH:MM.');
  if (start === end) fail('Quiet hours must start and end at different times.');
  const before = c.quietHours.enabled ? `${c.quietHours.start}–${c.quietHours.end}` : 'Off';
  const after = enabled ? `${start}–${end}` : 'Off';
  if (before === after && c.quietHours.enabled === enabled) fail('Nothing changed.', 409);
  c.quietHours = { enabled, start, end };
  logSetting(c, actor, 'SMS quiet hours changed', `${before} → ${after}`);
  return settingsOf(c);
});

mock.post('/v1/comms/settings/sender-id', (req) => {
  const { c, actor } = commsCtx(req);
  const name = requireText(
    (req.body as { name?: string } | undefined)?.name,
    'Enter the sender ID.',
  ).toUpperCase();
  if (!/^[A-Z][A-Z0-9]{2,10}$/.test(name))
    fail('Use 3 to 11 letters or numbers, starting with a letter, with no spaces.');
  if (c.senderId.name === name && c.senderId.status === 'Pending approval')
    fail(`“${name}” is already waiting for approval.`, 409);
  if (c.senderId.name === name && c.senderId.status === 'Approved')
    fail(`“${name}” is already approved.`, 409);
  const before = c.senderId.name ? `${c.senderId.name} (${c.senderId.status})` : 'None';
  c.senderId = {
    name,
    status: 'Pending approval',
    requestedAt: isoToday(),
    note: 'Networks usually approve a sender ID in 5–10 working days. SMS goes out from “EDUTRACK” until then.',
  };
  logSetting(c, actor, 'SMS sender ID requested', `${before} → ${name}`);
  return settingsOf(c);
});

/* ---------------- Inbox ---------------- */

const inboxOf = (schoolId: string) => (notifications[schoolId] ??= []);
const toInbox = (n: (typeof notifications)[string][number]): InboxItem => ({
  id: n.id,
  title: n.title,
  detail: n.detail,
  when: n.at ? atLabel(n.at) : n.when,
  unread: n.unread,
  to: n.to,
});

mock.get('/v1/notifications', (req) => {
  const { schoolId } = commsCtx(req);
  return inboxOf(schoolId).map(toInbox);
});

mock.get('/v1/comms/inbox', (req) => {
  const { schoolId } = commsCtx(req);
  const all = inboxOf(schoolId);
  const rows = req.query.filter === 'unread' ? all.filter((n) => n.unread) : all;
  const { data, meta } = paginate(
    rows.map(toInbox),
    { ...req.query, pageSize: req.query.pageSize ?? '20' },
    (n) => `${n.title} ${n.detail}`,
  );
  return { rows: data, meta, unread: all.filter((n) => n.unread).length, total: all.length };
});

mock.post('/v1/notifications/read-all', (req) => {
  for (const n of inboxOf(commsCtx(req).schoolId)) n.unread = false;
  return { ok: true };
});

mock.post('/v1/notifications/:id/read', (req) => {
  const n = inboxOf(commsCtx(req).schoolId).find((x) => x.id === req.params.id);
  if (!n) fail('Notification not found', 404);
  n!.unread = false;
  return { ok: true };
});

// The seeded "transfers awaiting verification" item reflects the live queue.
{
  const n1 = notifications.greenfield?.find((n) => n.id === 'n1');
  const pending = financeSnapshot('greenfield').fin.payments.filter(
    (p) => p.status === 'Pending verification',
  ).length;
  if (n1) {
    if (pending)
      n1.title = `${pending} bank transfer${pending === 1 ? '' : 's'} awaiting verification`;
    else notifications.greenfield = notifications.greenfield!.filter((n) => n !== n1);
  }
}
