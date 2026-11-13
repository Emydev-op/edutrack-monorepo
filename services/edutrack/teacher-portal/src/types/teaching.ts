/**
 * Types for the teaching area: my classes, subjects, students, timetable and lessons.
 * Re-exported from `@/types`.
 */
import type { AttendanceSummary } from './class-teacher';
import type { Paginated } from './common';
import type { MaterialType } from './materials';
import type { ResultSheetSummary, ScoreValue, SheetComponent, SheetStatus } from './results';
import type { AssessmentScheme, Period, Section, Weekday } from './school';

/** How the teacher holds a class: their normal role or a part-time assignment. */
export type TeachingRole = 'Subject teacher' | 'Part-time';

/** Whether a term's teaching records can change, for banners and disabled actions. */
export interface TermLock {
  termId: string;
  readOnly: boolean;
  /** Why the term is read-only, or null for the active term. */
  lockReason: string | null;
}

/** When a lesson next happens, relative to the API's clock. */
export interface LessonOccurrence {
  lessonId: string;
  /** "YYYY-MM-DD" */
  date: string;
  day: Weekday;
  periodId: string;
  /** "Period 3" */
  periodLabel: string;
  start: string;
  end: string;
  room: string;
  /** True when the lesson is happening right now. */
  inProgress: boolean;
}

/** One teaching assignment (class arm × subject) as a card on My classes. */
export interface TeachingClass {
  /** Teaching assignment id. */
  id: string;
  termId: string;
  armId: string;
  armName: string;
  section: Section;
  subject: string;
  subjectName: string;
  branchId: string;
  branchName: string;
  branchShort: string;
  students: number;
  periodsPerWeek: number;
  role: TeachingRole;
  /** The teacher is also this arm's class teacher. */
  isClassTeacher: boolean;
  /** Rooms the lessons are in (the arm's room, labs). */
  rooms: string[];
  /** This class's result sheet for the term, or null when there is none. */
  sheet: { id: string; status: SheetStatus; withHod: boolean } | null;
}

/** `GET /v1/teaching/classes?term=` */
export interface TeachingClassList extends TermLock {
  multiCampus: boolean;
  classes: TeachingClass[];
}

/** A student on a class page's Students tab. */
export interface ClassStudentRow {
  id: string;
  name: string;
  admissionNo: string;
  gender: 'Male' | 'Female';
  /** Day they joined this arm, when it was after the term began ("Joined 2 Nov"). */
  joinedLate: string | null;
}

/** `GET /v1/teaching/classes/:armId/:subject?term=` */
export interface TeachingClassDetail extends TermLock {
  class: TeachingClass;
  multiCampus: boolean;
  classTeacher: { id: string; name: string } | null;
  department: { id: string; name: string; hod: string | null };
  /** The next lesson from the published timetable, or null (term over, none published). */
  nextLesson: LessonOccurrence | null;
  students: ClassStudentRow[];
  /** The class's result sheet and what it says so far, or null when there is none. */
  results: ClassResults | null;
}

/** A student named on the class overview (needs support, absent from the exam). */
export interface ClassResultStudent {
  studentId: string;
  name: string;
  total: number | null;
}

export interface ClassResults {
  sheet: ResultSheetSummary;
  /** Why the sheet can't be edited now, or null. */
  lockReason: string | null;
  passMark: number;
  highest: ClassResultStudent | null;
  /** The lowest two totals below the pass mark. */
  needsSupport: ClassResultStudent[];
  /** Marked ABS for the examination (make-up needed). */
  absentFromExam: ClassResultStudent[];
}

/** A class inside a subject (My subjects / Subject page). */
export interface SubjectClass {
  armId: string;
  armName: string;
  branchName: string;
  branchShort: string;
  students: number;
  periodsPerWeek: number;
  role: TeachingRole;
}

export interface TeachingSubject {
  code: string;
  name: string;
  department: { id: string; name: string; hod: string | null };
  classes: SubjectClass[];
  students: number;
  periodsPerWeek: number;
}

/** `GET /v1/teaching/subjects?term=` */
export interface TeachingSubjectList extends TermLock {
  multiCampus: boolean;
  subjects: TeachingSubject[];
}

/** `GET /v1/teaching/subjects/:code?term=` */
export interface TeachingSubjectDetail extends TermLock {
  subject: TeachingSubject;
  multiCampus: boolean;
  /** The school's scheme for each section the subject is taught in. Read-only. */
  schemes: AssessmentScheme[];
}

