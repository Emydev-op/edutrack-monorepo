import type { PageQuery, TimelineEntry } from './common';

export const ISSUE_CATEGORIES = [
  'Account',
  'Billing',
  'Subscription',
  'Technical',
  'Academic',
  'Finance',
  'Access',
  'Other',
] as const;
export const ISSUE_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;
export const ISSUE_STATUSES = [
  'Open',
  'Assigned',
  'In Progress',
  'Waiting for School',
  'On Hold',
  'Escalated',
  'Resolved',
  'Closed',
  'Reopened',
] as const;
export const SUPPORT_TEAMS = [
  'Tier 1 Support',
  'Technical',
  'Billing',
  'Onboarding',
  'Engineering',
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type SupportTeam = (typeof SUPPORT_TEAMS)[number];
export type IssueView =
  | 'open'
  | 'unassigned'
  | 'mine'
  | 'overdue'
  | 'waiting'
  | 'escalated'
  | 'resolved'
  | 'closed'
  | 'all';

/** One SLA clock. `paused` while waiting on the school or on hold; `met` once satisfied. */
export interface SlaClock {
  state: 'ok' | 'soon' | 'over' | 'met' | 'paused';
  label: string;
}

export interface SupportIssue {
  id: string;
  schoolId: string;
  schoolName: string;
  subject: string;
  category: IssueCategory;
  priority: IssuePriority;
  status: IssueStatus;
  assignee: string | null;
  team: SupportTeam;
  requester: string;
  createdAt: string;
  updatedAt: string;
  resolution: string | null;
  resolutionType: string | null;
  sla: {
    firstReply: SlaClock;
    resolution: SlaClock;
    /** Working hours: [first reply, resolution]. */
    targets: [number, number];
  };
  /** The specialist role it was escalated to, and who had it before. */
  escalatedTo: string | null;
  escalatedFrom: string | null;
  holdReason: string | null;
  reopenCount: number;
  rating: { score: number; comment: string } | null;
}

export type MessageKind = 'school' | 'agent' | 'note';

export interface IssueMessage {
  id: string;
  author: string;
  authorRole: string;
  when: string;
  text: string;
  kind: MessageKind;
}

export interface SupportIssueDetail extends SupportIssue {
  messages: IssueMessage[];
  /** `detail` says who did it and whether the school can see it. */
  events: TimelineEntry[];
}

export interface IssueQuery extends PageQuery {
  view?: IssueView;
  priority?: IssuePriority;
  category?: IssueCategory;
  schoolId?: string;
  assignee?: string;
  /** Created between these inclusive ISO dates (YYYY-MM-DD). */
  dateFrom?: string;
  dateTo?: string;
}

export interface SupportSummary {
  open: number;
  unassigned: number;
  overdue: number;
  escalated: number;
  /** Average school rating out of 5, or null before any ratings. */
  satisfaction: number | null;
  ratings: number;
  /** Ticket counts for the views that show one on their tab. */
  views: Record<'open' | 'unassigned' | 'mine' | 'overdue', number>;
  /** Open tickets each agent owns, for choosing who to assign. */
  agentLoad: Record<string, number>;
  weeklyVolume: { label: string; value: number }[];
  byCategory: { label: string; percent: number }[];
  topSchools: { label: string; value: number }[];
}

export interface CreateIssuePayload {
  schoolId: string;
  requester: string;
  subject: string;
  description: string;
  category: IssueCategory;
  priority: IssuePriority;
  assignee: string | null;
  attachment: string | null;
}

/** Assignment, priority and category changes. `reason` is required when reassigning. */
export interface UpdateIssuePayload {
  assignee?: string | null;
  priority?: IssuePriority;
  category?: IssueCategory;
  reason?: string;
}

export interface IssueTransitionPayload {
  to: IssueStatus;
  /** The message, reason or resolution summary the step asks for. */
  note?: string;
  /** The chosen resolution type, hold reason, escalation team or close reason. */
  option?: string;
}
