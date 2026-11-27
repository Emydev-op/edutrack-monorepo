import { boardingOf, type BoardingPlace } from '../boarding/boarding-use.js';
import { Injectable } from '@nestjs/common';
import { campusBrands, type CampusBrand } from '../shared/campus-brand.js';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { initialsOf } from '../../auth/identifiers.js';
import { leftOnOf, readOnlyUntil } from '../../auth/school-portal-rules.js';
import type { Weekday } from '../../generated/prisma/enums.js';
import { fmtDate, isoDate, staffName } from '../academics/academic-format.js';
import { STUDENT_STATUS_LABEL } from '../guardians/family-records.js';
import { FamilyHomeworkService } from '../homework/family-homework.service.js';
import { DAY_LABEL, DAYS, hhmm } from '../timetable/timetable-format.js';
import { ParentFeesService } from './parent-fees.service.js';
import { ParentResultsService } from './parent-results.service.js';
import {
  guardianDisplay,
  ParentScopeService,
  type ChildScope,
  type ChildPlace,
  type ParentTerm,
  type StudentRef,
} from './parent-scope.service.js';

const MARK = { PRESENT: 'Present', LATE: 'Late', ABSENT: 'Absent', EXCUSED: 'Excused' } as const;
const AUDIENCE: Record<string, string> = {
  EVERYONE: 'Everyone',
  PARENTS: 'Parents',
  STUDENTS: 'Students',
  CLASSES: 'Classes',
};
const WEEKDAY_OF: Record<number, Weekday | undefined> = {
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
};

/** A child as the switcher, Home cards and My children list show them. */
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
  access: 'full' | 'read-only';
  leftOn: string | null;
  readOnlyUntil: string | null;
  /** Primary pupils hand in through a parent; JSS and SSS students hand in themselves. */
  handsInThrough: 'student' | 'guardian';
  fees: { outstanding: number; pending: number; overdue: boolean };
  /** The child's campus: the portal is themed in it while this child is selected. */
  campus: CampusBrand | null;
  /** A boarder this session (null: a day student): their hostel place, once given one. */
  boarding: { placed: boolean; place: BoardingPlace | null } | null;
}

/**
 * The rest of the Parent Portal: the shell (parent, school, term, children), Home, a child's page,
 * timetable, attendance and the school's announcements. Every child-specific read is scoped by
 * `ParentScopeService.child()`.
 */
@Injectable()
export class ParentSchoolService {
  constructor(
    private readonly scope: ParentScopeService,
    private readonly fees: ParentFeesService,
    private readonly results: ParentResultsService,
    private readonly homework: FamilyHomeworkService,
  ) {}

  private get db() {
    return this.scope.db;
  }

  /* ---------------- Shell ---------------- */

  /** The parent's children with their class, fees badge and access, by first name. */
  async childList(auth: AuthUserContext): Promise<ChildSummary[]> {
    const { links } = await this.scope.children(auth);
    const ids = links.map((l) => l.studentId);
    const [students, fees, terms] = await Promise.all([
      this.db.student.findMany({ where: { id: { in: ids } } }),
      this.fees.summaries(auth, ids),
      this.scope.terms(),
    ]);
    const campuses = await campusBrands(
      this.db,
      students.map((s) => s.branchId),
    );
    const current = ParentScopeService.current(terms, this.scope.today());
    const boarders = current ? await boardingOf(this.db, ids, current.sessionId) : new Map();
    const out: ChildSummary[] = [];
    for (const l of links) {
      const s = students.find((x) => x.id === l.studentId)!;
      const place =
        (current && (await this.scope.place(s.id, current.sessionId))) ??
        (await this.lastPlace(s.id));
      const left = l.access === 'read-only' ? leftOnOf(s) : null;
      out.push({
        id: s.id,
        name: `${s.firstName} ${s.surname}`,
        firstName: s.firstName,
        initials: initialsOf(`${s.firstName} ${s.surname}`),
        admissionNo: s.admissionNo,
        className: place?.className ?? '',
        branch: place?.branch ?? '',
        status: STUDENT_STATUS_LABEL[s.status],
        relationship: l.relationship,
        isPrimary: l.isPrimary,
        paysFees: l.paysFees,
        access: l.access,
        leftOn: left ? isoDate(left) : null,
        readOnlyUntil: left ? isoDate(readOnlyUntil(left)) : null,
        handsInThrough: place?.studentLogins ? 'student' : 'guardian',
        fees: fees.get(s.id) ?? { outstanding: 0, pending: 0, overdue: false },
        campus: campuses.get(s.branchId) ?? null,
        boarding: l.access === 'full' ? (boarders.get(s.id) ?? null) : null,
      });
    }
    return out;
  }

