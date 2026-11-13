/**
 * Types for the reviews area (HODs and the Academic Head). Result sheets and lesson notes.
 */
import type { LessonNote, LessonNoteSummary } from './lesson-notes';
import type { ResultSheet, SheetStatus } from './results';

/* ---------- Result sheets ---------- */

/** One sheet in the HOD's queue (or recently decided by them). */
export interface ReviewSheetSummary {
  id: string;
  armId: string;
  arm: string;
  subject: string;
  subjectName: string;
  branchName: string;
  teacher: string;
  students: number;
  status: SheetStatus;
  submittedAt: string | null;
  average: number | null;
  absent: number;
  exempt: number;
  /** What the HOD did and when, for sheets no longer waiting: "Forwarded 8 Dec, 09:10". */
  decision: string | null;
}

/** `GET /v1/reviews/sheets?term=` */
export interface ReviewSheetsList {
  department: string;
  waiting: ReviewSheetSummary[];
  /** Sheets this HOD forwarded or returned this term, newest first. */
  recent: ReviewSheetSummary[];
}

/** `GET /v1/reviews/sheets/:id`: the sheet read-only, and whether the HOD can act on it now. */
export interface ReviewSheet extends ResultSheet {
  canDecide: boolean;
  /** Why the HOD can't act, when they can't (already forwarded / returned). */
  decisionNote: string | null;
}

/* ---------- Lesson notes ---------- */

/** One note in the reviewer's queue (or recently decided by them). */
export interface ReviewNoteSummary extends LessonNoteSummary {
  department: string;
  /** "Approved 8 Dec, 09:10" / "Returned 7 Dec, 15:42", for notes no longer waiting. */
  decision: string | null;
}

/** `GET /v1/reviews/notes?term=` */
export interface ReviewNotesList {
  /** What this reviewer covers: "Sciences" or "Languages, Vocational, HODs’ own notes". */
  scope: string;
  waiting: ReviewNoteSummary[];
  /** Notes this reviewer approved or returned this term, newest first (latest 12). */
  recent: ReviewNoteSummary[];
}

/** `GET /v1/reviews/notes/:id`: the note read-only, and whether the reviewer can act on it now. */
export interface ReviewNote extends LessonNote {
  department: string;
  decision: string | null;
  canDecide: boolean;
  decisionNote: string | null;
}
