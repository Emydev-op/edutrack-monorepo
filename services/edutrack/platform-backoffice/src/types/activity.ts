import type { PageQuery } from './common';

export type ActivityEntity =
  | 'School'
  | 'Subscription'
  | 'User'
  | 'Issue'
  | 'Support session'
  | 'Plan'
  | 'Role'
  | 'Settings'
  | 'Invitation'
  | 'Audit';

export interface ActivityItem {
  id: string;
  when: string;
  actor: string;
  summary: string;
  schoolName: string;
  entity: ActivityEntity;
}

export interface ActivityQuery extends PageQuery {
  actor?: string;
  entity?: ActivityEntity;
  schoolName?: string;
  /** Inclusive ISO dates (YYYY-MM-DD). */
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entity: ActivityEntity;
  entityId: string;
  previousValue: string;
  newValue: string;
  ipDevice: string;
  requestId: string;
}
