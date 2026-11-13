/**
 * Weekly lesson notes: one per teacher × subject × class level × week of the term, reviewed by
 * the department's HOD (or the Academic Head when there is none).
 */
import type { TimelineEntry } from '@edutrack/app-kit/types';

export type LessonNoteStatus = 'Draft' | 'Submitted' | 'Approved' | 'Returned';
/** A week's slot with no note yet. */
export type LessonNoteSlotStatus = LessonNoteStatus | 'Not written';

export const LESSON_NOTE_LIMITS = {
  topic: { min: 3, max: 120 },
  objectives: { min: 1, max: 5, each: 200 },
  content: { min: 50, max: 5000 },
  schemeTopic: 120,
  /** 10 MB */
  attachmentBytes: 10 * 1024 * 1024,
} as const;

export interface TermWeek {
  week: number;
  /** Monday "YYYY-MM-DD" */
  start: string;
  /** Friday "YYYY-MM-DD" */
  end: string;
  /** "Week 13 · 7–11 Dec" */
  label: string;
  /** The Friday before the week. */
  due: string;
  /** Part of the week is the mid-term break. */
  midterm: boolean;
  /** "Mid-term break · Thu 29 – Fri 30 Oct", public holidays, closures. */
  note: string | null;
}

/** A subject and class level I teach, e.g. Mathematics · JSS 2. */
export interface LessonNoteSlot {
  key: string;
  subject: string;
  subjectName: string;
  level: string;
  label: string;
  reviewer: string;
  /** The Academic Head's own notes: filed as Approved on submit, no review. */
  noReview: boolean;
}

export interface NoteAttachment {
  name: string;
  type: string;
  bytes: number;
}

export interface LessonNoteSummary {
  id: string;
  subject: string;
  subjectName: string;
  level: string;
  week: number;
  weekLabel: string;
  topic: string;
  status: LessonNoteStatus;
  due: string;
  /** Not submitted (Draft or not written) after its due date. */
  overdue: boolean;
  teacher: string;
  reviewer: string;
  /** The Academic Head's own note: filed as Approved on submit, no review. */
  noReview: boolean;
  submittedAt: string | null;
  decidedAt: string | null;
  returnComment: string;
}

/** One expected note in the list: a slot × week, written or not. */
export interface LessonNoteRow {
  key: string;
  week: number;
  weekLabel: string;
  midterm: boolean;
  due: string;
  subject: string;
  subjectName: string;
  level: string;
  label: string;
  status: LessonNoteSlotStatus;
  overdue: boolean;
  /** Due this school week (the Friday ahead) and not yet submitted. */
  dueThisWeek: boolean;
  noteId: string | null;
  topic: string | null;
  returnComment: string;
}

/** `GET /v1/lesson-notes?term=` */
export interface LessonNotesList {
  termId: string;
  editable: boolean;
  lockReason: string | null;
  today: string;
  /** The week the demo clock is in (0 before the term, last week after it). */
  currentWeek: number;
  weeks: TermWeek[];
  slots: LessonNoteSlot[];
  /** Newest week first, up to next week. */
  rows: LessonNoteRow[];
  counts: {
    overdue: number;
    dueThisWeek: number;
    returned: number;
    waiting: number;
    approved: number;
  };
}

export interface LessonNote extends LessonNoteSummary {
  termId: string;
  weekStart: string;
  weekEnd: string;
  midterm: boolean;
  objectives: string[];
  content: string;
  attachment: NoteAttachment | null;
  schemeTopic: string;
  createdAt: string;
  updatedAt: string;
  /** Draft or Returned in the active term. */
  editable: boolean;
  /** Why it can't be changed (with the reviewer, approved, past term), or null. */
  lockReason: string | null;
  history: TimelineEntry[];
}

export interface LessonNotePayload {
  topic: string;
  objectives: string[];
  content: string;
  attachment: NoteAttachment | null;
  schemeTopic: string;
  /** Save and send to the reviewer. */
  submit: boolean;
}

export interface NewLessonNotePayload extends LessonNotePayload {
  subject: string;
  level: string;
  week: number;
}
