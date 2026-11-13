/**
 * Attendance, read-only: class teachers take the daily register in the Teacher Workspace; School
 * Admin sees each arm's attendance, the days not taken and every student's percentage.
 */
import { mock, MockHttpError } from '@edutrack/web-core/mock';

import type {
  AttendanceArmDetail,
  AttendanceArmRow,
  AttendanceDay,
  AttendanceOverview,
} from '@/types';

import { armStudents, type AcademicsData, type ArmRec, type LevelRec } from '../academics-db';
import { addDays, isoToday } from '../finance-ledger';
import {
  armAttendance,
  attendanceRate,
  closures,
  countKey,
  emptyCounts,
  isWeekend,
  registersFor,
  schoolDays,
} from '../register-db';
import {
  acadFor,
  activeBranches,
  allArms,
  branchName,
  currentSession,
  findArm,
  teacherName,
  termFrom,
} from './academics-shared';

/** The working branch, or null for all branches. */
function branchFrom(schoolId: string, name?: string) {
  return activeBranches(schoolId).find((b) => b.name === name)?.id ?? null;
}

function armRow(
  schoolId: string,
  acad: AcademicsData,
  level: LevelRec,
  arm: ArmRec,
  days: string[],
): AttendanceArmRow {
  const a = armAttendance(schoolId, level, arm, days);
  const today = isoToday();
  const students = armStudents(schoolId, level, arm).count;
  // An arm with no students has no register to take, so nothing counts as missed.
  const due = students ? days.length : a.taken.length;
  return {
    armId: arm.id,
    arm: a.name,
    branch: branchName(schoolId, level.branchId),
    section: level.section,
    classTeacher: teacherName(acad, arm.classTeacherId),
    students,
    schoolDays: days.length,
    daysTaken: a.taken.length,
    notTaken: due - a.taken.length,
    ...a.counts,
    rate: attendanceRate(a.counts),
    todayTaken: students && days.includes(today) ? a.taken.includes(today) : null,
  };
}

mock.get('/v1/academics/attendance', (req): AttendanceOverview => {
  const { acad, schoolId } = acadFor(req);
  const session = currentSession(acad);
  const term = termFrom(acad, req.query.term);
  const today = isoToday();
  if (!session || !term)
    return {
      term: '',
      termId: '',
      session: '',
      today,
      isSchoolDay: false,
      schoolDays: 0,
      closures: [],
      rows: [],
      totals: null,
      empty: 'no-session',
    };
  const days = schoolDays(acad, term);
  const branchId = branchFrom(schoolId, req.query.branch);
  const rows = allArms(acad)
    .filter(({ level }) => !branchId || level.branchId === branchId)
    .map(({ level, arm }) => armRow(schoolId, acad, level, arm, days));
  const sum = (k: keyof AttendanceArmRow) =>
    rows.reduce((n, r) => n + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
  const counts = {
    present: sum('present'),
    late: sum('late'),
    absent: sum('absent'),
    excused: sum('excused'),
  };
  return {
    term: term.name,
    termId: term.id,
    session: session.name,
    today,
    isSchoolDay: days.includes(today),
    schoolDays: days.length,
    closures: [...closures(acad, term)]
      .map(([date, name]) => ({ date, name }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    rows,
    totals: rows.length
      ? {
          ...counts,
          rate: attendanceRate(counts),
          daysTaken: sum('daysTaken'),
          possible: rows.length * days.length,
        }
      : null,
    empty: acad.levels.some((l) => l.arms.length) ? null : 'no-classes',
  };
});

mock.get('/v1/academics/attendance/:armId', (req): AttendanceArmDetail => {
  const { acad, schoolId } = acadFor(req);
  const term = termFrom(acad, req.query.term);
  if (!term) throw new MockHttpError(409, 'Create a session and its terms first.');
  const { level, arm } = findArm(acad, req.params.armId!);
  const today = isoToday();
  const days = schoolDays(acad, term);
  const closed = closures(acad, term);
  const regs = registersFor(schoolId).registers;
  const all: AttendanceDay[] = [];
  for (let d = term.start; d <= term.end; d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    const reg = regs[`${arm.id}|${d}`];
    const counts = emptyCounts();
    if (reg) {
      for (const m of Object.values(reg.marks)) counts[countKey(m.status)]++;
      for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] += reg.headcount[k];
    }
    all.push({
      date: d,
      kind: closed.has(d) ? 'closed' : d > today ? 'upcoming' : 'school',
      note: closed.get(d) ?? '',
      taken: !!reg,
      takenBy: reg?.takenBy ?? null,
      takenAt: reg?.takenAt ?? null,
      ...counts,
      rate: reg ? attendanceRate(counts) : null,
    });
  }
  const a = armAttendance(schoolId, level, arm, days);
  const { records, count } = armStudents(schoolId, level, arm);
  return {
    armId: arm.id,
    arm: a.name,
    branch: branchName(schoolId, level.branchId),
    classTeacher: teacherName(acad, arm.classTeacherId),
    term: term.name,
    today,
    summary: armRow(schoolId, acad, level, arm, days),
    days: all,
    students: records.map((s) => {
      const c = a.byStudent.get(s.id) ?? emptyCounts();
      return {
        id: s.id,
        name: `${s.firstName} ${s.surname}`.trim(),
        admissionNo: s.admissionNo,
        ...c,
        marked: c.present + c.late + c.absent + c.excused,
        rate: attendanceRate(c),
        marks: Object.fromEntries(
          a.taken.map((d) => [d, regs[`${arm.id}|${d}`]?.marks[s.id]]).filter(([, m]) => m),
        ),
      };
    }),
    others: count - records.length,
  };
});
