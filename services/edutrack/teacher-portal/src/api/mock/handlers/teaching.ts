/**
 * Mock endpoints for the teaching area: my classes, the class page, my subjects, students, the
 * student page, my timetable and the lesson page. Everything is scoped to the signed-in
 * teacher's assignments for `?term=` (default: the active term) through `../scope`.
 */
import { mock } from '@edutrack/web-core/mock';

import type {
  AssessmentScheme,
  ClassResultStudent,
  ClassResults,
  ClassStudentRow,
  StudentPastTerm,
  StudentSubject,
  MySubjectResult,
  StudentSubjectScores,
  TeachingClass,
  TeachingClassDetail,
  TeachingClassList,
  TeachingLessonDetail,
  TeachingStudentDetail,
  TeachingStudentList,
  TeachingStudentRow,
  TeachingSubject,
  TeachingSubjectDetail,
  TeachingSubjectList,
  TeachingTimetable,
  TermLock,
} from '@/types';

import { HANDED_IN, openAssignmentFor, submissionsFor } from '../assignments-db';
import { WEEKDAYS, isoToday, weekdayName } from '../clock';
import { latestMaterial } from '../materials-db';
import { attendanceSummary } from '../register-db';
import {
  PASS_MARK,
  isWithHod,
  lockOf as sheetLockOf,
  rowsOf,
  schemeOf,
  sheetFor,
  sheetSummary,
  studentTermResults,
  type SheetRecord,
} from '../results-db';
import {
  ARMS,
  LESSONS,
  MEMBERSHIPS,
  PERIODS,
  SCHEMES,
  TERMS,
  TIMETABLES,
  roomFor,
  type ArmRecord,
  type StudentRecord,
  type TeachingAssignmentRecord,
  type TermRecord,
} from '../school-db';
import {
  armById,
  assignmentsOf,
  branchOf,
  classArmOf,
  currentTeacher,
  departmentOfSubject,
  forbidden,
  notFound,
  requireStudentInScope,
  requireTeaching,
  scopeSummary,
  staffById,
  studentsInArmFor,
  studentsTaughtBy,
  subjectByCode,
  termById,
  termFor,
  termLockReason,
} from '../scope';
import {
  lessonShape,
  lessonsOf,
  lessonsOfAssignment,
  nextOccurrence,
  todayNoteFor,
  todaysLessons,
} from '../teaching-db';

/* ---------- Shapes ---------- */

const lockOf = (term: TermRecord): TermLock => {
  const reason = termLockReason(term.id);
  return { termId: term.id, readOnly: reason !== null, lockReason: reason };
};

const multiCampus = (teacherId: string, termId: string) =>
  new Set(assignmentsOf(teacherId, termId).map((a) => a.branchId)).size > 1;

const classTeacherOf = (a: ArmRecord) =>
  a.classTeacherId ? { id: a.classTeacherId, name: staffById(a.classTeacherId).name } : null;

function departmentShape(code: string) {
  const d = departmentOfSubject(code);
  return { id: d.id, name: d.name, hod: d.hodId ? staffById(d.hodId).name : null };
}

const roleOf = (ta: TeachingAssignmentRecord) =>
  ta.type === 'Part-time' ? ('Part-time' as const) : ('Subject teacher' as const);

function classShape(ta: TeachingAssignmentRecord): TeachingClass {
  const a = armById(ta.armId);
  const b = branchOf(a.branchId);
  const rooms = [...new Set(lessonsOfAssignment(ta.id).map((l) => l.room))];
  return {
    id: ta.id,
    termId: ta.termId,
    armId: a.id,
    armName: a.name,
    section: a.section,
    subject: ta.subject,
    subjectName: subjectByCode(ta.subject).name,
    branchId: b.id,
    branchName: b.name,
    branchShort: b.short,
    students: studentsInArmFor(a.id, ta.subject, ta.termId).length,
    periodsPerWeek: ta.periodsPerWeek,
    role: roleOf(ta),
    isClassTeacher: a.classTeacherId === ta.teacherId,
    rooms: rooms.length ? rooms.sort() : [roomFor(a, ta.subject)],
    sheet: sheetRef(sheetFor(ta.termId, a.id, ta.subject)),
  };
}

const sheetRef = (s: SheetRecord | undefined | null) =>
  s ? { id: s.id, status: s.status, withHod: isWithHod(s) } : null;

