/**
 * Types for the assignments area (assignments, submissions, grading). Owned by the Assignments
 * builder. Re-exported from `@/types`.
 */
import type { PageMeta } from './common';
import type { TimelineEntry } from '@edutrack/app-kit/types';

export type AssignmentStatus = 'Draft' | 'Published' | 'Closed';
export const ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = ['Draft', 'Published', 'Closed'];

/** One meaning per word, everywhere (spec §5.6). */
export type SubmissionStatus =
  'Not submitted' | 'Submitted' | 'Late' | 'Graded' | 'Returned' | 'Excused';
export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'Not submitted',
  'Submitted',
  'Late',
  'Graded',
  'Returned',
  'Excused',
];

/** Limits for assignment attachments (and material files). */
export const ATTACHMENT_LIMITS = {
  count: 5,
  bytes: 25 * 1024 * 1024,
  /** Lower-case extensions. */
  extensions: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp'],
  label: 'PDF, Word, PowerPoint or images',
} as const;

export const ASSIGNMENT_LIMITS = { title: 120, instructions: 4000, maxScore: 100 } as const;

/** A file attached to an assignment or a submission (the mock keeps name, type and size only). */
export interface FileRef {
  name: string;
  type: string;
  bytes: number;
  /** Set when the attachment is one of the teacher's materials. */
  materialId?: string;
  /** Read-only, from the API: the linked material was archived, so students can't open it. */
  unavailable?: boolean;
}

export interface AssignmentRow {
  id: string;
  termId: string;
  armId: string;
  armName: string;
  subject: string;
  subjectName: string;
  /** "JSS 2B · Mathematics" */
  classLabel: string;
  branchName: string;
  title: string;
  status: AssignmentStatus;
  /** Local "YYYY-MM-DDTHH:mm", null on drafts without a date yet. */
  dueAt: string | null;
  maxScore: number | null;
  allowLate: boolean;
  /** Students in the class for this subject. */
  students: number;
  /** Handed in: Submitted, Late, Graded or Returned. */
  submitted: number;
  /** Waiting to be graded: Submitted + Late. */
  toGrade: number;
  /** Due in the next 3 days and still open. */
  dueSoon: boolean;
  /** Past the due date. */
  pastDue: boolean;
}

export type SubmissionCounts = Record<SubmissionStatus, number>;

export interface AssignmentPermissions {
  edit: boolean;
  publish: boolean;
  close: boolean;
  reopen: boolean;
  delete: boolean;
  grade: boolean;
  /** Why changes are off (past term, …), when they are. */
  lockReason: string | null;
}

export interface AssignmentDetail extends AssignmentRow {
  instructions: string;
  attachments: FileRef[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  closedAt: string | null;
  counts: SubmissionCounts;
  /** Highest score already given (for the "can't reduce max" rule), null when none. */
  highestScore: { score: number; studentName: string } | null;
  permissions: AssignmentPermissions;
  history: TimelineEntry[];
}

export interface AssignmentListQuery {
  term?: string;
  class?: string;
  subject?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AssignmentList {
  data: AssignmentRow[];
  meta: PageMeta;
  counts: Record<AssignmentStatus, number> & { toGrade: number };
}

/** Create / edit. `publish: true` publishes (or keeps it published); false saves a draft. */
export interface AssignmentPayload {
  armId: string;
  subject: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  maxScore: number | null;
  allowLate: boolean;
  attachments: FileRef[];
  publish: boolean;
}

export interface SubmissionRow {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  status: SubmissionStatus;
  /** Local "YYYY-MM-DDTHH:mm" */
  submittedAt: string | null;
  /** Handed in after the due date. */
  late: boolean;
  score: number | null;
  files: number;
  gradedAt: string | null;
  returnedAt: string | null;
}

export interface SubmissionList {
  rows: SubmissionRow[];
  meta: PageMeta;
  counts: SubmissionCounts & { All: number };
  assignment: AssignmentRow & { permissions: AssignmentPermissions };
}

export interface SubmissionDetail extends SubmissionRow {
  files: number;
  fileList: FileRef[];
  note: string | null;
  feedback: string;
  excuseReason: string | null;
  history: TimelineEntry[];
  prevId: string | null;
  nextId: string | null;
  /** 1-based position in the class list, and the class size. */
  position: number;
  of: number;
  assignment: AssignmentRow & { permissions: AssignmentPermissions };
}

export interface GradePayload {
  score: number | null;
  feedback: string;
}

export interface BulkReturnResult {
  returned: number;
  skipped: { id: string; studentName: string; reason: string }[];
}

/** One assignment from a student's point of view, for the student page. */
export interface StudentAssignmentRow {
  assignmentId: string;
  submissionId: string | null;
  title: string;
  classLabel: string;
  dueAt: string | null;
  maxScore: number | null;
  assignmentStatus: AssignmentStatus;
  status: SubmissionStatus;
  score: number | null;
}