  /** A leaver's last class. */
  private async lastPlace(studentId: string) {
    const e = await this.db.enrollment.findFirst({
      where: { studentId, armId: { not: null } },
      orderBy: { session: { startsOn: 'desc' } },
      select: { sessionId: true },
    });
    return e ? this.scope.place(studentId, e.sessionId) : null;
  }

  /** `GET /v1/parent/overview`: who is signed in, the school, the term and the children. */
  async overview(auth: AuthUserContext) {
    const guardian = await this.scope.guardian(auth);
    const [children, user, school, terms] = await Promise.all([
      this.childList(auth),
      this.db.user.findUniqueOrThrow({ where: { id: auth.userId } }),
      this.db.school.findUniqueOrThrow({ where: { id: auth.schoolId! } }),
      this.scope.terms(),
    ]);
    const term = ParentScopeService.current(terms, this.scope.today());
    return {
      parent: {
        name: guardianDisplay(guardian),
        firstName: user.firstName,
        email: user.email ?? '',
      },
      school: {
        name: school.name,
        initials: initialsOf(school.name),
        phone: school.phone,
        email: school.email,
        address: [school.street, school.city, school.state].filter(Boolean).join(', ') || null,
      },
      today: this.scope.today(),
      term: term
        ? {
            id: term.id,
            name: term.name,
            session: term.session,
            label: term.label,
            endsOn: isoDate(term.endsOn),
          }
        : null,
      children,
    };
  }

  /* ---------------- A child ---------------- */

