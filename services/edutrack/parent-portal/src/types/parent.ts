/* Shapes of the Parent Portal API (`/v1/parent/*`), as the backend returns them. */

export type ChildAccess = 'full' | 'read-only';

export interface FeeBadge {
  outstanding: number;
  pending: number;
  overdue: boolean;
}

/** A child in the switcher, Home cards and My children. */
export interface ChildSummary {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  admissionNo: string;
  className: string;
  branch: string;
  status: string;
  relationship: string;
  isPrimary: boolean;
  paysFees: boolean;
  access: ChildAccess;
  leftOn: string | null;
  readOnlyUntil: string | null;
  handsInThrough: 'student' | 'guardian';
  fees: FeeBadge;
}

export interface Overview {
  parent: { name: string; firstName: string; email: string };
  school: {
    name: string;
    initials: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  /** "YYYY-MM-DD" in Lagos. */
  today: string;
  term: { id: string; name: string; session: string; label: string; endsOn: string } | null;
  children: ChildSummary[];
}

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

export interface ChildDetail {
  child: ChildSummary;
  enrolment: {
    session: string;
    term: string;
    className: string;
    branch: string;
    classTeacher: string | null;
    admissionNo: string;
    admittedOn: string;
    status: string;
  };
  thisTerm: {
    term: string;
    fees: FeeBadge;
    results: ResultSummary;
    assignmentsToDo: number;
    attendance: AttendanceSummary;
  };
  guardians: { name: string; relationship: string; you: boolean; paysFees?: boolean }[];
}

export interface HomeAlert {
  kind: string;
  tone: 'error' | 'warning' | 'info' | 'success';
  title: string;
  text: string;
  action: { label: string; to: string } | null;
}

export interface Lesson {
  start: string;
  end: string;
  period: string;
  isBreak: boolean;
  subject: string;
  teacher: string | null;
}

export interface Home {
  term: string;
  alerts: HomeAlert[];
  latestResult: ResultSummary;
  homework: {
    id: string;
    title: string;
    subjectName: string;
    teacherName: string;
    dueAt: string | null;
    status: string;
    pastDue: boolean;
  }[];
  today: { day: string | null; className: string | null; lessons: Lesson[] };
  announcements: Announcement[];
}

/* ---------------- Fees ---------------- */

export interface Installment {
  label: string;
  amount: number;
  due: string;
  paid: number;
  status: 'Paid' | 'Part paid' | 'Overdue' | 'Due soon' | 'Upcoming';
}

export interface FeeInvoice {
  id: string;
  number: string;
  period: string;
  current: boolean;
  total: number;
  paid: number;
  pending: number;
  balance: number;
  status: string;
  overdue: boolean;
  dueOn: string;
  dueNote: string;
  lines: { label: string; amount: number }[];
  discounts: { label: string; amount: number }[];
  installments: Installment[];
}

export interface FeePayment {
  id: string;
  number: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
  status: 'Confirmed' | 'Pending verification' | 'Rejected';
  byParent: boolean;
  payer: string;
  proofName: string | null;
  rejectReason: string | null;
  invoices: string[];
}

export type PayOptionKey = 'all' | 'overdue' | 'current' | 'previous';

export interface PayOption {
  key: PayOptionKey;
  label: string;
  detail: string;
  amount: number;
}

export interface PayTo {
  accounts: { id: string; bank: string; accountNumber: string; accountName: string }[];
  reference: string;
  referenceKind: 'invoice' | 'admission';
}

export interface Fees {
  term: { id: string; label: string } | null;
  canPay: boolean;
  payBlockedReason: string | null;
  readOnly: boolean;
  totals: { outstanding: number; pending: number; overdue: boolean; credit: number };
  current: FeeInvoice | null;
  previous: FeeInvoice[];
  payments: FeePayment[];
  payTo: PayTo | null;
  options: PayOption[];
}

export interface FeeClaimPayload {
  option: PayOptionKey;
  paidOn: string;
  proofFileId: string;
  accountId?: string;
  reference?: string;
  note?: string;
}

export interface FeeClaimResult {
  id: string;
  number: string;
  amount: number;
  status: string;
}

/* ---------------- Results ---------------- */

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

/* ---------------- Homework ---------------- */

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

/* ---------------- Timetable, attendance, news ---------------- */

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

/* ---------------- Account ---------------- */

export interface Profile {
  name: string;
  title: string | null;
  email: string;
  phone: string;
  address: string;
  occupation: string | null;
  lastSignInAt: string | null;
}

export interface NotificationPreference {
  key: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export interface ParentNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  to: string;
  childId: string | null;
  createdAt: string;
  when: string;
  read: boolean;
}

export interface NotificationPage {
  rows: ParentNotification[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
  unread: number;
  total: number;
}
