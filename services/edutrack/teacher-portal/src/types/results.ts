/**
 * Types for the results area: score sheets and correction requests. The words and shapes match
 * School Admin's (`school-admin/src/types/academics.ts`: SheetStatus, ScoreValue, SheetRow,
 * Correction) so the two portals line up once the API exists.
 */
import type { TimelineEntry } from './common';

/**
 * Not started → Draft → Submitted (with the HOD) → Under review (with the academic office) →
 * Approved → Published, plus Returned (to the teacher, with a comment). Departments with no HOD,
 * and an HOD's own sheets, go Draft → Under review directly.
 */
export type SheetStatus =
  'Not started' | 'Draft' | 'Submitted' | 'Under review' | 'Returned' | 'Approved' | 'Published';

/** A number 0–max, ABS (absent), EXM (exempt) or null (missing — never zero). */
export type ScoreValue = number | 'ABS' | 'EXM' | null;

export interface SheetComponent {
  key: 'CA1' | 'CA2' | 'EXAM';
  name: string;
  max: number;
  /** Percent of the total. */
  weight: number;
}

export interface SheetGradeBand {
  grade: string;
  min: number;
  max: number;
  remark: string;
  points: number;
  pass: boolean;
}

export interface SheetRow {
  studentId: string;
  name: string;
  admissionNo: string;
  /** One per component, in the scheme's order. */
  scores: ScoreValue[];
  total: number | null;
  grade: string | null;
  /** The grade band's remark ("Very good"). */
  remark: string;
  /** "Absent (Examination) · make-up needed", "Exempt from CA 1", "Missing score" or "". */
  flag: string;
  /** The teacher's own remark for the student. */
  teacherRemark: string;
}

export interface SheetStats {
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passed: number;
  count: number;
  /** Students with every component entered. */
  complete: number;
  absent: number;
  exempt: number;
  /** Students with at least one blank score. */
  missing: number;
  distribution: { grade: string; remark: string; count: number }[];
}

export interface SheetCompletion {
  /** Cells entered (number, ABS or EXM). */
  scored: number;
  /** Students × components. */
  total: number;
  /** Students with a blank score. */
  missing: number;
}

/** Why a sheet can't be edited, or null when it can. */
export interface SheetLock {
  /** `TERM_LOCKED`: past/upcoming term or the entry deadline; `SHEET_LOCKED`: its status. */
  code: 'TERM_LOCKED' | 'SHEET_LOCKED';
  title: string;
  reason: string;
}

/** One row of the results list (and the class / student pages). */
export interface ResultSheetSummary {
  id: string;
  termId: string;
  armId: string;
  arm: string;
  subject: string;
  subjectName: string;
  branchName: string;
  students: number;
  status: SheetStatus;
  /** Submitted and waiting on the HOD. */
  withHod: boolean;
  /** "With Mr. Ibrahim Bello (HOD Sciences)", "With the academic office", or null. */
  withLabel: string | null;
  completion: SheetCompletion;
  average: number | null;
  /** The term's result entry deadline (local "YYYY-MM-DDTHH:mm"). */
  deadline: string | null;
  /** Local time of the last save, or null. */
  savedAt: string | null;
  submittedAt: string | null;
  editable: boolean;
  /** The reviewer's comment when the sheet is Returned. */
  returnNote: string | null;
}

export interface ResultSheet extends ResultSheetSummary {
  teacherId: string;
  teacher: string;
  section: 'JSS' | 'SSS';
  department: string | null;
  /**
   * Who a submit goes to: "Mr. Ibrahim Bello (HOD Sciences)" or "the academic office (Languages
   * has no HOD)". For a returned sheet, the reviewer who returned it.
   */
  submitTo: string;
  /** True when submitting sends it to an HOD (status becomes Submitted). */
  submitToHod: boolean;
  components: SheetComponent[];
  scale: SheetGradeBand[];
  scaleName: string;
  passMark: number;
  rows: SheetRow[];
  stats: SheetStats;
  lock: SheetLock | null;
  returned: { by: string; at: string; note: string } | null;
  /** Published sheets accept correction requests (from the teacher who owns them). */
  canRequestCorrection: boolean;
  corrections: Correction[];
  history: TimelineEntry[];
}

export interface SaveScoresPayload {
  rows: { studentId: string; scores: ScoreValue[]; remark?: string }[];
}

/* ---------- Corrections ---------- */

export type CorrectionStatus = 'Under review' | 'Applied' | 'Rejected';

/** Same shape as School Admin's Correction (plus the sheet and term it belongs to). */
export interface Correction {
  id: string;
  sheetId: string;
  termId: string;
  studentId: string;
  student: string;
  armId: string;
  arm: string;
  subject: string;
  subjectName: string;
  /** "CA 2 (max 20)" */
  component: string;
  componentKey: SheetComponent['key'];
  original: number;
  proposed: number;
  /** "64.0 · B" */
  originalTotal: string;
  proposedTotal: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  evidence: string | null;
  status: CorrectionStatus;
  decisionNote: string;
  history: TimelineEntry[];
}

export interface CorrectionPayload {
  sheetId: string;
  studentId: string;
  componentKey: SheetComponent['key'];
  proposed: number;
  reason: string;
  /** The evidence file's details (uploads are simulated in the mock). */
  evidence?: { name: string; size: number; type: string } | null;
}

/** `GET /v1/results?term=` */
export interface ResultsList {
  termId: string;
  deadline: string | null;
  /** Result entry is still open for the term. */
  entryOpen: boolean;
  sheets: ResultSheetSummary[];
  corrections: Correction[];
}
