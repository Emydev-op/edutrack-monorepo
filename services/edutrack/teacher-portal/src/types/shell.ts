import type { RouteLocationRaw } from 'vue-router';

export type TermStatus = 'Closed' | 'Active' | 'Upcoming';

export interface TermSummary {
  id: string;
  sessionName: string;
  /** "First Term" */
  name: string;
  /** "2026/2027 · First Term" */
  label: string;
  status: TermStatus;
  start: string;
  end: string;
  /** Local "YYYY-MM-DDTHH:mm", or null when not set. */
  resultEntryCloses: string | null;
  resultsPublication: string | null;
  /** Why the term is read-only, or null for the active term. */
  lockReason: string | null;
}

export interface CalendarEvent {
  id: string;
  kind: 'term' | 'holiday' | 'break' | 'closure' | 'exams' | 'deadline' | 'publication';
  title: string;
  from: string;
  to: string;
}

/** `GET /v1/context`: the terms and the clock. "Today" in the UI always comes from here. */
export interface ShellContext {
  terms: TermSummary[];
  activeTermId: string | null;
  /** "YYYY-MM-DD" */
  today: string;
  /** Local "YYYY-MM-DDTHH:mm" */
  now: string;
  /** Today is a school day (not a weekend, holiday, break or closure). */
  isSchoolDay: boolean;
  /** Why there are no classes today, when there aren't. */
  closedReason: string | null;
  /** The active term's result entry deadline. */
  entryDeadline: string | null;
  calendar: CalendarEvent[];
  school: { name: string; academicOffice: string };
}

export interface BranchSummary {
  id: string;
  name: string;
  short: string;
}

export type StaffRole = 'Teacher' | 'HOD' | 'Academic Head';

/** `GET /v1/me`: the teacher and what their roles unlock (for the active term). */
export interface Me {
  teacher: {
    id: string;
    title: string;
    firstName: string;
    lastName: string;
    name: string;
    email: string;
    staffNo: string;
    position: string;
    department: { id: string; name: string } | null;
  };
  roles: StaffRole[];
  isClassTeacher: boolean;
  classArm: { id: string; name: string; branchId: string; branchName: string } | null;
  /** HOD: reviews result sheets and lesson notes of `hodOf`. */
  isHod: boolean;
  hodOf: { id: string; name: string } | null;
  /** Academic Head: reviews lesson notes for departments with no HOD. */
  isAcademicHead: boolean;
  reviews: { resultSheets: boolean; lessonNotes: boolean };
  /** Any review responsibility: the Reviews section shows. */
  isReviewer: boolean;
  /** Campuses the teacher works on. */
  branches: BranchSummary[];
  /** Has classes in the active term. */
  hasAssignments: boolean;
  /** False until the teacher adds a phone number (first sign-in). */
  profileComplete: boolean;
}

/** One of my teaching assignments (class arm × subject) for a term. */
export interface AssignmentSummary {
  id: string;
  termId: string;
  armId: string;
  armName: string;
  subject: string;
  subjectName: string;
  branchId: string;
  branchName: string;
  periodsPerWeek: number;
  students: number;
  type: 'Full-time' | 'Part-time';
}

/** `GET /v1/my-scope?term=`: what the teacher is assigned to in a term. */
export interface MyScope {
  termId: string;
  assignments: AssignmentSummary[];
  classArm: { id: string; name: string; branchName: string; students: number } | null;
  /** True when the teacher works on more than one campus this term (show campus names). */
  multiCampus: boolean;
}

/** Counts shown beside sidebar items, keyed by route name. */
export type NavCounts = Partial<Record<string, number>>;

export type NotificationCategory =
  | 'results'
  | 'reviews'
  | 'assignments'
  | 'assessments'
  | 'lesson-notes'
  | 'register'
  | 'materials'
  | 'timetable'
  | 'announcements'
  | 'account';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  to: RouteLocationRaw;
  /** Local "YYYY-MM-DDTHH:mm" */
  createdAt: string;
  /** "25m ago", "Yesterday 16:10" on the API's clock. */
  when: string;
  read: boolean;
}

export interface NotificationList {
  rows: NotificationItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  unread: number;
  total: number;
}

export interface EmailPreference {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface SearchResult {
  id: string;
  type: 'Student' | 'Class' | 'Subject' | 'Page';
  title: string;
  meta: string;
  to: RouteLocationRaw;
}
