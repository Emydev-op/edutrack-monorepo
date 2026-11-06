import type { SupportIssue } from '@/types';

export interface IssueStage {
  label: string;
  state: 'done' | 'current' | 'todo';
}

const STAGES = ['Open', 'Assigned', 'In Progress', 'Waiting / on hold', 'Resolved', 'Closed'];

/**
 * The lifecycle strip. Side states take the slot they belong to: Reopened replaces Open,
 * Escalated replaces In Progress, and On hold shows in the waiting slot.
 */
export function issueStages(i: SupportIssue): IssueStage[] {
  const at: Partial<Record<SupportIssue['status'], number>> = {
    Open: 0,
    Reopened: 0,
    Assigned: 1,
    'In Progress': 2,
    Escalated: 2,
    'Waiting for School': 3,
    'On Hold': 3,
    Resolved: 4,
    Closed: 5,
  };
  const current = at[i.status] ?? 0;
  return STAGES.map((label, k) => ({
    label:
      k === 0 && i.status === 'Reopened'
        ? 'Reopened'
        : k === 2 && i.status === 'Escalated'
          ? 'Escalated'
          : k === 3 && i.status === 'On Hold'
            ? 'On hold'
            : k === 3 && i.status === 'Waiting for School'
              ? 'Waiting for School'
              : label,
    state: k < current ? 'done' : k === current ? 'current' : 'todo',
  }));
}

/** What the agent should know about the ticket right now, or '' when nothing stands out. */
export function issueBanner(i: SupportIssue): string {
  const { firstReply, resolution } = i.sla;
  switch (i.status) {
    case 'Escalated':
      return `Escalated to ${i.escalatedTo ?? i.team}${i.escalatedFrom ? ` from ${i.escalatedFrom}` : ''}. Resolution SLA: ${resolution.label.toLowerCase()}.`;
    case 'Resolved':
      return 'Waiting for the school to confirm. Closes automatically 7 days after resolving unless they reply.';
    case 'Waiting for School':
      return 'Waiting for the school’s reply · SLA paused. Reminder after 2 working days; closes after 7 days without a reply.';
    case 'On Hold':
      return `On hold${i.holdReason ? ` · ${i.holdReason}` : ''} · SLA paused.`;
    case 'Closed':
      return `Closed${i.rating ? ` · school rated ${i.rating.score} / 5${i.rating.comment ? ` “${i.rating.comment}”` : ''}` : ''}.`;
  }
  if (firstReply.state === 'over')
    return `First reply overdue. ${i.assignee ? `${i.assignee} owns this ticket.` : 'Nobody owns this ticket yet.'}`;
  if (resolution.state === 'over')
    return `Resolution SLA missed: ${resolution.label.toLowerCase()}. Consider escalating.`;
  if (i.status === 'Reopened')
    return `Reopened ${i.reopenCount || 1}×. The original resolution didn’t hold.`;
  return '';
}
