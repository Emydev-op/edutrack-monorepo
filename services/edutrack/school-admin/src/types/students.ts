import type { PageQuery, TimelineEntry } from './common';

export type StudentStatus =
  'Active' | 'Incomplete profile' | 'Transferred' | 'Withdrawn' | 'Graduated';
export type Gender = 'Female' | 'Male';

export interface StudentRow {
  id: string;
  name: string;
  admissionNo: string;
  gender: Gender;
  /** e.g. "JSS 2B"; empty when admitted but not yet placed in an arm. */
  className: string;
  branch: string;
  guardianName: string | null;
  /** Naira owed across all sessions. */
  balance: number;
  status: StudentStatus;
  /** Admitted in this session and not yet enrolled into an arm. */
  awaitingEnrollment: boolean;
  admittedToday: boolean;
}

export interface StudentQuery extends PageQuery {
  status?: string;
  className?: string;
  gender?: string;
}

export interface StudentGuardianLink {
  guardianId: string;
  name: string;
  relationship: string;
  primary: boolean;
  phone: string;
  email: string;
  paysFees: boolean;
  portal: string;
  otherChildren: string[];
}

export interface StudentInvoice {
  number: string;
  period: string;
  total: number;
  paid: number;
  pending: number;
  balance: number;
  status: string;
}

export interface StudentDetail extends StudentRow {
  firstName: string;
  surname: string;
  otherNames: string;
  dateOfBirth: string;
  age: number | null;
  stateOfOrigin: string;
  address: string;
  medicalNotes: string;
  admittedOn: string;
  admissionType: string;
  admittedInto: string;
  previousSchool: string;
  section: string;
  classTeacher: string;
  enrolledSince: string;
  termResults: string;
  assignments: string;
  enrollments: {
    session: string;
    className: string;
    branch: string;
    status: string;
    outcome: string;
  }[];
  results: { session: string; terms: [string, string][] }[];
  subjects: { name: string; type: string; teacher: string; since: string }[];
  invoices: StudentInvoice[];
  payments: TimelineEntry[];
  guardians: StudentGuardianLink[];
  documents: { name: string; required: string; uploaded: string; status: string }[];
  activity: TimelineEntry[];
  /** Set once a transfer or withdrawal is recorded. */
  exit: { kind: string; date: string; reason: string; destination: string } | null;
}

export interface TransferPayload {
  kind: 'Transfer' | 'Withdrawal';
  date: string;
  reason: string;
  destination: string;
  notes: string;
  document: string | null;
}

/* ---------------- Admissions ---------------- */

export type ApplicationStage =
  'Pending' | 'Under review' | 'Offer accepted' | 'Admitted' | 'Rejected';

export interface AdmissionApplication {
  id: string;
  applicant: string;
  note: string;
  applyingFor: string;
  type: 'New intake' | 'Transfer in';
  applied: string;
  guardian: string;
  stage: ApplicationStage;
  stageNote: string;
  /** Set once admitted. */
  studentId: string | null;
}

/** What the admission wizard needs to know about the school. */
export interface AdmissionOptions {
  session: string;
  term: string;
  branches: string[];
  /** Class level → arms with how many places are used of the capacity. */
  arms: Record<string, { arm: string; used: number; capacity: number }[]>;
  compulsorySubjects: string[];
  religiousSubjects: [code: string, name: string][];
  electives: string[];
  /** Electives with no teacher this session. */
  unstaffedElectives: string[];
  states: string[];
  feeItems: [label: string, amount: number][];
  admissionFee: number;
  siblingDiscount: number;
  requiredDocuments: { key: string; label: string; required: 'always' | 'transfer' | 'optional' }[];
}

/** Students and guardians that look related to a new applicant. */
export interface AdmissionMatches {
  duplicate: { id: string; name: string; className: string; admissionNo: string } | null;
  sibling: {
    studentId: string;
    studentName: string;
    className: string;
    guardianId: string;
    guardianName: string;
    guardianPhone: string;
    relationship: string;
  } | null;
}

export interface AdmitPayload {
  applicationId: string | null;
  surname: string;
  firstName: string;
  otherNames: string;
  gender: Gender;
  dateOfBirth: string;
  stateOfOrigin: string;
  previousSchool: string;
  guardian:
    | { mode: 'link'; guardianId: string }
    | { mode: 'new'; name: string; phone: string; email: string }
    | { mode: 'skip' };
  relationship: string;
  paysFees: boolean;
  invite: boolean;
  branch: string;
  level: string;
  arm: string;
  admissionType: 'New intake' | 'Transfer in';
  admissionDate: string;
  religious: string;
  elective: string;
  documents: Record<string, string | null>;
  billing: 'full' | 'defer';
  siblingDiscount: boolean;
}

export interface AdmitResult {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  branch: string;
  guardianName: string | null;
  invited: boolean;
  invoiceTotal: number;
}

/* ---------------- Import ---------------- */

export interface ImportIssue {
  row: number;
  student: string;
  kind: 'error' | 'warning';
  /** What the issue is about, so the UI can offer the right fix. */
  code: 'class' | 'dob' | 'duplicate' | 'no-guardian' | 'guardian-match';
  message: string;
  /** For class: the suggested class. */
  suggestion?: string;
  value?: string;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  rows: number;
  valid: number;
  issues: ImportIssue[];
  /** Guardians that would be created / linked if every row imports. */
  guardiansNew: number;
  guardiansLinked: number;
  target: string;
}

export interface ImportCommitPayload {
  /** row → chosen fix: "JSS 1C", a corrected date, "new" | "skip" | "accept" | "link". */
  resolutions: Record<string, string>;
  excludeErrors: boolean;
}

export interface ImportResult {
  batchId: string;
  imported: number;
  guardiansNew: number;
  guardiansLinked: number;
}

/* ---------------- Enrollment ---------------- */

export interface EnrollmentOptions {
  session: string;
  sections: {
    name: string;
    levels: { level: string; arms: { arm: string; used: number; capacity: number }[] }[];
  }[];
  /** Admitted students not yet placed in an arm this session. */
  awaiting: { id: string; name: string; admissionNo: string; level: string }[];
}

export interface EnrollPayload {
  level: string;
  arm: string;
  studentIds: string[];
}

/* ---------------- Guardians ---------------- */

export interface GuardianRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  children: { id: string; name: string; className: string }[];
  relationship: string;
  paysFees: boolean;
  portal: 'Active' | 'Invited' | 'No account';
  balance: number;
}

export interface GuardianDetail extends GuardianRow {
  address: string;
  occupation: string;
  portalSince: string;
  childrenDetail: {
    id: string;
    name: string;
    className: string;
    branch: string;
    balance: number;
    status: string;
    relationship: string;
    note: string;
  }[];
  paymentPlan: string;
  preferredMethod: string;
  notifications: [string, string][];
}

export interface GuardianDuplicate {
  keepId: string;
  keepLabel: string;
  mergeId: string;
  mergeLabel: string;
  reason: string;
  children: string;
}

export interface GuardianPayload {
  name: string;
  phone: string;
  email: string;
  relationship: string;
  studentIds: string[];
  paysFees: boolean;
  invite: boolean;
}
