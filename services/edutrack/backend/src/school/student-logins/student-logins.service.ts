import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hashPassword } from '../../auth/password.js';
import { PortalLinksService } from '../../auth/portal-links.service.js';
import { CURRENT_STUDENT_STATUSES } from '../../auth/school-portal-rules.js';
import { SessionService } from '../../auth/session.service.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { Portal } from '../../generated/prisma/enums.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { matchesClass, placements, type Placement } from '../guardians/family-records.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import type { CreateStudentLoginsDto, StudentLoginsQueryDto } from './dto/student-logins.dto.js';

const studentInclude = {
  membership: { include: { user: { select: { lastSignInAt: true, mustChangePassword: true } } } },
} satisfies Prisma.StudentInclude;
type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

/** Easy to read aloud and type: no 0/O, 1/I/L. */
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const pick = (set: string, n: number) =>
  Array.from({ length: n }, () => set[randomInt(set.length)]).join('');

/** A one-time password for a login slip, e.g. "KTMB-4827". Changed at the first sign-in. */
export const oneTimePassword = () => `${pick(LETTERS, 4)}-${pick(DIGITS, 4)}`;

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
});

const nameOf = (s: { firstName: string; surname: string }) => `${s.firstName} ${s.surname}`;

/**
 * Student Portal logins (`<slug>.edutrack.ng/student`): students sign in with their admission
 * number and a password. The school turns logins on per section and creates them here; each new
 * login gets a one-time password printed on a slip (shown once, never stored in plain text) that
 * must be changed at the first sign-in (`User.mustChangePassword`).
 */
@Injectable()
export class StudentLoginsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
    private readonly links: PortalLinksService,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private async current() {
    const students = await this.db.student.findMany({
      where: { deletedAt: null, status: { in: [...CURRENT_STUDENT_STATUSES] } },
      include: studentInclude,
      orderBy: [{ surname: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    });
    return {
      students,
      places: await placements(
        this.db,
        students.map((s) => s.id),
      ),
    };
  }

  private loginState(s: StudentRow) {
    const m = s.membership;
    if (!m || m.status === 'REVOKED') return 'No login';
    if (m.status !== 'ACTIVE') return 'Closed';
    return !m.user.lastSignInAt || m.user.mustChangePassword ? 'Not signed in yet' : 'Active';
  }

  async view(q: StudentLoginsQueryDto) {
    const [sections, { students, places }] = await Promise.all([
      this.db.section.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.current(),
    ]);
    const rows = students
      .filter((s) => matchesClass(places.get(s.id), q.className))
      .map((s) => {
        const p = places.get(s.id);
        return {
          id: s.id,
          name: nameOf(s),
          admissionNo: s.admissionNo,
          className: p?.className ?? '',
          section: p?.sectionName ?? '',
          enabled: !!p?.studentLogins,
          login: this.loginState(s),
        };
      });
    const eligible = rows.filter((r) => r.enabled);
    const withLogin = eligible.filter((r) => r.login !== 'No login' && r.login !== 'Closed').length;
    return {
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        studentLogins: s.studentLogins,
      })),
      students: rows,
      counts: { eligible: eligible.length, withLogin, withoutLogin: eligible.length - withLogin },
    };
  }

  /** Creates logins (and, with `reissue`, new passwords) and answers the printable slips. */
  async create(dto: CreateStudentLoginsDto) {
    const schoolId = RequestContext.schoolId()!;
    const { students, places } = await this.current();
    const ids = dto.studentIds ? new Set(dto.studentIds.filter(isUuid)) : null;
    if (dto.studentIds && dto.studentIds.length && !ids?.size)
      throw AppException.validation({ studentIds: 'Choose the students.' });
    const targeted = !!ids || !!dto.className;
    const chosen = students.filter(
      (s) => (!ids || ids.has(s.id)) && matchesClass(places.get(s.id), dto.className),
    );
    if (targeted && !chosen.length)
      throw AppException.validation(
        { className: 'No current students match.' },
        'No current students match.',
      );

    const skipped: { id: string; name: string; reason: string }[] = [];
    const todo: { s: StudentRow; p: Placement }[] = [];
    for (const s of chosen) {
      const p = places.get(s.id);
      const skip = (reason: string) => skipped.push({ id: s.id, name: nameOf(s), reason });
      if (!p) {
        if (targeted) skip('Not placed in a class yet.');
        continue;
      }
      if (!p.studentLogins) {
        if (targeted) skip(`Student logins are off for ${p.sectionName}.`);
        continue;
      }
      if (s.membership?.status === 'ACTIVE' && !dto.reissue) {
        skip('Already has a login.');
        continue;
      }
      todo.push({ s, p });
    }
    if (todo.length > 600)
      throw AppException.validation(
        { className: 'Create logins a class or level at a time (600 at most).' },
        'Create logins a class or level at a time (600 at most).',
      );

    // Hash outside the transaction (argon2 is deliberately slow), a few at a time.
    const passwords = todo.map(() => oneTimePassword());
    const hashes: string[] = [];
    for (let i = 0; i < passwords.length; i += 8)
      hashes.push(...(await Promise.all(passwords.slice(i, i + 8).map((p) => hashPassword(p)))));

    const now = this.clock.now();
    const reissuedUsers: string[] = [];
    let created = 0;
    await this.db.$transaction(
      async (tx) => {
        for (const [i, { s }] of todo.entries()) {
          const secret = {
            passwordHash: hashes[i]!,
            passwordChangedAt: now,
            mustChangePassword: true,
            failedSignInCount: 0,
            lockedUntil: null,
          };
          const m = s.membership;
          if (m) {
            await tx.user.update({ where: { id: m.userId }, data: secret });
            await tx.schoolMembership.update({
              where: { id: m.id },
              data: { status: 'ACTIVE', statusReason: null, activatedAt: m.activatedAt ?? now },
            });
            if (m.status === 'ACTIVE') reissuedUsers.push(m.userId);
            else created += 1;
            continue;
          }
          const user = await tx.user.create({
            data: { firstName: s.firstName, lastName: s.surname, ...secret },
          });
          await tx.schoolMembership.create({
            data: {
              schoolId,
              userId: user.id,
              kind: 'STUDENT',
              studentId: s.id,
              status: 'ACTIVE',
              activatedAt: now,
            },
          });
          created += 1;
        }
        if (todo.length)
          await this.audit.record(
            {
              action: 'student.logins.create',
              area: 'Students',
              entity: 'Student',
              summary: `Student Portal logins: ${created} created${reissuedUsers.length ? `, ${reissuedUsers.length} new password${reissuedUsers.length === 1 ? '' : 's'}` : ''}`,
              detail:
                dto.className ?? (ids ? `${ids.size} chosen students` : 'All enabled sections'),
              after: { studentIds: todo.map((t) => t.s.id) },
            },
            asTx(tx),
          );
      },
      { timeout: 60_000 },
    );
    // A new password signs the student out everywhere.
    for (const userId of reissuedUsers)
      await this.sessions.revokeAllForUser(userId, 'password_reset');

    const school = await this.db.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { name: true, slug: true },
    });
    const signInAddress = this.links.base(Portal.STUDENT, school.slug);
    return {
      created,
      reissued: reissuedUsers.length,
      skipped,
      issuedOn: DATE.format(now),
      slips: todo.map(({ s, p }, i) => ({
        studentId: s.id,
        name: nameOf(s),
        className: p.className || p.levelName,
        admissionNo: s.admissionNo,
        schoolName: school.name,
        signInAddress,
        oneTimePassword: passwords[i]!,
      })),
    };
  }
}
