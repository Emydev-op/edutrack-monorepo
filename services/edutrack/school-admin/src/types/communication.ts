import type { PaginationMeta } from '@edutrack/shared';
import type { RouteLocationRaw } from 'vue-router';

import type { TimelineEntry } from './common';

/* ---------------- Shared ---------------- */

export type Channel = 'In-app' | 'Email' | 'SMS';
export const CHANNELS: Channel[] = ['In-app', 'Email', 'SMS'];

export type DeliveryStatus = 'Queued' | 'Sent' | 'Delivered' | 'Read' | 'Failed';

/** Automatic messages the system sends, plus announcements written by staff. */
export type CommsEvent =
  | 'admission'
  | 'parent.invitation'
  | 'staff.invitation'
  | 'invoice.issued'
  | 'fee.reminder'
  | 'fee.overdue'
  | 'installment.due'
  | 'payment.details'
  | 'payment.confirmed'
  | 'payment.rejected'
  | 'refund.paid'
  | 'assignment.published'
  | 'result.published'
  | 'student.exit'
  | 'graduation'
  | 'timetable.published'
  | 'announcement';

export type RecipientRole = 'Parent' | 'Student' | 'Teacher' | 'Staff';

export interface CommsOptions {
  branches: { id: string; name: string }[];
  /** Class arms with active students, e.g. "JSS 2B". */
  classes: { label: string; level: string; branchId: string; students: number }[];
  events: { key: CommsEvent; label: string }[];
  smsUnitPrice: number;
}

/* ---------------- Announcements ---------------- */

export type AnnouncementStatus = 'Draft' | 'Scheduled' | 'Sent' | 'Withdrawn' | 'Expired';
export type AudienceKind = 'everyone' | 'parents' | 'students' | 'teachers' | 'staff' | 'classes';

export interface Audience {
  kind: AudienceKind;
  /** Class arm labels when kind is "classes". */
  classes: string[];
  /** null = all branches. */
  branchId: string | null;
}

export interface AnnouncementPayload {
  title: string;
  body: string;
  /** Short version for SMS; required when SMS is chosen. */
  smsText: string;
  audience: Audience;
  channels: Channel[];
  /** Local date-time "YYYY-MM-DDTHH:mm" when scheduling. */
  scheduledFor: string | null;
  /** Last day it shows in the portals ("YYYY-MM-DD"), optional. */
  expiresOn: string | null;
  action: 'draft' | 'send' | 'schedule';
}

export interface AudiencePreview {
  label: string;
  recipients: number;
  byRole: { role: RecipientRole; count: number }[];
  /** Recipients each channel can reach. */
  reach: Record<Channel, number>;
  /** Why some recipients can't get a channel. */
  gaps: string[];
  smsPages: number;
  smsUnits: number;
  smsCost: number;
  credit: number;
  enough: boolean;
  sender: string;
  senderNote: string;
  quietHoursNote: string;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  snippet: string;
  audience: string;
  channels: Channel[];
  by: string;
  /** Sent, scheduled or last-edited time, "YYYY-MM-DDTHH:mm". */
  date: string;
  dateLabel: string;
  status: AnnouncementStatus;
  recipients: number | null;
}

export interface AnnouncementList {
  rows: AnnouncementRow[];
  meta: PaginationMeta;
  counts: Record<AnnouncementStatus | 'All', number>;
  sentThisTerm: number;
  smsCredit: number;
}

