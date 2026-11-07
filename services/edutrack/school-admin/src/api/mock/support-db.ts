import type {
  TicketAttachment,
  TicketCategory,
  TicketPriority,
  TicketSla,
  TicketStatus,
} from '@/types';

/**
 * Support tickets the school raises with the EduTrack platform team. On the real platform these
 * live in the back office's support desk; the school only ever sees its own tickets, never the
 * agents' internal notes.
 */
export interface TicketMsgRec {
  id: string;
  author: string;
  authorRole: string;
  /** `note` is internal to the support team and is never sent to the school. */
  kind: 'school' | 'agent' | 'note';
  at: string;
  text: string;
  attachments: TicketAttachment[];
}

export interface TicketEventRec {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export interface TicketRec {
  id: string;
  schoolId: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requester: string;
  requesterId: string;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  firstReplyAt: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  rating: number | null;
  reopenCount: number;
  followUpOf: string | null;
  messages: TicketMsgRec[];
  events: TicketEventRec[];
}

/** Which platform team picks up each category (the back office's queues). */
export const TEAM_OF: Record<TicketCategory, string> = {
  'Results & report cards': 'Tier 1 Support',
  'Fees & payments': 'Tier 1 Support',
  Communication: 'Technical',
  'Students & admissions': 'Tier 1 Support',
  'Account & billing': 'Billing',
  'Something else': 'Tier 1 Support',
};

/** First-reply target in support working hours. */
export const FIRST_REPLY_HOURS: Record<TicketPriority, number> = {
  Urgent: 1,
  High: 2,
  Normal: 4,
};

/* ---------------- Working-hours clock (Mon–Fri 08:00–17:00 WAT, UTC+1) ---------------- */

const HOUR = 3_600_000;
const WAT = HOUR; // West Africa Time has no daylight saving.
const OPEN = 8;
const CLOSE = 17;

/** Adds support working hours to a moment, skipping evenings and weekends. */
export function addWorkingHours(startMs: number, hours: number): number {
  let t = startMs + WAT; // work in WAT wall-clock, expressed as UTC fields
  let left = hours * HOUR;
  for (let guard = 0; guard < 400; guard++) {
    const d = new Date(t);
    const day = d.getUTCDay();
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), OPEN);
    const dayEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), CLOSE);
    if (day === 0 || day === 6 || t >= dayEnd) {
      t = dayStart + 24 * HOUR; // next day's opening; weekends are skipped on the next pass
      continue;
    }
    if (t < dayStart) t = dayStart;
    const room = dayEnd - t;
    if (left <= room) return t + left - WAT;
    left -= room;
    t = dayStart + 24 * HOUR;
  }
  return t - WAT;
}

/** Working milliseconds between two moments. */
export function workingMsBetween(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  let total = 0;
  let t = fromMs + WAT;
  const end = toMs + WAT;
  for (let guard = 0; guard < 4000 && t < end; guard++) {
    const d = new Date(t);
    const day = d.getUTCDay();
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), OPEN);
    const dayEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), CLOSE);
    if (day !== 0 && day !== 6) {
      const a = Math.max(t, dayStart);
      const b = Math.min(end, dayEnd);
      if (b > a) total += b - a;
    }
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 24 * HOUR;
  }
  return total;
}

