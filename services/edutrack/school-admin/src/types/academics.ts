import type { RouteLocationRaw } from 'vue-router';

import type { TimelineEntry } from './common';
import type { SessionStatus } from './shell';

/* ---------------- Sections ---------------- */

/** A section the school runs, e.g. Junior Secondary (JSS). Order is the promotion path. */
export interface AcademicSection {
  id: string;
  name: string;
  /** 2–5 capitals, shown on class codes and reports. */
  code: string;
  description: string;
  /** Class levels across branches; a section with classes can't be removed. */
  levels: number;
  /** Active branches that run it. */
  branches: string[];
}

export interface SectionsView {
  sections: AcademicSection[];
  confirmed: boolean;
}

export interface SectionInput {
  id?: string;
  name: string;
  code: string;
  description: string;
}

/* ---------------- Sessions, terms and calendar ---------------- */

export type TermStatus = 'Upcoming' | 'Active' | 'Ended' | 'Closed';
export type TermEventType =
  'resumption' | 'midterm' | 'ca' | 'exams' | 'pta' | 'results' | 'custom';
export type SessionStructure = '3 terms' | '2 semesters' | 'Custom';

export interface TermEvent {
  id: string;
  type: TermEventType;
  name: string;
  start: string;
  end: string;
}

export interface Term {
  id: string;
  name: string;
  start: string;
  end: string;
  status: TermStatus;
  events: TermEvent[];
}

export interface AcademicSession {
  id: string;
  name: string;
  start: string;
  end: string;
  status: SessionStatus;
  structure: SessionStructure;
  terms: Term[];
  students: number;
  /** Where the configuration came from, e.g. "Copied from 2026/2027". */
  note: string;
  closedOn: string | null;
}

export type ChecklistStatus =
  'Complete' | 'Blocking' | 'Pending' | 'In progress' | 'Review needed' | 'Optional';

export interface ChecklistItem {
  label: string;
  detail: string;
  status: ChecklistStatus;
  to: RouteLocationRaw | null;
}

export interface Checklist {
  title: string;
  items: ChecklistItem[];
  canClose: boolean;
  /** Why closing is blocked, or empty. */
  reason: string;
}

export const COPY_AREAS = [
  'sections',
  'classes',
  'arms',
  'subjects',
  'curriculum',
  'grading',
  'assessment',
  'assignments',
  'timetable',
  'calendar',
] as const;
export type CopyArea = (typeof COPY_AREAS)[number];

export interface SessionsView {
  sessions: AcademicSession[];
  /** The Active session, or the newest Upcoming one for a new school. */
  currentId: string | null;
  /** Closing checklist for the active term of the current session. */
  termChecklist: (Checklist & { termId: string }) | null;
  /** What a new session can copy, with a count for each area ("17 levels"). */
  copyAreas: { id: CopyArea; label: string; detail: string }[];
  confirmed: { session: boolean; terms: boolean };
}

export interface NewSessionPayload {
  name: string;
  start: string;
  end: string;
  structure: SessionStructure;
  termNames: string[];
  copy: CopyArea[];
}

export interface TermInput {
  id?: string;
  name: string;
  start: string;
  end: string;
  events: TermEvent[];
}

export interface PublicHoliday {
  date: string;
  name: string;
}

export type AcadEventType = 'Term' | 'Break' | 'Exam' | 'Holiday' | 'Meeting' | 'Event';

export interface CalendarEvent {
  id: string;
  title: string;
  type: AcadEventType;
  start: string;
  end: string;
  /** Who it is for: "Everyone", "Staff", "Parents", or a section. */
  audience: string;
  /** Term events and holidays are edited from Sessions & Terms; custom events here. */
  source: 'term' | 'holiday' | 'custom';
  notes: string;
}

export interface CalendarView {
  session: string;
  events: CalendarEvent[];
  holidays: PublicHoliday[];
  /** Date range the calendar can show (the session's dates). */
  start: string;
  end: string;
}

export interface CalendarEventInput {
  title: string;
  type: AcadEventType;
  start: string;
  end: string;
  audience: string;
  notes: string;
}

/* ---------------- Classes & arms ---------------- */

export interface ClassArm {
  id: string;
  levelId: string;
  branchId: string;
  branch: string;
  section: string;
  level: string;
  arm: string;
  /** "JSS 2B" */
  name: string;
  capacity: number;
  students: number;
  classTeacherId: string | null;
  classTeacher: string | null;
  room: string;
}

export interface ClassLevel {
  id: string;
  branchId: string;
  section: string;
  name: string;
  /** Promotes to; null for the final class (students graduate). */
  next: string | null;
  arms: ClassArm[];
}

export interface ClassesView {
  branches: { id: string; name: string; sections: string[] }[];
  sections: AcademicSection[];
  levels: ClassLevel[];
  confirmed: boolean;
  /** Standard levels per section code, offered as defaults. */
  defaults: Record<string, string[]>;
}

