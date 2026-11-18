import { Injectable, Logger } from '@nestjs/common';
import { PortalLinksService } from '../../auth/portal-links.service.js';
import { Clock } from '../../common/clock/clock.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PlatformAlertsService } from '../alerts/platform-alerts.service.js';

export type SchoolNotice = 'reply' | 'waiting' | 'resolved' | 'closed';
export type DeskNotice = 'created' | 'reply' | 'reopened' | 'confirmed' | 'closed';

const SCHOOL_TITLE: Record<SchoolNotice, string> = {
  reply: 'EduTrack support replied',
  waiting: 'EduTrack support is waiting for your reply',
  resolved: 'EduTrack support marked it resolved',
  closed: 'EduTrack support closed it',
};

/**
 * Tells each side of a support ticket what the other did. The school's admins get an in-app
 * notification (School Admin's bell) and an email; EduTrack's desk gets back-office alerts (the
 * assignee, or everyone who works tickets). Failures are logged, never thrown: a reply is saved
 * even if a notification can't be sent.
 */
@Injectable()
export class SupportNoticesService {
  private readonly logger = new Logger(SupportNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly alerts: PlatformAlertsService,
    private readonly links: PortalLinksService,
    private readonly clock: Clock,
  ) {}

  /** The school's admins who should hear about a ticket: its requester, else every admin. */
  private async schoolAudience(t: { schoolId: string; requesterUserId: string | null }) {
    const admins = await this.prisma.schoolMembership.findMany({
      where: {
        schoolId: t.schoolId,
        kind: 'STAFF',
        status: 'ACTIVE',
        roles: { some: { role: { key: { in: ['owner', 'school_admin'] }, archivedAt: null } } },
      },
      select: { userId: true, user: { select: { firstName: true, email: true } } },
    });
    if (t.requesterUserId) {
      const requester = await this.prisma.schoolMembership.findFirst({
        where: { schoolId: t.schoolId, userId: t.requesterUserId, kind: 'STAFF', status: 'ACTIVE' },
        select: { userId: true, user: { select: { firstName: true, email: true } } },
      });
      if (requester) return [requester];
    }
    return admins;
  }

  async toSchool(ticketId: string, kind: SchoolNotice, detail: string) {
    try {
      const t = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
      if (!t) return;
      const people = await this.schoolAudience(t);
      const title = SCHOOL_TITLE[kind];
      const link = `${this.links.base('SCHOOL_ADMIN')}/support/${t.number}`;
      const now = this.clock.now();
      await this.prisma.notification.createMany({
        data: people.map((p) => ({
          userId: p.userId,
          schoolId: t.schoolId,
          category: 'support',
          title: `${t.number} · ${title}`,
          body: detail,
          link: `/support/${t.number}`,
          entityType: 'SupportTicket',
          entityId: t.id,
          createdAt: now,
        })),
      });
      for (const p of people)
        if (p.user.email)
          await this.notifications.email(p.user.email, 'support-update', {
            firstName: p.user.firstName,
            number: t.number,
            subject: t.subject,
            title,
            detail,
            link,
          });
    } catch (error) {
      this.logger.warn({ msg: 'School support notice failed', ticketId, error: String(error) });
    }
  }

  async toDesk(
    t: {
      id: string;
      number: string;
      subject: string;
      priority: string;
      assigneeUserId: string | null;
    },
    kind: DeskNotice,
    schoolName: string,
  ) {
    const alert = {
      detail: `${schoolName} · ${t.subject}`,
      link: `/support/${t.number}`,
      entityType: 'Issue',
      entityId: t.id,
    };
    if (kind === 'created') {
      await this.alerts.tryNotify(
        'issue.created',
        { ...alert, title: `New support issue ${t.number}` },
        { permission: 'Support.View' },
      );
      if (t.priority === 'URGENT')
        await this.alerts.tryNotify(
          'issue.urgent',
          { ...alert, title: `Urgent support issue ${t.number}` },
          { permission: 'Support.View' },
        );
      return;
    }
    const title = {
      reply: `${schoolName} replied on ${t.number}`,
      reopened: `${schoolName} reopened ${t.number}`,
      confirmed: `${schoolName} confirmed the fix on ${t.number}`,
      closed: `${schoolName} closed ${t.number}`,
    }[kind];
    await this.alerts.tryNotify(
      'issue.school_reply',
      { ...alert, title },
      t.assigneeUserId ? { userIds: [t.assigneeUserId] } : { permission: 'Support.View' },
    );
  }
}
