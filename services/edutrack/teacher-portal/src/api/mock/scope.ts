/**
 * Scope helpers: the ONE place that decides what a signed-in teacher may see. Every feature
 * handler resolves the teacher with `currentTeacher(req)`, the term with `termFor(req)`, and
 * checks access with `requireTeaching` / `canTeach` before returning anything. Unauthorised
 * access answers 403 with a clear message; unknown ids answer 404.
 */
import { MockHttpError, type MockRequest } from '@edutrack/web-core/mock';

import { accountOf, sessionOfToken } from './accounts-db';
import { isoToday } from './clock';
import {
  ACADEMIC_HEAD_ID,
  ARMS,
  BRANCHES,
  DEPARTMENTS,
  MEMBERSHIPS,
  STAFF,
  STUDENTS,
  SUBJECTS,
  TEACHING_ASSIGNMENTS,
  TERMS,
  type ArmRecord,
  type StaffRecord,
  type StudentRecord,
  type TermRecord,
} from './school-db';

type Req = Pick<MockRequest, 'headers'>;

/* ---------- Errors ---------- */

export const notFound = (what: string): never => {
  throw new MockHttpError(404, `${what} wasn’t found. It may have been removed.`, 'NOT_FOUND');
};
export const forbidden = (message: string): never => {
  throw new MockHttpError(403, message, 'FORBIDDEN');
};

/* ---------- Who is asking ---------- */

/** The signed-in teacher, from the bearer token. 401 when the session ended. */
export function currentTeacher(req: Req): StaffRecord {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = sessionOfToken(token);
  const staff = session && STAFF.find((s) => s.id === session.staffId);
  if (!staff || accountOf(staff.id)?.status !== 'Active')
    throw new MockHttpError(401, 'Sign in to continue');
  return staff;
}

/** The device session behind the request (for "this device" and signing out others). */
export function currentSessionId(req: Req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return sessionOfToken(token)?.id ?? null;
}

/* ---------- Records by id (404 when unknown) ---------- */

export const termById = (id: string): TermRecord =>
  TERMS.find((t) => t.id === id) ?? notFound('That term');
export const activeTerm = (): TermRecord => TERMS.find((t) => t.status === 'Active')!;
/** The term a request is about: `?term=` when given, else the active term. */
export const termFor = (req: Pick<MockRequest, 'query'>): TermRecord =>
  req.query.term ? termById(req.query.term) : activeTerm();

export const armById = (id: string): ArmRecord =>
  ARMS.find((a) => a.id === id) ?? notFound('That class');
export const subjectByCode = (code: string) =>
  SUBJECTS.find((s) => s.code === code) ?? notFound('That subject');
export const staffById = (id: string): StaffRecord =>
  STAFF.find((s) => s.id === id) ?? notFound('That staff member');
export const studentById = (id: string): StudentRecord =>
  STUDENTS.find((s) => s.id === id) ?? notFound('That student');
export const branchOf = (id: string) => BRANCHES.find((b) => b.id === id)!;
export const departmentOfSubject = (code: string) =>
  DEPARTMENTS.find((d) => d.subjects.includes(code)) ?? notFound('That subject’s department');

/** "JSS 2B · Mathematics" */
export const classLabel = (armId: string, subject: string) =>
  `${armById(armId).name} · ${subjectByCode(subject).name}`;
/** "SSS 1A (Lekki) · Further Mathematics" when the teacher works on more than one campus. */
export const armLabel = (a: ArmRecord, withCampus = false) =>
  withCampus ? `${a.name} (${branchOf(a.branchId).short})` : a.name;

/* ---------- Term lock ---------- */

/** Only the Active term is editable. */
export const isEditableTerm = (termId: string) => termById(termId).status === 'Active';

/** Why a term is read-only, or `null` when it is editable. */
export function termLockReason(termId: string): string | null {
  const t = termById(termId);
  if (t.status === 'Closed')
    return `${t.sessionName} ${t.name} is closed. Its records are read-only.`;
  if (t.status === 'Upcoming')
    return `${t.sessionName} ${t.name} hasn’t started yet. You can look ahead, but changes open when it starts.`;
  return null;
}