export interface LevelInput {
  branchId: string;
  section: string;
  name: string;
  arms: string[];
  capacity: number;
  /** Insert after this level in the section; null = at the start. */
  after?: string | null;
}

export interface ArmInput {
  arm?: string;
  capacity: number;
  classTeacherId: string | null;
  room: string;
}

export interface ClassDetail {
  arm: ClassArm;
  students: {
    id: string;
    name: string;
    admissionNo: string;
    gender: string;
    guardian: string;
    balance: number;
  }[];
  subjects: {
    code: string;
    name: string;
    type: 'Compulsory' | 'Elective';
    teacherId: string | null;
    teacher: string | null;
    periods: number;
  }[];
  timetable: TimetableView | null;
  results: {
    code: string;
    subject: string;
    teacher: string | null;
    average: number | null;
    status: SheetStatus;
  }[];
}

/* ---------------- Subjects & curriculum ---------------- */

export type SubjectCategory =
  | 'Core'
  | 'Science'
  | 'Arts'
  | 'Commercial'
  | 'Technical'
  | 'Language'
  | 'Religious'
  | 'Early years';

export interface Subject {
  code: string;
  name: string;
  category: SubjectCategory;
  status: 'Active' | 'Inactive';
  /** Default lessons per week; timetables place this many. */
  periods: number;
  /** Class levels that offer it. */
  levels: string[];
  teachers: string[];
  /** Scored this session; can't be deleted. */
  hasScores: boolean;
}

export type Offering = 'C' | 'E';

export interface ElectiveGroup {
  id: string;
  name: string;
  section: string;
  subjects: string[];
  min: number;
  max: number;
  /** e.g. "Requires Academic Head approval". */
  note: string;
}

export interface CurriculumView {
  subjects: Subject[];
  /** section → level → subject code → Compulsory/Elective. */
  curriculum: Record<string, Record<string, Record<string, Offering>>>;
  groups: ElectiveGroup[];
  /** Levels per section, in promotion order. */
  levels: { section: string; levels: string[] }[];
  confirmed: boolean;
}

export interface SubjectInput {
  code: string;
  name: string;
  category: SubjectCategory;
  status: 'Active' | 'Inactive';
  periods: number;
}

/* ---------------- Teachers & assignments ---------------- */

export interface Teacher {
  id: string;
  name: string;
  branches: string[];
  /** Subject codes on their staff record. */
  qualified: string[];
  employment: 'Full-time' | 'Part-time';
  maxPeriods: number;
  periods: number;
  classTeacherOf: string[];
}

export type AssignmentType = 'Subject teacher' | 'Temporary' | 'Part-time';

export interface Assignment {
  id: string;
  teacherId: string;
  teacher: string;
  subject: string;
  subjectName: string;
  armId: string;
  arm: string;
  branch: string;
  type: AssignmentType;
  periods: number;
}

export interface AssignmentGap {
  subject: string;
  subjectName: string;
  arms: { id: string; name: string }[];
}

export interface AssignmentsView {
  term: string;
  assignments: Assignment[];
  teachers: Teacher[];
  gaps: AssignmentGap[];
  armsWithoutClassTeacher: { id: string; name: string }[];
  /** Arm options with the subjects each offers. */
  arms: { id: string; name: string; branch: string; branchId: string; subjects: string[] }[];
  subjects: { code: string; name: string }[];
  confirmed: boolean;
  canCopyPrevious: boolean;
}

export interface AssignmentInput {
  teacherId: string;
  subject: string;
  armId: string;
  type: AssignmentType;
}

export interface AssignmentWarning {
  tone: 'warning' | 'error';
  kind: 'workload' | 'qualification' | 'conflict' | 'branch' | 'duplicate';
  text: string;
}

/* ---------------- Timetable ---------------- */

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export type Day = (typeof DAYS)[number];

export interface Period {
  id: string;
  label: string;
  start: string;
  end: string;
  /** Break and lunch can't hold lessons. */
  isBreak: boolean;
}

export type TimetableStatus = 'Draft' | 'Reviewed' | 'Published';

export interface TimetableView {
  armId: string;
  arm: string;
  term: string;
  termId: string;
  status: TimetableStatus;
  version: number;
  periods: Period[];
  /** "Monday-3" → subject code. */
  grid: Record<string, string>;
  /** Lessons each subject needs per week, and who teaches it. */
  palette: {
    code: string;
    name: string;
    teacherId: string | null;
    teacher: string | null;
    need: number;
  }[];
  /** teacherId → slot → what keeps them busy ("JSS 1A · Mathematics"). */
  busy: Record<string, Record<string, string>>;
  maxConsecutive: number;
  history: TimelineEntry[];
  publishedVersion: number | null;
}