/** The class's sheet with average, highest, who needs support and who missed the exam. */
function classResults(sheet: SheetRecord | undefined | null): ClassResults | null {
  if (!sheet) return null;
  const rows = rowsOf(sheet);
  const examIndex = schemeOf(sheet).components.findIndex((c) => c.key === 'EXAM');
  const person = (r: (typeof rows)[number]): ClassResultStudent => ({
    studentId: r.studentId,
    name: r.name,
    total: r.total,
  });
  const totalled = rows.filter((r) => r.total !== null);
  const best = [...totalled].sort((a, b) => b.total! - a.total!)[0];
  return {
    sheet: sheetSummary(sheet),
    lockReason: sheetLockOf(sheet)?.reason ?? null,
    passMark: PASS_MARK,
    highest: best ? person(best) : null,
    needsSupport: totalled
      .filter((r) => r.total! < PASS_MARK)
      .sort((a, b) => a.total! - b.total!)
      .slice(0, 2)
      .map(person),
    absentFromExam:
      examIndex < 0 ? [] : rows.filter((r) => r.scores[examIndex] === 'ABS').map(person),
  };
}

/** The student's arm membership in a term (the one in force at the term's reference day). */
function membershipIn(studentId: string, term: TermRecord) {
  const day = term.status === 'Closed' ? term.end : isoToday();
  const mine = MEMBERSHIPS.filter(
    (m) =>
      m.studentId === studentId &&
      ARMS.find((a) => a.id === m.armId)?.sessionId === term.sessionId &&
      m.from <= term.end &&
      (m.to === null || m.to >= term.start),
  );
  return (
    mine.find((m) => m.from <= day && (m.to === null || m.to >= day)) ??
    mine.sort((x, y) => y.from.localeCompare(x.from))[0] ??
    null
  );
}

/** The day a student joined an arm, when that was after the term began. */
function joinedLate(studentId: string, armId: string, term: TermRecord) {
  const m = MEMBERSHIPS.find((x) => x.studentId === studentId && x.armId === armId);
  return m && m.from > term.start && m.from <= term.end ? m.from : null;
}

const classStudentRow = (s: StudentRecord, armId: string, term: TermRecord): ClassStudentRow => ({
  id: s.id,
  name: s.name,
  admissionNo: s.admissionNo,
  gender: s.gender,
  joinedLate: joinedLate(s.id, armId, term),
});

function subjectShapes(teacherId: string, term: TermRecord): TeachingSubject[] {
  const mine = assignmentsOf(teacherId, term.id);
  return [...new Set(mine.map((a) => a.subject))].map((code) => {
    const rows = mine.filter((a) => a.subject === code);
    const students = new Set(
      rows.flatMap((ta) => studentsInArmFor(ta.armId, code, term.id).map((s) => s.id)),
    );
    return {
      code,
      name: subjectByCode(code).name,
      department: departmentShape(code),
      classes: rows.map((ta) => {
        const c = classShape(ta);
        return {
          armId: c.armId,
          armName: c.armName,
          branchName: c.branchName,
          branchShort: c.branchShort,
          students: c.students,
          periodsPerWeek: c.periodsPerWeek,
          role: c.role,
        };
      }),
      students: students.size,
      periodsPerWeek: rows.reduce((sum, ta) => sum + ta.periodsPerWeek, 0),
    };
  });
}

/* ---------- My classes ---------- */

mock.get('/v1/teaching/classes', (req): TeachingClassList => {
  const t = currentTeacher(req);
  const term = termFor(req);
  return {
    ...lockOf(term),
    multiCampus: multiCampus(t.id, term.id),
    classes: assignmentsOf(t.id, term.id).map(classShape),
  };
});

mock.get('/v1/teaching/classes/:armId/:subject', (req): TeachingClassDetail => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const ta = requireTeaching(t.id, term.id, req.params.armId!, req.params.subject!);
  const a = armById(ta.armId);
  return {
    ...lockOf(term),
    class: classShape(ta),
    multiCampus: multiCampus(t.id, term.id),
    classTeacher: classTeacherOf(a),
    department: departmentShape(ta.subject),
    nextLesson: nextOccurrence(lessonsOfAssignment(ta.id), term.id),
    students: studentsInArmFor(a.id, ta.subject, term.id).map((s) =>
      classStudentRow(s, a.id, term),
    ),
    results: classResults(sheetFor(term.id, a.id, ta.subject)),
  };
});

