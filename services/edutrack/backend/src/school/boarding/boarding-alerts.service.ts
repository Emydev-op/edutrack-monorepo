import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

/**
 * Boarding alerts: an in-app notification and an email to a boarder's parents (gate sign-out and
 * return, a missed roll call, a sick bay visit, an exeat decision) or to house staff (a new exeat
 * request). SMS follows once the school's SMS provider is connected. A failed email never undoes
 * what triggered it.
 */
@Injectable()
export class BoardingAlertsService {
  private readonly log = new Logger(BoardingAlertsService.name);

  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private async school() {
    return this.db.school.findUniqueOrThrow({
      where: { id: RequestContext.schoolId()! },
      select: { name: true },
    });
  }

  private async send(
    people: { userId: string | null; email: string | null }[],
    alert: {
      category: string;
      title: string;
      body: string;
      link: string | null;
      entityType: string;
      entityId: string;
    },
  ) {
    const schoolId = RequestContext.schoolId()!;
    const school = await this.school();
    const users = people.filter((p) => p.userId);
    if (users.length)
      await this.db.notification.createMany({
        data: users.map((p) => ({
          userId: p.userId!,
          schoolId,
          category: alert.category,
          title: alert.title,
          body: alert.body,
          link: alert.link,
          entityType: alert.entityType,
          entityId: alert.entityId,
        })),
      });
    for (const p of people)
      if (p.email)
        await this.notifications
          .email(p.email, 'announcement', {
            subject: alert.title,
            body: alert.body,
            schoolName: school.name,
          })
          .catch((e: unknown) => this.log.warn(`Boarding email not queued: ${String(e)}`));
  }

  /** The boarder's parents and guardians (with an active Parent Portal account, or an email). */
  async parents(
    studentId: string,
    alert: {
      title: string;
      body: string;
      link?: string | null;
      entityType: string;
      entityId: string;
    },
  ) {
    const links = await this.db.studentGuardian.findMany({
      where: { studentId, guardian: { deletedAt: null, mergedIntoId: null } },
      select: {
        guardian: {
          select: { email: true, membership: { select: { userId: true, status: true } } },
        },
      },
    });
    await this.send(
      links.map((l) => ({
        userId: l.guardian.membership?.status === 'ACTIVE' ? l.guardian.membership.userId : null,
        email: l.guardian.email,
      })),
      { category: 'boarding', ...alert, link: alert.link ?? null },
    );
  }

  /** Staff (house staff of a hostel, or given staff ids). */
  async staff(
    staffIds: string[],
    alert: {
      title: string;
      body: string;
      link?: string | null;
      entityType: string;
      entityId: string;
    },
  ) {
    if (!staffIds.length) return;
    const staff = await this.db.staff.findMany({
      where: { id: { in: [...new Set(staffIds)] }, status: 'ACTIVE' },
      select: {
        email: true,
        membership: { select: { userId: true, status: true, user: { select: { email: true } } } },
      },
    });
    await this.send(
      staff.map((s) => ({
        userId: s.membership?.status === 'ACTIVE' ? s.membership.userId : null,
        email: s.email ?? s.membership?.user.email ?? null,
      })),
      { category: 'boarding', ...alert, link: alert.link ?? null },
    );
  }
}
