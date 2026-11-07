import type { PaginationMeta } from '@edutrack/shared';

/** What the school picks when raising a ticket. Each routes to a platform support team. */
export const TICKET_CATEGORIES = [
  'Results & report cards',
  'Fees & payments',
  'Communication',
  'Students & admissions',
  'Account & billing',
  'Something else',
] as const;
export const TICKET_PRIORITIES = ['Normal', 'High', 'Urgent'] as const;
/** The platform support desk's statuses, as the school sees them. */
export const TICKET_STATUSES = [
  'Open',
  'In progress',
  'Waiting for School',
  'Resolved',
  'Closed',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketTab = 'open' | 'closed' | 'all';

/** Limits shared by the form and the API. */
export const TICKET_LIMITS = {
  subject: 120,
  descriptionMin: 20,
  text: 5000,
  attachments: 3,
  attachmentBytes: 10 * 1024 * 1024,
  attachmentTypes: ['image/png', 'image/jpeg', 'application/pdf'],
  /** Days a resolved ticket waits for the school before it closes by itself. */
  autoCloseDays: 7,
} as const;

export interface TicketAttachment {
  name: string;
  type: string;
  bytes: number;
  /** Null for files that can't be previewed here (e.g. older uploads). */
  dataUrl: string | null;
}

/** One SLA clock, measured in support working hours (Mon–Fri 08:00–17:00 WAT). */
export interface TicketSla {
  state: 'ok' | 'soon' | 'over' | 'met' | 'late';
  label: string;
  /** ISO time the first reply is due. */
  due: string;
  targetHours: number;
}

export interface TicketRow {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  /** "Waiting on you" for Waiting for School, and so on. */
  statusLabel: string;
  assignee: string | null;
  team: string;
  requester: string;
  createdAt: string;
  updatedAt: string;
  sla: TicketSla;
  /** The school needs to act: reply, or confirm a resolution. */
  needsYou: boolean;
}

export interface TicketList {
  rows: TicketRow[];
  meta: PaginationMeta;
  counts: Record<TicketTab, number>;
  /** Tickets waiting on the school's reply or confirmation, newest first. */
  attention: { id: string; subject: string; status: TicketStatus }[];
}

export interface TicketQuery {
  tab?: TicketTab;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TicketMessage {
  id: string;
  author: string;
  authorRole: string;
  /** Who wrote it: the school or the platform support team. Internal notes never reach the school. */
  from: 'school' | 'support';
  at: string;
  text: string;
  attachments: TicketAttachment[];
}

export interface TicketEvent {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export interface TicketDetail extends TicketRow {
  messages: TicketMessage[];
  events: TicketEvent[];
  resolution: string | null;
  resolvedAt: string | null;
  /** When a resolved ticket closes by itself if the school doesn't respond. */
  autoCloseAt: string | null;
  closedAt: string | null;
  rating: number | null;
  followUpOf: string | null;
  followUps: string[];
  reopenCount: number;
  /** What the school can do right now. */
  can: { reply: boolean; confirm: boolean; reopen: boolean; close: boolean; followUp: boolean };
}

export interface NewTicketPayload {
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  attachments: TicketAttachment[];
  /** A closed ticket this one continues. */
  followUpOf?: string;
}

export interface TicketReplyPayload {
  text: string;
  attachments: TicketAttachment[];
}
