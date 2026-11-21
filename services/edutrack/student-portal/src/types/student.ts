/* The Student Portal's API shapes (`/v1/student/*` and the school inbox). */

export type ChildAccess = 'full' | 'read-only';

export type ResultStatus = 'published' | 'not-published' | 'held';

export interface ResultSummary {
  termId: string;
  term: string;
  status: ResultStatus;
  average: string | null;
  position: string | null;
  plannedOn: string | null;
  held: { message: string } | null;
  previous: ResultSummary | null;
}

export interface AttendanceSummary {
  present: number;
  late: number;
  absent: number;
  excused: number;
  schoolDays: number;
  percent: number | null;
}

export interface Lesson {
  start: string;
  end: string;
  period: string;
  isBreak: boolean;
  subject: string;
  teacher: string | null;
}

export interface TermChip {
  id: string;
  label: string;
  current: boolean;
}

export interface ReportCardSubject {
  name: string;
  scores: (number | string)[];
  total: string;
  grade: string;
  remark: string;
  position: string | null;
}

export interface ReportCard {
  school: { name?: string; motto?: string | null; address?: string | null } | null;
  title: string | null;
  student: {
    name?: string;
    admissionNo?: string;
    className?: string;
    photoUrl?: string | null;
  } | null;
  classTeacher: string | null;
  components: string[] | null;
  subjects: ReportCardSubject[] | null;
  average: string | null;
  grade: string | null;
  position: string | null;
  version: number | null;
  nextTerm: string | null;
  classTeacherRemark: string | null;
  conduct: { trait: string; rating: number | null }[] | null;
  attendance: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    schoolDays: number;
  } | null;
  cumulative: {
    terms: string[];
    subjects: { name: string; totals: (number | null)[]; average: number | null }[];
    average: number | null;
  } | null;
  publishedAt: string | null;
}

export interface Results {
  termId: string;
  term: string;
  className: string | null;
  terms: TermChip[];
  status: ResultStatus;
  plannedOn: string | null;
  held: { message: string } | null;
  publishedOn: string | null;
  card: ReportCard | null;
}

export interface FileRef {
  id: string;
  name: string;
  type: string;
  bytes: number;
  url?: string | null;
}

export interface Assignment {
  id: string;
  title: string;
  subjectName: string;
  classLabel: string;
  teacherName: string;
  instructions: string;
  dueAt: string | null;
  maxScore: number;
  allowLate: boolean;
  pastDue: boolean;
  assignmentStatus: string;
  attachments: (FileRef & { materialId?: string })[];
  status: string;
  submittedAt: string | null;
  late: boolean;
  submittedByGuardian: string | null;
  note: string | null;
  files: FileRef[];
  score: number | null;
  feedback: string | null;
  returnedAt: string | null;
  excuseReason: string | null;
  canSubmit: boolean;
}

export interface Material {
  id: string;
  title: string;
  description: string | null;
  type: string;
  subjectName: string;
  classLabel: string;
  file: FileRef | null;
  link: string | null;
  publishedAt: string | null;
}

export interface Homework {
  termId: string;
  student?: { id: string; name: string; className: string; photoUrl?: string | null };
  handsInThrough?: 'student' | 'guardian';
  assignments: Assignment[];
  materials: Material[];
}

export interface Timetable {
  termId: string;
  term: string;
  className: string | null;
  published: boolean;
  version: number | null;
  effectiveFrom: string | null;
  days: { day: string; lessons: Lesson[] }[];
}

export interface Attendance {
  termId: string;
  term: string;
  startsOn: string;
  endsOn: string;
  terms: TermChip[];
  summary: AttendanceSummary;
  days: { date: string; mark: 'Present' | 'Late' | 'Absent' | 'Excused'; reason: string | null }[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  from: string;
  sentAt: string | null;
  date: string;
  audience: string;
  expiresOn: string | null;
}

export interface StudentNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  to: string;
  createdAt: string;
  when: string;
  read: boolean;
}

export interface NotificationPage {
  rows: StudentNotification[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  unread: number;
  total: number;
}
/** The frame: the signed-in student, the school's contact details and the term. */
export interface Overview {
  student: {
    id: string;
    name: string;
    firstName: string;
    initials: string;
    admissionNo: string;
    className: string;
    section: string;
    branch: string;
    access: ChildAccess;
    leftOn: string | null;
  };
  school: {
    name: string;
    initials: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  today: string;
  term: { id: string; name: string; session: string; label: string; endsOn: string } | null;
}

export interface HomeHomework {
  id: string;
  title: string;
  subjectName: string;
  teacherName: string;
  dueAt: string | null;
  status: string;
  pastDue: boolean;
  canSubmit: boolean;
}

export interface Home {
  term: string;
  today: { day: string | null; className: string | null; lessons: Lesson[] };
  homework: HomeHomework[];
  homeworkDue: number;
  latestResult: ResultSummary;
  attendance: AttendanceSummary;
  announcements: Announcement[];
}

export interface Profile {
  name: string;
  firstName: string;
  surname: string;
  initials: string;
  admissionNo: string;
  gender: string;
  dateOfBirth: string | null;
  admittedOn: string;
  status: string;
  className: string | null;
  section: string | null;
  branch: string | null;
  classTeacher: string | null;
  session: string;
  guardians: { name: string; relationship: string }[];
}
