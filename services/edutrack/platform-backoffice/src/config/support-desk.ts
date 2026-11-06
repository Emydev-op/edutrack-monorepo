import type { IssuePriority, IssueStatus, SupportTeam } from '@/types';

/** Support staff who can own tickets, with the team each one works in. */
export const SUPPORT_AGENTS: { name: string; team: SupportTeam }[] = [
  { name: 'Tolu Bamidele', team: 'Tier 1 Support' },
  { name: 'Ngozi Okafor', team: 'Tier 1 Support' },
  { name: 'Ibrahim Yusuf', team: 'Technical' },
  { name: 'Chidi Eze', team: 'Technical' },
  { name: 'Funmi Adebayo', team: 'Billing' },
  { name: 'Kemi Lawal', team: 'Onboarding' },
];
export const SUPPORT_AGENT_NAMES = SUPPORT_AGENTS.map((a) => a.name);
export const teamOfAgent = (name: string | null): SupportTeam | undefined =>
  SUPPORT_AGENTS.find((a) => a.name === name)?.team;

/** Where a ticket can be escalated, and to whom. */
export const ESCALATION_TARGETS: {
  team: SupportTeam;
  owner: string;
  label: string;
  description: string;
}[] = [
  {
    team: 'Technical',
    owner: 'Chidi Eze',
    label: 'Tier 2 · Technical',
    description: 'Data fixes, integrations, anything Tier 1 can’t resolve',
  },
  {
    team: 'Engineering',
    owner: 'Engineering on-call',
    label: 'Engineering',
    description: 'Confirmed bug that needs a code change',
  },
  {
    team: 'Billing',
    owner: 'Funmi Adebayo',
    label: 'Billing specialist',
    description: 'Refunds, invoice disputes, plan changes',
  },
  {
    team: 'Tier 1 Support',
    owner: 'Ngozi Okafor',
    label: 'Support lead',
    description: 'Unhappy school or SLA at risk',
  },
];

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