/** 409 TERM_LOCKED with the reason when the term can't be changed. */
export function requireEditableTerm(termId: string) {
  const reason = termLockReason(termId);
  if (reason) throw new MockHttpError(409, reason, 'TERM_LOCKED');
}

/* ---------- Teaching scope ---------- */

export const assignmentsOf = (teacherId: string, termId: string) =>
  TEACHING_ASSIGNMENTS.filter((a) => a.teacherId === teacherId && a.termId === termId);

export const canTeach = (teacherId: string, termId: string, armId: string, subject: string) =>
  TEACHING_ASSIGNMENTS.some(
    (a) =>
      a.teacherId === teacherId &&
      a.termId === termId &&
      a.armId === armId &&
      a.subject === subject,
  );

/** "JSS 1A · Mathematics, JSS 2B · Mathematics" or "no classes" — for 403 messages. */
export function scopeSummary(teacherId: string, termId: string) {
  const mine = assignmentsOf(teacherId, termId);
  if (!mine.length) return 'You have no classes assigned this term.';
  const campuses = new Set(mine.map((a) => a.branchId)).size > 1;
  return `You teach ${mine
    .map((a) => `${armLabel(armById(a.armId), campuses)} · ${subjectByCode(a.subject).name}`)
    .join(', ')}.`;
}

/**
 * The teacher's assignment for a class and subject, or 403 naming what they *are* assigned to
 * (never anything about the class they asked for beyond its name).
 */
export function requireTeaching(teacherId: string, termId: string, armId: string, subject: string) {
  const a = armById(armId);
  const s = subjectByCode(subject);
  const mine = TEACHING_ASSIGNMENTS.find(
    (x) =>
      x.teacherId === teacherId &&
      x.termId === termId &&
      x.armId === armId &&
      x.subject === subject,
  );
  if (!mine)
    forbidden(`You don’t have access to ${a.name} · ${s.name}. ${scopeSummary(teacherId, termId)}`);
  return mine!;
}

/** A teaching assignment by id that belongs to the teacher (404 unknown, 403 someone else’s). */
export function requireOwnAssignment(teacherId: string, assignmentId: string) {
  const ta = TEACHING_ASSIGNMENTS.find((a) => a.id === assignmentId) ?? notFound('That class');
  if (ta.teacherId !== teacherId)
    forbidden(
      `You don’t have access to ${classLabel(ta.armId, ta.subject)}. ${scopeSummary(teacherId, ta.termId)}`,
    );
  return ta;
}

/** The day membership is judged on: today for the active/upcoming term, the last day for past ones. */
const referenceDay = (term: TermRecord) => (term.status === 'Closed' ? term.end : isoToday());

/**
 * Students who take `subject` in an arm for a term. Respects electives (Religious Studies choice,
 * Further Mathematics), students who joined mid-term and students who left: by default only
 * those in the arm now (or at the end of a past term). `includeLeft` also returns anyone who was
 * in the arm at some point during the term (for history: registers, sheets).
 */
export function studentsInArmFor(
  armId: string,
  subject: string,
  termId: string,
  options: { includeLeft?: boolean } = {},
): StudentRecord[] {
  const a = armById(armId);
  const term = termById(termId);
  const offering = a.subjects.find((o) => o.code === subject);
  if (!offering) return [];
  const day = referenceDay(term);
  const ids = new Set(
    MEMBERSHIPS.filter(
      (m) =>
        m.armId === armId &&
        (options.includeLeft
          ? m.from <= term.end && (m.to === null || m.to >= term.start)
          : m.from <= day && (m.to === null || m.to >= day)),
    ).map((m) => m.studentId),
  );
  return STUDENTS.filter(
    (s) => ids.has(s.id) && (!offering.group || s.electives.includes(subject)),
  ).sort((x, y) => x.lastName.localeCompare(y.lastName) || x.firstName.localeCompare(y.firstName));
}

