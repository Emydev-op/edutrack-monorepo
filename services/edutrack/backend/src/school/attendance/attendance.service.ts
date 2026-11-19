import { armRollSpans, covers } from '../shared/arm-roll.js';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import type { AttendanceMark } from '../../generated/prisma/enums.js';
import { lagosToday } from '../../platform/shared/format.js';
import { AcademicCatalogService, type ArmInfo } from '../academics/academic-catalog.service.js';
import { addDays, fail, isoDate, staffName } from '../academics/academic-format.js';

type Counts = { present: number; late: number; absent: number; excused: number };
type TermLike = { id: string; startsOn: Date; endsOn: Date; sessionId: string };

const KEY: Record<AttendanceMark, keyof Counts> = {
  PRESENT: 'present',
  LATE: 'late',
  ABSENT: 'absent',
  EXCUSED: 'excused',
};
export const MARK_LABEL: Record<AttendanceMark, 'Present' | 'Late' | 'Absent' | 'Excused'> = {
  PRESENT: 'Present',
  LATE: 'Late',
  ABSENT: 'Absent',
  EXCUSED: 'Excused',
};

export const emptyCounts = (): Counts => ({ present: 0, late: 0, absent: 0, excused: 0 });

/** Present or late ÷ everything marked, to one decimal place; null when nothing is marked. */
export function attendanceRate(c: Counts) {
  const marked = c.present + c.late + c.absent + c.excused;
  return marked ? Math.round(((c.present + c.late) / marked) * 1000) / 10 : null;
}

const isWeekend = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