  /** `GET /v1/parent/children/:id`: enrolment, this term at a glance, guardians on record. */
  async child(auth: AuthUserContext, scope: ChildScope) {
    const id = scope.student.id;
    const all = await this.childList(auth);
    const summary = all.find((c) => c.id === id)!;
    const { term } = await this.scope.termFor(id);
    const place = await this.scope.place(id, term.sessionId);
    const [classTeacher, results, attendance, hw, guardians] = await Promise.all([
      place ? this.scope.classTeacher(place.armId, term) : null,
      this.results.latest(scope),
      this.attendanceSummary(id, term.id),
      this.homework.homework(id, term.id, { guardian: true, full: scope.link.access === 'full' }),
      this.db.studentGuardian.findMany({
        where: { studentId: id, guardian: { deletedAt: null, mergedIntoId: null } },
        include: { guardian: { select: { id: true, title: true, fullName: true } } },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      child: summary,
      enrolment: {
        session: term.session,
        term: term.name,
        className: place?.className ?? summary.className,
        branch: place?.branch ?? summary.branch,
        classTeacher,
        admissionNo: scope.student.admissionNo,
        admittedOn: fmtDate(scope.student.admittedOn),
        status: summary.status,
      },
      thisTerm: {
        term: term.label,
        fees: summary.fees,
        results,
        assignmentsToDo: hw.assignments.filter(
          (a) => a.status === 'Not submitted' && !a.pastDue && a.assignmentStatus !== 'Closed',
        ).length,
        attendance,
      },
      // Other guardians by name and relationship only: no contact details.
      guardians: guardians.map((g) => ({
        name: guardianDisplay(g.guardian),
        relationship: g.relationship,
        you: g.guardianId === scope.guardian.id,
        paysFees: g.guardianId === scope.guardian.id ? g.paysFees : undefined,
      })),
    };
  }

  /* ---------------- Home ---------------- */

  /** `GET /v1/parent/children/:id/home`: alerts, latest result, homework, today, announcements. */
  async home(auth: AuthUserContext, scope: ChildScope) {
    const id = scope.student.id;
    const { term } = await this.scope.termFor(id);
    const [fees, latest, hw, today, news, absences] = await Promise.all([
      this.fees.fees(auth, scope),
      this.results.latest(scope),
      this.homework.homework(id, term.id, { guardian: true, full: scope.link.access === 'full' }),
      this.todayLessons(id, term),
      this.announcements(auth, id, 3),
      this.db.attendanceEntry.findMany({
        where: { studentId: id, termId: term.id, mark: 'ABSENT' },
        orderBy: { date: 'desc' },
        take: 1,
      }),
    ]);
    const first = scope.student.firstName;
    const alerts: {
      kind: string;
      tone: 'error' | 'warning' | 'info' | 'success';
      title: string;
      text: string;
      action: { label: string; to: string } | null;
    }[] = [];
    const overdue = fees.current?.installments.find((i) => i.status === 'Overdue');
    if (fees.totals.outstanding > 0 && (fees.totals.overdue || overdue)) {
      const amount = overdue ? overdue.amount - overdue.paid : fees.totals.outstanding;
      const several = (fees.current?.installments.length ?? 0) > 1;
      const due = overdue ? ` was due ${fmtDate(overdue.due, false)}` : ' is overdue';
      alerts.push({
        kind: 'fees-overdue',
        tone: 'error',
        title: overdue && several ? `${overdue.label} is overdue` : 'Fees are overdue',
        text: `${naira(amount)}${due} for ${first}. Total outstanding ${naira(fees.totals.outstanding)}.`,
        action: fees.canPay
          ? { label: 'Pay now', to: '/fees/pay' }
          : { label: 'View fees', to: '/fees' },
      });
    }
    if (fees.totals.pending > 0)
      alerts.push({
        kind: 'fees-pending',
        tone: 'warning',
        title: `${naira(fees.totals.pending)} transfer being verified`,
        text: 'Your balance updates once the school confirms the transfer.',
        action: null,
      });
    const lastAbsence = absences[0];
    if (lastAbsence && isoDate(lastAbsence.date) >= addDaysIso(this.scope.today(), -7))
      alerts.push({
        kind: 'absent',
        tone: 'info',
        title: `${first} was absent on ${fmtDate(lastAbsence.date, false)}`,
        text: lastAbsence.reason ?? 'Recorded by the class teacher.',
        action: { label: 'Attendance', to: '/attendance' },
      });
    const order = (a: { status: string }) => (a.status === 'Not submitted' ? 0 : 1);
    return {
      term: term.label,
      alerts,
      latestResult: latest,
      homework: [...hw.assignments]
        .sort((a, b) => order(a) - order(b) || b.dueAt!.localeCompare(a.dueAt!))
        .slice(0, 3)
        .map((a) => ({
          id: a.id,
          title: a.title,
          subjectName: a.subjectName,
          teacherName: a.teacherName,
          dueAt: a.dueAt,
          status: a.status,
          pastDue: a.pastDue,
        })),
      today,
      announcements: news,
    };
  }

  /* ---------------- Timetable ---------------- */

  private async week(armId: string, termId: string) {
    const tt = await this.db.timetable.findFirst({ where: { armId, termId } });
    if (!tt?.publishedVersion) return null;
    const arm = await this.db.classArm.findFirstOrThrow({
      where: { id: armId },
      select: { level: { select: { sectionId: true } } },
    });
    const [periods, slots] = await Promise.all([
      this.db.timetablePeriod.findMany({
        where: { sectionId: arm.level.sectionId },
        orderBy: { sortOrder: 'asc' },
      }),
      this.db.timetableSlot.findMany({
        where: { timetableId: tt.id, layer: 'PUBLISHED' },
        include: {
          subject: { select: { name: true } },
          staff: { select: { title: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    const days = DAYS.map((day) => ({
      day: DAY_LABEL[day],
      lessons: periods.flatMap((p) => {
        const slot = slots.find((s) => s.day === day && s.periodId === p.id);
        if (!p.isBreak && !slot) return [];
        return [
          {
            start: hhmm(p.startsAt),
            end: hhmm(p.endsAt),
            period: p.label,
            isBreak: p.isBreak,
            subject: p.isBreak ? p.label : slot!.subject.name,
            teacher: slot?.staff ? staffName(slot.staff) : null,
          },
        ];
      }),
    }));
    return { version: tt.publishedVersion, publishedAt: tt.publishedAt, days };
  }

  /** `GET /v1/parent/children/:id/timetable`. */
  async timetable(scope: StudentRef, termId?: string) {
    const id = scope.student.id;
    const { term } = await this.scope.termFor(id, termId);
    const place = await this.scope.place(id, term.sessionId);
    const week = place ? await this.week(place.armId, term.id) : null;
    return {
      termId: term.id,
      term: term.label,
      className: place?.className ?? null,
      published: !!week,
      version: week?.version ?? null,
      effectiveFrom: week?.publishedAt ? fmtDate(week.publishedAt) : null,
      days: week?.days ?? [],
    };
  }

  async todayLessons(studentId: string, term: ParentTerm) {
    const place = await this.scope.place(studentId, term.sessionId);
    const today = this.scope.today();
    const weekday = WEEKDAY_OF[new Date(`${today}T12:00:00Z`).getUTCDay()];
    const label = weekday ? DAY_LABEL[weekday] : null;
    if (!place || !label || term.status !== 'ACTIVE')
      return { day: label, className: place?.className ?? null, lessons: [] };
    const week = await this.week(place.armId, term.id);
    return {
      day: label,
      className: place.className,
      lessons: (week?.days.find((d) => d.day === label)?.lessons ?? []).filter((l) => !l.isBreak),
    };
  }

  /* ---------------- Attendance ---------------- */

  async attendanceSummary(studentId: string, termId: string) {
    const entries = await this.db.attendanceEntry.findMany({
      where: { studentId, termId },
      select: { mark: true },
    });
    const count = (m: keyof typeof MARK) => entries.filter((e) => e.mark === m).length;
    const present = count('PRESENT');
    const late = count('LATE');
    const schoolDays = entries.length;
    return {
      present,
      late,
      absent: count('ABSENT'),
      excused: count('EXCUSED'),
      schoolDays,
      // Present rate counts Present and Late, as the register does.
      percent: schoolDays ? Math.round(((present + late) / schoolDays) * 1000) / 10 : null,
    };
  }

  /** `GET /v1/parent/children/:id/attendance?term=`: the term's summary and every marked day. */
  async attendance(scope: StudentRef, termId?: string) {
    const id = scope.student.id;
    const { term, terms } = await this.scope.termFor(id, termId);
    const list = await this.scope.childTerms(id, terms);
    const [summary, entries] = await Promise.all([
      this.attendanceSummary(id, term.id),
      this.db.attendanceEntry.findMany({
        where: { studentId: id, termId: term.id },
        orderBy: { date: 'asc' },
        select: { date: true, mark: true, reason: true },
      }),
    ]);
    return {
      termId: term.id,
      term: term.label,
      startsOn: isoDate(term.startsOn),
      endsOn: isoDate(term.endsOn),
      terms: list.map((t) => ({ id: t.id, label: t.label, current: t.status === 'ACTIVE' })),
      summary,
      days: entries.map((e) => ({
        date: isoDate(e.date),
        mark: MARK[e.mark],
        reason: e.mark === 'PRESENT' ? null : (e.reason ?? null),
      })),
    };
  }

  /* ---------------- Announcements ---------------- */

  /**
   * Announcements for this parent: sent to everyone or to parents (in the branch of one of their
   * children, or school-wide), or to one of their children's classes; not withdrawn or expired.
   */
  async announcements(auth: AuthUserContext, childId?: string, take = 50) {
    const { links } = await this.scope.children(auth);
    const ids = childId ? [childId] : links.map((l) => l.studentId);
    const guardian = await this.scope.guardian(auth);
    return this.announcementsFor(auth.schoolId!, ids, ['EVERYONE', 'PARENTS'], take, [
      `g:${guardian.id}`,
    ]);
  }

  /**
   * Announcements for these students' families or the students themselves: sent to one of
   * `kinds` (in the branch of one of the students, or school-wide), or to one of the students'
   * classes; not withdrawn or expired. Shared by the Parent and Student Portals.
   */
  async announcementsFor(
    schoolId: string,
    ids: string[],
    kinds: ('EVERYONE' | 'PARENTS' | 'STUDENTS')[],
    take = 50,
    /** The reader's own keys ("g:<guardianId>" or "s:<studentId>"): sent to them by name. */
    people: string[] = [],
  ) {
    const terms = await this.scope.terms();
    const current = ParentScopeService.current(terms, this.scope.today());
    const places: ChildPlace[] = current
      ? (await Promise.all(ids.map((id) => this.scope.place(id, current.sessionId)))).filter(
          (p) => p !== null,
        )
      : [];
    const students = await this.db.student.findMany({
      where: { id: { in: ids } },
      select: { branchId: true },
    });
    const branchIds = [
      ...new Set([...students.map((s) => s.branchId), ...places.map((p) => p.branchId)]),
    ];
    const armIds = places.map((p) => p.armId);
    const today = new Date(`${this.scope.today()}T00:00:00.000Z`);
    const rows = await this.db.announcement.findMany({
      where: {
        status: 'SENT',
        withdrawnAt: null,
        OR: [{ expiresOn: null }, { expiresOn: { gte: today } }],
        AND: [
          {
            OR: [
              {
                audienceKind: { in: kinds },
                OR: [{ audienceBranchId: null }, { audienceBranchId: { in: branchIds } }],
              },
              { audienceKind: 'CLASSES', audienceArms: { some: { armId: { in: armIds } } } },
              ...(people.length
                ? [{ audienceKind: 'PEOPLE' as const, audiencePeople: { hasSome: people } }]
                : []),
            ],
          },
        ],
      },
      include: { audienceArms: { select: { armId: true } } },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take,
    });
    const authors = await this.db.user.findMany({
      where: { id: { in: rows.map((r) => r.createdById).filter((x): x is string => !!x) } },
      select: { id: true, title: true, firstName: true, lastName: true },
    });
    const school = await this.db.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { name: true },
    });
    const classOf = new Map(places.map((p) => [p.armId, p.className]));
    return rows.map((a) => {
      const by = authors.find((u) => u.id === a.createdById);
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        from: by ? [by.title, by.firstName, by.lastName].filter(Boolean).join(' ') : school.name,
        sentAt: a.sentAt ? a.sentAt.toISOString() : null,
        date: a.sentAt ? fmtDate(a.sentAt) : '',
        audience:
          a.audienceKind === 'CLASSES'
            ? a.audienceArms
                .map((x) => classOf.get(x.armId))
                .filter(Boolean)
                .join(', ') || 'Classes'
            : a.audienceKind === 'PEOPLE'
              ? 'Sent to you'
              : (AUDIENCE[a.audienceKind] ?? 'Everyone'),
        expiresOn: a.expiresOn ? isoDate(a.expiresOn) : null,
      };
    });
  }
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const addDaysIso = (iso: string, days: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
