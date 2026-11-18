import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { AcademicCatalogService, type ArmInfo } from '../academics/academic-catalog.service.js';
import { fmtDate, isoDate, staffName } from '../academics/academic-format.js';

export type TermRow = {
  id: string;
  name: string;
  sessionId: string;
  status: string;
  startsOn: Date;
  endsOn: Date;
  resultEntryClosesAt: Date | null;
  session: { name: string };
};

/** "Main" for "Main Campus": the short campus name the Teacher Workspace prints on cards. */
export const branchShort = (name: string) => name.split(/\s+/)[0] ?? name;

/** "Joined 2 Nov" when a student joined the class after the term began, else null. */
export const joinedLate = (enrolledOn: Date, term: { startsOn: Date }) =>
  enrolledOn > term.startsOn ? `Joined ${fmtDate(enrolledOn, false)}` : null;

/**
 * The signed-in teacher and what they may see: their staff record, the selected term (any term of
 * the school, defaulting to the active one), their teaching assignments and their class (class
 * teacher). Everything the Teacher Workspace returns is scoped through here, so a teacher never
 * sees another class's students or another teacher's work.
 */
@Injectable()
export class TeacherScopeService {
  constructor(readonly catalog: AcademicCatalogService) {}

  get db() {
    return this.catalog.db;
  }

  /** The teacher's staff record (their membership must be an active staff one). */
  async staff(auth: AuthUserContext) {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId, userId: auth.userId, kind: 'STAFF', status: 'ACTIVE' },
      include: {
        user: { select: { email: true } },
        roles: { include: { role: { select: { key: true, name: true } } } },
        staff: {
          include: {
            department: { select: { id: true, name: true } },
            branches: { select: { branchId: true } },
            hodOf: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!m?.staff || m.staff.status !== 'ACTIVE')
      throw AppException.forbidden(
        'This account doesn’t have access to the Teacher Workspace at this school.',
        'NO_ACCESS',
      );
    return {
      ...m.staff,
      email: m.user.email ?? m.staff.email ?? '',
      roleKeys: m.roles.map((r) => r.role.key),
    };
  }

  /** Every term of the school, newest first. */
  terms(): Promise<TermRow[]> {
    return this.db.term.findMany({
      include: { session: { select: { name: true } } },
      orderBy: { startsOn: 'desc' },
    });
  }

  /** The term asked for (`?term=`), else the active one, else the newest. */
  async term(termId?: string | null): Promise<TermRow> {
    const terms = await this.terms();
    const term =
      (termId && terms.find((t) => t.id === termId)) ||
      terms.find((t) => t.status === 'ACTIVE') ||
      terms[0];
    if (!term) throw AppException.notFound('Your school hasn’t set up its terms yet.', 'NO_TERM');
    if (termId && term.id !== termId)
      throw AppException.notFound('That term doesn’t exist.', 'NOT_FOUND');
    return term;
  }

  /** Why a term's records are read-only, or null for the active term. */
  static lockReason(term: TermRow) {
    if (term.status === 'ACTIVE') return null;
    if (term.status === 'UPCOMING')
      return `${term.session.name} ${term.name} hasn’t started yet, so it’s read-only.`;
    return `${term.session.name} ${term.name} is closed. Its records are read-only.`;
  }

  static termLock(term: TermRow) {
    const lockReason = TeacherScopeService.lockReason(term);
    return { termId: term.id, readOnly: lockReason !== null, lockReason };
  }

  /** The teacher's assignments in a term, with the arm and subject. */
  async assignments(staffId: string, termId: string) {
    const [rows, arms] = await Promise.all([
      this.db.teachingAssignment.findMany({
        where: { staffId, termId },
        include: {
          subject: { include: { department: { include: { hod: true } } } },
          curriculumEntry: { select: { offering: true } },
        },
      }),
      this.catalog.arms(),
    ]);
    const armById = new Map(arms.map((a) => [a.id, a]));
    return rows
      .filter((r) => armById.has(r.armId))
      .map((r) => ({ ...r, arm: armById.get(r.armId)! }))
      .sort(
        (a, b) =>
          arms.indexOf(a.arm) - arms.indexOf(b.arm) || a.subject.name.localeCompare(b.subject.name),
      );
  }

  /**
   * Class-teacher posts that covered the term: a post replaced mid-session still counts for the
   * terms it overlapped, so the earlier class teacher keeps their registers for those terms.
   */
  private static during(term: { sessionId: string; startsOn: Date; endsOn: Date }) {
    return {
      sessionId: term.sessionId,
      startsOn: { lte: term.endsOn },
      OR: [{ endsOn: null }, { endsOn: { gte: term.startsOn } }],
    };
  }

  /** The arm the teacher was class teacher of during the term (the latest post), if any. */
  async classArm(
    staffId: string,
    term: { sessionId: string; startsOn: Date; endsOn: Date },
  ): Promise<ArmInfo | null> {
    const ct = await this.db.classTeacherAssignment.findFirst({
      where: { staffId, ...TeacherScopeService.during(term) },
      orderBy: { startsOn: 'desc' },
    });
    return ct ? this.catalog.arm(ct.armId) : null;
  }

  /** The arm's class teacher during the term (the latest post). */
  async classTeacherOf(armId: string, term: { sessionId: string; startsOn: Date; endsOn: Date }) {
    const ct = await this.db.classTeacherAssignment.findFirst({
      where: { armId, ...TeacherScopeService.during(term) },
      orderBy: { startsOn: 'desc' },
      include: { staff: { select: { id: true, title: true, firstName: true, lastName: true } } },
    });
    return ct ? { id: ct.staff.id, name: staffName(ct.staff) } : null;
  }

  /** Students on an arm's roll in a session (still enrolled), by surname. */
  roll(sessionId: string, armIds: string[]) {
    return this.db.enrollment.findMany({
      where: { sessionId, armId: { in: armIds }, status: 'ACTIVE' },
      include: { student: true },
      orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
    });
  }

  /**
   * Who takes a subject in an arm: everyone for a compulsory subject; for an elective, those who
   * chose it (everyone while the class has no choices recorded yet).
   */
  async studentsFor(
    sessionId: string,
    a: { armId: string; subjectId: string; curriculumEntry: { offering: string } },
  ) {
    const roll = await this.roll(sessionId, [a.armId]);
    if (a.curriculumEntry.offering === 'COMPULSORY') return roll;
    const choices = await this.db.studentSubject.findMany({
      where: { sessionId, studentId: { in: roll.map((e) => e.studentId) } },
      select: { studentId: true, subjectId: true },
    });
    if (!choices.length) return roll;
    const mine = new Set(
      choices.filter((c) => c.subjectId === a.subjectId).map((c) => c.studentId),
    );
    return roll.filter((e) => mine.has(e.studentId));
  }

  /** 403 unless the teacher teaches this arm (any subject) or is its class teacher this term. */
  async requireArm(staffId: string, term: TermRow, armId: string) {
    const [teaches, ct] = await Promise.all([
      this.db.teachingAssignment.count({ where: { staffId, termId: term.id, armId } }),
      this.classArm(staffId, term),
    ]);
    if (!teaches && ct?.id !== armId)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'You don’t teach this class this term.',
        'FORBIDDEN',
      );
  }

  /** "2026-11-17T09:40" in Lagos time, as the Teacher Workspace prints local times. */
  static local(d: Date) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(d)
      .replace(' ', 'T');
  }

  static iso = isoDate;

  /** The request's school id (every route here is tenant-scoped). */
  static schoolId() {
    return RequestContext.get()!.schoolId!;
  }
}
