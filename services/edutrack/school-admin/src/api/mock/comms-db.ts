/**
 * Communication data per school and the messaging core every module sends through.
 *
 * CONTRACT (other modules import these; keep the signatures):
 * - smsCreditOf(schoolId): SMS credit balance, usage this term and the sender ID state.
 * - pushNotification(schoolId, item): adds an item to the signed-in staff inbox (newest first).
 *
 * Nothing is really sent: outcomes are simulated deterministically per recipient and channel,
 * the way delivery receipts from email and SMS providers would come back.
 */
import type { RouteLocationRaw } from 'vue-router';

import { routesPath as r } from '@/router/routes-path';
import type {
  Audience,
  Channel,
  ChannelTemplate,
  CommsEvent,
  DeliveryStatus,
  NotificationItem,
  RecipientRole,
  SenderIdState,
} from '@/types';

import { academicsData } from './academics-db';
import { EVENTS, eventDef, render, smsLength, smsSafe } from './comms-catalog';
import { notifications, schools } from './db';
import { financeData, termsOf, type FinStudent } from './finance-db';
import { addDays, isoToday } from './finance-ledger';
import { currentTerm } from './handlers/academics-shared';
import { classOf } from './handlers/finance-shared';
import { isPhone } from './handlers/shared';
import { schoolData } from './school-db';
import { studentsData } from './students-db';

/* ---------------- Contract ---------------- */

export interface SmsCreditSummary {
  units: number;
  usedThisTerm: number;
  senderId: { name: string; status: SenderIdState['status'] };
}

export function smsCreditOf(schoolId: string): SmsCreditSummary {
  const c = commsFor(schoolId);
  return {
    units: c.credit,
    usedThisTerm: unitsUsedThisTerm(schoolId),
    senderId: { name: c.senderId.name, status: c.senderId.status },
  };
}