/** Everyone in an arm (all subjects) for a term — the class teacher's register list. */
export const studentsInArm = (
  armId: string,
  termId: string,
  options: { includeLeft?: boolean } = {},
) => {
  const seen = new Map<string, StudentRecord>();
  for (const o of armById(armId).subjects)
    for (const s of studentsInArmFor(armId, o.code, termId, options)) seen.set(s.id, s);
  return [...seen.values()].sort(
    (x, y) => x.lastName.localeCompare(y.lastName) || x.firstName.localeCompare(y.firstName),
  );
};

/** Every student the teacher teaches in a term, once each, with the assignments they share. */
export function studentsTaughtBy(teacherId: string, termId: string) {
  const out = new Map<string, { student: StudentRecord; assignmentIds: string[] }>();
  for (const ta of assignmentsOf(teacherId, termId))
    for (const s of studentsInArmFor(ta.armId, ta.subject, termId)) {
      const row = out.get(s.id) ?? { student: s, assignmentIds: [] };
      row.assignmentIds.push(ta.id);
      out.set(s.id, row);
    }
  return [...out.values()];
}

/** A student the teacher teaches (or is class teacher of) this term, else 403 / 404. */
export function requireStudentInScope(teacherId: string, termId: string, studentId: string) {
  const s = studentById(studentId);
  const taught = studentsTaughtBy(teacherId, termId).some((r) => r.student.id === studentId);
  const arm = classArmOf(teacherId, termId);
  const inMyClass = arm
    ? studentsInArm(arm.id, termId, { includeLeft: true }).some((x) => x.id === studentId)
    : false;
  if (!taught && !inMyClass)
    forbidden(`You don’t have access to ${s.name}. ${scopeSummary(teacherId, termId)}`);
  return s;
}

/* ---------- Roles and review chain ---------- */

export const hodDepartmentOf = (teacherId: string) =>
  DEPARTMENTS.find((d) => d.hodId === teacherId) ?? null;
export const isHod = (teacherId: string) => hodDepartmentOf(teacherId) !== null;
export const isAcademicHead = (teacherId: string) => teacherId === ACADEMIC_HEAD_ID;

/**
 * Who reviews a teacher's result sheet for a subject: the HOD of the subject's department,
 * unless there is none or it is the teacher themself — then `null`, meaning the sheet goes
 * straight to the academic office.
 */
export function reviewerFor(teacherId: string, subjectCode: string): StaffRecord | null {
  const hod = departmentOfSubject(subjectCode).hodId;
  return hod && hod !== teacherId ? staffById(hod) : null;
}

/**
 * Who reviews a teacher's lesson note: the HOD of the subject's department, else the Academic
 * Head — never the teacher themself (`null` then means the academic office).
 */
export function lessonNoteReviewerFor(teacherId: string, subjectCode: string): StaffRecord | null {
  const hod = departmentOfSubject(subjectCode).hodId;
  if (hod && hod !== teacherId) return staffById(hod);
  return ACADEMIC_HEAD_ID !== teacherId ? staffById(ACADEMIC_HEAD_ID) : null;
}

/** The arm a teacher is class teacher of in a term's session, if any. */
export function classArmOf(teacherId: string, termId = activeTerm().id): ArmRecord | null {
  const sessionId = termById(termId).sessionId;
  return ARMS.find((a) => a.sessionId === sessionId && a.classTeacherId === teacherId) ?? null;
}
export const isClassTeacher = (teacherId: string, termId = activeTerm().id) =>
  classArmOf(teacherId, termId) !== null;

/** The class teacher's arm, or 403 for teachers who aren't one. */
export function requireClassArm(teacherId: string, termId: string) {
  const a = classArmOf(teacherId, termId);
  if (!a) forbidden('You don’t have access to My class. You aren’t a class teacher this term.');
  return a!;
}

/** Departments whose result sheets a teacher reviews (as HOD). */
export const sheetReviewDepartments = (teacherId: string) =>
  DEPARTMENTS.filter((d) => d.hodId === teacherId);

/** Departments whose lesson notes a teacher reviews: as HOD, or as Academic Head for those with no HOD. */
export const noteReviewDepartments = (teacherId: string) =>
  DEPARTMENTS.filter(
    (d) => d.hodId === teacherId || (isAcademicHead(teacherId) && d.hodId === null),
  );
