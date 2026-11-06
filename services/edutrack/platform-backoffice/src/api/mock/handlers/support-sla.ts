import { isDone, PAUSED_STATUSES, SLA_TARGETS } from '@/config/support-desk';
import type { IssueStatus, SlaClock, SupportIssue } from '@/types';

import type { IssueRow } from '../db';

const HOUR = 3600e3;

/** "2h 5m", "1d 3h", "40m". */
export function durationText(ms: number) {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return mm ? `${h}h ${mm}m` : `${h}h`;
  return `${mm}m`;
}

/** A running clock: overdue, due soon (within an hour, or the first-reply window), or fine. */
function running(leftMs: number, soonMs: number): SlaClock {
  if (leftMs < 0) return { state: 'over', label: `Overdue by ${durationText(leftMs)}` };
  return { state: leftMs < soonMs ? 'soon' : 'ok', label: `Due in ${durationText(leftMs)}` };
}

export function slaOf(row: IssueRow, now = Date.now()): SupportIssue['sla'] {
  const targets = SLA_TARGETS[row.priority];
  const soon = Math.max(1, targets[0]) * HOUR;
  const done = isDone(row.status);
  const firstReply: SlaClock =
    row.firstReplyMs || done
      ? { state: 'met', label: 'Met' }
      : running(row.createdMs + targets[0] * HOUR - now, soon);
  const paused = row.pausedMs + (row.pausedSince ? now - row.pausedSince : 0);
  const resolution: SlaClock = done
    ? row.slaMissed
      ? { state: 'over', label: 'Missed' }
      : { state: 'met', label: 'Met' }
    : PAUSED_STATUSES.includes(row.status)
      ? {
          state: 'paused',
          label: `Paused · ${row.status === 'On Hold' ? 'on hold' : 'waiting for school'}`,
        }
      : running(row.createdMs + targets[1] * HOUR + paused - now, soon);
  return { firstReply, resolution, targets };
}

export const isOverdue = (row: IssueRow) => {
  if (isDone(row.status)) return false;
  const { firstReply, resolution } = slaOf(row);
  return firstReply.state === 'over' || resolution.state === 'over';
};

/** Moves `row` to `to`, keeping the paused time, resolution and reopen bookkeeping right. */
export function setStatus(row: IssueRow, to: IssueStatus, now = Date.now()) {
  const wasPaused = PAUSED_STATUSES.includes(row.status);
  const willPause = PAUSED_STATUSES.includes(to);
  if (wasPaused && !willPause && row.pausedSince) {
    row.pausedMs += now - row.pausedSince;
    row.pausedSince = null;
  }
  if (willPause && !wasPaused) row.pausedSince = now;
  if (to === 'Resolved' && !isDone(row.status))
    row.slaMissed = slaOf(row, now).resolution.state === 'over';
  if (to === 'Reopened') {
    row.reopenCount += 1;
    row.slaMissed = false;
    row.rating = null;
    row.escalatedTo = null;
  }
  if (!willPause) row.holdReason = null;
  row.status = to;
  row.updatedAt = 'Just now';
}
