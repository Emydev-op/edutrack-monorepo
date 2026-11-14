import type { IssuePriority, IssueStatus, SupportAgent, SupportTeam } from '@/types';

/** Where a ticket can be escalated. It goes to the least-busy person in that team. */
export const ESCALATION_TARGETS: {
  team: SupportTeam;
  label: string;
  description: string;
}[] = [
  {
    team: 'Technical',
    label: 'Tier 2 · Technical',
    description: 'Data fixes, integrations, anything Tier 1 can’t resolve',
  },
  {
    team: 'Engineering',
    label: 'Engineering',
    description: 'Confirmed bug that needs a code change',
  },
  {
    team: 'Billing',
    label: 'Billing specialist',
    description: 'Refunds, invoice disputes, plan changes',
  },
  {
    team: 'Tier 1 Support',
    label: 'Support lead',
    description: 'Unhappy school or SLA at risk',
  },
];

/** Who an escalation to `team` would go to (the API picks the same person), or null for the queue. */
export const escalationOwner = (
  team: SupportTeam,
  agents: SupportAgent[],
  current: string | null,
): SupportAgent | null =>
  agents
    .filter((a) => a.team === team && a.id !== current)
    .sort((a, b) => a.open - b.open || a.name.localeCompare(b.name))[0] ?? null;

/** SLA targets in working hours: [first reply, resolution]. */
export const SLA_TARGETS: Record<IssuePriority, [firstReply: number, resolution: number]> = {
  Urgent: [1, 8],
  High: [4, 24],
  Normal: [8, 72],
  Low: [24, 120],
};

export const hoursText = (h: number) =>
  h >= 24 ? `${h / 24} day${h > 24 ? 's' : ''}` : `${h} hour${h === 1 ? '' : 's'}`;

/** Statuses that pause the resolution clock. */
export const PAUSED_STATUSES: IssueStatus[] = ['Waiting for School', 'On Hold'];
export const DONE_STATUSES: IssueStatus[] = ['Resolved', 'Closed'];
export const isDone = (s: IssueStatus) => DONE_STATUSES.includes(s);

type Choice = [label: string, description: string];
export const RESOLUTION_TYPES: Choice[] = [
  ['Fixed', 'We changed something and it works now'],
  ['Guidance given', 'How-to or configuration answer'],
  ['Workaround', 'Known issue · temporary workaround shared'],
  ['Expected behaviour', 'Working as designed'],
  ['Duplicate', 'Same as another ticket'],
];
export const HOLD_REASONS: Choice[] = [
  ['Payment provider', 'Waiting on Paystack / Flutterwave'],
  ['SMS or WhatsApp provider', 'Waiting on the messaging gateway'],
  ['Scheduled fix', 'Fix ships in an upcoming release'],
  ['Internal team', 'Waiting on another Edutrack team'],
];
export const CLOSE_REASONS: Choice[] = [
  ['Duplicate', 'Already tracked in another ticket'],
  ['Raised in error', 'The school didn’t mean to submit it'],
  ['Spam', 'Not a real request'],
];
