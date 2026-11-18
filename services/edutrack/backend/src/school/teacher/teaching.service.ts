import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Weekday } from '../../generated/prisma/enums.js';
import { isoDate, staffName } from '../academics/academic-format.js';
import {
  AttendanceService,
  attendanceRate,
  emptyCounts,
} from '../attendance/attendance.service.js';
import { hhmm } from '../timetable/timetable-format.js';
import {
  branchShort,
  joinedLate,
  TeacherScopeService,
  type TermRow,
} from './teacher-scope.service.js';

const WEEKDAY: Record<Weekday, 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
};
const DAY_ORDER: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const TERM_STATUS: Record<string, 'Closed' | 'Active' | 'Upcoming'> = {
  ACTIVE: 'Active',
  UPCOMING: 'Upcoming',
  ENDED: 'Closed',
  CLOSED: 'Closed',
};
const GENDER = { MALE: 'Male', FEMALE: 'Female' } as const;
const role = (type: string) =>
  type === 'PART_TIME' ? ('Part-time' as const) : ('Subject teacher' as const);

/**
 * Teacher Workspace (`<slug>.edutrack.ng/teacher`): the frame (who I am, terms and the clock, my
 * scope, search) and Teaching (my classes, subjects, students, timetable, lessons). Shapes follow
 * the Teacher Workspace mock (`teacher-portal/src/api/mock/handlers/shell.ts` and `teaching.ts`).
 * Results, assignments and materials arrive with their phases, so those parts are empty for now.
 */
@Injectable()
export class TeachingService {
  constructor(
    private readonly scope: TeacherScopeService,
    private readonly attendance: AttendanceService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.scope.db;
  }

  private today() {
    return this.attendance.today();
  }

  /* ---------------- Frame ---------------- */

