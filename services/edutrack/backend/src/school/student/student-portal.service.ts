import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { initialsOf } from '../../auth/identifiers.js';
import { leftOnOf } from '../../auth/school-portal-rules.js';
import { fmtDate, isoDate } from '../academics/academic-format.js';
import { STUDENT_STATUS_LABEL } from '../guardians/family-records.js';
import { FamilyHomeworkService } from '../homework/family-homework.service.js';
import { ParentResultsService } from '../parent/parent-results.service.js';
import { ParentSchoolService } from '../parent/parent-school.service.js';
import { guardianDisplay, ParentScopeService } from '../parent/parent-scope.service.js';
import type { StudentScope } from './student-scope.service.js';

const GENDER: Record<string, string> = { MALE: 'Male', FEMALE: 'Female' };

/**
 * The Student Portal's read models. They reuse the Parent Portal's (results from the published
 * report card, timetable, attendance, announcements) and the family homework read model, scoped
 * to the signed-in pupil instead of a parent's child.
 */
@Injectable()
export class StudentPortalService {
  constructor(
    private readonly scope: ParentScopeService,
    private readonly school: ParentSchoolService,
    private readonly results: ParentResultsService,
    private readonly family: FamilyHomeworkService,
  ) {}

  private get db() {
    return this.scope.db;
  }

  /** The pupil's class: this session's, else (a leaver) their last one. */
  private async place(studentId: string) {
    const terms = await this.scope.terms();
    const current = ParentScopeService.current(terms, this.scope.today());
    const now = current && (await this.scope.place(studentId, current.sessionId));
    if (now) return now;
    const e = await this.db.enrollment.findFirst({
      where: { studentId, armId: { not: null } },
      orderBy: { session: { startsOn: 'desc' } },
      select: { sessionId: true },
    });
    return e ? this.scope.place(studentId, e.sessionId) : null;
  }

  /** `GET /v1/student/overview`: who is signed in, the school, the term. */
  async overview(auth: AuthUserContext, me: StudentScope) {
    const s = me.student;
    const [school, terms, place] = await Promise.all([
      this.db.school.findUniqueOrThrow({ where: { id: auth.schoolId! } }),
      this.scope.terms(),
      this.place(s.id),
    ]);
    const term = ParentScopeService.current(terms, this.scope.today());
    const left = me.access === 'read-only' ? leftOnOf(s) : null;
    return {
      student: {
        id: s.id,
        name: `${s.firstName} ${s.surname}`,
        firstName: s.firstName,
        initials: initialsOf(`${s.firstName} ${s.surname}`),
        admissionNo: s.admissionNo,
        className: place?.className ?? '',
        section: place?.section ?? '',
        branch: place?.branch ?? '',
        access: me.access,
        leftOn: left ? isoDate(left) : null,
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
    };
  }

  /** The pupil's homework for a term; nothing can be handed in once they have left. */
  async homework(me: StudentScope, termId?: string) {
    const hw = await this.family.homework(me.student.id, termId, {
      guardian: false,
      full: me.access === 'full',
    });
    if (me.access === 'full') return hw;
    return { ...hw, assignments: hw.assignments.map((a) => ({ ...a, canSubmit: false })) };
  }

  /** `GET /v1/student/home`: today's lessons, homework due, latest result, attendance, news. */
  async home(auth: AuthUserContext, me: StudentScope) {
    const id = me.student.id;
    const { term } = await this.scope.termFor(id);
    const [latest, hw, today, news, attendance] = await Promise.all([
      this.results.latest(me),
      this.homework(me, term.id),
      this.school.todayLessons(id, term),
      this.school.announcementsFor(auth.schoolId!, [id], ['EVERYONE', 'STUDENTS'], 3),
      this.school.attendanceSummary(id, term.id),
    ]);
    const due = hw.assignments
      .filter((a) => a.status === 'Not submitted' && a.assignmentStatus !== 'Closed')
      .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
    return {
      term: term.label,
      today,
      homework: due.slice(0, 3).map((a) => ({
        id: a.id,
        title: a.title,
        subjectName: a.subjectName,
        teacherName: a.teacherName,
        dueAt: a.dueAt,
        status: a.status,
        pastDue: a.pastDue,
        canSubmit: a.canSubmit,
      })),
      homeworkDue: due.filter((a) => !a.pastDue).length,
      latestResult: latest,
      attendance,
      announcements: news,
    };
  }

  /** `GET /v1/student/announcements`: to everyone or students (their branch), or their class. */
  announcements(auth: AuthUserContext, me: StudentScope) {
    return this.school.announcementsFor(auth.schoolId!, [me.student.id], ['EVERYONE', 'STUDENTS']);
  }

  /** `GET /v1/student/profile`: the pupil's details as the school holds them (read-only). */
  async profile(me: StudentScope) {
    const s = me.student;
    const { term } = await this.scope.termFor(s.id);
    const place = await this.place(s.id);
    const [classTeacher, guardians] = await Promise.all([
      place ? this.scope.classTeacher(place.armId, term) : null,
      this.db.studentGuardian.findMany({
        where: { studentId: s.id, guardian: { deletedAt: null, mergedIntoId: null } },
        include: { guardian: { select: { title: true, fullName: true } } },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      name: [s.firstName, s.otherNames, s.surname].filter(Boolean).join(' '),
      firstName: s.firstName,
      surname: s.surname,
      initials: initialsOf(`${s.firstName} ${s.surname}`),
      admissionNo: s.admissionNo,
      gender: GENDER[s.gender] ?? s.gender,
      dateOfBirth: s.dateOfBirth ? fmtDate(s.dateOfBirth) : null,
      admittedOn: fmtDate(s.admittedOn),
      status: STUDENT_STATUS_LABEL[s.status],
      className: place?.className ?? null,
      section: place?.section ?? null,
      branch: place?.branch ?? null,
      classTeacher,
      session: term.session,
      // Guardians by name and relationship only: no contact details.
      guardians: guardians.map((g) => ({
        name: guardianDisplay(g.guardian),
        relationship: g.relationship,
      })),
    };
  }
}