export interface AnnouncementQuery {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ChannelStats {
  channel: Channel;
  recipients: number;
  delivered: number;
  read: number;
  queued: number;
  sent: number;
  failed: number;
}

export interface AnnouncementDetail extends AnnouncementPayload {
  id: string;
  status: AnnouncementStatus;
  audienceLabel: string;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  withdrawnAt: string | null;
  withdrawReason: string;
  recipients: number | null;
  smsUnits: number;
  messageId: string | null;
  stats: ChannelStats[];
  history: TimelineEntry[];
  canEdit: boolean;
  canWithdraw: boolean;
  canCancel: boolean;
  canDelete: boolean;
}

/* ---------------- Delivery logs ---------------- */

export interface DeliveryRow {
  /** "<messageId>~<channel>". */
  id: string;
  messageId: string;
  title: string;
  event: CommsEvent;
  eventLabel: string;
  recipient: string;
  recipients: number;
  channel: Channel;
  status: DeliveryStatus;
  /** Recipients this channel failed for. */
  failed: number;
  /** e.g. "12 of 742 failed" or the single recipient's reason. */
  detail: string;
  at: string;
  atLabel: string;
}

export interface DeliveryList {
  rows: DeliveryRow[];
  meta: PaginationMeta;
  summary: {
    today: number;
    deliveredRate: number | null;
    failed: number;
    retryable: number;
    queued: number;
  };
}

export interface DeliveryQuery {
  search?: string;
  channel?: string;
  status?: string;
  event?: string;
  page?: number;
  pageSize?: number;
}

export interface RecipientOutcome {
  channel: Channel;
  address: string;
  status: DeliveryStatus;
  detail: string;
  retryable: boolean;
  /** Where to fix a missing or wrong contact. */
  fix: RouteLocationRaw | null;
}

export interface DeliveryRecipientRow {
  key: string;
  name: string;
  role: RecipientRole;
  outcomes: RecipientOutcome[];
}

export interface DeliveryDetail {
  id: string;
  title: string;
  event: CommsEvent;
  eventLabel: string;
  by: string;
  at: string;
  atLabel: string;
  audience: string;
  sender: string;
  source: { label: string; to: RouteLocationRaw } | null;
  stats: ChannelStats[];
  smsUnits: number;
  retryable: number;
  /** Rendered content per channel, for the first recipient. */
  content: { channel: Channel; subject: string; body: string }[];
  rows: DeliveryRecipientRow[];
  meta: PaginationMeta;
}

export interface DeliveryDetailQuery {
  search?: string;
  channel?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/* ---------------- Templates & events ---------------- */

export interface ChannelTemplate {
  subject: string;
  body: string;
}

export interface TemplateRow {
  event: CommsEvent;
  label: string;
  channels: Channel[];
  variables: string[];
  customised: boolean;
}

export interface TemplateDetail {
  event: CommsEvent;
  label: string;
  description: string;
  variables: { name: string; description: string; sample: string }[];
  /** Channels this event can use at all. */
  available: Channel[];
  /** Channels switched on in Settings → Notifications. */
  enabled: Channel[];
  templates: Partial<Record<Channel, ChannelTemplate>>;
  defaults: Partial<Record<Channel, ChannelTemplate>>;
  customised: boolean;
  updatedBy: string;
  updatedAt: string | null;
}

export type TemplatePayload = Partial<Record<Channel, ChannelTemplate>>;

export interface EventSetting {
  key: CommsEvent;
  label: string;
  description: string;
  who: string;
  available: Channel[];
  channels: Channel[];
  active: boolean;
  /** Why the event or a channel can't be switched off. */
  locked: string;
  /** Who triggers it: a screen in this portal, or another portal. */
  trigger: string;
}

/* ---------------- Settings ---------------- */

export interface SenderIdState {
  name: string;
  status: 'Not requested' | 'Pending approval' | 'Approved' | 'Rejected';
  requestedAt: string | null;
  note: string;
}

export interface CommsSettings {
  events: EventSetting[];
  senderId: SenderIdState;
  /** What SMS goes out as right now. */
  sender: string;
  credit: { units: number; usedThisTerm: number; low: boolean; unitPrice: number };
  quietHours: { enabled: boolean; start: string; end: string };
  history: { id: string; at: string; atLabel: string; by: string; what: string; detail: string }[];
}

export type EventSettingsPayload = Record<string, { active: boolean; channels: Channel[] }>;

/* ---------------- Inbox ---------------- */

export interface InboxItem {
  id: string;
  title: string;
  detail: string;
  when: string;
  unread: boolean;
  to: RouteLocationRaw;
}

export interface InboxList {
  rows: InboxItem[];
  meta: PaginationMeta;
  unread: number;
  total: number;
}