/**
 * Attendance from the daily class registers: which weekdays of a term are school days (not
 * public holidays, mid-term breaks or calendar closures), and each arm's and student's marks.
 * School Admin's view is read-only; class teachers take the register in the Teacher Workspace.
 * Shapes follow the School Admin mock (`/v1/academics/attendance`).
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly catalog: AcademicCatalogService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.catalog.db;
  }

  today() {
    return isoDate(lagosToday(this.clock.now()));
  }

  /** Weekdays in the term with no classes, and why. */
  async closures(term: TermLike) {
    const start = isoDate(term.startsOn);
    const end = isoDate(term.endsOn);
    const [holidays, events, calendar] = await Promise.all([
      this.db.publicHoliday.findMany({
        where: { country: 'NG', date: { gte: term.startsOn, lte: term.endsOn } },
      }),
      this.db.termEvent.findMany({
        where: { termId: term.id, OR: [{ closesSchool: true }, { type: 'MIDTERM' }] },
      }),
      this.db.calendarEvent.findMany({
        where: {
          sessionId: term.sessionId,
          startsOn: { lte: term.endsOn },
          endsOn: { gte: term.startsOn },
          OR: [{ closesSchool: true }, { type: { in: ['HOLIDAY', 'BREAK'] } }],
        },
      }),
    ]);
    const out = new Map<string, string>();
    const mark = (from: string, to: string, name: string) => {
      for (let d = from; d <= to; d = addDays(d, 1))
        if (d >= start && d <= end && !isWeekend(d) && !out.has(d)) out.set(d, name);
    };
    for (const h of holidays) mark(isoDate(h.date), isoDate(h.date), h.name);
    for (const e of events) mark(isoDate(e.startsOn), isoDate(e.endsOn), e.name);
    for (const e of calendar) mark(isoDate(e.startsOn), isoDate(e.endsOn), e.title);
    return out;
  }

  /** School days in the term up to a date (inclusive). */
  async schoolDays(term: TermLike, upTo = this.today()) {
    const closed = await this.closures(term);
    const end = isoDate(term.endsOn);
    const last = upTo < end ? upTo : end;
    const out: string[] = [];
    for (let d = isoDate(term.startsOn); d <= last; d = addDays(d, 1))
      if (!isWeekend(d) && !closed.has(d)) out.push(d);
    return { days: out, closed };
  }

  /** Students on an arm's roll this session (placed and still enrolled). */
  roll(sessionId: string, armIds: string[]) {
    return this.db.enrollment.findMany({
      where: { sessionId, armId: { in: armIds }, status: 'ACTIVE' },
      include: {
        student: { select: { id: true, firstName: true, surname: true, admissionNo: true } },
      },
      orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
    });
  }

  private async registers(termId: string, armIds: string[], days: string[]) {
    if (!days.length || !armIds.length) return [];
    return this.db.attendanceRegister.findMany({
      where: {
        termId,
        armId: { in: armIds },
        date: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days.at(-1)}T00:00:00Z`) },
      },
      include: {
        marks: { select: { studentId: true, mark: true, reason: true } },
        takenByStaff: { select: { title: true, firstName: true, lastName: true } },
      },
    });
  }

  private row(
    arm: ArmInfo,
    regs: Awaited<ReturnType<AttendanceService['registers']>>,
    days: string[],
    students: number,
    classTeacher: string | null,
    today: string,
  ) {
    const dayset = new Set(days);
    const mine = regs.filter((r) => r.armId === arm.id && dayset.has(isoDate(r.date)));
    const counts = emptyCounts();
    for (const r of mine) {
      for (const m of r.marks) counts[KEY[m.mark]]++;
      counts.present += r.othersPresent;
      counts.late += r.othersLate;
      counts.absent += r.othersAbsent;
      counts.excused += r.othersExcused;
    }
    const taken = mine.map((r) => isoDate(r.date));
    // An arm with no students has no register to take, so nothing counts as missed.
    const due = students ? days.length : taken.length;
    return {
      armId: arm.id,
      arm: arm.label,
      branch: arm.branch,
      section: arm.section,
      classTeacher,
      students,
      schoolDays: days.length,
      daysTaken: taken.length,
      notTaken: due - taken.length,
      ...counts,
      rate: attendanceRate(counts),
      todayTaken: students && days.includes(today) ? taken.includes(today) : null,
    };
  }

  private async classTeachers(sessionId: string) {
    const rows = await this.db.classTeacherAssignment.findMany({
      where: { sessionId, endsOn: null },
      include: { staff: { select: { title: true, firstName: true, lastName: true } } },
    });
    return new Map(rows.map((r) => [r.armId, staffName(r.staff)]));
  }

  async overview(termId?: string | null, branch?: string | null) {
    const today = this.today();
    const found = await this.catalog.termFrom(termId);
    if (!found?.term)
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
        empty: 'no-session' as const,
      };
    const { session, term } = found;
    const { days, closed } = await this.schoolDays(term);
    const branchId = await this.catalog.branchIdByName(branch);
    const [allArms, arms] = await Promise.all([this.catalog.arms(), this.catalog.arms(branchId)]);
    const [roll, regs, teachers] = await Promise.all([
      this.roll(
        session.id,
        arms.map((a) => a.id),
      ),
      this.registers(
        term.id,
        arms.map((a) => a.id),
        days,
      ),
      this.classTeachers(session.id),
    ]);
    const rows = arms.map((a) =>
      this.row(
        a,
        regs,
        days,
        roll.filter((e) => e.armId === a.id).length,
        teachers.get(a.id) ?? null,
        today,
      ),
    );
    const sum = (k: 'present' | 'late' | 'absent' | 'excused' | 'daysTaken') =>
      rows.reduce((n, r) => n + r[k], 0);
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
      closures: [...closed]
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
      empty: allArms.length ? null : ('no-classes' as const),
    };
  }

  async armDetail(armId: string, termId?: string | null) {
    const arm = await this.catalog.arm(armId);
    if (!arm) throw fail('Class not found', 'ARM_NOT_FOUND', HttpStatus.NOT_FOUND);
    const found = await this.catalog.termFrom(termId);
    if (!found?.term)
      throw fail('Create a session and its terms first.', 'NO_TERM', HttpStatus.CONFLICT);
    const { session, term } = found;
    const today = this.today();
    const { days, closed } = await this.schoolDays(term);
    const allWeekdays: string[] = [];
    for (let d = isoDate(term.startsOn); d <= isoDate(term.endsOn); d = addDays(d, 1))
      if (!isWeekend(d)) allWeekdays.push(d);
    const [roll, spans, regs, teachers] = await Promise.all([
      this.roll(session.id, [arm.id]),
      // Everyone who was in the class at some point this term, for their days in it.
      armRollSpans(this.db, session.id, [arm.id]),
      this.registers(term.id, [arm.id], allWeekdays),
      this.classTeachers(session.id),
    ]);
    const byDate = new Map(regs.map((r) => [isoDate(r.date), r]));
    const summary = this.row(arm, regs, days, roll.length, teachers.get(arm.id) ?? null, today);
    const dayset = new Set(days);
    return {
      armId: arm.id,
      arm: arm.label,
      branch: arm.branch,
      classTeacher: teachers.get(arm.id) ?? null,
      term: term.name,
      today,
      summary,
      days: allWeekdays.map((date) => {
        const reg = byDate.get(date);
        const c = emptyCounts();
        if (reg) {
          for (const m of reg.marks) c[KEY[m.mark]]++;
          c.present += reg.othersPresent;
          c.late += reg.othersLate;
          c.absent += reg.othersAbsent;
          c.excused += reg.othersExcused;
        }
        return {
          date,
          kind: closed.has(date)
            ? ('closed' as const)
            : date > today
              ? ('upcoming' as const)
              : ('school' as const),
          note: closed.get(date) ?? '',
          taken: !!reg,
          takenBy: reg?.takenByStaff ? staffName(reg.takenByStaff) : null,
          takenAt: reg ? reg.takenAt.toISOString() : null,
          ...c,
          rate: reg ? attendanceRate(c) : null,
        };
      }),
      students: spans.map((e) => {
        const c = emptyCounts();
        const marks: Record<string, { status: string; reason: string }> = {};
        for (const r of regs) {
          const date = isoDate(r.date);
          if (!dayset.has(date) || !covers(e.span, date)) continue;
          const m = r.marks.find((x) => x.studentId === e.studentId);
          if (!m) continue;
          c[KEY[m.mark]]++;
          marks[date] = { status: MARK_LABEL[m.mark], reason: m.reason ?? '' };
        }
        return {
          id: e.student.id,
          name: `${e.student.firstName} ${e.student.surname}`.trim(),
          admissionNo: e.student.admissionNo,
          ...c,
          marked: c.present + c.late + c.absent + c.excused,
          rate: attendanceRate(c),
          marks,
        };
      }),
      others: 0,
    };
  }
}