const durationText = (ms: number) => {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Mon 7 Dec, 10:14" in WAT. */
export function watLabel(ms: number) {
  const d = new Date(ms + WAT);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}, ${hh}:${mm}`;
}

/** The first-reply clock as the school sees it. */
export function slaOf(t: TicketRec, now = Date.now()): TicketSla {
  const targetHours = FIRST_REPLY_HOURS[t.priority];
  const created = Date.parse(t.createdAt);
  const due = addWorkingHours(created, targetHours);
  const base = { due: new Date(due).toISOString(), targetHours };
  if (t.firstReplyAt) {
    const replied = Date.parse(t.firstReplyAt);
    const took = durationText(workingMsBetween(created, replied));
    return replied <= due
      ? { ...base, state: 'met', label: `First reply in ${took}` }
      : { ...base, state: 'late', label: `First reply took ${took}` };
  }
  if (t.status === 'Closed') return { ...base, state: 'met', label: 'Closed before a reply' };
  if (now > due)
    return { ...base, state: 'over', label: `First reply overdue since ${watLabel(due)}` };
  const left = workingMsBetween(now, due);
  return {
    ...base,
    state: left <= HOUR ? 'soon' : 'ok',
    label: `First reply due by ${watLabel(due)}`,
  };
}

/* ---------------- Seed ---------------- */

let seq = 0;
export const nextMsgId = () => `m${Date.now().toString(36)}${(++seq).toString(36)}`;

/** Ticket numbers are platform-wide, like the back office's. */
let ticketNo = 1049;
export const nextTicketId = () => `SUP-${++ticketNo}`;

/** `days` days ago at a WAT wall-clock time (so seeds always read as recent). */
function ago(days: number, hourWat: number, minute = 0): string {
  const now = new Date(Date.now() + WAT);
  const d = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days,
    hourWat,
    minute,
  );
  return new Date(d - WAT).toISOString();
}
/** The nearest weekday on or before `days` ago, so seeded tickets were raised in working hours. */
function weekdayAgo(days: number, hourWat: number, minute = 0): string {
  for (let d = days; d < days + 7; d++) {
    const iso = ago(d, hourWat, minute);
    const wd = new Date(Date.parse(iso) + WAT).getUTCDay();
    if (wd !== 0 && wd !== 6 && Date.parse(iso) < Date.now() - 30 * 60000) return iso;
  }
  return ago(days, hourWat, minute);
}
const plusMin = (iso: string, mins: number) =>
  new Date(Date.parse(iso) + mins * 60000).toISOString();

const ADAEZE = { name: 'Adaeze Okonkwo', id: 'okonkwo', role: 'Principal · Greenfield Academy' };
const TOBI = 'Tobi Adewale';
const IFE = 'Ifeoma Nnaji';

const msg = (
  kind: TicketMsgRec['kind'],
  author: string,
  at: string,
  text: string,
  attachments: TicketAttachment[] = [],
): TicketMsgRec => ({
  id: nextMsgId(),
  author,
  authorRole:
    kind === 'school' ? ADAEZE.role : kind === 'note' ? 'Internal note' : 'EduTrack Support',
  kind,
  at,
  text,
  attachments,
});
const ev = (at: string, title: string, tone?: TicketEventRec['tone'], detail?: string) => ({
  id: nextMsgId(),
  at,
  title,
  tone,
  detail,
});

function seedGreenfield(): TicketRec[] {
  const t1 = weekdayAgo(3, 10, 14);
  const t2 = weekdayAgo(9, 9, 20);
  const t3 = weekdayAgo(60, 11, 5);
  const t4 = weekdayAgo(2, 9, 40);
  const t5 = weekdayAgo(0, 9, 5);
  const base = {
    schoolId: 'greenfield',
    requester: ADAEZE.name,
    requesterId: ADAEZE.id,
    reopenCount: 0,
    followUpOf: null,
    rating: null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
  };
  return [
    {
      ...base,
      id: 'SUP-1042',
      subject: 'Report cards print with cut-off principal signature',
      category: 'Results & report cards',
      priority: 'Normal',
      status: 'Waiting for School',
      assignee: TOBI,
      createdAt: t1,
      updatedAt: plusMin(t1, 48),
      firstReplyAt: plusMin(t1, 48),
      messages: [
        msg(
          'school',
          ADAEZE.name,
          t1,
          'When we print report cards for JSS 2, the principal’s signature is cut off at the bottom of the page. It happens for every student in JSS 2A and JSS 2B.',
          [{ name: 'report-card-jss2.png', type: 'image/png', bytes: 655_360, dataUrl: null }],
        ),
        msg('note', TOBI, plusMin(t1, 40), 'Probably the A4 margin on the Classic template.'),
        msg(
          'agent',
          TOBI,
          plusMin(t1, 48),
          'Thanks for the screenshot. Could you tell us which report card template you’re using, and send one exported PDF so we can check the page margins?',
        ),
      ],
      events: [
        ev(t1, 'Ticket raised', 'info', ADAEZE.name),
        ev(plusMin(t1, 30), `Assigned to ${TOBI}`, 'neutral', 'Tier 1 Support'),
        ev(plusMin(t1, 48), 'Support is waiting for your reply', 'warning'),
      ],
    },
    {
      ...base,
      id: 'SUP-1031',
      subject: 'Bulk SMS to parents not delivered on MTN numbers',
      category: 'Communication',
      priority: 'High',
      status: 'In progress',
      assignee: IFE,
      createdAt: t2,
      updatedAt: plusMin(t2, 205),
      firstReplyAt: plusMin(t2, 85),
      messages: [
        msg(
          'school',
          ADAEZE.name,
          t2,
          'About 40 MTN numbers show Failed in Delivery Logs for the PTA notice we sent this morning. Glo and Airtel numbers received it.',
        ),
        msg(
          'agent',
          IFE,
          plusMin(t2, 85),
          'We can see the failures. Email and in-app copies of the notice were delivered. We’ve escalated the MTN route to our SMS provider and will update you here.',
        ),
        msg(
          'note',
          IFE,
          plusMin(t2, 200),
          'Escalated to Engineering: MTN DND filtering on promo route.',
        ),
      ],
      events: [
        ev(t2, 'Ticket raised', 'info', ADAEZE.name),
        ev(plusMin(t2, 60), `Assigned to ${IFE}`, 'neutral', 'Technical'),
        ev(plusMin(t2, 205), 'Escalated to our SMS provider', 'warning'),
      ],
    },
    {
      ...base,
      id: 'SUP-0998',
      subject: 'Add Lekki Campus to our plan',
      category: 'Account & billing',
      priority: 'Normal',
      status: 'Closed',
      assignee: 'Musa Garba',
      createdAt: t3,
      updatedAt: plusMin(t3, 60 * 26),
      firstReplyAt: plusMin(t3, 70),
      resolution: 'Lekki Campus added. The plan now covers 3 branches.',
      resolvedAt: plusMin(t3, 60 * 24),
      closedAt: plusMin(t3, 60 * 26),
      rating: 5,
      messages: [
        msg(
          'school',
          ADAEZE.name,
          t3,
          'We opened a second campus in Lekki and need it on our account.',
        ),
        msg(
          'agent',
          'Musa Garba',
          plusMin(t3, 70),
          'Done. Lekki Campus is active and your plan now covers 3 branches. You can set it up under School → Branches.',
        ),
        msg('school', ADAEZE.name, plusMin(t3, 60 * 26), 'Confirmed, thank you.'),
      ],
      events: [
        ev(t3, 'Ticket raised', 'info', ADAEZE.name),
        ev(plusMin(t3, 60 * 24), 'Marked resolved by support', 'success'),
        ev(plusMin(t3, 60 * 26), 'You confirmed the fix · rated 5 of 5', 'success'),
      ],
    },
    {
      ...base,
      id: 'SUP-1046',
      subject: 'Receipts show the Main Campus address for Lekki payments',
      category: 'Fees & payments',
      priority: 'Normal',
      status: 'Resolved',
      assignee: TOBI,
      createdAt: t4,
      updatedAt: plusMin(t4, 60 * 22),
      firstReplyAt: plusMin(t4, 55),
      resolution: 'Receipts now use the paying student’s branch address.',
      resolvedAt: plusMin(t4, 60 * 22),
      messages: [
        msg(
          'school',
          ADAEZE.name,
          t4,
          'Receipts for Lekki Campus students show the Main Campus address in the header. Parents have asked whether they paid the right campus.',
        ),
        msg(
          'agent',
          TOBI,
          plusMin(t4, 55),
          'Thanks, we’ve reproduced it and passed it to Engineering.',
        ),
        msg(
          'agent',
          TOBI,
          plusMin(t4, 60 * 22),
          'Fixed: receipts now use the paying student’s branch address. Receipts issued earlier keep their original layout. Please confirm on your side.',
        ),
      ],
      events: [
        ev(t4, 'Ticket raised', 'info', ADAEZE.name),
        ev(plusMin(t4, 50), `Assigned to ${TOBI}`, 'neutral', 'Tier 1 Support'),
        ev(plusMin(t4, 60 * 22), 'Marked resolved by support', 'success'),
      ],
    },
    {
      ...base,
      id: 'SUP-1049',
      subject: 'Staff passport photos over 1 MB won’t upload',
      category: 'Something else',
      priority: 'Normal',
      status: 'Open',
      assignee: null,
      createdAt: t5,
      updatedAt: t5,
      firstReplyAt: null,
      messages: [
        msg(
          'school',
          ADAEZE.name,
          t5,
          'Photos taken on our phones are 2–3 MB and the staff form rejects them. Can the limit be raised, or can the photo be resized automatically?',
        ),
      ],
      events: [ev(t5, 'Ticket raised', 'info', ADAEZE.name)],
    },
  ];
}

export const tickets: TicketRec[] = [...seedGreenfield()];
