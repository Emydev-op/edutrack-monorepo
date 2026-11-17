import { Injectable, Logger } from '@nestjs/common';
import { childAccess, isCurrentStudent } from '../../auth/school-portal-rules.js';
import { SessionService } from '../../auth/session.service.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';

export const PARENT_ACCESS_ENDED_REASON =
  'Your children have left the school and their records are no longer shared with you.';
export const STUDENT_LEFT_REASON = 'You have left the school.';

/**
 * The daily clean-up behind the leavers rule (sign-in already applies it live):
 *
 * - a pupil who has left (graduated, transferred, withdrawn) loses their Student Portal login;
 * - a parent keeps read-only access to a child who left for two years after `leftOn`; when no
 *   child is current or inside that window, their Parent Portal membership at that school is
 *   closed (a pending invitation is withdrawn) and their sessions there end.
 *
 * Runs across every school (a system job) with the unscoped client, filtering by school itself.
 */
@Injectable()
export class FamilyAccessService {
  private readonly logger = new Logger(FamilyAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  async closeEndedAccess(): Promise<{ parentsClosed: number; studentsClosed: number }> {
    const now = this.clock.now();
    let parentsClosed = 0;
    let studentsClosed = 0;

    const parents = await this.prisma.schoolMembership.findMany({
      where: { kind: 'GUARDIAN', status: { in: ['ACTIVE', 'INVITED'] } },
      include: {
        guardian: { include: { students: { include: { student: true } } } },
      },
      orderBy: { id: 'asc' },
    });
    for (const m of parents) {
      const kept = (m.guardian?.students ?? []).some((l) => childAccess(l.student, now));
      if (kept) continue;
      await this.close(m, PARENT_ACCESS_ENDED_REASON, 'PARENT', m.guardian?.fullName ?? 'Parent');
      parentsClosed += 1;
    }

    const pupils = await this.prisma.schoolMembership.findMany({
      where: { kind: 'STUDENT', status: { in: ['ACTIVE', 'INVITED'] } },
      include: { student: true },
      orderBy: { id: 'asc' },
    });
    for (const m of pupils) {
      if (m.student && isCurrentStudent(m.student)) continue;
      const name = m.student ? `${m.student.firstName} ${m.student.surname}` : 'Student';
      await this.close(m, STUDENT_LEFT_REASON, 'STUDENT', name);
      studentsClosed += 1;
    }
    if (parentsClosed || studentsClosed)
      this.logger.log({ msg: 'Family access closed', parentsClosed, studentsClosed });
    return { parentsClosed, studentsClosed };
  }

  private async close(
    m: {
      id: string;
      schoolId: string;
      userId: string;
      status: string;
      guardianId: string | null;
      studentId: string | null;
    },
    reason: string,
    portal: 'PARENT' | 'STUDENT',
    name: string,
  ) {
    const now = this.clock.now();
    await RequestContext.forSchool(m.schoolId, () =>
      this.prisma.$transaction(async (tx) => {
        await tx.schoolMembership.update({
          where: { id: m.id },
          data: {
            status: m.status === 'INVITED' ? 'REVOKED' : 'DEACTIVATED',
            statusReason: reason,
          },
        });
        await tx.invitation.updateMany({
          where: { membershipId: m.id, status: { in: ['PENDING', 'EXPIRED'] } },
          data: { status: 'REVOKED', revokedAt: now },
        });
        await this.audit.record(
          {
            action: portal === 'PARENT' ? 'guardian.access.close' : 'student.login.close',
            area: 'Students',
            entity: portal === 'PARENT' ? 'Guardian' : 'Student',
            entityId: portal === 'PARENT' ? m.guardianId : m.studentId,
            summary:
              portal === 'PARENT'
                ? `${name}’s Parent Portal account closed: no current children`
                : `${name}’s Student Portal login closed: left the school`,
          },
          tx,
        );
      }),
    );
    const live = await this.prisma.authSession.findMany({
      where: { userId: m.userId, schoolId: m.schoolId, portal, revokedAt: null },
      select: { id: true },
    });
    for (const s of live) await this.sessions.revoke(s.id, 'access_lost');
  }
}