export function pushNotification(
  schoolId: string,
  item: Omit<NotificationItem, 'id' | 'unread' | 'when'>,
) {
  (notifications[schoolId] ??= []).unshift({
    ...item,
    id: `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    unread: true,
    when: 'Just now',
    at: localNow(),
  });
}

/* ---------------- Time ---------------- */

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Local date-time "YYYY-MM-DDTHH:mm", as the school sees it. */
export const localNow = () => stamp(new Date());
export const addMinutes = (at: string, minutes: number) =>
  stamp(new Date(new Date(at).getTime() + minutes * 60_000));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today 09:40", "Yesterday 21:14", "4 Nov 08:12", or "4 Nov 2025" for other years. */
export function atLabel(at: string, withTime = true) {
  const date = at.slice(0, 10);
  const time = at.slice(11, 16);
  const today = isoToday();
  const yesterday = stamp(new Date(new Date(`${today}T12:00`).getTime() - 86_400_000)).slice(0, 10);
  const tail = withTime && time ? ` ${time}` : '';
  if (date === today) return `Today${tail}`;
  if (date === yesterday) return `Yesterday${tail}`;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const base = `${d} ${MONTHS[m - 1]}`;
  return y === Number(today.slice(0, 4)) ? `${base}${tail}` : `${base} ${y}`;
}

/* ---------------- Deterministic chance ---------------- */

export function chance(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
const pick = <T>(xs: readonly T[], n: number) => xs[Math.floor(n * xs.length) % xs.length]!;

/* ---------------- Records ---------------- */

export interface Recipient {
  key: string;
  name: string;
  role: RecipientRole;
  email: string;
  phone: string;
  /** Has a portal account, so in-app messages reach them. */
  portal: boolean;
  branchId: string | null;
  fix: RouteLocationRaw | null;
  vars?: Record<string, string>;
}

export interface Outcome {
  status: DeliveryStatus;
  detail: string;
  retryable: boolean;
  address: string;
  units: number;
  attempts: number;
  /** Queued for quiet hours until then. */
  releaseAt?: string;
  /** "Sent" becomes "Delivered" once the receipt arrives. */
  settleAt?: string;
  /** Queued until the school has SMS credit. */
  waitingCredit?: boolean;
}

export interface MessageRecipient extends Recipient {
  out: Partial<Record<Channel, Outcome>>;
}

export interface MessageRec {
  id: string;
  event: CommsEvent;
  title: string;
  at: string;
  by: string;
  audience: string;
  sender: string;
  source: { label: string; to: RouteLocationRaw } | null;
  channels: Channel[];
  content: Partial<Record<Channel, ChannelTemplate>>;
  recipients: MessageRecipient[];
  announcementId: string | null;
}

export interface AnnouncementRec {
  id: string;
  title: string;
  body: string;
  smsText: string;
  audience: Audience;
  channels: Channel[];
  status: 'Draft' | 'Scheduled' | 'Sent' | 'Withdrawn';
  scheduledFor: string | null;
  expiresOn: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  withdrawnAt: string | null;
  withdrawReason: string;
  recipients: number | null;
  smsUnits: number;
  messageId: string | null;
  history: {
    id: string;
    title: string;
    detail: string;
    when: string;
    tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  }[];
}

export interface EventState {
  active: boolean;
  channels: Channel[];
}

export interface CommsData {
  schoolId: string;
  seq: number;
  messages: MessageRec[];
  announcements: AnnouncementRec[];
  events: Record<string, EventState>;
  templates: Record<
    string,
    { channels: Partial<Record<Channel, ChannelTemplate>>; by: string; at: string }
  >;
  senderId: SenderIdState;
  credit: number;
  lowCreditNotified: boolean;
  quietHours: { enabled: boolean; start: string; end: string };
  history: { id: string; at: string; by: string; what: string; detail: string }[];
  /** Messages with outcomes that change with time (receipts, quiet hours). */
  watch: Set<string>;
  /** Set while seeding or processing, so time-based work doesn't re-enter. */
  busy: boolean;
}

export const SMS_UNIT_PRICE = 4;
export const LOW_CREDIT = 2000;

const comms: Record<string, CommsData> = {};

/** A school's communication data, seeded the first time it's used. */
export function commsFor(schoolId: string): CommsData {
  let c = comms[schoolId];
  if (!c) {
    const greenfield = schoolId === 'greenfield';
    c = comms[schoolId] = {
      schoolId,
      seq: 0,
      messages: [],
      announcements: [],
      events: Object.fromEntries(
        EVENTS.map((e) => [e.key, { active: true, channels: [...e.defaults] }]),
      ),
      templates: {},
      senderId: greenfield
        ? {
            name: 'GREENFIELD',
            status: 'Pending approval',
            requestedAt: '2026-10-28',
            note: 'Networks usually approve a sender ID in 5–10 working days.',
          }
        : { name: '', status: 'Not requested', requestedAt: null, note: '' },
      credit: greenfield ? 18420 : 0,
      lowCreditNotified: false,
      quietHours: { enabled: greenfield, start: '21:00', end: '07:00' },
      history: [],
      watch: new Set(),
      busy: false,
    };
    if (greenfield) {
      c.busy = true;
      try {
        seedGreenfield(c);
      } finally {
        c.busy = false;
      }
    }
  }
  processDue(c);
  return c;
}

export const nextCommsId = (c: CommsData, prefix: string) => `${prefix}${++c.seq}`;

export const schoolName = (schoolId: string) =>
  schoolData[schoolId]?.profile.name ??
  schools.find((s) => s.id === schoolId)?.name ??
  'Your school';

/** What SMS goes out as: the school's approved sender ID, otherwise EduTrack's. */
export const smsSender = (c: CommsData) =>
  c.senderId.status === 'Approved' ? c.senderId.name : 'EDUTRACK';

export function unitsUsedThisTerm(schoolId: string) {
  const c = comms[schoolId];
  if (!c) return 0;
  const acad = academicsData[schoolId];
  const termId = acad ? currentTerm(acad)?.id : undefined;
  const start = termsOf(schoolId).find((t) => t.id === termId)?.start ?? isoToday().slice(0, 7);
  let used = 0;
  for (const m of c.messages) {
    if (m.at < start) continue;
    for (const rec of m.recipients) used += rec.out.SMS?.units ?? 0;
  }
  return used;
}

export function logSetting(c: CommsData, by: string, what: string, detail: string) {
  c.history.unshift({ id: nextCommsId(c, 'h'), at: localNow(), by, what, detail });
}

/* ---------------- Recipients ---------------- */

const STAFF_FIRST = [
  'Bola',
  'Ngozi',
  'Emeka',
  'Fatima',
  'Tunde',
  'Halima',
  'Uche',
  'Yemi',
  'Kelechi',
  'Zainab',
  'Segun',
  'Amaka',
  'Musa',
  'Ifeoma',
  'Dayo',
  'Hauwa',
];
const STAFF_LAST = [
  'Okoro',
  'Bello',
  'Adewale',
  'Nwosu',
  'Ibrahim',
  'Ogunleye',
  'Eze',
  'Lawal',
  'Okafor',
  'Danjuma',
  'Afolabi',
  'Chukwu',
  'Yusuf',
  'Ojo',
];

const bare = (name: string) =>
  name.replace(/^(Mr|Mrs|Miss|Ms|Dr|Prof|Rev|Alhaji|Chief)\.?\s+/i, '');
const digitsOf = (p: string) => p.replace(/\D/g, '');

/** The guardian who pays for a student, with whatever contact details the school holds. */
export function payerOf(schoolId: string, s: FinStudent): Recipient | null {
  if (!s.payer) return null;
  const sd = studentsData[schoolId];
  const g =
    sd?.guardians.find((x) => s.recordId && x.children[s.recordId] && x.name === s.payer) ??
    sd?.guardians.find(
      (x) => x.name === s.payer && (!s.payerPhone || digitsOf(x.phone) === digitsOf(s.payerPhone)),
    );
  if (g)
    return {
      key: `g:${g.id}`,
      name: g.name,
      role: 'Parent',
      email: g.email,
      phone: g.phone,
      portal: g.portal === 'Active',
      branchId: s.branchId,
      fix: { name: r.students.parent.name, params: { id: g.id } },
    };
  // Families outside the Students records exist only in Finance; give them stable contacts.
  const k = `${s.payer}|${s.payerPhone}`;
  const [first = 'parent', ...rest] = bare(s.payer).toLowerCase().split(/\s+/);
  const email =
    chance(`${k}e`) < 0.84
      ? `${first}.${rest.join('') || 'family'}@${pick(['gmail.com', 'yahoo.com', 'outlook.com'], chance(`${k}d`))}`
      : '';
  return {
    key: `p:${k}`,
    name: s.payer,
    role: 'Parent',
    email,
    phone: s.payerPhone,
    portal: chance(`${k}p`) < 0.78,
    branchId: s.branchId,
    fix: { name: r.finance.studentAccount.name, params: { key: s.key } },
  };
}

const studentRecipient = (s: FinStudent): Recipient => ({
  key: `s:${s.key}`,
  name: s.name,
  role: 'Student',
  email: '',
  phone: '',
  portal: true,
  branchId: s.branchId,
  fix: null,
});

function staffRecipients(schoolId: string, branchId: string | null, teachersOnly: boolean) {
  const data = schoolData[schoolId];
  if (!data) return [];
  const out: Recipient[] = [];
  const listed = data.staff.filter((s) => !s.left);
  for (const s of listed) {
    if (branchId && !s.branchIds.includes(branchId)) continue;
    if (teachersOnly && s.kind !== 'Teaching') continue;
    const u = data.users.find((x) => x.staffId === s.id);
    out.push({
      key: `st:${s.id}`,
      name: s.name,
      role: s.kind === 'Teaching' ? 'Teacher' : 'Staff',
      email: s.email,
      phone: s.phone,
      portal: u?.status === 'Active',
      branchId: s.branchIds[0] ?? null,
      fix: { name: r.staff.detail.name, params: { id: s.id } },
    });
  }
  // The branch headcount includes staff not listed in the demo records; they get messages too.
  for (const b of data.branches) {
    if (b.status !== 'Active' || (branchId && b.id !== branchId)) continue;
    const here = listed.filter((s) => s.branchIds.includes(b.id)).length;
    for (let i = 0; i < Math.max(0, b.staff - here); i++) {
      const k = `${b.id}-${i}`;
      const teaching = chance(`${k}t`) < 0.62;
      if (teachersOnly && !teaching) continue;
      const first = pick(STAFF_FIRST, chance(`${k}f`));
      const last = pick(STAFF_LAST, chance(`${k}l`));
      out.push({
        key: `sx:${k}`,
        name: `${chance(`${k}g`) < 0.5 ? 'Mrs.' : 'Mr.'} ${first} ${last}`,
        role: teaching ? 'Teacher' : 'Staff',
        email: `${first}.${last}${i}@${schoolId}.edu.ng`.toLowerCase(),
        phone: `+234 80${(i % 8) + 2} 555 ${String(1000 + ((i * 37) % 9000)).padStart(4, '0')}`,
        portal: chance(`${k}p`) < 0.9,
        branchId: b.id,
        fix: null,
      });
    }
  }
  return out;
}

const activeStudents = (schoolId: string, branchId: string | null, classes?: string[]) => {
  const fin = financeData[schoolId];
  if (!fin) return [];
  return [...fin.studentIndex().values()].filter(
    (s) =>
      s.active &&
      (!branchId || s.branchId === branchId) &&
      (!classes || (s.arm && classes.includes(classOf(s)))),
  );
};

/** Parents of these students, one per family (siblings share a payer). */
export function parentsOf(schoolId: string, students: FinStudent[]) {
  const byKey = new Map<string, Recipient & { children: string[] }>();
  let noGuardian = 0;
  for (const s of students) {
    const p = payerOf(schoolId, s);
    if (!p) {
      noGuardian++;
      continue;
    }
    const seen = byKey.get(p.key);
    if (seen) seen.children.push(s.name);
    else byKey.set(p.key, { ...p, children: [s.name] });
  }
  return { parents: [...byKey.values()], noGuardian };
}

export function audienceLabel(schoolId: string, a: Audience) {
  const branch = a.branchId
    ? (schoolData[schoolId]?.branches.find((b) => b.id === a.branchId)?.name ?? 'Removed branch')
    : 'All branches';
  const who =
    a.kind === 'everyone'
      ? 'Entire school'
      : a.kind === 'parents'
        ? 'Parents'
        : a.kind === 'students'
          ? 'Students'
          : a.kind === 'teachers'
            ? 'Teachers'
            : a.kind === 'staff'
              ? 'All staff'
              : a.classes.length <= 3
                ? `Parents & students · ${a.classes.join(', ')}`
                : `Parents & students · ${a.classes.length} classes`;
  return `${who} · ${branch}`;
}

/** Everyone an announcement audience reaches, from live student, guardian and staff data. */
export function audienceRecipients(schoolId: string, a: Audience) {
  const out: Recipient[] = [];
  let noGuardian = 0;
  const withParents = a.kind === 'everyone' || a.kind === 'parents' || a.kind === 'classes';
  const withStudents = a.kind === 'everyone' || a.kind === 'students' || a.kind === 'classes';
  const students = activeStudents(
    schoolId,
    a.branchId,
    a.kind === 'classes' ? a.classes : undefined,
  );
  if (withParents) {
    const p = parentsOf(schoolId, students);
    out.push(...p.parents);
    noGuardian = p.noGuardian;
  }
  if (withStudents) out.push(...students.map(studentRecipient));
  if (a.kind === 'everyone' || a.kind === 'staff')
    out.push(...staffRecipients(schoolId, a.branchId, false));
  if (a.kind === 'teachers') out.push(...staffRecipients(schoolId, a.branchId, true));
  return { recipients: out, noGuardian };
}

/** Students only use the portal; everyone else can get any channel. */
export const channelsFor = (rec: Recipient, channels: Channel[]) =>
  rec.role === 'Student' ? channels.filter((ch) => ch === 'In-app') : channels;

/* ---------------- Sending ---------------- */

const inWindow = (hhmm: string, start: string, end: string) =>
  start <= end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;

/** When quiet hours end after `at`. */
function quietRelease(at: string, end: string) {
  const sameDay = `${at.slice(0, 10)}T${end}`;
  return sameDay > at
    ? sameDay
    : `${addMinutes(`${at.slice(0, 10)}T12:00`, 24 * 60).slice(0, 10)}T${end}`;
}

export function templatesOf(c: CommsData, event: CommsEvent) {
  return c.templates[event]?.channels ?? eventDef(event)?.templates ?? {};
}

function smsUnitsFor(text: string) {
  return smsLength(smsSafe(text)).pages;
}

function attemptSms(
  c: CommsData,
  o: Outcome,
  body: string,
  at: string,
  seed: string,
  live: boolean,
) {
  const units = smsUnitsFor(body);
  // History seeded for the demo is already paid for: the balance is what's left today.
  if (!live) {
    Object.assign(o, { units, attempts: 1 });
    if (chance(`${seed}|1`) < 0.035)
      Object.assign(o, {
        status: 'Failed',
        detail: 'Number not reachable (phone off or out of coverage)',
        retryable: true,
      });
    return;
  }
  if (c.credit < units) {
    Object.assign(o, {
      status: 'Queued',
      detail: 'Waiting for SMS credit',
      retryable: true,
      waitingCredit: true,
    });
    return;
  }
  c.credit -= units;
  o.units += units;
  o.attempts += 1;
  o.waitingCredit = false;
  o.releaseAt = undefined;
  const n = chance(`${seed}|${o.attempts}`);
  if (n < (o.attempts > 1 ? 0.15 : 0.035)) {
    Object.assign(o, {
      status: 'Failed',
      detail: 'Number not reachable (phone off or out of coverage)',
      retryable: true,
    });
  } else if (live && n < 0.12) {
    Object.assign(o, {
      status: 'Sent',
      detail: 'Awaiting delivery receipt',
      retryable: false,
      settleAt: addMinutes(at, 3),
    });
  } else Object.assign(o, { status: 'Delivered', detail: '', retryable: false });
}

export interface DispatchInput {
  event: CommsEvent;
  title: string;
  audience: string;
  recipients: Recipient[];
  by: string;
  /** Default: now. Seeds pass a past time. */
  at?: string;
  source?: { label: string; to: RouteLocationRaw } | null;
  /** Announcements bring their own channels and wording. */
  channels?: Channel[];
  content?: Partial<Record<Channel, ChannelTemplate>>;
  announcementId?: string;
  /** Shared variables; each recipient's own vars win. */
  vars?: Record<string, string>;
}

/**
 * Sends one message to its recipients on each channel, recording an outcome per recipient
 * and channel. Returns null when the event is switched off or has no channels.
 */
export function dispatch(schoolId: string, input: DispatchInput): MessageRec | null {
  const c = commsFor(schoolId);
  const def = eventDef(input.event);
  if (!def) return null;
  const live = !input.at;
  const at = input.at ?? localNow();
  const state = c.events[input.event];
  let channels: Channel[];
  if (input.channels) channels = input.channels;
  else {
    if (!state?.active) return null;
    channels = def.available.filter((ch) => state.channels.includes(ch));
  }
  if (!channels.length || !input.recipients.length) return null;
  const content = input.content ?? templatesOf(c, input.event);
  const school = schoolName(schoolId);
  const sender = smsSender(c);
  const id = nextCommsId(c, 'msg');
  const quiet =
    live &&
    def.quiet &&
    c.quietHours.enabled &&
    inWindow(at.slice(11, 16), c.quietHours.start, c.quietHours.end);
  const msg: MessageRec = {
    id,
    event: input.event,
    title: input.title,
    at,
    by: input.by,
    audience: input.audience,
    sender,
    source: input.source ?? null,
    channels,
    content,
    recipients: [],
    announcementId: input.announcementId ?? null,
  };
  const seen = new Set<string>();
  for (const base of input.recipients) {
    if (seen.has(base.key)) continue;
    seen.add(base.key);
    const rec: MessageRecipient = {
      ...base,
      vars: { school_name: school, ...input.vars, ...base.vars },
      out: {},
    };
    for (const ch of channelsFor(rec, channels)) {
      const seed = `${id}|${rec.key}|${ch}`;
      const n = chance(seed);
      const o: Outcome = {
        status: 'Delivered',
        detail: '',
        retryable: false,
        address: '',
        units: 0,
        attempts: 0,
      };
      if (ch === 'In-app') {
        o.address =
          rec.role === 'Student'
            ? 'Student portal'
            : rec.role === 'Parent'
              ? 'Parent portal'
              : 'Staff portal';
        if (!rec.portal)
          Object.assign(o, {
            status: 'Queued',
            detail: 'Shows when they activate their portal account',
          });
        else if (!live && n < 0.62) o.status = 'Read';
        o.attempts = 1;
      } else if (ch === 'Email') {
        o.address = rec.email;
        o.attempts = 1;
        if (!rec.email)
          Object.assign(o, { status: 'Failed', detail: 'No email address on record' });
        else if (n < 0.012)
          Object.assign(o, {
            status: 'Failed',
            detail: 'Mailbox rejected it (bounced). Check the address.',
          });
        else if (!live && n < 0.47) Object.assign(o, { status: 'Read', detail: 'Opened' });
      } else {
        o.address = rec.phone;
        if (!rec.phone) Object.assign(o, { status: 'Failed', detail: 'No phone number on record' });
        else if (!isPhone(rec.phone))
          Object.assign(o, { status: 'Failed', detail: `Invalid phone number: ${rec.phone}` });
        else if (quiet)
          Object.assign(o, {
            status: 'Queued',
            detail: `Held for quiet hours · goes out at ${c.quietHours.end}`,
            releaseAt: quietRelease(at, c.quietHours.end),
          });
        else attemptSms(c, o, render(content.SMS?.body ?? '', rec.vars!), at, seed, live);
      }
      rec.out[ch] = o;
    }
    if (Object.keys(rec.out).length) msg.recipients.push(rec);
  }
  if (!msg.recipients.length) return null;
  c.messages.unshift(msg);
  if (msg.recipients.some((x) => x.out.SMS?.settleAt || x.out.SMS?.releaseAt)) c.watch.add(msg.id);
  if (live) afterSend(c, msg);
  return msg;
}

function afterSend(c: CommsData, msg: MessageRec) {
  if (c.credit < LOW_CREDIT && !c.lowCreditNotified) {
    c.lowCreditNotified = true;
    pushNotification(c.schoolId, {
      title: c.credit
        ? `SMS credit is low: ${c.credit.toLocaleString('en-NG')} units left`
        : 'SMS credit has run out',
      detail: 'Communication · ask EduTrack support to top up',
      to: { name: r.settings.name, query: { tab: 'notifications' } },
    });
  }
  const failed = msg.recipients.filter((x) =>
    Object.values(x.out).some((o) => o?.status === 'Failed'),
  ).length;
  if (failed && msg.recipients.length > 1)
    pushNotification(c.schoolId, {
      title: `${failed.toLocaleString('en-NG')} of ${msg.recipients.length.toLocaleString('en-NG')} recipients didn’t get “${msg.title}” on every channel`,
      detail: 'Communication · Delivery logs',
      to: { name: r.communication.deliveryDetail.name, params: { id: msg.id } },
    });
}

/** Retries failed SMS that might go through now, and SMS waiting for credit. */
export function retryMessage(c: CommsData, msg: MessageRec) {
  let retried = 0;
  const at = localNow();
  for (const rec of msg.recipients) {
    const o = rec.out.SMS;
    if (!o?.retryable) continue;
    if (o.status !== 'Failed' && !(o.status === 'Queued' && o.waitingCredit)) continue;
    retried++;
    attemptSms(
      c,
      o,
      render(msg.content.SMS?.body ?? '', rec.vars ?? {}),
      at,
      `${msg.id}|${rec.key}|SMS`,
      true,
    );
  }
  if (msg.recipients.some((x) => x.out.SMS?.settleAt)) c.watch.add(msg.id);
  return retried;
}

export const retryableIn = (msg: MessageRec) =>
  msg.recipients.filter(
    (x) => x.out.SMS?.retryable && (x.out.SMS.status === 'Failed' || x.out.SMS.waitingCredit),
  ).length;

/** Things that happen with time: receipts arrive, quiet hours end, scheduled posts go out. */
export function processDue(c: CommsData) {
  if (c.busy) return;
  c.busy = true;
  try {
    const now = localNow();
    for (const a of c.announcements)
      if (a.status === 'Scheduled' && a.scheduledFor && a.scheduledFor <= now)
        sendAnnouncement(c, a, a.createdBy, true);
    for (const id of Array.from(c.watch)) {
      const m = c.messages.find((x) => x.id === id);
      let waiting = false;
      for (const rec of m?.recipients ?? []) {
        const o = rec.out.SMS;
        if (!o) continue;
        if (o.status === 'Sent' && o.settleAt) {
          if (o.settleAt <= now)
            Object.assign(o, { status: 'Delivered', detail: '', settleAt: undefined });
          else waiting = true;
        } else if (o.status === 'Queued' && o.releaseAt) {
          if (o.releaseAt <= now)
            attemptSms(
              c,
              o,
              render(m!.content.SMS?.body ?? '', rec.vars ?? {}),
              o.releaseAt,
              `${m!.id}|${rec.key}|SMS`,
              true,
            );
          if (o.settleAt || o.releaseAt) waiting = true;
        }
      }
      if (!waiting) c.watch.delete(id);
    }
  } finally {
    c.busy = false;
  }
}

/* ---------------- Announcements ---------------- */

export function announcementContent(
  a: Pick<AnnouncementRec, 'title' | 'body' | 'smsText'>,
  school: string,
) {
  return {
    'In-app': { subject: a.title, body: a.body },
    Email: { subject: a.title, body: `${a.body}\n\n${school}` },
    SMS: { subject: '', body: a.smsText },
  } satisfies Record<Channel, ChannelTemplate>;
}

export function sendAnnouncement(
  c: CommsData,
  a: AnnouncementRec,
  by: string,
  scheduled = false,
  at?: string,
) {
  const { recipients } = audienceRecipients(c.schoolId, a.audience);
  const school = schoolName(c.schoolId);
  const msg = dispatch(c.schoolId, {
    event: 'announcement',
    title: a.title,
    audience: audienceLabel(c.schoolId, a.audience),
    recipients,
    by,
    at,
    channels: a.channels,
    content: announcementContent(a, school),
    announcementId: a.id,
    source: {
      label: 'Announcement',
      to: { name: r.communication.announcementDetail.name, params: { id: a.id } },
    },
  });
  const when = at ?? localNow();
  a.status = 'Sent';
  a.sentAt = when;
  a.messageId = msg?.id ?? null;
  a.recipients = msg?.recipients.length ?? 0;
  a.smsUnits = msg ? msg.recipients.reduce((n, x) => n + (x.out.SMS?.units ?? 0), 0) : 0;
  a.history.push({
    id: `ah${a.history.length + 1}`,
    title: scheduled ? 'Sent as scheduled' : 'Sent',
    detail: `${by} · ${a.recipients.toLocaleString('en-NG')} recipients`,
    when: atLabel(when),
    tone: 'success',
  });
  if (scheduled && !at)
    pushNotification(c.schoolId, {
      title: `Scheduled announcement sent: ${a.title}`,
      detail: `Communication · ${a.recipients.toLocaleString('en-NG')} recipients`,
      to: { name: r.communication.announcementDetail.name, params: { id: a.id } },
    });
  return msg;
}

/* ---------------- Automatic messages from other modules ---------------- */

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const longDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
export { longDate as commsDate, naira as commsNaira };

/** Bank details and transfer reference for a student, as the Finance pay-to card shows them. */
export function payVars(schoolId: string, s: FinStudent): Record<string, string> {
  const fin = financeData[schoolId];
  if (!fin) return {};
  const acc =
    fin.accounts.find(
      (a) => a.status === 'Active' && a.showToParents && a.branchId === s.branchId,
    ) ??
    fin.accounts.find((a) => a.status === 'Active' && a.showToParents && !a.branchId) ??
    fin.accounts.find((a) => a.status === 'Active' && a.showToParents);
  const reference =
    fin.settings.transferReference === 'Invoice number'
      ? (fin.invoices.find((i) => i.studentKey === s.key && i.status === 'Issued')?.no ??
        s.admissionNo)
      : s.admissionNo;
  return {
    account_details: acc
      ? `${acc.bank} ${acc.accountNumber} (${acc.accountName})`
      : 'the school’s bank account',
    reference,
  };
}

/** Sends an automatic message about students to their fee payers. */
export function notifyPayers(
  schoolId: string,
  input: Omit<DispatchInput, 'recipients' | 'audience'> & {
    students: { student: FinStudent; vars?: Record<string, string> }[];
    audience?: string;
  },
) {
  const recipients: Recipient[] = [];
  for (const { student, vars } of input.students) {
    const p = payerOf(schoolId, student);
    if (!p) continue;
    recipients.push({
      ...p,
      key: input.students.length > 1 ? `${p.key}#${student.key}` : p.key,
      vars: {
        parent_name: p.name,
        student_name: student.name,
        ...payVars(schoolId, student),
        ...vars,
      },
    });
  }
  return dispatch(schoolId, {
    ...input,
    audience:
      input.audience ??
      (recipients.length === 1
        ? recipients[0]!.name
        : `${recipients.length.toLocaleString('en-NG')} fee payers`),
    recipients,
  });
}