/* ---------- My subjects ---------- */

mock.get('/v1/teaching/subjects', (req): TeachingSubjectList => {
  const t = currentTeacher(req);
  const term = termFor(req);
  return {
    ...lockOf(term),
    multiCampus: multiCampus(t.id, term.id),
    subjects: subjectShapes(t.id, term),
  };
});

mock.get('/v1/teaching/subjects/:code', (req): TeachingSubjectDetail => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const s = subjectByCode(req.params.code!);
  const subject = subjectShapes(t.id, term).find((x) => x.code === s.code);
  if (!subject)
    return forbidden(`You don’t have access to ${s.name}. ${scopeSummary(t.id, term.id)}`);
  const sections = [
    ...new Set(
      assignmentsOf(t.id, term.id)
        .filter((a) => a.subject === s.code)
        .map((a) => armById(a.armId).section),
    ),
  ].sort();
  const schemes: AssessmentScheme[] = sections.map((section) => ({
    section,
    components: SCHEMES[section].components.map((c) => ({ ...c })),
    scaleName: SCHEMES[section].scaleName,
    scale: SCHEMES[section].scale.map((b) => ({ ...b })),
  }));
  return { ...lockOf(term), subject, multiCampus: multiCampus(t.id, term.id), schemes };
});

/* ---------- Students ---------- */

function studentSubjects(assignmentIds: string[], teacherId: string, termId: string) {
  const mine = assignmentsOf(teacherId, termId);
  return assignmentIds
    .map((id) => mine.find((a) => a.id === id)!)
    .map<StudentSubject>((a) => ({
      code: a.subject,
      name: subjectByCode(a.subject).name,
      armId: a.armId,
    }));
}

mock.get('/v1/teaching/students', (req): TeachingStudentList => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const q = (req.query.q ?? '').trim().toLowerCase();
  const armFilter = req.query.class ?? '';
  const subjectFilter = req.query.subject ?? '';
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));

  const rows: TeachingStudentRow[] = studentsTaughtBy(t.id, term.id)
    .map(({ student, assignmentIds }) => {
      const subjects = studentSubjects(assignmentIds, t.id, term.id);
      const armId = subjects[0]!.armId;
      const a = armById(armId);
      return {
        id: student.id,
        name: student.name,
        admissionNo: student.admissionNo,
        gender: student.gender,
        armId,
        armName: a.name,
        branchShort: branchOf(a.branchId).short,
        subjects,
        joinedLate: joinedLate(student.id, armId, term),
      };
    })
    .filter(
      (r) =>
        (!armFilter || r.armId === armFilter) &&
        (!subjectFilter || r.subjects.some((s) => s.code === subjectFilter)) &&
        (!q || r.name.toLowerCase().includes(q) || r.admissionNo.toLowerCase().includes(q)),
    )
    .sort(
      (x, y) =>
        x.armName.localeCompare(y.armName) ||
        x.armId.localeCompare(y.armId) ||
        x.name.split(' ').slice(-1)[0]!.localeCompare(y.name.split(' ').slice(-1)[0]!) ||
        x.name.localeCompare(y.name),
    );

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(req.query.page) || 1));
  return {
    ...lockOf(term),
    data: rows.slice((page - 1) * pageSize, page * pageSize),
    meta: { page, pageSize, total, totalPages },
  };
});

