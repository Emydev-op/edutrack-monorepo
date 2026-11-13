/**
 * Types for the dashboard (`GET /v1/dashboard?term=`). Re-exported from `@/types`.
 *
 * Each block (metrics, today's lessons, to-do) is computed on its own and comes back as
 * `{ ok: true, data }` or `{ ok: false, error }`, so one failing block never blanks the page.
 */
import type { StatusTone } from '@edutrack/ui/lib/status';
import type { RouteLocationRaw } from 'vue-router';

import type { TermStatus } from './shell';
import type { TodayLesson } from './teaching';

export type DashboardBlock<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DashboardMetrics {
  /** Lessons on today's timetable (0 when there is no school today). */
  classesToday: number;
  /** The lesson on now, else the next one to start today, or null. */
  nextLesson: {
    armName: string;
    subjectName: string;
    start: string;
    end: string;
    /** Happening right now. */
    now: boolean;
  } | null;
  /** Why there are no lessons today (weekend, holiday, past term…), or null. */
  noLessonsReason: string | null;
  /** Submissions waiting to be graded (Submitted + Late). */
  toGrade: number;
  /** Assignments those submissions are spread across. */
  toGradeAssignments: number;
  sheets: {
    /** Sent for review or beyond (Submitted, Under review, Approved, Published). */
    submitted: number;
    total: number;
    /** Local "YYYY-MM-DDTHH:mm" result entry deadline, or null. */
    deadline: string | null;
    /** Result entry is still open for the term. */
    entryOpen: boolean;
  };
  /** Class teachers only: today's register. */
  register: {
    armName: string;
    taken: boolean;
    /** Why today's register can't be taken (weekend, read-only term…), or null. */
    closedReason: string | null;
  } | null;
  /** HODs / the Academic Head only: items waiting on me. */
  reviews: { sheets: number | null; notes: number | null } | null;
}

export interface DashboardLessons {
  lessons: TodayLesson[];
  /** Why there's no "Today" list, or null. */
  note: string | null;
  multiCampus: boolean;
  /** The term's timetable is published. */
  published: boolean;
}

export type DashboardTodoKind =
  | 'sheet-returned'
  | 'sheet-missing'
  | 'sheet-ready'
  | 'grade'
  | 'register'
  | 'note-returned'
  | 'note-overdue'
  | 'note-due'
  | 'remarks'
  | 'review-sheets'
  | 'review-notes';

/** One thing to do, built from the real state of the record it links to. */
export interface DashboardTodo {
  /** Stable per record, e.g. `sheet-missing:rs-t-2627-1-mc-jss1a-MTH`. */
  id: string;
  kind: DashboardTodoKind;
  badge: { label: string; tone: StatusTone };
  title: string;
  detail: string;
  action: string;
  to: RouteLocationRaw;
}

/** `GET /v1/dashboard?term=` */
export interface Dashboard {
  termId: string;
  termLabel: string;
  termStatus: TermStatus;
  /** Why the selected term is read-only, or null for the active term. */
  lockReason: string | null;
  /** "YYYY-MM-DD" and local "YYYY-MM-DDTHH:mm" from the API's clock. */
  today: string;
  now: string;
  /** Campuses taught on in the selected term (or the teacher's home campus). */
  campuses: string[];
  hasAssignments: boolean;
  /** The profile has a phone number. */
  profileComplete: boolean;
  metrics: DashboardBlock<DashboardMetrics>;
  lessons: DashboardBlock<DashboardLessons>;
  todo: DashboardBlock<DashboardTodo[]>;
}