/** Which channels a dispatch used, for history lines like "Email and SMS". */
export function channelSummary(msg: MessageRec | null) {
  if (!msg) return 'notifications for this event are off';
  const used = msg.channels.filter((ch) => msg.recipients.some((x) => x.out[ch]));
  return used.length > 1
    ? `${used.slice(0, -1).join(', ')} and ${used[used.length - 1]}`
    : (used[0] ?? 'no channel');
}

/** A guardian record as a message recipient. */
export function guardianRecipient(
  g: { id: string; name: string; email: string; phone: string; portal: string },
  vars: Record<string, string> = {},
): Recipient {
  return {
    key: `g:${g.id}`,
    name: g.name,
    role: 'Parent',
    email: g.email,
    phone: g.phone,
    portal: g.portal === 'Active',
    branchId: null,
    fix: { name: r.students.parent.name, params: { id: g.id } },
    vars: { parent_name: g.name, ...vars },
  };
}

/** A staff record as a message recipient. */
export function staffRecipient(
  s: { id: string; name: string; email: string; phone: string },
  vars: Record<string, string> = {},
): Recipient {
  return {
    key: `st:${s.id}`,
    name: s.name,
    role: 'Staff',
    email: s.email,
    phone: s.phone,
    portal: false,
    branchId: null,
    fix: { name: r.staff.detail.name, params: { id: s.id } },
    vars: { staff_name: s.name, ...vars },
  };
}

