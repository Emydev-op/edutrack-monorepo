import { covers, daysIn, type RollSpan } from '../shared/arm-roll.js';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AttendanceMark } from '../../generated/prisma/enums.js';
import {
  addDays,
  fmtDate,
  fromIso,
  isIso,
  isoDate,
  plural,
  staffName,
} from '../academics/academic-format.js';
import {
  AttendanceService,
  attendanceRate,
  emptyCounts,
  MARK_LABEL,
} from '../attendance/attendance.service.js';
import { CommsDispatchService } from '../communication/comms-dispatch.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { joinedLate, TeacherScopeService, type TermRow } from './teacher-scope.service.js';

const MARK_BY_LABEL: Record<string, AttendanceMark> = {
  Present: 'PRESENT',
  Absent: 'ABSENT',
  Late: 'LATE',
  Excused: 'EXCUSED',
};
const KEY = { PRESENT: 'present', ABSENT: 'absent', LATE: 'late', EXCUSED: 'excused' } as const;
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());
/** "Tuesday 17 Nov". */
const dayLabel = (iso: string) =>
  `${DAY_NAME[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${fmtDate(iso, false)}`;

export interface MarkInput {
  studentId: string;
  status: string;
  reason?: string;
}

type Counts = { present: number; absent: number; late: number; excused: number };
const countsLabel = (c: Counts) =>
  `${c.present} present · ${c.absent} absent · ${c.late} late · ${c.excused} excused`;

/**
 * My class › Register (Teacher Workspace): the class teacher takes the day's register for their
 * arm. Days can be taken or changed for today and the previous `registerEditDays` school days
 * (School settings, default 5); weekends, closures, future days and closed terms are read-only.
 * A student newly marked Absent gets their guardians an in-app Parent Portal notification (no
 * SMS: the school's decision). Shapes follow the Teacher Workspace mock (`class-teacher.ts`).
 */
@Injectable()
export class RegisterService {
  constructor(
    private readonly scope: TeacherScopeService,
    private readonly attendance: AttendanceService,
    private readonly audit: SchoolAuditService,
    private readonly comms: CommsDispatchService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.scope.db;
  }