export interface TimetableArmOption {
  id: string;
  name: string;
  branch: string;
  status: TimetableStatus | 'Not started';
}

/* ---------------- Assessment & grading ---------------- */

export interface AssessmentComponent {
  name: string;
  max: number;
  weight: number;
  /** When it usually happens, e.g. "Week 5". */
  when: string;
}

export interface GradeBand {
  grade: string;
  min: number;
  max: number;
  remark: string;
  points: number;
  pass: boolean;
}

export interface AssessmentScheme {
  mode: 'scores' | 'descriptive';
  components: AssessmentComponent[];
  scale: GradeBand[];
  /** Highest first, for descriptive (e.g. Nursery) reports. */
  ratings: { name: string; description: string }[];
}

export interface AssessmentConfig {
  /** One scheme for every section, under the key "*". */
  same: boolean;
  schemes: Record<string, AssessmentScheme | null>;
  showPosition: boolean;
  rounding: 'Whole number' | '1 decimal place';
  passMark: number;
}

export interface AssessmentView extends AssessmentConfig {
  sections: { name: string; code: string }[];
  confirmed: boolean;
  /** Sections that still need a scheme. */
  missing: string[];
  hasPublished: boolean;
}

/* ---------------- Results ---------------- */

export type SheetStatus =
  'Not started' | 'Draft' | 'Submitted' | 'Under review' | 'Returned' | 'Approved' | 'Published';

export interface ResultsMatrix {
  term: string;
  section: string;
  sections: string[];
  subjects: { code: string; name: string }[];
  rows: {
    armId: string;
    arm: string;
    cells: Record<string, SheetStatus | null>;
    /** Every offered subject approved: the class can be published. */
    ready: boolean;
    published: boolean;
  }[];
  counts: Record<SheetStatus, number>;
  /** The section has no assessment scheme yet, so nothing can be scored. */
  schemeMissing: boolean;
  /** The section uses descriptive ratings (e.g. Nursery), reported separately. */
  descriptive: boolean;
}

export type ScoreValue = number | 'ABS' | 'EXM' | null;

export interface SheetRow {
  studentId: string;
  name: string;
  admissionNo: string;
  scores: ScoreValue[];
  total: number | null;
  grade: string | null;
  remark: string;
  flag: string;
}

export interface ResultSheet {
  armId: string;
  arm: string;
  subject: string;
  subjectName: string;
  teacher: string | null;
  term: string;
  status: SheetStatus;
  submittedAt: string | null;
  components: AssessmentComponent[];
  rows: SheetRow[];
  stats: {
    average: number | null;
    highest: number | null;
    lowest: number | null;
    passed: number;
    count: number;
    absent: number;
    exempt: number;
    missing: number;
  };
  returnNote: string;
  history: TimelineEntry[];
  passMark: number;
}

export interface PublishCheck {
  armId: string;
  arm: string;
  students: number;
  subjects: number;
  notApproved: string[];
  flags: string[];
}

export interface ReportCard {
  school: { name: string; motto: string; address: string; logoUrl: string | null };
  title: string;
  student: { id: string; name: string; admissionNo: string; gender: string; className: string };
  classTeacher: string | null;
  subjects: {
    name: string;
    scores: (string | number)[];
    total: string;
    grade: string;
    remark: string;
  }[];
  components: string[];
  average: string;
  grade: string;
  position: string | null;
  published: boolean;
  version: number;
  nextTerm: string;
  classmates: { id: string; name: string }[];
}

export type CorrectionStatus = 'Under review' | 'Applied' | 'Rejected';

export interface Correction {
  id: string;
  studentId: string;
  student: string;
  armId: string;
  arm: string;
  subject: string;
  subjectName: string;
  component: string;
  original: number;
  proposed: number;
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

/* ---------------- Promotion ---------------- */

export type PromotionDecision = 'Promote' | 'Repeat' | 'Graduate' | 'Transfer' | 'Withdraw';

export interface PromotionStudent {
  id: string;
  name: string;
  average: number;
  maths: number;
  english: number;
  eligible: boolean;
  note: string;
  suggestion: PromotionDecision;
  decision: PromotionDecision | null;
  reason: string;
  balance: number;
  /** Where the decision puts them next session. */
  next: string;
}

export interface PromotionView {
  from: string;
  to: string;
  rule: string;
  classes: {
    id: string;
    name: string;
    pending: number;
    total: number;
    status: 'Pending' | 'Complete' | 'Graduated';
  }[];
  classId: string;
  className: string;
  /** Where promoted students go; null for a final class (they graduate). */
  nextLevel: string | null;
  arm: string;
  students: PromotionStudent[];
  applied: boolean;
  /** No session to promote from (a new school). */
  empty: boolean;
}

export interface PromotionDecisionInput {
  studentId: string;
  decision: PromotionDecision | null;
  reason: string;
}
