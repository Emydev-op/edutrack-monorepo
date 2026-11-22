import { HttpStatus, Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PlatformAlertsService } from '../../platform/alerts/platform-alerts.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { ON_ROLL } from '../students/student-view.js';
import type { TenantTx } from './tenant-tx.js';

/** School Admin is warned from this share of a limit. */
export const LIMIT_WARNING = 0.9;

export interface LimitUsage {
  used: number;
  /** null: unlimited. */
  limit: number | null;
  /** At or above 90% of the limit. */
  near: boolean;
  /** At (or over) the limit: new ones are refused. */
  reached: boolean;
}

const usage = (used: number, limit: number | null | undefined): LimitUsage => ({
  used,
  limit: limit ?? null,
  near: !!limit && used >= Math.ceil(limit * LIMIT_WARNING),
  reached: !!limit && used >= limit,
});

const fmt = (n: number) => n.toLocaleString('en-NG');

/**
 * The plan's student and user limits. Students on roll count toward the student limit; staff with
 * a login (School Admin users and teachers, invited, active or suspended) toward the user limit;
 * parents and students never do. At a limit new admissions, imports and staff logins are refused
 * and EduTrack's back office is told, so billing can follow up. Existing records are untouched.
 */
@Injectable()
export class PlanLimitsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly alerts: PlatformAlertsService,
  ) {}

  private async plan() {
    const schoolId = RequestContext.schoolId()!;
    const row = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        subscription: {
          select: { plan: { select: { name: true, studentLimit: true, userLimit: true } } },
        },
      },
    });
    return {
      schoolId,
      school: row?.name ?? 'The school',
      name: row?.subscription?.plan.name ?? '',
      studentLimit: row?.subscription?.plan.studentLimit ?? null,
      userLimit: row?.subscription?.plan.userLimit ?? null,
    };
  }

  async students(): Promise<LimitUsage> {
    const [p, used] = await Promise.all([
      this.plan(),
      this.tenant.db.student.count({ where: { status: { in: ON_ROLL }, deletedAt: null } }),
    ]);
    return usage(used, p.studentLimit);
  }

  async users(): Promise<LimitUsage> {
    const [p, used] = await Promise.all([
      this.plan(),
      this.tenant.db.schoolMembership.count({
        where: { kind: 'STAFF', status: { in: ['INVITED', 'ACTIVE', 'SUSPENDED'] } },
      }),
    ]);
    return usage(used, p.userLimit);
  }

  /** Refuses adding `adding` students past the plan's limit (and tells EduTrack). */
  async requireStudents(adding = 1) {
    const p = await this.plan();
    if (!p.studentLimit) return;
    const used = await this.tenant.db.student.count({
      where: { status: { in: ON_ROLL }, deletedAt: null },
    });
    if (used + adding <= p.studentLimit) return;
    await this.alert(p, 'students', used, p.studentLimit);
    const left = Math.max(0, p.studentLimit - used);
    throw new AppException(
      HttpStatus.CONFLICT,
      left
        ? `Your ${p.name} plan allows ${fmt(p.studentLimit)} students and you have ${fmt(used)}, so only ${fmt(left)} more can be admitted. Upgrade your plan to admit more.`
        : `Your ${p.name} plan allows ${fmt(p.studentLimit)} students and the school has reached it. Upgrade your plan to admit more.`,
      'STUDENT_LIMIT',
    );
  }

  /**
   * Refuses another staff login past the plan's user limit (and tells EduTrack). Pass the
   * transaction when inviting several in one, so its own invitations count.
   */
  async requireUser(
    db: Pick<TenantTx, 'schoolMembership'> = this.tenant.db as unknown as TenantTx,
  ) {
    const p = await this.plan();
    if (!p.userLimit) return;
    const used = await db.schoolMembership.count({
      where: { kind: 'STAFF', status: { in: ['INVITED', 'ACTIVE', 'SUSPENDED'] } },
    });
    if (used < p.userLimit) return;
    await this.alert(p, 'staff logins', used, p.userLimit);
    throw new AppException(
      HttpStatus.CONFLICT,
      `Your ${p.name} plan allows ${fmt(p.userLimit)} staff logins and the school has reached it. Deactivate a login or upgrade your plan.`,
      'USER_LIMIT',
    );
  }

  private alert(
    p: { schoolId: string; school: string; name: string },
    what: string,
    used: number,
    limit: number,
  ) {
    // Once a day per school is enough.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return this.alerts.tryNotify(
      'plan.limit',
      {
        title: `${p.school} has reached its ${what} limit`,
        detail: `${fmt(used)} of ${fmt(limit)} on the ${p.name} plan · tried to add more`,
        link: `/schools/${p.schoolId}/billing`,
        entityType: 'Subscription',
        entityId: p.schoolId,
      },
      { permission: 'Subscriptions.View' },
      { onceSince: today },
    );
  }
}
