import type { StatusTone } from '@edutrack/ui/lib/status';

import type { IssuePriority, IssueStatus, SlaClock } from '@/types';

export const ISSUE_STATUS_TONE: Record<IssueStatus, StatusTone> = {
  Open: 'warning',
  Assigned: 'info',
  'In Progress': 'info',
  'Waiting for School': 'warning',
  'On Hold': 'neutral',
  Escalated: 'error',
  Resolved: 'success',
  Closed: 'neutral',
  Reopened: 'warning',
};

export const ISSUE_PRIORITY_TONE: Record<IssuePriority, StatusTone> = {
  Low: 'neutral',
  Normal: 'info',
  High: 'warning',
  Urgent: 'error',
};

export const SLA_TONE: Record<SlaClock['state'], StatusTone> = {
  over: 'error',
  soon: 'warning',
  ok: 'info',
  paused: 'neutral',
  met: 'success',
};
