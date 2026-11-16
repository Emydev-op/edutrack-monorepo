import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { overdueInvoice } from '../subscriptions/subscriptions.service.js';
import { addDays, daysBetween, formatDay, formatNaira, lagosToday } from '../shared/format.js';
import { PlatformAlertsService } from './platform-alerts.service.js';

/** How far ahead "Subscription expiring" alerts look. */
export const EXPIRING_WINDOW_DAYS = 30;

/**
 * The morning checks (run by `DailyChecksProcessor`): staff invitations that lapsed, subscriptions
 * renewing soon and overdue platform invoices. Each record alerts a person once.
 */
@Injectable()
export class DailyChecksService {
  private readonly logger = new Logger(DailyChecksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: PlatformAlertsService,
    private readonly clock: Clock,
  ) {}

  async run() {
    const result = {
      invitationsExpired: await this.expireInvitations(),
      expiring: await this.subscriptionsExpiring(),
      overdue: await this.overdueInvoices(),
    };
    this.logger.log({ msg: 'Daily back-office checks', ...result });
    return result;
  }

  /** Marks lapsed back-office invitations Expired and tells the people who manage users. */
  private async expireInvitations() {
    const now = this.clock.now();
    const lapsed = await this.prisma.invitation.findMany({
      where: { kind: 'PLATFORM_STAFF', status: 'PENDING', expiresAt: { lte: now } },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    for (const inv of lapsed) {
      const { count } = await this.prisma.invitation.updateMany({
        where: { id: inv.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (count === 0) continue;
      await this.alerts.tryNotify(
        'user.invitation',
        {
          title: `${inv.user.firstName} ${inv.user.lastName}’s invitation expired`,
          detail: 'Users · resend it from their profile',
          link: `/users/${inv.user.id}`,
          entityType: 'Invitation',
          entityId: inv.id,
        },
        { permission: 'Users.View' },
        { onceSince: inv.createdAt },
      );
    }
    return lapsed.length;
  }

  private async subscriptionsExpiring() {
    const today = lagosToday(this.clock.now());
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING'] },
        school: { status: 'ACTIVE' },
        renewsOn: { gte: today, lte: addDays(today, EXPIRING_WINDOW_DAYS) },
      },
      include: { school: { select: { name: true } }, plan: { select: { name: true } } },
    });
    for (const s of subs) {
      const days = daysBetween(today, s.renewsOn);
      await this.alerts.tryNotify(
        'subscription.expiring',
        {
          title: `${s.school.name} renews on ${formatDay(s.renewsOn, { calendar: true })}`,
          detail: `${s.plan.name} · ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}`,
          link: `/schools/${s.schoolId}/subscription`,
          entityType: 'Subscription',
          entityId: s.id,
        },
        { permission: 'Subscriptions.View' },
        // Once per renewal date.
        { onceSince: addDays(s.renewsOn, -EXPIRING_WINDOW_DAYS - 1) },
      );
    }
    return subs.length;
  }

  private async overdueInvoices() {
    const today = lagosToday(this.clock.now());
    const invoices = await this.prisma.platformInvoice.findMany({
      where: { ...overdueInvoice(today), school: { status: { not: 'SUSPENDED' } } },
      include: { school: { select: { name: true } } },
    });
    for (const inv of invoices) {
      await this.alerts.tryNotify(
        'subscription.overdue',
        {
          title: `${inv.school.name} has an overdue invoice`,
          detail: `${inv.number} · ${formatNaira(inv.amountKobo)} · due ${formatDay(inv.dueOn, { calendar: true })}`,
          link: `/schools/${inv.schoolId}/billing`,
          entityType: 'Subscription',
          entityId: inv.id,
        },
        { permission: 'Subscriptions.View' },
        { onceSince: inv.dueOn },
      );
    }
    return invoices.length;
  }
}
