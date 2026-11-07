import type { RouteLocationRaw } from 'vue-router';

/** Everything a school admin views or records applies to one branch, session and term. */
export interface WorkingContext {
  branch: string;
  session: string;
  term: string;
}

export type SessionStatus = 'Upcoming' | 'Active' | 'Closing' | 'Closed' | 'Archived';

export interface ContextOptions {
  branches: { name: string; status: 'Active' | 'Inactive' }[];
  sessions: { name: string; status: SessionStatus }[];
  terms: string[];
  /** Where a new sign-in starts. */
  defaults: WorkingContext;
}

/** Counts shown beside sidebar items, keyed by route name. */
export type NavCounts = Partial<Record<string, number>>;

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  when: string;
  unread: boolean;
  to: RouteLocationRaw;
  /** Local "YYYY-MM-DDTHH:mm" it arrived, for sorting and fresh "when" labels. */
  at?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  type:
    | 'Student'
    | 'Parent'
    | 'Teacher'
    | 'Class'
    | 'Subject'
    | 'Invoice'
    | 'Payment'
    | 'Vendor'
    | 'Inventory';
  meta: string;
  to: RouteLocationRaw;
}
