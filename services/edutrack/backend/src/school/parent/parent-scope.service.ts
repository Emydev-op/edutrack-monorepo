import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { PortalAccessService, type ParentChildAccess } from '../../auth/portal-access.service.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel, isoDate } from '../academics/academic-format.js';

/** A term as the Parent Portal shows it. */
export interface ParentTerm {
  id: string;
  name: string;
  sessionId: string;
  session: string;
  status: string;
  startsOn: Date;
  endsOn: Date;
  /** "First Term · 2026/2027". */
  label: string;
  /** The results-publication day from the term's calendar, if planned. */
  resultsOn: Date | null;
}

/** Where a child sat in a session: their arm, level, section and branch. */
export interface ChildPlace {
  armId: string;
  /** "JSS 2B". */
  className: string;
  levelId: string;
  sectionId: string;
  section: string;
  /** The section has Student Portal logins (the pupil hands in their own work). */
  studentLogins: boolean;
  branchId: string;
  branch: string;
  sessionId: string;
}

/** The signed-in guardian and one child they may see. */
export interface ChildScope {
  guardian: { id: string; title: string | null; fullName: string };
  link: ParentChildAccess;
  student: {
    id: string;
    firstName: string;
    surname: string;
    admissionNo: string;
    status: string;
    branchId: string;
    admittedOn: Date;
    leftOn: Date | null;
  };
}

export const guardianDisplay = (g: { title: string | null; fullName: string }) =>
  [g.title, g.fullName].filter(Boolean).join(' ');

export const READ_ONLY_MESSAGE = 'This child has left the school, so their records are read-only.';

/**
 * Who the signed-in parent is and which children they may see, for every Parent Portal route.
 * A child-specific route always goes through `child()`: a child that isn't linked to the parent
 * (another family, another school, or a leaver past the two-year window) answers 404, so the
 * route can't be used to find out whether a record exists.
 */
