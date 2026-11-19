import { unprocessable } from '../shared/staff.js';
import type {
  SupportTeam,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  Tone,
} from '../../generated/prisma/enums.js';
import { addWorkingMs, type Holidays } from './working-time.js';

/** The back office's labels (platform-backoffice/src/types/support.ts). */
const byLabel = <K extends string>(labels: Record<K, string>) =>
  Object.fromEntries(Object.entries(labels).map(([k, v]) => [v, k])) as Record<string, K>;

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_SCHOOL: 'Waiting for School',
  ON_HOLD: 'On Hold',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};
export const STATUS_BY_LABEL = byLabel(STATUS_LABEL);

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};
export const PRIORITY_BY_LABEL = byLabel(PRIORITY_LABEL);

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  ACCOUNT: 'Account',
  BILLING: 'Billing',
  SUBSCRIPTION: 'Subscription',
  TECHNICAL: 'Technical',
  ACADEMIC: 'Academic',
  FINANCE: 'Finance',
  ACCESS: 'Access',
  OTHER: 'Other',
};
export const CATEGORY_BY_LABEL = byLabel(CATEGORY_LABEL);

export const TEAM_LABEL: Record<SupportTeam, string> = {
  TIER_1_SUPPORT: 'Tier 1 Support',
  TECHNICAL: 'Technical',
  BILLING: 'Billing',
  ONBOARDING: 'Onboarding',
  ENGINEERING: 'Engineering',
};
export const TEAM_BY_LABEL = byLabel(TEAM_LABEL);

export const TONE_LABEL: Record<Tone, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  SUCCESS: 'success',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  NEUTRAL: 'neutral',
};

export const DONE: TicketStatus[] = ['RESOLVED', 'CLOSED'];
/** Statuses that pause the resolution clock. */
export const PAUSED: TicketStatus[] = ['WAITING_FOR_SCHOOL', 'ON_HOLD'];
export const isDone = (s: TicketStatus) => DONE.includes(s);
export const isPaused = (s: TicketStatus) => PAUSED.includes(s);

/** Which status each status can move to through POST /transitions. */
export const NEXT: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['CLOSED'],
  REOPENED: ['CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'ESCALATED'],
  IN_PROGRESS: ['RESOLVED', 'WAITING_FOR_SCHOOL', 'ON_HOLD', 'ESCALATED'],
  WAITING_FOR_SCHOOL: ['IN_PROGRESS', 'RESOLVED'],
  ON_HOLD: ['IN_PROGRESS', 'RESOLVED'],
  ESCALATED: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
};

/** The team a new ticket is routed to, from its category. */
export function routeTeam(category: TicketCategory): SupportTeam {
  if (category === 'BILLING' || category === 'SUBSCRIPTION') return 'BILLING';
  if (category === 'TECHNICAL' || category === 'ACCESS') return 'TECHNICAL';
  return 'TIER_1_SUPPORT';
}

/** Where a ticket can be escalated (the back office's `ESCALATION_TARGETS`). */
export const ESCALATION_TARGETS: { team: SupportTeam; label: string }[] = [
  { team: 'TECHNICAL', label: 'Tier 2 · Technical' },
  { team: 'ENGINEERING', label: 'Engineering' },
  { team: 'BILLING', label: 'Billing specialist' },
  { team: 'TIER_1_SUPPORT', label: 'Support lead' },
];

export const RESOLUTION_TYPES = [
  'Fixed',
  'Guidance given',
  'Workaround',
  'Expected behaviour',
  'Duplicate',
];
export const HOLD_REASONS = [
  'Payment provider',
  'SMS or WhatsApp provider',
  'Scheduled fix',
  'Internal team',
];
export const CLOSE_REASONS = ['Duplicate', 'Raised in error', 'Spam'];

/** A resolved ticket closes by itself this long after resolving if the school doesn't reply. */
export const AUTO_CLOSE_DAYS = 7;

const HOUR = 3_600_000;

/** SLA targets in working hours: [first reply, resolution]. */
export const SLA_HOURS: Record<TicketPriority, [number, number]> = {
  URGENT: [1, 8],
  HIGH: [4, 24],
  NORMAL: [8, 72],
  LOW: [24, 120],
};

export interface SlaClock {
  state: 'ok' | 'soon' | 'over' | 'met' | 'paused';
  label: string;
}

/** "2h 5m", "1d 3h", "40m". */
export function durationText(ms: number) {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return mm ? `${h}h ${mm}m` : `${h}h`;
  return `${mm}m`;
}

/** Overdue, due soon, or fine. Labels give the clock time to (or since) the due moment. */
function running(due: Date, now: Date, soonMs: number): SlaClock {
  const left = due.getTime() - now.getTime();
  if (left < 0) return { state: 'over', label: `Overdue by ${durationText(left)}` };
  return { state: left < soonMs ? 'soon' : 'ok', label: `Due in ${durationText(left)}` };
}

export interface SlaTicket {
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: Date;
  firstReplyAt: Date | null;
  /** Working seconds spent paused before `pausedSince`. */
  pausedSeconds: number;
  slaMissed: boolean;
}

/** When the resolution target falls, counting the working time it spent paused. */
export const resolutionDue = (t: SlaTicket, holidays: Holidays) =>
  addWorkingMs(t.createdAt, SLA_HOURS[t.priority][1] * HOUR + t.pausedSeconds * 1000, holidays);

export function slaOf(t: SlaTicket, now: Date, holidays: Holidays) {
  const targets = SLA_HOURS[t.priority];
  const soon = Math.max(1, targets[0]) * HOUR;
  const done = isDone(t.status);
  const firstReply: SlaClock =
    t.firstReplyAt || done
      ? { state: 'met', label: 'Met' }
      : running(addWorkingMs(t.createdAt, targets[0] * HOUR, holidays), now, soon);
  const resolution: SlaClock = done
    ? t.slaMissed
      ? { state: 'over', label: 'Missed' }
      : { state: 'met', label: 'Met' }
    : isPaused(t.status)
      ? {
          state: 'paused',
          label: `Paused · ${t.status === 'ON_HOLD' ? 'on hold' : 'waiting for school'}`,
        }
      : running(resolutionDue(t, holidays), now, soon);
  return { firstReply, resolution, targets };
}

export function isOverdue(t: SlaTicket, now: Date, holidays: Holidays) {
  if (isDone(t.status)) return false;
  const { firstReply, resolution } = slaOf(t, now, holidays);
  return firstReply.state === 'over' || resolution.state === 'over';
}

/** Attachments: PNG, JPEG or PDF, 10 MB at most, checked by their first bytes too. */
export const MAX_SUPPORT_ATTACHMENT = 10 * 1024 * 1024;

/** A `data:` URL as bytes, refusing anything that isn't really a PNG, JPEG or PDF. */
export function parseSupportAttachment(dataUrl: string) {
  const match = /^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/.exec(
    dataUrl,
  );
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
  if (bytes.length > MAX_SUPPORT_ATTACHMENT)
    throw unprocessable('The attachment is larger than 10 MB.', 'ATTACHMENT_TOO_LARGE');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'pdf';
  return { bytes, mime, ext };
}