/** One of my subjects for a student. */
export interface StudentSubject {
  code: string;
  name: string;
  armId: string;
}

/** One row on Students: a student taught in two subjects appears once with both. */
export interface TeachingStudentRow {
  id: string;
  name: string;
  admissionNo: string;
  gender: 'Male' | 'Female';
  armId: string;
  armName: string;
  branchShort: string;
  subjects: StudentSubject[];
  joinedLate: string | null;
}

export interface TeachingStudentsQuery {
  class?: string;
  subject?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** `GET /v1/teaching/students?term=&class=&subject=&q=&page=&pageSize=` */
export interface TeachingStudentList extends Paginated<TeachingStudentRow>, TermLock {}

/** `GET /v1/teaching/students/:studentId?term=` */
export interface TeachingStudentDetail extends TermLock {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  gender: 'Male' | 'Female';
  status: 'Active' | 'Transferred';
  /** The arm in the selected term. */
  armId: string;
  armName: string;
  branchName: string;
  section: Section;
  /** First day at the school. */
  joinedSchool: string;
  /** Day they joined this arm, when it was after the term began. */
  joinedLate: string | null;
  /** Last day at the school, for students who left. */
  leftOn: string | null;
  classTeacher: { id: string; name: string } | null;
  /** The signed-in teacher is this student's class teacher. */
  isMyClassStudent: boolean;
  mySubjects: StudentSubject[];
  /** Per component, for my subjects only (never other teachers'). */
  scores: StudentSubjectScores[];
  /** This term's totals for my subjects: given only once the sheet is Approved or Published. */
  results: MySubjectResult[];
  /** Published results for my subjects in past terms (read-only). */
  pastResults: StudentPastTerm[];
  attendance: AttendanceSummary;
}

/** One of my subjects' sheet row for a student. */
export interface StudentSubjectScores {
  subject: string;
  subjectName: string;
  armId: string;
  sheetId: string;
  status: SheetStatus;
  withHod: boolean;
  components: SheetComponent[];
  scores: ScoreValue[];
}

export interface MySubjectResult {
  subject: string;
  subjectName: string;
  status: SheetStatus;
  withHod: boolean;
  /** Null until the sheet is Approved or Published. */
  total: number | null;
  grade: string | null;
}

export interface StudentPastTerm {
  termId: string;
  label: string;
  results: { subject: string; subjectName: string; total: number | null; grade: string | null }[];
}

/** A lesson in my week. */
export interface TimetableLesson {
  id: string;
  day: Weekday;
  periodId: string;
  periodLabel: string;
  start: string;
  end: string;
  armId: string;
  armName: string;
  subject: string;
  subjectName: string;
  room: string;
  branchId: string;
  branchName: string;
  branchShort: string;
}

/** Today's lessons, from the API's clock. */
export type LessonStatus = 'Done' | 'Now' | 'Next' | 'Later';

export interface TodayLesson extends TimetableLesson {
  status: LessonStatus;
}

/** `GET /v1/teaching/timetable?term=` */
export interface TeachingTimetable extends TermLock {
  published: boolean;
  publishedOn: string | null;
  periods: Period[];
  days: Weekday[];
  multiCampus: boolean;
  /** Today's weekday when the selected term is running and today is a school day. */
  todayDay: Weekday | null;
  /** "YYYY-MM-DD" from the API's clock. */
  today: string;
  /** Why there is no "Today" list (weekend, holiday, past term…), or null. */
  todayNote: string | null;
  lessons: TimetableLesson[];
  todayLessons: TodayLesson[];
}

/** `GET /v1/teaching/lessons/:lessonId?term=` */
export interface TeachingLessonDetail extends TermLock {
  lesson: TimetableLesson;
  section: Section;
  students: number;
  classTeacher: { id: string; name: string } | null;
  multiCampus: boolean;
  /** Next time this slot runs (may be now), or null when the term is over. */
  next: LessonOccurrence | null;
  /** The class's next open assignment (published, not yet due), or null. */
  openAssignment: {
    id: string;
    title: string;
    /** Local "YYYY-MM-DDTHH:mm" */
    dueAt: string;
    handedIn: number;
    students: number;
  } | null;
  /** The newest published material for the class, or null. */
  latestMaterial: {
    id: string;
    title: string;
    type: MaterialType;
    /** Local "YYYY-MM-DDTHH:mm" */
    publishedAt: string;
  } | null;
}