  async me(auth: AuthUserContext) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term().catch(() => null);
    const [assignments, arm, branches] = await Promise.all([
      term ? this.scope.assignments(s.id, term.id) : [],
      term ? this.scope.classArm(s.id, term.sessionId) : null,
      this.scope.catalog.structure.activeBranches(),
    ]);
    const hod = s.hodOf[0] ?? null;
    const isAcademicHead = s.roleKeys.includes('academic_head');
    const reviews = { resultSheets: !!hod || isAcademicHead, lessonNotes: !!hod || isAcademicHead };
    const branchIds = new Set([
      ...(s.allBranches ? branches.map((b) => b.id) : s.branches.map((b) => b.branchId)),
      ...assignments.map((a) => a.arm.branchId),
    ]);
    return {
      teacher: {
        id: s.id,
        title: s.title ?? '',
        firstName: s.firstName,
        lastName: s.lastName,
        name: staffName(s),
        email: s.email,
        staffNo: s.staffNumber,
        position: s.positionTitle ?? 'Teacher',
        department: s.department ? { id: s.department.id, name: s.department.name } : null,
      },
      roles: [
        'Teacher' as const,
        ...(hod ? (['HOD'] as const) : []),
        ...(isAcademicHead ? (['Academic Head'] as const) : []),
      ],
      isClassTeacher: !!arm,
      classArm: arm
        ? { id: arm.id, name: arm.label, branchId: arm.branchId, branchName: arm.branch }
        : null,
      isHod: !!hod,
      hodOf: hod ? { id: hod.id, name: hod.name } : null,
      isAcademicHead,
      reviews,
      isReviewer: reviews.resultSheets || reviews.lessonNotes,
      branches: branches
        .filter((b) => branchIds.has(b.id))
        .map((b) => ({ id: b.id, name: b.name, short: branchShort(b.name) })),
      hasAssignments: assignments.length > 0,
      profileComplete: !!s.phone?.trim(),
    };
  }

  static termSummary(t: TermRow) {
    return {
      id: t.id,
      sessionName: t.session.name,
      name: t.name,
      label: `${t.session.name} · ${t.name}`,
      status: TERM_STATUS[t.status] ?? 'Closed',
      start: isoDate(t.startsOn),
      end: isoDate(t.endsOn),
      resultEntryCloses: t.resultEntryClosesAt
        ? TeacherScopeService.local(t.resultEntryClosesAt)
        : null,
      resultsPublication: null as string | null,
      lockReason: TeacherScopeService.lockReason(t),
    };
  }

  async context() {
    const [terms, school] = await Promise.all([
      this.scope.terms(),
      // `School` isn't tenant-scoped: look it up by the request's school.
      this.db.school.findUnique({
        where: { id: TeacherScopeService.schoolId() },
        select: { name: true },
      }),
    ]);
    const active = terms.find((t) => t.status === 'ACTIVE') ?? null;
    const today = this.today();
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    let closedReason: string | null = weekday === 0 || weekday === 6 ? 'Weekend' : null;
    const calendar: { id: string; kind: string; title: string; from: string; to: string }[] = [];
    if (active) {
      const closed = await this.attendance.closures(active);
      closedReason ??= closed.get(today) ?? null;
      if (today < isoDate(active.startsOn) || today > isoDate(active.endsOn))
        closedReason ??= 'Outside the term';
      const events = await this.db.termEvent.findMany({
        where: { termId: active.id },
        orderBy: { startsOn: 'asc' },
      });
      const KIND: Record<string, string> = {
        MIDTERM: 'break',
        EXAMS: 'exams',
        RESULTS: 'publication',
        CA: 'deadline',
      };
      calendar.push(
        {
          id: `term-${active.id}`,
          kind: 'term',
          title: active.name,
          from: isoDate(active.startsOn),
          to: isoDate(active.endsOn),
        },
        ...events.map((e) => ({
          id: e.id,
          kind: KIND[e.type] ?? 'term',
          title: e.name,
          from: isoDate(e.startsOn),
          to: isoDate(e.endsOn),
        })),
      );
      for (const [date, name] of closed)
        if (!events.some((e) => e.name === name))
          calendar.push({
            id: `closed-${date}`,
            kind: 'holiday',
            title: name,
            from: date,
            to: date,
          });
    } else closedReason ??= 'No term is running';
    return {
      terms: terms.map(TeachingService.termSummary),
      activeTermId: active?.id ?? null,
      today,
      now: TeacherScopeService.local(this.clock.now()),
      isSchoolDay: closedReason === null,
      closedReason,
      entryDeadline: active?.resultEntryClosesAt
        ? TeacherScopeService.local(active.resultEntryClosesAt)
        : null,
      calendar: calendar.sort((a, b) => a.from.localeCompare(b.from)),
      school: { name: school?.name ?? '', academicOffice: 'the academic office' },
    };
  }

  private async summaries(staffId: string, term: TermRow) {
    const rows = await this.scope.assignments(staffId, term.id);
    return Promise.all(
      rows.map(async (a) => ({
        a,
        students: await this.scope.studentsFor(term.sessionId, a),
      })),
    );
  }

  async myScope(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const [list, arm] = await Promise.all([
      this.summaries(s.id, term),
      this.scope.classArm(s.id, term.sessionId),
    ]);
    const assignments = list.map(({ a, students }) => ({
      id: a.id,
      termId: term.id,
      armId: a.armId,
      armName: a.arm.label,
      subject: a.subject.code,
      subjectName: a.subject.name,
      branchId: a.arm.branchId,
      branchName: a.arm.branch,
      periodsPerWeek: a.periodsPerWeek,
      students: students.length,
      type: a.type === 'PART_TIME' ? ('Part-time' as const) : ('Full-time' as const),
    }));
    return {
      termId: term.id,
      assignments,
      classArm: arm
        ? {
            id: arm.id,
            name: arm.label,
            branchName: arm.branch,
            students: (await this.scope.roll(term.sessionId, [arm.id])).length,
          }
        : null,
      multiCampus: new Set(assignments.map((a) => a.branchId)).size > 1,
    };
  }

  /** My classes, subjects and students, plus pages, for the command menu. */
  async search(auth: AuthUserContext, q = '', termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const list = await this.summaries(s.id, term);
    const multi = new Set(list.map(({ a }) => a.arm.branchId)).size > 1;
    const classes = list.map(({ a, students }) => ({
      id: a.id,
      type: 'Class' as const,
      title: `${a.arm.label} · ${a.subject.name}`,
      meta: `${multi ? `${a.arm.branch} · ` : ''}${students.length} students · ${a.periodsPerWeek} periods a week`,
      to: { name: 'class', params: { armId: a.armId, subject: a.subject.code } },
    }));
    const codes = [...new Set(list.map(({ a }) => a.subject.code))];
    const subjects = codes.map((code) => {
      const mine = list.filter(({ a }) => a.subject.code === code);
      return {
        id: `subject-${code}`,
        type: 'Subject' as const,
        title: mine[0]!.a.subject.name,
        meta: mine.map(({ a }) => a.arm.label).join(', '),
        to: { name: 'subject', params: { subject: code } },
      };
    });
    const seen = new Set<string>();
    const students = list.flatMap(({ a, students: roll }) =>
      roll
        .filter((e) => !seen.has(e.studentId) && seen.add(e.studentId))
        .map((e) => ({
          id: e.studentId,
          type: 'Student' as const,
          title: `${e.student.firstName} ${e.student.surname}`,
          meta: `${e.student.admissionNo} · ${a.arm.label}`,
          to: { name: 'student', params: { studentId: e.studentId } },
        })),
    );
    const pages = [
      ['Timetable', 'timetable', 'My week'],
      ['Results', 'results', 'Score sheets for the term'],
      ['Assignments', 'assignments', 'Homework and submissions'],
      ['Profile', 'profile', 'Phone, password and devices'],
    ].map(([title, name, meta]) => ({
      id: `page-${name}`,
      type: 'Page' as const,
      title: title!,
      meta: meta!,
      to: { name: name! },
    }));
    const needle = q.trim().toLowerCase();
    if (!needle) return [...classes, ...pages].slice(0, 9);
    return [...classes, ...subjects, ...students, ...pages]
      .filter((x) => `${x.title} ${x.meta}`.toLowerCase().includes(needle))
      .slice(0, 9);
  }

  /* ---------------- Teaching ---------------- */

  private teachingClass(
    a: Awaited<ReturnType<TeacherScopeService['assignments']>>[number],
    term: TermRow,
    students: number,
    classArmId: string | null,
  ) {
    return {
      id: a.id,
      termId: term.id,
      armId: a.armId,
      armName: a.arm.label,
      section: '',
      subject: a.subject.code,
      subjectName: a.subject.name,
      branchId: a.arm.branchId,
      branchName: a.arm.branch,
      branchShort: branchShort(a.arm.branch),
      students,
      periodsPerWeek: a.periodsPerWeek,
      role: role(a.type),
      isClassTeacher: classArmId === a.armId,
      rooms: a.arm.room ? [a.arm.room] : [],
      // Result sheets arrive with Phase 3b.
      sheet: null,
    };
  }

  private async sectionCodes() {
    const sections = await this.scope.catalog.structure.sections();
    return new Map(sections.map((s) => [s.id, s.code]));
  }

  async classes(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const [list, arm, codes] = await Promise.all([
      this.summaries(s.id, term),
      this.scope.classArm(s.id, term.sessionId),
      this.sectionCodes(),
    ]);
    return {
      ...TeacherScopeService.termLock(term),
      multiCampus: new Set(list.map(({ a }) => a.arm.branchId)).size > 1,
      classes: list.map(({ a, students }) => ({
        ...this.teachingClass(a, term, students.length, arm?.id ?? null),
        section: codes.get(a.arm.sectionId) ?? '',
      })),
    };
  }

  private async mine(
    auth: AuthUserContext,
    termId: string | undefined,
    armId: string,
    subject: string,
  ) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const list = await this.scope.assignments(s.id, term.id);
    const a = list.find((x) => x.armId === armId && x.subject.code === subject);
    if (!a)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'You don’t teach this class this term.',
        'FORBIDDEN',
      );
    return { s, term, a, list };
  }

  /** The next time a published lesson of this arm and subject happens (now counts). */
  private async nextLesson(termId: string, armId: string, subjectId: string, staffId: string) {
    const slots = await this.db.timetableSlot.findMany({
      where: { termId, layer: 'PUBLISHED', subjectId, staffId, timetable: { armId } },
      include: { period: true, timetable: { select: { arm: { select: { room: true } } } } },
    });
    return this.firstOccurrence(slots, termId);
  }

  private async firstOccurrence(
    slots: {
      id: string;
      day: Weekday;
      period: { id: string; label: string; startsAt: Date; endsAt: Date; sortOrder: number };
      timetable: { arm: { room: string | null } };
    }[],
    termId: string,
  ) {
    if (!slots.length) return null;
    const term = await this.db.term.findFirst({ where: { id: termId } });
    if (!term) return null;
    const now = TeacherScopeService.local(this.clock.now());
    const [today, time] = now.split('T') as [string, string];
    const closed = await this.attendance.closures({ ...term, sessionId: term.sessionId });
    const last = isoDate(term.endsOn);
    for (
      let d = today < isoDate(term.startsOn) ? isoDate(term.startsOn) : today;
      d <= last;
      d = isoDate(new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000))
    ) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (wd === 0 || wd === 6 || closed.has(d)) continue;
      const day = DAY_ORDER[wd - 1]!;
      const todays = slots
        .filter((x) => x.day === day && (d > today || hhmm(x.period.endsAt) > time))
        .sort((x, y) => x.period.sortOrder - y.period.sortOrder);
      const first = todays[0];
      if (first)
        return {
          lessonId: first.id,
          date: d,
          day: WEEKDAY[day],
          periodId: `P${first.period.sortOrder}`,
          periodLabel: `Period ${first.period.label}`,
          start: hhmm(first.period.startsAt),
          end: hhmm(first.period.endsAt),
          room: first.timetable.arm.room ?? '',
          inProgress: d === today && hhmm(first.period.startsAt) <= time,
        };
    }
    return null;
  }

  async classDetail(auth: AuthUserContext, armId: string, subject: string, termId?: string) {
    const { s, term, a, list } = await this.mine(auth, termId, armId, subject);
    const [students, ct, arm, codes, next] = await Promise.all([
      this.scope.studentsFor(term.sessionId, a),
      this.scope.classTeacherOf(armId, term.sessionId),
      this.scope.classArm(s.id, term.sessionId),
      this.sectionCodes(),
      this.nextLesson(term.id, armId, a.subjectId, s.id),
    ]);
    const dept = a.subject.department;
    return {
      ...TeacherScopeService.termLock(term),
      class: {
        ...this.teachingClass(a, term, students.length, arm?.id ?? null),
        section: codes.get(a.arm.sectionId) ?? '',
      },
      multiCampus: new Set(list.map((x) => x.arm.branchId)).size > 1,
      classTeacher: ct,
      department: dept
        ? { id: dept.id, name: dept.name, hod: dept.hod ? staffName(dept.hod) : null }
        : { id: '', name: 'No department', hod: null },
      nextLesson: next,
      students: students.map((e) => ({
        id: e.studentId,
        name: `${e.student.firstName} ${e.student.surname}`,
        admissionNo: e.student.admissionNo,
        gender: GENDER[e.student.gender as keyof typeof GENDER] ?? 'Male',
        joinedLate: joinedLate(e.enrolledOn, term),
      })),
      results: null,
    };
  }

  private async subjectList(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const list = await this.summaries(s.id, term);
    const codes = [...new Set(list.map(({ a }) => a.subject.code))];
    const subjects = codes.map((code) => {
      const mine = list.filter(({ a }) => a.subject.code === code);
      const subj = mine[0]!.a.subject;
      const dept = subj.department;
      return {
        code,
        name: subj.name,
        department: dept
          ? { id: dept.id, name: dept.name, hod: dept.hod ? staffName(dept.hod) : null }
          : { id: '', name: 'No department', hod: null },
        classes: mine.map(({ a, students }) => ({
          armId: a.armId,
          armName: a.arm.label,
          branchName: a.arm.branch,
          branchShort: branchShort(a.arm.branch),
          students: students.length,
          periodsPerWeek: a.periodsPerWeek,
          role: role(a.type),
        })),
        students: mine.reduce((n, x) => n + x.students.length, 0),
        periodsPerWeek: mine.reduce((n, x) => n + x.a.periodsPerWeek, 0),
      };
    });
    return {
      term,
      list,
      subjects,
      multiCampus: new Set(list.map(({ a }) => a.arm.branchId)).size > 1,
    };
  }

  async subjects(auth: AuthUserContext, termId?: string) {
    const { term, subjects, multiCampus } = await this.subjectList(auth, termId);
    return { ...TeacherScopeService.termLock(term), multiCampus, subjects };
  }

  async subjectDetail(auth: AuthUserContext, code: string, termId?: string) {
    const { term, list, subjects, multiCampus } = await this.subjectList(auth, termId);
    const subject = subjects.find((x) => x.code === code);
    if (!subject)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'You don’t teach this subject this term.',
        'FORBIDDEN',
      );
    const sectionIds = [
      ...new Set(list.filter(({ a }) => a.subject.code === code).map(({ a }) => a.arm.sectionId)),
    ];
    const schemes = await this.db.assessmentScheme.findMany({
      where: { sessionId: term.sessionId, sectionId: { in: sectionIds }, mode: 'SCORES' },
      include: {
        section: { select: { code: true } },
        components: { orderBy: { sortOrder: 'asc' } },
        gradeBands: { orderBy: { sortOrder: 'asc' } },
      },
    });
    return {
      ...TeacherScopeService.termLock(term),
      subject,
      multiCampus,
      schemes: schemes.map((x) => ({
        section: x.section.code,
        components: x.components.map((c) => ({
          key: c.key,
          name: c.name,
          max: Number(c.maxScore),
          weight: Number(c.weight),
        })),
        scaleName: x.scaleName,
        scale: x.gradeBands.map((g) => ({
          grade: g.grade,
          min: Number(g.minScore),
          max: Number(g.maxScore),
          remark: g.remark,
          points: Number(g.points),
          pass: g.isPass,
        })),
      })),
    };
  }

  /** Everyone I teach this term (once each, with my subjects for them), filtered and paged. */
  async students(
    auth: AuthUserContext,
    q: {
      term?: string;
      class?: string;
      subject?: string;
      q?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(q.term);
    const list = await this.summaries(s.id, term);
    const rows = new Map<string, ReturnType<typeof makeRow>>();
    function makeRow(e: (typeof list)[number]['students'][number], a: (typeof list)[number]['a']) {
      return {
        id: e.studentId,
        name: `${e.student.firstName} ${e.student.surname}`,
        admissionNo: e.student.admissionNo,
        gender: GENDER[e.student.gender as keyof typeof GENDER] ?? 'Male',
        armId: a.armId,
        armName: a.arm.label,
        branchShort: branchShort(a.arm.branch),
        subjects: [] as { code: string; name: string; armId: string }[],
        joinedLate: joinedLate(e.enrolledOn, term),
      };
    }
    for (const { a, students } of list) {
      if (q.class && a.armId !== q.class) continue;
      if (q.subject && a.subject.code !== q.subject) continue;
      for (const e of students) {
        const row = rows.get(e.studentId) ?? makeRow(e, a);
        row.subjects.push({ code: a.subject.code, name: a.subject.name, armId: a.armId });
        rows.set(e.studentId, row);
      }
    }
    const needle = (q.q ?? '').trim().toLowerCase();
    const all = [...rows.values()]
      .filter((r) => !needle || `${r.name} ${r.admissionNo}`.toLowerCase().includes(needle))
      .sort((x, y) => x.armName.localeCompare(y.armName) || x.name.localeCompare(y.name));
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 20, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    return {
      ...TeacherScopeService.termLock(term),
      data: all.slice((page - 1) * pageSize, page * pageSize),
      meta: {
        page,
        pageSize,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
      },
    };
  }

  async studentDetail(auth: AuthUserContext, studentId: string, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const enrollment = await this.db.enrollment.findFirst({
      where: { sessionId: term.sessionId, studentId, armId: { not: null } },
      include: { student: true },
      orderBy: { enrolledOn: 'desc' },
    });
    if (!enrollment?.armId) throw AppException.notFound('That student doesn’t exist.', 'NOT_FOUND');
    const [list, myArm] = await Promise.all([
      this.summaries(s.id, term),
      this.scope.classArm(s.id, term.sessionId),
    ]);
    const mySubjects = list
      .filter(({ students }) => students.some((e) => e.studentId === studentId))
      .map(({ a }) => ({ code: a.subject.code, name: a.subject.name, armId: a.armId }));
    const isMyClassStudent = myArm?.id === enrollment.armId;
    if (!mySubjects.length && !isMyClassStudent)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'You don’t teach this student this term.',
        'FORBIDDEN',
      );
    const [arm, ct, codes, entries, days] = await Promise.all([
      this.scope.catalog.arm(enrollment.armId),
      this.scope.classTeacherOf(enrollment.armId, term.sessionId),
      this.sectionCodes(),
      this.db.attendanceEntry.findMany({
        where: { studentId, termId: term.id },
        select: { mark: true },
      }),
      this.attendance.schoolDays(term),
    ]);
    const c = emptyCounts();
    for (const e of entries) c[e.mark.toLowerCase() as keyof typeof c]++;
    const st = enrollment.student;
    return {
      ...TeacherScopeService.termLock(term),
      id: st.id,
      name: `${st.firstName} ${st.surname}`,
      firstName: st.firstName,
      lastName: st.surname,
      admissionNo: st.admissionNo,
      gender: GENDER[st.gender as keyof typeof GENDER] ?? 'Male',
      status: enrollment.status === 'LEFT' ? ('Transferred' as const) : ('Active' as const),
      armId: enrollment.armId,
      armName: arm?.label ?? '',
      branchName: arm?.branch ?? '',
      section: arm ? (codes.get(arm.sectionId) ?? '') : '',
      joinedSchool: isoDate(st.admittedOn ?? enrollment.enrolledOn),
      joinedLate: joinedLate(enrollment.enrolledOn, term),
      leftOn: enrollment.leftOn ? isoDate(enrollment.leftOn) : null,
      classTeacher: ct,
      isMyClassStudent,
      mySubjects,
      // Scores and results arrive with Phase 3b.
      scores: [],
      results: [],
      pastResults: [],
      attendance: { ...c, schoolDays: days.days.length, percent: attendanceRate(c) },
    };
  }

  /* ---------------- Timetable ---------------- */

  private async myLessons(staffId: string, termId: string) {
    const slots = await this.db.timetableSlot.findMany({
      where: { termId, layer: 'PUBLISHED', staffId },
      include: {
        period: true,
        subject: { select: { code: true, name: true } },
        timetable: { select: { armId: true, publishedAt: true, arm: { select: { room: true } } } },
      },
    });
    const arms = new Map((await this.scope.catalog.arms()).map((a) => [a.id, a]));
    return slots
      .filter((x) => arms.has(x.timetable.armId))
      .map((x) => {
        const arm = arms.get(x.timetable.armId)!;
        return {
          slot: x,
          lesson: {
            id: x.id,
            day: WEEKDAY[x.day],
            periodId: `P${x.period.sortOrder}`,
            periodLabel: x.period.label,
            start: hhmm(x.period.startsAt),
            end: hhmm(x.period.endsAt),
            armId: arm.id,
            armName: arm.label,
            subject: x.subject.code,
            subjectName: x.subject.name,
            room: x.timetable.arm.room ?? '',
            branchId: arm.branchId,
            branchName: arm.branch,
            branchShort: branchShort(arm.branch),
          },
        };
      })
      .sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.slot.day) - DAY_ORDER.indexOf(b.slot.day) ||
          a.lesson.start.localeCompare(b.lesson.start),
      );
  }

  async timetable(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const lessons = await this.myLessons(s.id, term.id);
    // The bell schedule of the section most of my lessons are in (sections usually share one).
    const sectionId = lessons[0]?.slot.period.sectionId;
    const periods = sectionId
      ? await this.db.timetablePeriod.findMany({
          where: { sectionId },
          orderBy: { sortOrder: 'asc' },
        })
      : [];
    const now = TeacherScopeService.local(this.clock.now());
    const [today, time] = now.split('T') as [string, string];
    const wd = new Date(`${today}T00:00:00Z`).getUTCDay();
    const closed =
      term.status === 'ACTIVE' ? await this.attendance.closures(term) : new Map<string, string>();
    let todayNote: string | null = null;
    if (term.status !== 'ACTIVE') todayNote = 'This term isn’t running.';
    else if (today < isoDate(term.startsOn) || today > isoDate(term.endsOn))
      todayNote = 'Today is outside the term.';
    else if (wd === 0 || wd === 6) todayNote = 'No lessons at the weekend.';
    else if (closed.has(today)) todayNote = `No lessons today: ${closed.get(today)}.`;
    const todayDay = todayNote ? null : WEEKDAY[DAY_ORDER[wd - 1]!];
    const todays = todayDay
      ? lessons.filter((l) => l.lesson.day === todayDay).map((l) => l.lesson)
      : [];
    let nextGiven = false;
    const todayLessons = todays.map((l) => {
      let status: 'Done' | 'Now' | 'Next' | 'Later' = 'Later';
      if (l.end <= time) status = 'Done';
      else if (l.start <= time) status = 'Now';
      else if (!nextGiven) {
        status = 'Next';
        nextGiven = true;
      }
      return { ...l, status };
    });
    const published = lessons
      .map((l) => l.slot.timetable.publishedAt)
      .filter((d): d is Date => !!d);
    return {
      ...TeacherScopeService.termLock(term),
      published: lessons.length > 0,
      publishedOn: published.length
        ? // "YYYY-MM-DD", in Lagos time; the screen formats it.
          TeacherScopeService.local(new Date(Math.max(...published.map((d) => d.getTime())))).slice(
            0,
            10,
          )
        : null,
      periods: periods.map((p) => ({
        id: `P${p.sortOrder}`,
        label: p.label,
        start: hhmm(p.startsAt),
        end: hhmm(p.endsAt),
        isBreak: p.isBreak,
      })),
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const,
      multiCampus: new Set(lessons.map((l) => l.lesson.branchId)).size > 1,
      todayDay,
      today,
      todayNote,
      lessons: lessons.map((l) => l.lesson),
      todayLessons,
    };
  }

  async lesson(auth: AuthUserContext, lessonId: string, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const lessons = await this.myLessons(s.id, term.id);
    const found = lessons.find((l) => l.lesson.id === lessonId);
    if (!found) throw AppException.notFound('That lesson isn’t on your timetable.', 'NOT_FOUND');
    const [roll, ct, codes, next] = await Promise.all([
      this.scope.roll(term.sessionId, [found.lesson.armId]),
      this.scope.classTeacherOf(found.lesson.armId, term.sessionId),
      this.sectionCodes(),
      this.firstOccurrence([found.slot], term.id),
    ]);
    const arm = await this.scope.catalog.arm(found.lesson.armId);
    return {
      ...TeacherScopeService.termLock(term),
      lesson: found.lesson,
      section: arm ? (codes.get(arm.sectionId) ?? '') : '',
      students: roll.length,
      classTeacher: ct,
      multiCampus: new Set(lessons.map((l) => l.lesson.branchId)).size > 1,
      next,
      // Assignments and materials arrive with their phase.
      openAssignment: null,
      latestMaterial: null,
    };
  }
}
