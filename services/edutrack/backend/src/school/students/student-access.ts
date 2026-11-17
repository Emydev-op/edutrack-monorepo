import { Injectable } from '@nestjs/common';
import { SessionService } from '../../auth/session.service.js';
import { Clock } from '../../common/clock/clock.js';
import type { TenantTx } from '../shared/tenant-tx.js';
import { OPEN_ACCESS } from './student-view.js';

/** What `closeStudentAccess` ended: hand it to `StudentAccessService.forget()` after commit. */
export interface ClosedStudentAccess {
  userId: string;
  membershipId: string;
  /** Sign-in sessions at this school that were revoked. */
  sessionIds: string[];
}

/**
 * Leavers rule: when a student leaves (graduated, transferred out, withdrawn) their own STUDENT
 * login closes. Inside the caller's transaction this deactivates the student's membership (a
 * pending invitation is withdrawn instead) and revokes their sign-in sessions at this school, so
 * it commits or rolls back with the exit. Parents keep their access (read-only rules live with
 * guardians). After the transaction commits, pass the result to `StudentAccessService.forget()`
 * so the auth guard's session cache drops them at once rather than within 30 seconds.
 *
 * Returns null when the student has no open login.
 */
export async function closeStudentAccess(
  studentId: string,
  tx: TenantTx,
  now: Date = new Date(),
  reason = 'Left the school',
): Promise<ClosedStudentAccess | null> {
  const membership = await tx.schoolMembership.findFirst({
    where: { studentId, kind: 'STUDENT', status: { in: OPEN_ACCESS } },
    select: { id: true, userId: true, status: true },
  });
  if (!membership) return null;
  if (membership.status === 'INVITED') {
    await tx.schoolMembership.update({
      where: { id: membership.id },
      data: { status: 'REVOKED', statusReason: `Invitation cancelled: ${reason.toLowerCase()}.` },
    });
    await tx.invitation.updateMany({
      where: { membershipId: membership.id, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'REVOKED', revokedAt: now },
    });
  } else {
    await tx.schoolMembership.update({
      where: { id: membership.id },
      data: { status: 'DEACTIVATED', statusReason: `${reason}.` },
    });
  }
  const live = await tx.authSession.findMany({
    where: { userId: membership.userId, revokedAt: null },
    select: { id: true },
  });
  if (live.length)
    await tx.authSession.updateMany({
      where: { id: { in: live.map((s) => s.id) }, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'access_lost' },
    });
  return {
    userId: membership.userId,
    membershipId: membership.id,
    sessionIds: live.map((s) => s.id),
  };
}

/** The non-transactional half of closing a student's access (see `closeStudentAccess`). */
@Injectable()
export class StudentAccessService {
  constructor(
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  /** `closeStudentAccess` with the injected clock (tests move time). */
  close(studentId: string, tx: TenantTx, reason?: string) {
    return closeStudentAccess(studentId, tx, this.clock.now(), reason);
  }

  /** Drops the revoked sessions from the auth cache (already revoked: only the cache changes). */
  async forget(closed: ClosedStudentAccess | null | undefined): Promise<void> {
    for (const id of closed?.sessionIds ?? []) await this.sessions.revoke(id, 'access_lost');
  }
}