mock.get('/v1/teaching/students/:studentId', (req): TeachingStudentDetail => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const s = requireStudentInScope(t.id, term.id, req.params.studentId!);
  const m = membershipIn(s.id, term) ?? notFound('That student’s class for this term');
  const a = armById(m.armId);
  const taught = studentsTaughtBy(t.id, term.id).find((r) => r.student.id === s.id);
  const left = s.leftOn && s.leftOn <= (term.status === 'Closed' ? term.end : isoToday());
  const mySubjects = taught ? studentSubjects(taught.assignmentIds, t.id, term.id) : [];
  const myCodes = new Set(mySubjects.map((x) => x.code));

  // Scores and results for MY subjects only: other teachers' subjects never leave the API.
  const scores: StudentSubjectScores[] = [];
  const results: MySubjectResult[] = [];
  for (const sub of mySubjects) {
    const sheet = sheetFor(term.id, sub.armId, sub.code);
    if (!sheet) continue;
    const row = rowsOf(sheet).find((x) => x.studentId === s.id);
    if (!row) continue;
    const final = sheet.status === 'Approved' || sheet.status === 'Published';
    scores.push({
      subject: sub.code,
      subjectName: sub.name,
      armId: sub.armId,
      sheetId: sheet.id,
      status: sheet.status,
      withHod: isWithHod(sheet),
      components: schemeOf(sheet).components.map((c) => ({ ...c })),
      scores: [...row.scores],
    });
    results.push({
      subject: sub.code,
      subjectName: sub.name,
      status: sheet.status,
      withHod: isWithHod(sheet),
      total: final ? row.total : null,
      grade: final ? row.grade : null,
    });
  }
  const pastResults: StudentPastTerm[] = TERMS.filter(
    (x) => x.status === 'Closed' && x.end < term.start,
  )
    .sort((x, y) => y.start.localeCompare(x.start))
    .map((x) => ({
      termId: x.id,
      label: `${x.sessionName} · ${x.name}`,
      results: studentTermResults(s.id, x.id)
        .filter((res) => myCodes.has(res.subject) && res.status === 'Published')
        .map((res) => ({
          subject: res.subject,
          subjectName: res.subjectName,
          total: res.total,
          grade: res.grade,
        })),
    }))
    .filter((x) => x.results.length);

  return {
    ...lockOf(term),
    id: s.id,
    name: s.name,
    firstName: s.firstName,
    lastName: s.lastName,
    admissionNo: s.admissionNo,
    gender: s.gender,
    status: left ? 'Transferred' : 'Active',
    armId: a.id,
    armName: a.name,
    branchName: branchOf(a.branchId).name,
    section: a.section,
    joinedSchool: s.joinedOn,
    joinedLate: joinedLate(s.id, a.id, term),
    leftOn: left ? s.leftOn : null,
    classTeacher: classTeacherOf(a),
    isMyClassStudent: classArmOf(t.id, term.id)?.id === a.id,
    mySubjects,
    scores,
    results,
    pastResults,
    attendance: attendanceSummary(s.id, term.id),
  };
});

/* ---------- Timetable ---------- */

mock.get('/v1/teaching/timetable', (req): TeachingTimetable => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const tt = TIMETABLES[term.id];
  const note = todayNoteFor(term.id);
  return {
    ...lockOf(term),
    published: tt?.published ?? false,
    publishedOn: tt?.publishedOn ?? null,
    periods: PERIODS.map((p) => ({ ...p })),
    days: [...WEEKDAYS],
    multiCampus: multiCampus(t.id, term.id),
    todayDay: note ? null : weekdayName(isoToday()),
    today: isoToday(),
    todayNote: note,
    lessons: lessonsOf(t.id, term.id).map(lessonShape),
    todayLessons: todaysLessons(t.id, term.id),
  };
});

mock.get('/v1/teaching/lessons/:lessonId', (req): TeachingLessonDetail => {
  const t = currentTeacher(req);
  const l = LESSONS.find((x) => x.id === req.params.lessonId) ?? notFound('That lesson');
  const term = termById(l.termId);
  const shape = lessonShape(l);
  if (l.teacherId !== t.id)
    forbidden(
      `You don’t have access to ${shape.armName} · ${shape.subjectName} (${shape.day}, ${shape.periodLabel}). ${scopeSummary(t.id, term.id)}`,
    );
  const a = armById(l.armId);
  return {
    ...lockOf(term),
    lesson: shape,
    section: a.section,
    students: studentsInArmFor(a.id, l.subject, term.id).length,
    classTeacher: classTeacherOf(a),
    multiCampus: multiCampus(t.id, term.id),
    next: nextOccurrence([l], term.id),
    openAssignment: (() => {
      const a = openAssignmentFor(l.armId, l.subject, term.id);
      if (!a) return null;
      const subs = submissionsFor(a);
      return {
        id: a.id,
        title: a.title,
        dueAt: a.dueAt!,
        handedIn: subs.filter((x) => HANDED_IN.includes(x.status)).length,
        students: subs.length,
      };
    })(),
    latestMaterial: (() => {
      const m = latestMaterial(l.armId, l.subject, term.id);
      return m ? { id: m.id, title: m.title, type: m.type, publishedAt: m.publishedAt } : null;
    })(),
  };
});