/** Teachers (by name), students and guardians of one class arm. */
export function classRecipients(schoolId: string, label: string, teacherNames: string[]) {
  const students = activeStudents(schoolId, null, [label]);
  const joined = (xs: string[]) =>
    xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? '');
  const out: Recipient[] = [
    ...parentsOf(schoolId, students).parents.map(({ children, ...p }) => ({
      ...p,
      vars: { parent_name: p.name, student_name: joined(children) },
    })),
    ...students.map((s) => ({ ...studentRecipient(s), vars: { student_name: s.name } })),
  ];
  const staff = schoolData[schoolId]?.staff ?? [];
  for (const name of new Set(teacherNames)) {
    const s = staff.find((x) => x.name === name && !x.left);
    out.push(
      s
        ? { ...staffRecipient(s), role: 'Teacher', portal: true }
        : {
            key: `t:${name}`,
            name,
            role: 'Teacher',
            email: '',
            phone: '',
            portal: true,
            branchId: null,
            fix: null,
          },
    );
  }
  return out;
}

/* ---------------- Greenfield history ---------------- */

const at = (date: string, seed: string, from = 8, span = 9) => {
  const minutes = Math.floor(chance(seed) * span * 60);
  return `${date}T${pad(from + Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
};

function seedGreenfield(c: CommsData) {
  const schoolId = c.schoolId;
  const fin = financeData[schoolId];
  if (!fin) return;
  const today = isoToday();
  const students = fin.studentIndex();
  const terms = termsOf(schoolId);
  const acad = academicsData[schoolId];
  const term =
    terms.find((t) => t.id === (acad ? currentTerm(acad)?.id : '')) ?? terms[terms.length - 1];
  // Invoices go out a few weeks before the session starts, so history starts a month earlier.
  const firstDay = terms
    .filter((t) => t.session === term?.session)
    .map((t) => t.start)
    .sort()[0];
  const sessionStart = firstDay ? addDays(firstDay, -31) : '2026-08-01';
  const BURSAR = 'Mrs. Bisi Bankole';
  const invoiceTotal = (id: string) => {
    const inv = fin.invoices.find((i) => i.id === id)!;
    const sub = inv.lines.reduce((n, l) => n + l.amount, 0);
    return Math.max(0, sub - inv.discounts.reduce((n, d) => n + d.amount, 0));
  };
  type Pending = { at: string; run: () => void };
  const pending: Pending[] = [];

  // Invoices issued this session: big runs go out as one message, the rest one by one.
  const issued = fin.invoices.filter(
    (i) =>
      i.status !== 'Draft' &&
      i.issuedOn &&
      i.issuedOn >= sessionStart &&
      i.issuedOn <= today &&
      i.notified,
  );
  const byDay = new Map<string, typeof issued>();
  for (const inv of issued) byDay.set(inv.issuedOn!, [...(byDay.get(inv.issuedOn!) ?? []), inv]);
  for (const [day, list] of byDay) {
    const t = terms.find((x) => x.id === list[0]!.termId);
    const run = (batch: typeof list) => () =>
      notifyPayers(schoolId, {
        event: 'invoice.issued',
        title:
          batch.length > 1
            ? `Invoices issued · ${t?.name ?? ''} ${t?.session ?? ''}`
            : `Invoice issued · ${batch[0]!.no}`,
        by: BURSAR,
        at: at(day, `inv${day}`, 9, 2),
        source:
          batch.length > 1
            ? { label: 'Invoices', to: { name: r.finance.invoices.name } }
            : {
                label: batch[0]!.no,
                to: { name: r.finance.invoiceDetail.name, params: { id: batch[0]!.id } },
              },
        students: batch.flatMap((inv) => {
          const s = students.get(inv.studentKey);
          return s
            ? [
                {
                  student: s,
                  vars: {
                    invoice_no: inv.no,
                    amount: naira(invoiceTotal(inv.id)),
                    due_date: longDate(inv.dueOn),
                    term: t ? `${t.session} ${t.name}` : '',
                  },
                },
              ]
            : [];
        }),
      });
    if (list.length > 5) pending.push({ at: `${day}T09`, run: run(list) });
    else for (const inv of list) pending.push({ at: `${day}T10`, run: run([inv]) });
  }

  // Confirmed and rejected payments.
  for (const p of fin.payments) {
    const day = p.status === 'Confirmed' ? (p.verifiedOn ?? p.date) : p.date;
    if (day < sessionStart || day > today) continue;
    const s = students.get(p.studentKey);
    if (!s) continue;
    if (p.status === 'Confirmed')
      pending.push({
        at: `${day}T11`,
        run: () =>
          notifyPayers(schoolId, {
            event: 'payment.confirmed',
            title: `Payment received · ${naira(p.amount)}`,
            by: p.verifiedBy ?? p.recordedBy,
            at: at(day, `pay${p.id}`),
            source: {
              label: p.no,
              to: { name: r.finance.paymentDetail.name, params: { id: p.id } },
            },
            students: [
              { student: s, vars: { amount: naira(p.amount), receipt_no: p.no, balance: '₦0' } },
            ],
          }),
      });
    else if (p.status === 'Rejected')
      pending.push({
        at: `${day}T15`,
        run: () =>
          notifyPayers(schoolId, {
            event: 'payment.rejected',
            title: `Payment not confirmed · ${naira(p.amount)}`,
            by: BURSAR,
            at: at(day, `rej${p.id}`, 14, 3),
            source: {
              label: p.no,
              to: { name: r.finance.paymentDetail.name, params: { id: p.id } },
            },
            students: [
              {
                student: s,
                vars: { amount: naira(p.amount), reason: p.rejectReason || 'No matching transfer' },
              },
            ],
          }),
      });
  }

  // Refunds paid out.
  for (const rf of fin.refunds ?? []) {
    if (rf.status !== 'Paid' || !rf.paidOn || rf.paidOn < sessionStart) continue;
    const s = students.get(rf.studentKey);
    if (!s) continue;
    pending.push({
      at: `${rf.paidOn}T12`,
      run: () =>
        notifyPayers(schoolId, {
          event: 'refund.paid',
          title: `Refund paid · ${rf.no}`,
          by: BURSAR,
          at: at(rf.paidOn!, `rf${rf.id}`),
          source: {
            label: rf.no,
            to: { name: r.finance.refundDetail.name, params: { id: rf.id } },
          },
          students: [{ student: s, vars: { amount: naira(rf.amount), refund_no: rf.no } }],
        }),
    });
  }

  // Overdue reminders the bursary sent.
  const overdue = fin.invoices
    .filter((i) => i.status === 'Issued' && i.dueOn < today && students.get(i.studentKey)?.payer)
    .sort((a, b) => a.studentKey.localeCompare(b.studentKey));
  for (const [i, rem] of (fin.reminders ?? []).entries()) {
    if (rem.date < sessionStart || rem.date > today) continue;
    const batch = overdue.filter((inv) => inv.dueOn < rem.date).slice(0, Math.max(1, rem.count));
    if (!batch.length) continue;
    pending.push({
      at: `${rem.date}T16`,
      run: () =>
        notifyPayers(schoolId, {
          event: 'fee.overdue',
          title:
            batch.length > 1 ? 'Overdue fee reminder' : `Overdue fee reminder · ${batch[0]!.no}`,
          by: rem.by,
          at: at(rem.date, `rem${i}`, 16, 2),
          source: {
            label: 'Invoices',
            to: { name: r.finance.invoices.name, query: { status: 'Overdue' } },
          },
          students: batch.map((inv) => ({
            student: students.get(inv.studentKey)!,
            vars: {
              balance: naira(invoiceTotal(inv.id)),
              days_overdue: String(
                Math.max(
                  1,
                  Math.round(
                    (new Date(rem.date).getTime() - new Date(inv.dueOn).getTime()) / 86_400_000,
                  ),
                ),
              ),
            },
          })),
        }),
    });
  }

  // Invitations still waiting.
  const sd = studentsData[schoolId];
  for (const g of sd?.guardians ?? []) {
    if (g.portal !== 'Invited') continue;
    const day = '2026-11-02';
    pending.push({
      at: `${day}T10`,
      run: () =>
        dispatch(schoolId, {
          event: 'parent.invitation',
          title: 'Parent Portal invitation',
          audience: g.name,
          by: 'Adaeze Okonkwo',
          at: at(day, `gi${g.id}`),
          recipients: [guardianRecipient(g, { invite_link: 'https://parents.edutrack.ng/i/…' })],
          source: { label: g.name, to: { name: r.students.parent.name, params: { id: g.id } } },
        }),
    });
  }
  const data = schoolData[schoolId];
  for (const u of data?.users ?? []) {
    if (u.status !== 'Invited') continue;
    const s = u.staffId ? data!.staff.find((x) => x.id === u.staffId) : null;
    const day = '2026-11-04';
    pending.push({
      at: `${day}T09`,
      run: () =>
        dispatch(schoolId, {
          event: 'staff.invitation',
          title: 'Staff invitation',
          audience: u.name,
          by: 'Adaeze Okonkwo',
          at: at(day, `ui${u.id}`),
          recipients: [
            staffRecipient(
              { id: s?.id ?? u.id, name: u.name, email: u.email, phone: s?.phone ?? '' },
              { role: u.roles.join(', '), invite_link: 'https://app.edutrack.ng/i/…' },
            ),
          ],
          source: { label: u.name, to: { name: r.school.user.name, params: { id: u.id } } },
        }),
    });
  }

  // Announcements written this term.
  seedAnnouncements(c, pending);

  pending.sort((a, b) => a.at.localeCompare(b.at));
  for (const p of pending) p.run();
  // Seeds come out newest first like live sends.
  c.messages.sort((a, b) => b.at.localeCompare(a.at));
}

function seedAnnouncements(c: CommsData, pending: { at: string; run: () => void }[]) {
  const main = schoolData[c.schoolId]?.branches[0]?.id ?? null;
  const ADA = 'Adaeze Okonkwo';
  const base = (
    id: string,
    title: string,
    body: string,
    smsText: string,
    audience: Audience,
    channels: Channel[],
    created: string,
  ): AnnouncementRec => ({
    id,
    title,
    body,
    smsText,
    audience,
    channels,
    status: 'Draft',
    scheduledFor: null,
    expiresOn: null,
    createdBy: ADA,
    createdAt: created,
    updatedAt: created,
    sentAt: null,
    withdrawnAt: null,
    withdrawReason: '',
    recipients: null,
    smsUnits: 0,
    messageId: null,
    history: [{ id: 'ah0', title: 'Created', detail: ADA, when: atLabel(created) }],
  });
  const all = (kind: Audience['kind'], branchId: string | null = null): Audience => ({
    kind,
    classes: [],
    branchId,
  });

  const list: { a: AnnouncementRec; send?: string; withdraw?: { at: string; reason: string } }[] = [
    {
      a: {
        ...base(
          'an1',
          'Welcome back: First Term resumes Monday 14 September',
          'Dear parents and students, First Term 2026/2027 resumes on Monday 14 September. Boarders return on Sunday 13 September from 2pm. Please make sure fees are settled or a payment plan agreed with the bursary before resumption.',
          'Greenfield: First Term resumes Mon 14 Sep. Boarders return Sun 13 Sep from 2pm.',
          all('everyone'),
          ['In-app', 'Email', 'SMS'],
          '2026-09-08T10:12',
        ),
        expiresOn: '2026-09-14',
      },
      send: '2026-09-08T10:30',
    },
    {
      a: {
        ...base(
          'an2',
          'Inter-house sports: Friday 9 October',
          'Our inter-house sports competition holds on Friday 9 October from 8am at the main field. Parents are welcome. Students should come in their house colours.',
          'Greenfield: Inter-house sports Fri 9 Oct, 8am. Parents welcome. Students wear house colours.',
          all('everyone', main),
          ['In-app', 'SMS'],
          '2026-09-29T14:02',
        ),
        expiresOn: '2026-10-09',
      },
      send: '2026-10-01T09:00',
    },
    {
      a: {
        ...base(
          'an3',
          'Mid-term break dates',
          'Mid-term break runs from Monday 19 to Friday 23 October.',
          'Greenfield: mid-term break is 19–23 Oct.',
          all('parents'),
          ['In-app', 'Email', 'SMS'],
          '2026-10-12T11:20',
        ),
        expiresOn: '2026-10-23',
      },
      send: '2026-10-12T11:25',
      withdraw: { at: '2026-10-12T13:40', reason: 'Wrong dates. The corrected notice follows.' },
    },
    {
      a: {
        ...base(
          'an4',
          'Mid-term break: 26 to 30 October',
          'Correction: mid-term break runs from Monday 26 to Friday 30 October. School resumes on Monday 2 November. We apologise for the earlier notice.',
          'Greenfield: correction, mid-term break is 26–30 Oct. Resumption Mon 2 Nov.',
          all('parents'),
          ['In-app', 'Email', 'SMS'],
          '2026-10-12T13:45',
        ),
        expiresOn: '2026-10-30',
      },
      send: '2026-10-12T13:50',
    },
    {
      a: {
        ...base(
          'an5',
          'PTA meeting & open day: Wednesday 18 November',
          'Dear parents, our end-of-term PTA meeting and open day holds on Wednesday 18 November at 10:00 in the main hall. Class teachers will be available to discuss each child’s progress.',
          'Greenfield: PTA meeting & open day Wed 18 Nov, 10am, main hall.',
          all('parents'),
          ['In-app', 'Email', 'SMS'],
          '2026-11-03T09:10',
        ),
        expiresOn: '2026-11-18',
      },
      send: '2026-11-04T09:00',
    },
    {
      a: {
        ...base(
          'an6',
          'JSS 2 science excursion: consent forms',
          'JSS 2 students visit the Lagos Science Museum on Thursday 26 November. Please sign and return the consent form by Friday 20 November. The trip costs ₦7,500, payable to the bursary.',
          'Greenfield: JSS 2 science trip Thu 26 Nov. Return consent forms by Fri 20 Nov.',
          { kind: 'classes', classes: ['JSS 2A', 'JSS 2B'], branchId: null },
          ['In-app', 'SMS'],
          '2026-11-05T12:30',
        ),
        expiresOn: '2026-11-26',
      },
      send: '2026-11-05T12:45',
    },
    {
      a: {
        ...base(
          'an7',
          'First Term examination timetable',
          'The First Term examination timetable is attached in the portal. Examinations run from Monday 30 November to Friday 11 December.',
          '',
          all('everyone'),
          ['In-app', 'Email'],
          '2026-11-06T15:00',
        ),
        status: 'Scheduled',
        scheduledFor: '2026-11-16T08:00',
        expiresOn: '2026-12-11',
      },
    },
    {
      a: base(
        'an8',
        'Christmas carol service',
        'Our annual Christmas carol service holds on Thursday 17 December at 4pm. All families are invited.',
        'Greenfield: Christmas carol service Thu 17 Dec, 4pm. All families invited.',
        all('everyone'),
        ['In-app', 'Email', 'SMS'],
        '2026-11-06T16:20',
      ),
    },
    {
      a: {
        ...base(
          'an9',
          'Staff briefing: report card deadlines',
          'All teaching staff: score entry for First Term closes on Friday 4 December. HODs review the following week.',
          '',
          all('teachers'),
          ['In-app', 'Email'],
          '2026-11-02T08:15',
        ),
      },
      send: '2026-11-02T08:20',
    },
  ];
  for (const { a, send, withdraw } of list) {
    c.announcements.push(a);
    if (a.status === 'Scheduled')
      a.history.push({
        id: 'ah1',
        title: `Scheduled for ${atLabel(a.scheduledFor!)}`,
        detail: a.createdBy,
        when: atLabel(a.createdAt),
      });
    if (send)
      pending.push({
        at: send,
        run: () => {
          sendAnnouncement(c, a, a.createdBy, false, send);
          if (withdraw) {
            a.status = 'Withdrawn';
            a.withdrawnAt = withdraw.at;
            a.withdrawReason = withdraw.reason;
            a.history.push({
              id: `ah${a.history.length + 1}`,
              title: 'Withdrawn from the portals',
              detail: `${a.createdBy} · ${withdraw.reason}`,
              when: atLabel(withdraw.at),
              tone: 'warning',
            });
          }
        },
      });
  }
  c.seq = Math.max(c.seq, 20);
}
