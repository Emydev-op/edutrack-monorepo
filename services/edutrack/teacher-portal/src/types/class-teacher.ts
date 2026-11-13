/**
 * Types for My class (class teachers): the daily register, class progress across subjects, and
 * report-card remarks and conduct ratings. Shapes line up with School Admin's attendance and
 * report card.
 */
import type { TimelineEntry } from '@edutrack/app-kit/types';

import type { SheetCompletion, SheetStatus } from './results';

/* ---------- Register ---------- */

export type AttendanceMark = 'Present' | 'Absent' | 'Late' | 'Excused';

export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

/** A student's attendance for a term. `percent` = (present + late) ÷ marked, or null. */
export interface AttendanceSummary extends AttendanceCounts {
  /** School days so far this term on which the student was in the class. */
  schoolDays: number;
  percent: number | null;
}

/** The class teacher's arm, as every My class response names it. */
export interface ClassArmRef {
  armId: string;
  arm: string;
  branchName: string;
  termId: string;
}

export interface RegisterRow {
  studentId: string;
  name: string;
  admissionNo: string;
  /** null until marked (or on a day not taken). */
  status: AttendanceMark | null;
  /** Reason for Excused, optional note for Absent. */
  reason: string;
  /** Guardian notified of this absence. */
  guardianNotified: boolean;
}

export type RegisterLockCode = 'NO_SCHOOL' | 'FUTURE' | 'OUT_OF_TERM' | 'TERM_LOCKED' | 'TOO_OLD';

/** `GET /v1/class-teacher/register?term=&date=` */
export interface RegisterDay extends ClassArmRef {
  date: string;
  today: string;
  taken: boolean;
  takenBy: string | null;
  takenAt: string | null;
  updatedAt: string | null;
  /** Why this day can't be taken or changed (weekend, holiday, future, too old, past term). */
  lock: { code: RegisterLockCode; reason: string } | null;
  rows: RegisterRow[];
  counts: AttendanceCounts & { unmarked: number };
  /** Today and the previous 5 school days: the days that can still be changed. */
  editableDays: string[];
  termStart: string;
  termEnd: string;
  history: TimelineEntry[];
}

export interface RegisterMarkInput {
  studentId: string;
  status: AttendanceMark;
  reason?: string;
}

export interface SaveRegisterResult {
  register: RegisterDay;
  /** Students whose guardians were notified of an absence by this save. */
  notified: string[];
}

export interface RegisterHistoryDay extends AttendanceCounts {
  date: string;
  taken: boolean;
  takenBy: string | null;
  takenAt: string | null;
  percent: number | null;
  /** Students on the roll that day. */
  students: number;
}

export interface RegisterHistoryStudent extends AttendanceSummary {
  studentId: string;
  name: string;
  admissionNo: string;
  marked: number;
  /** "Joined 2 Nov", "Left 16 Nov (transferred)" — empty for everyone else. */
  note: string;
}

/** `GET /v1/class-teacher/register/history?term=` */
export interface RegisterHistory extends ClassArmRef {
  term: string;
  today: string;
  schoolDays: number;
  daysTaken: number;
  notTaken: number;
  percent: number | null;
  /** School days up to today, newest first. */
  days: RegisterHistoryDay[];
  students: RegisterHistoryStudent[];
}

/* ---------- Class progress ---------- */

export interface ClassProgressSubject {
  sheetId: string;
  subject: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  status: SheetStatus;
  withHod: boolean;
  completion: SheetCompletion;
  average: number | null;
  /** The class teacher teaches this subject: the button reads "Your sheet". */
  isMine: boolean;
  canRemind: boolean;
  /** "Reminded today 08:20" once a reminder went out today. */
  remindedAt: string | null;
}

/** `GET /v1/class-teacher/progress?term=` */
export interface ClassProgress extends ClassArmRef {
  students: number;
  deadline: string | null;
  editable: boolean;
  summary: Record<SheetStatus, number>;
  subjects: ClassProgressSubject[];
}

/* ---------- Report cards ---------- */

export const CONDUCT_TRAITS = [
  'Punctuality',
  'Neatness',
  'Attentiveness',
  'Relationship with others',
  'Leadership',
] as const;
export type ConductTrait = (typeof CONDUCT_TRAITS)[number];

/** 1–5, highest first (same words as School Admin's report card). */
export const CONDUCT_SCALE: Record<number, string> = {
  5: 'Excellent',
  4: 'Very good',
  3: 'Good',
  2: 'Fair',
  1: 'Needs improvement',
};

export const REMARK_LIMITS = { min: 20, max: 400 } as const;

export interface StudentSubjectResult {
  subject: string;
  subjectName: string;
  /** Only for Approved / Published sheets; null shows as "Pending". */
  total: number | null;
  grade: string | null;
  status: SheetStatus;
}

export interface ReportCardRow {
  studentId: string;
  name: string;
  admissionNo: string;
  /** Remark written and all five ratings given. */
  done: boolean;
  remark: string | null;
  results: StudentSubjectResult[];
  attendance: AttendanceSummary;
}

/** `GET /v1/class-teacher/report-cards?term=` */
export interface ReportCardsList extends ClassArmRef {
  term: string;
  editable: boolean;
  lockReason: string | null;
  progress: { done: number; total: number };
  subjects: { code: string; name: string }[];
  students: ReportCardRow[];
}

/** `GET /v1/class-teacher/report-cards/:studentId?term=` */
export interface ReportCardEntry extends ClassArmRef {
  student: { id: string; name: string; admissionNo: string; gender: string };
  term: string;
  remark: string;
  ratings: Record<ConductTrait, number | null>;
  done: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  results: StudentSubjectResult[];
  attendance: AttendanceSummary;
  editable: boolean;
  lockReason: string | null;
  /** Position in the class list, for prev / next. */
  index: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
  history: TimelineEntry[];
}

export interface ReportCardPayload {
  remark: string;
  ratings: Partial<Record<ConductTrait, number | null>>;
}