@Injectable()
export class ParentScopeService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly access: PortalAccessService,
    private readonly clock: Clock,
  ) {}

  get db() {
    return this.tenant.db;
  }

  now() {
    return this.clock.now();
  }

  /** "2026-12-08" in Lagos. */
  today() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(this.now());
  }

  /** The signed-in guardian record (403 NO_ACCESS when the session isn't an active parent). */
  async guardian(auth: AuthUserContext) {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId, userId: auth.userId, kind: 'GUARDIAN', status: 'ACTIVE' },
      include: { guardian: true },
    });
    if (!m?.guardian || m.guardian.deletedAt || m.guardian.mergedIntoId)
      throw AppException.forbidden(
        'This account doesn’t have access to the Parent Portal at this school.',
        'NO_ACCESS',
      );
    return m.guardian;
  }

  /** The children the parent may still see (403 PARENT_ACCESS_ENDED when none are left). */
  async children(auth: AuthUserContext) {
    const guardian = await this.guardian(auth);
    const links = await this.access.parentChildren(auth.schoolId!, guardian.id);
    if (!links.length)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Your children are no longer at this school, so this parent account has closed.',
        'PARENT_ACCESS_ENDED',
      );
    return { guardian, links };
  }

  /** One of the parent's children (404 for anyone else's). */
  async child(auth: AuthUserContext, studentId: string): Promise<ChildScope> {
    const guardian = await this.guardian(auth);
    const links = await this.access.parentChildren(auth.schoolId!, guardian.id);
    const link = links.find((l) => l.studentId === studentId);
    if (!link) throw AppException.notFound('That child isn’t linked to your account.', 'NOT_FOUND');
    const student = await this.db.student.findFirstOrThrow({ where: { id: studentId } });
    return { guardian, link, student };
  }

  /** Writes for a child who has left are refused (paying old balances is handled separately). */
  static requireFull(scope: ChildScope) {
    if (scope.link.access !== 'full') throw AppException.forbidden(READ_ONLY_MESSAGE, 'READ_ONLY');
  }

  /* ---------------- Terms ---------------- */

  async terms(): Promise<ParentTerm[]> {
    const rows = await this.db.term.findMany({
      include: {
        session: { select: { name: true } },
        events: { where: { type: 'RESULTS' }, select: { startsOn: true }, take: 1 },
      },
      orderBy: { startsOn: 'desc' },
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      sessionId: t.sessionId,
      session: t.session.name,
      status: t.status,
      startsOn: t.startsOn,
      endsOn: t.endsOn,
      label: `${t.name} · ${t.session.name}`,
      resultsOn: t.events[0]?.startsOn ?? null,
    }));
  }

  /** The active term, else the latest that has started, else the newest. */
  static current(terms: ParentTerm[], today: string): ParentTerm | null {
    return (
      terms.find((t) => t.status === 'ACTIVE') ??
      terms.find((t) => isoDate(t.startsOn) <= today) ??
      terms[0] ??
      null
    );
  }

  /**
   * The term a child-specific screen opens on: the one asked for (404 if unknown), else the
   * current term, else (a leaver) the last term they were enrolled in.
   */
  async termFor(studentId: string, termId?: string | null) {
    const terms = await this.terms();
    if (termId) {
      const t = terms.find((x) => x.id === termId);
      if (!t) throw AppException.notFound('That term doesn’t exist.', 'NOT_FOUND');
      return { term: t, terms };
    }
    const current = ParentScopeService.current(terms, this.today());
    if (!current)
      throw AppException.notFound('Your school hasn’t set up its terms yet.', 'NO_TERM');
    if (await this.place(studentId, current.sessionId)) return { term: current, terms };
    const sessions = await this.db.enrollment.findMany({
      where: { studentId, armId: { not: null } },
      select: { sessionId: true },
    });
    const ids = new Set(sessions.map((s) => s.sessionId));
    const today = this.today();
    const last = terms.find((t) => ids.has(t.sessionId) && isoDate(t.startsOn) <= today);
    return { term: last ?? current, terms };
  }

  /** Terms of the sessions the child was enrolled in that have started, newest first. */
  async childTerms(studentId: string, terms?: ParentTerm[]) {
    const all = terms ?? (await this.terms());
    const rows = await this.db.enrollment.findMany({
      where: { studentId, armId: { not: null } },
      select: { sessionId: true },
    });
    const ids = new Set(rows.map((r) => r.sessionId));
    const today = this.today();
    return all.filter((t) => ids.has(t.sessionId) && isoDate(t.startsOn) <= today);
  }

  /* ---------------- Placement ---------------- */

  /** The child's arm in a session (their active enrollment first, else their last one). */
  async place(studentId: string, sessionId: string): Promise<ChildPlace | null> {
    const rows = await this.db.enrollment.findMany({
      where: { studentId, sessionId, armId: { not: null } },
      include: {
        arm: { select: { id: true, name: true } },
        level: {
          select: {
            name: true,
            sectionId: true,
            section: { select: { name: true, studentLogins: true } },
          },
        },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const e = rows.find((r) => r.status === 'ACTIVE') ?? rows[0];
    if (!e?.arm) return null;
    return {
      armId: e.arm.id,
      className: armLabel(e.level.name, e.arm.name),
      levelId: e.levelId,
      sectionId: e.level.sectionId,
      section: e.level.section.name,
      studentLogins: e.level.section.studentLogins,
      branchId: e.branchId,
      branch: e.branch.name,
      sessionId: e.sessionId,
    };
  }

  /** The class teacher of an arm during a term. */
  async classTeacher(armId: string, term: { sessionId: string; startsOn: Date; endsOn: Date }) {
    const ct = await this.db.classTeacherAssignment.findFirst({
      where: {
        armId,
        sessionId: term.sessionId,
        startsOn: { lte: term.endsOn },
        OR: [{ endsOn: null }, { endsOn: { gte: term.startsOn } }],
      },
      orderBy: { startsOn: 'desc' },
      include: { staff: { select: { title: true, firstName: true, lastName: true } } },
    });
    return ct
      ? [ct.staff.title, ct.staff.firstName, ct.staff.lastName].filter(Boolean).join(' ')
      : null;
  }
}