  /** The class teacher's arm for the term, or 403. */
  private async myArm(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const arm = await this.scope.classArm(s.id, term);
    if (!arm)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Only class teachers take the register. You aren’t a class teacher this term.',
        'FORBIDDEN',
      );
    return {
      s,
      term,
      arm,
      ref: { armId: arm.id, arm: arm.label, branchName: arm.branch, termId: term.id },
    };
  }

  private async editDays(): Promise<number> {
    const settings = await this.db.schoolSettings.findFirst({ select: { registerEditDays: true } });
    return settings?.registerEditDays ?? 5;
  }

  /** Today and the previous N school days of the term (the days that can still change). */
  private async editableDays(term: TermRow, closed: Map<string, string>) {
    const today = this.attendance.today();
    if (term.status !== 'ACTIVE') return [];
    const n = await this.editDays();
    const start = isoDate(term.startsOn);
    const schoolDay = (d: string) => !isWeekend(d) && !closed.has(d);
    const out: string[] = schoolDay(today) ? [today] : [];
    // Plus the N school days before today.
    for (let d = addDays(today, -1), k = 0; k < n && d >= start; d = addDays(d, -1))
      if (schoolDay(d)) {
        out.push(d);
        k++;
      }
    return out;
  }

  private async lock(term: TermRow, date: string, closed: Map<string, string>, editable: string[]) {
    const start = isoDate(term.startsOn);
    const end = isoDate(term.endsOn);
    if (date < start || date > end)
      return {
        code: 'OUT_OF_TERM' as const,
        reason: `${fmtDate(date)} isn’t in ${term.name} (${fmtDate(start, false)} – ${fmtDate(end, false)}).`,
      };
    if (isWeekend(date))
      return {
        code: 'NO_SCHOOL' as const,
        reason: `There’s no register on ${dayLabel(date)}: it’s the weekend.`,
      };
    if (closed.has(date))
      return {
        code: 'NO_SCHOOL' as const,
        reason: `There’s no register on ${dayLabel(date)}: ${closed.get(date)}.`,
      };
    if (date > this.attendance.today())
      return {
        code: 'FUTURE' as const,
        reason: `${dayLabel(date)} hasn’t happened yet. You can take a register on the day.`,
      };
    if (term.status !== 'ACTIVE')
      return {
        code: 'TERM_LOCKED' as const,
        reason: `${term.session.name} ${term.name} is closed. Its registers are read-only.`,
      };
    if (!editable.includes(date)) {
      const n = await this.editDays();
      return {
        code: 'TOO_OLD' as const,
        reason: `Registers can be changed for ${n} school days. ${dayLabel(date)} is older, so it’s read-only. Ask the academic office to correct it.`,
      };
    }
    return null;
  }

  /** Who is on the roll on a date: in this arm that day (a student who moved is on each arm's
   *  roll only for the days they were in it). */
  private rollOn(sessionId: string, armId: string, date: string) {
    return this.scope.rollOn(sessionId, armId, date);
  }

  private async day(
    ref: { armId: string; arm: string; branchName: string; termId: string },
    term: TermRow,
    date: string,
  ) {
    const { closed } = await this.attendance.schoolDays(
      term,
      undefined,
      await this.attendance.branchOfArm(ref.armId),
    );
    const editable = await this.editableDays(term, closed);
    const lock = await this.lock(term, date, closed, editable);
    const register = await this.db.attendanceRegister.findFirst({
      where: { armId: ref.armId, date: fromIso(date) },
      include: {
        marks: true,
        takenByStaff: { select: { title: true, firstName: true, lastName: true } },
      },
    });
    const noRoll = lock && ['NO_SCHOOL', 'OUT_OF_TERM', 'FUTURE'].includes(lock.code);
    const roll = noRoll ? [] : await this.rollOn(term.sessionId, ref.armId, date);
    const rows = roll.map((e) => {
      const m = register?.marks.find((x) => x.studentId === e.studentId);
      return {
        studentId: e.studentId,
        name: `${e.student.firstName} ${e.student.surname}`,
        admissionNo: e.student.admissionNo,
        status: m ? MARK_LABEL[m.mark] : null,
        reason: m?.reason ?? '',
        guardianNotified: !!m?.guardianNotifiedAt,
      };
    });
    const counts = emptyCounts();
    for (const r of rows) if (r.status) counts[KEY[MARK_BY_LABEL[r.status]!]]++;
    const updated = register && register.updatedAt.getTime() - register.takenAt.getTime() > 1000;
    return {
      ...ref,
      date,
      today: this.attendance.today(),
      taken: !!register,
      takenBy: register?.takenByStaff ? staffName(register.takenByStaff) : null,
      takenAt: register ? TeacherScopeService.local(register.takenAt) : null,
      updatedAt: updated ? TeacherScopeService.local(register.updatedAt) : null,
      lock,
      rows,
      counts: { ...counts, unmarked: rows.filter((r) => !r.status).length },
      editableDays: editable,
      termStart: isoDate(term.startsOn),
      termEnd: isoDate(term.endsOn),
      history: register ? await this.audit.history('AttendanceRegister', register.id) : [],
    };
  }

  /** The day a register opens on: today, or a past term's last school day. */
  private async defaultDay(term: TermRow) {
    const today = this.attendance.today();
    if (today >= isoDate(term.startsOn) && today <= isoDate(term.endsOn)) return today;
    const { days } = await this.attendance.schoolDays(term, isoDate(term.endsOn));
    return days.at(-1) ?? isoDate(term.startsOn);
  }

  private static dateParam(value?: string) {
    if (value !== undefined && !isIso(value))
      throw AppException.validation({ date: 'Choose a valid date.' }, 'Choose a valid date.');
    return value;
  }

  async get(auth: AuthUserContext, termId?: string, date?: string) {
    const { term, ref } = await this.myArm(auth, termId);
    return this.day(ref, term, RegisterService.dateParam(date) ?? (await this.defaultDay(term)));
  }

  async save(auth: AuthUserContext, date: string, input: { marks?: MarkInput[] }, termId?: string) {
    RegisterService.dateParam(date);
    const { s, term, arm, ref } = await this.myArm(auth, termId);
    // A teacher replaced as class teacher keeps reading the registers they took, but only the
    // current class teacher takes new ones.
    const current = await this.db.classTeacherAssignment.findFirst({
      where: { armId: arm.id, sessionId: term.sessionId, endsOn: null },
      select: { staffId: true },
    });
    if (current?.staffId !== s.id)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        `You’re no longer the class teacher of ${arm.label}, so its register is read-only for you.`,
        'FORBIDDEN',
      );
    const { closed } = await this.attendance.schoolDays(
      term,
      undefined,
      await this.attendance.branchOfArm(arm.id),
    );
    const editable = await this.editableDays(term, closed);
    const lock = await this.lock(term, date, closed, editable);
    if (lock)
      throw new AppException(
        HttpStatus.CONFLICT,
        lock.reason,
        lock.code === 'TERM_LOCKED' ? 'TERM_LOCKED' : `REGISTER_${lock.code}`,
      );
    const roll = await this.rollOn(term.sessionId, arm.id, date);
    if (!Array.isArray(input?.marks))
      throw AppException.validation({}, 'Mark every student before saving.');
    const byId = new Map(
      input.marks.filter((m) => typeof m?.studentId === 'string').map((m) => [m.studentId, m]),
    );
    if ([...byId.keys()].some((id) => !roll.some((e) => e.studentId === id)))
      throw AppException.validation(
        {},
        'Some students in this register weren’t in the class on that day. Refresh and try again.',
      );
    const fields: Record<string, string> = {};
    const marks = new Map<string, { mark: AttendanceMark; reason: string | null }>();
    for (const e of roll) {
      const m = byId.get(e.studentId);
      const mark = m && MARK_BY_LABEL[m.status];
      if (!mark) {
        fields[e.studentId] = 'Choose Present, Absent, Late or Excused.';
        continue;
      }
      const reason = typeof m.reason === 'string' ? m.reason.trim() : '';
      if (mark === 'EXCUSED' && reason.length < 3) {
        fields[e.studentId] = 'Give a reason for Excused (e.g. Hospital appointment).';
        continue;
      }
      if (reason.length > 200) {
        fields[e.studentId] = 'Keep the reason or note under 200 characters.';
        continue;
      }
      marks.set(e.studentId, {
        mark,
        reason: mark === 'EXCUSED' || mark === 'ABSENT' ? reason || null : null,
      });
    }
    const missing = Object.keys(fields).length;
    if (missing)
      throw AppException.validation(
        fields,
        `${missing} student${missing === 1 ? ' needs' : 's need'} a mark or a reason before you can save.`,
      );

    const schoolId = TeacherScopeService.schoolId();
    const now = this.clock.now();
    const name = staffName(s);
    const notified: string[] = [];
    let flush: (() => Promise<void>) | null = null;
    await this.db.$transaction(async (tx) => {
      const existing = await tx.attendanceRegister.findFirst({
        where: { armId: arm.id, date: fromIso(date) },
        include: { marks: true },
      });
      const register =
        existing ??
        (await tx.attendanceRegister.create({
          data: {
            schoolId,
            termId: term.id,
            armId: arm.id,
            date: fromIso(date),
            takenById: auth.userId,
            takenByStaffId: s.id,
            takenAt: now,
          },
        }));
      if (existing)
        await tx.attendanceRegister.update({
          where: { id: existing.id },
          data: { updatedAt: now },
        });
      const before = new Map((existing?.marks ?? []).map((m) => [m.studentId, m]));
      // Students who left since are kept out of a re-save; their marks for the day stay.
      await tx.attendanceEntry.deleteMany({
        where: { registerId: register.id, studentId: { in: [...marks.keys()] } },
      });
      const newlyAbsent = [...marks].filter(
        ([id, m]) => m.mark === 'ABSENT' && before.get(id)?.mark !== 'ABSENT',
      );
      // Absence alerts to the guardians, through the school's Communication settings (the
      // event's switch, channels and wording; SMS only if switched on and units are left). A
      // student only counts as notified when at least one guardian was reached.
      const alerted = new Set<string>();
      if (newlyAbsent.length) {
        const links = await tx.studentGuardian.findMany({
          where: { studentId: { in: newlyAbsent.map(([id]) => id) } },
          include: {
            student: { select: { id: true, firstName: true, surname: true } },
            guardian: {
              select: {
                id: true,
                title: true,
                fullName: true,
                email: true,
                phone: true,
                membership: { select: { userId: true, status: true } },
              },
            },
          },
        });
        const guardian = (g: { title: string | null; fullName: string }) =>
          [g.title, g.fullName].filter(Boolean).join(' ');
        const sent = await this.comms.dispatch(asTx(tx), schoolId, {
          event: 'attendance.absent',
          title: `Absence alert · ${arm.label} · ${dayLabel(date)}`,
          audienceLabel:
            links.length === 1
              ? guardian(links[0]!.guardian)
              : `${links.length} guardians · ${arm.label}`,
          recipients: links.map((l) => ({
            key: `${l.guardianId}#${l.studentId}`,
            role: 'PARENT' as const,
            name: guardian(l.guardian),
            userId:
              l.guardian.membership?.status === 'ACTIVE' ? l.guardian.membership.userId : null,
            guardianId: l.guardianId,
            studentId: l.studentId,
            email: l.guardian.email,
            phone: l.guardian.phone,
            vars: {
              parent_name: guardian(l.guardian),
              student_name: `${l.student.firstName} ${l.student.surname}`,
              first_name: l.student.firstName,
              class: arm.label,
              date: dayLabel(date),
            },
            entity: { type: 'Student', id: l.student.id },
          })),
          createdById: auth.userId,
          source: { type: 'AttendanceRegister', id: register.id },
          inApp: { category: 'register', link: '/attendance' },
        });
        flush = sent.flush;
        for (const l of links)
          if (sent.reached.has(`${l.guardianId}#${l.studentId}`)) alerted.add(l.studentId);
        for (const [id] of newlyAbsent)
          if (alerted.has(id)) {
            const e = roll.find((x) => x.studentId === id)!;
            notified.push(`${e.student.firstName} ${e.student.surname}`);
          }
      }
      await tx.attendanceEntry.createMany({
        data: [...marks].map(([studentId, m]) => ({
          schoolId,
          registerId: register.id,
          studentId,
          termId: term.id,
          date: fromIso(date),
          mark: m.mark,
          reason: m.reason,
          // Set when guardians were told of this absence; kept while the student stays absent.
          guardianNotifiedAt:
            m.mark === 'ABSENT'
              ? alerted.has(studentId)
                ? now
                : (before.get(studentId)?.guardianNotifiedAt ?? null)
              : null,
        })),
      });
      const counts = emptyCounts();
      for (const m of marks.values()) counts[KEY[m.mark]]++;
      await this.audit.record(
        {
          action: existing ? 'register.update' : 'register.take',
          area: 'Academic',
          entity: 'AttendanceRegister',
          entityId: register.id,
          summary: existing ? `Register updated by ${name}` : `Register taken by ${name}`,
          detail: `${arm.label} · ${dayLabel(date)} · ${countsLabel(counts)}`,
        },
        asTx(tx),
      );
      if (notified.length)
        await this.audit.record(
          {
            action: 'register.absence_alert',
            area: 'Academic',
            entity: 'AttendanceRegister',
            entityId: register.id,
            summary: `Parents notified of ${plural(notified.length, 'absence')}`,
            detail: notified.join(', '),
          },
          asTx(tx),
        );
    });
    // Email and SMS go to the transports once the register is saved.
    if (flush) await (flush as () => Promise<void>)();
    return { register: await this.day(ref, term, date), notified };
  }

  async history(auth: AuthUserContext, termId?: string) {
    const { term, arm, ref } = await this.myArm(auth, termId);
    const today = this.attendance.today();
    const { days } = await this.attendance.schoolDays(
      term,
      undefined,
      await this.attendance.branchOfArm(arm.id),
    );
    const [registers, roll] = await Promise.all([
      this.db.attendanceRegister.findMany({
        where: { termId: term.id, armId: arm.id },
        include: {
          marks: { select: { studentId: true, mark: true } },
          takenByStaff: { select: { title: true, firstName: true, lastName: true } },
        },
      }),
      this.scope.rollSpans(term.sessionId, [arm.id]),
    ]);
    const byDate = new Map(registers.map((r) => [isoDate(r.date), r]));
    const dayRows = [...days].reverse().map((date) => {
      const r = byDate.get(date);
      const c = emptyCounts();
      for (const m of r?.marks ?? []) c[KEY[m.mark]]++;
      return {
        date,
        taken: !!r,
        takenBy: r?.takenByStaff ? staffName(r.takenByStaff) : null,
        takenAt: r ? TeacherScopeService.local(r.takenAt) : null,
        ...c,
        percent: r ? attendanceRate(c) : null,
        students: roll.filter((e) => covers(e.span, date)).length,
      };
    });
    const total = emptyCounts();
    for (const d of dayRows)
      for (const k of ['present', 'absent', 'late', 'excused'] as const) total[k] += d[k];
    const daySet = new Set(days);
    const students = roll.map((e) => {
      // A student who moved arms during the term shows here only for their days in this arm.
      const c = emptyCounts();
      for (const r of registers)
        if (daySet.has(isoDate(r.date)) && covers(e.span, isoDate(r.date)))
          for (const m of r.marks) if (m.studentId === e.studentId) c[KEY[m.mark]]++;
      const marked = c.present + c.absent + c.late + c.excused;
      return {
        studentId: e.studentId,
        name: `${e.student.firstName} ${e.student.surname}`,
        admissionNo: e.student.admissionNo,
        ...c,
        schoolDays: daysIn(e.span, days).length,
        percent: attendanceRate(c),
        marked,
        note: spanNote(e, term) ?? '',
      };
    });
    const taken = dayRows.filter((d) => d.taken).length;
    return {
      ...ref,
      term: `${term.session.name} · ${term.name}`,
      today,
      schoolDays: days.length,
      daysTaken: taken,
      notTaken: roll.length ? days.length - taken : 0,
      percent: attendanceRate(total),
      days: dayRows,
      students,
    };
  }
}

/** "Joined on …", "Moved in on …" or "Moved out on …" for a student's stretch in an arm. */
function spanNote(e: RollSpan, term: { startsOn: Date; endsOn: Date }): string | null {
  const start = isoDate(term.startsOn);
  const movedIn = e.armMoves.some((m) => isoDate(m.movedOn) === e.span.from);
  if (e.span.to && e.span.to < isoDate(term.endsOn) && e.armMoves.length)
    return `Moved to another class on ${dayLabel(addDays(e.span.to, 1))}`;
  if (movedIn && e.span.from > start) return `Moved in on ${dayLabel(e.span.from)}`;
  return joinedLate(e.enrolledOn, term);
}
