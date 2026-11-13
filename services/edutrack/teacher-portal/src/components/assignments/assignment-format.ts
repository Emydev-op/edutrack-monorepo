import type { StatusTone } from '@edutrack/ui/lib/status';

import { daysBetween, formatDateTime, formatDeadline } from '@/lib/dates';
import type { AssignmentStatus, SubmissionStatus } from '@/types';

/** One tone per submission status, everywhere. */
export const SUBMISSION_TONE: Record<SubmissionStatus, StatusTone> = {
  'Not submitted': 'neutral',
  Submitted: 'info',
  Late: 'warning',
  Graded: 'brand',
  Returned: 'success',
  Excused: 'neutral',
};

export const ASSIGNMENT_TONE: Record<AssignmentStatus, StatusTone> = {
  Draft: 'neutral',
  Published: 'brand',
  Closed: 'neutral',
};

/** "1.3 MB", "412 KB" */
export function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Thu 10 Dec, 16:00" with "today" / "tomorrow" / "in 3 days" / "2 days ago" relative to now. */
export function dueLabel(dueAt: string | null, now: string) {
  if (!dueAt) return { text: 'No due date', hint: '' };
  const days = now ? daysBetween(now, dueAt) : 0;
  let hint = '';
  if (now) {
    if (dueAt < now)
      hint = days === 0 ? 'Earlier today' : days === -1 ? 'Yesterday' : `${-days} days ago`;
    else if (days === 0) hint = 'Due today';
    else if (days === 1) hint = 'Due tomorrow';
    else hint = `In ${days} days`;
  }
  return { text: formatDeadline(dueAt), hint };
}

export const when = (local: string | null) => (local ? formatDateTime(local) : '—');

/** "3h 20m", "2 days" from one local time to a later one. */
export function durationText(from: string, to: string) {
  const mins = (local: string) =>
    Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10)) / 60_000 +
    +local.slice(11, 13) * 60 +
    +local.slice(14, 16);
  const m = Math.max(0, mins(to) - mins(from));
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
  const d = Math.round(m / (24 * 60));
  return `${d} day${d === 1 ? '' : 's'}`;
}
