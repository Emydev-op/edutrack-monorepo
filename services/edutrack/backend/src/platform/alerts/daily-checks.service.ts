import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SupportService } from '../support/support.service.js';
import { GRACE_DAYS, overdueInvoice } from '../subscriptions/subscriptions.service.js';
import { addDays, daysBetween, formatDay, formatNaira, lagosToday } from '../shared/format.js';
import { PlatformAlertsService } from './platform-alerts.service.js';

/** How far ahead "Subscription expiring" alerts look. */
export const EXPIRING_WINDOW_DAYS = 30;

/**
 * The morning checks (run by `DailyChecksProcessor`): staff invitations that lapsed, subscriptions
 * renewing soon and overdue platform invoices (each record alerts a person once), and resolved
 * support tickets the school never answered, which close by themselves.
 */
@Injectable()
export class DailyChecksService {
  private readonly logger = new Logger(DailyChecksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: PlatformAlertsService,
    private readonly support: SupportService,
    private readonly clock: Clock,
  ) {}

  async run() {
    const result = {
      subscriptions: await this.moveSubscriptions(),
      invitationsExpired: await this.expireInvitations(),
      expiring: await this.subscriptionsExpiring(),
      overdue: await this.overdueInvoices(),
      ticketsClosed: await this.support.autoClose(),
    };
    this.logger.log({ msg: 'Daily back-office checks', ...result });
    return result;
  }

  /**
   * Moves subscriptions along by date: Active → Expiring inside the renewal window, then a
   * 14-day grace period once the renewal date passes (still fully open), then Expired, which
   * makes School Admin view-only and closes the school's other portals. Restricted and Cancelled
   * are only set by EduTrack staff; Extend and Reactivate bring a school back. The school's
   * admins hear about the grace period and the expiry.
   */
  private async moveSubscriptions() {
    const today = lagosToday(this.clock.now());
    const moved = { expiring: 0, grace: 0, expired: 0 };
    const subs = await this.prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'EXPIRING', 'GRACE_PERIOD'] } },
      include: { school: { select: { name: true } } },
    });
    for (const s of subs) {
      const graceEnds = s.graceEndsOn ?? addDays(s.renewsOn, GRACE_DAYS);
      const next =
        s.renewsOn >= today
          ? s.renewsOn <= addDays(today, EXPIRING_WINDOW_DAYS)
            ? 'EXPIRING'
            : 'ACTIVE'
          : graceEnds >= today
            ? 'GRACE_PERIOD'
            : 'EXPIRED';
      // Never back to Active by date alone: Extend and Reactivate do that.
      if (next === s.status || next === 'ACTIVE') continue;
      const { count } = await this.prisma.subscription.updateMany({
        where: { id: s.id, status: s.status },
        data: {
          status: next,
          ...(next === 'GRACE_PERIOD' && { graceEndsOn: graceEnds }),
        },
      });
      if (!count) continue;
      if (next === 'EXPIRING') moved.expiring++;
      if (next === 'GRACE_PERIOD') {
        moved.grace++;
        await this.tellSchool(
          s.schoolId,
          'Subscription renewal is overdue',
          `Renew by ${formatDay(graceEnds, { calendar: true })} to keep EduTrack open. After that, School Admin becomes view-only and teachers, parents and students can’t sign in.`,
        );
      }
      if (next === 'EXPIRED') {
        moved.expired++;
        await this.tellSchool(
          s.schoolId,
          'Subscription expired',
          'School Admin is view-only and teachers, parents and students can’t sign in until it’s renewed. Your data is safe. Raise a support ticket if you need help.',
        );
      }
    }
    return moved;
  }

  /** An in-app notice to the school's owners and admins (School Admin's bell). */
  private async tellSchool(schoolId: string, title: string, body: string) {
    const admins = await this.prisma.schoolMembership.findMany({
      where: {
        schoolId,
        kind: 'STAFF',
        status: 'ACTIVE',
        roles: { some: { role: { key: { in: ['owner', 'school_admin'] }, archivedAt: null } } },
      },
      select: { userId: true },
    });
    const now = this.clock.now();
    await this.prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.userId,
        schoolId,
        category: 'subscription',
        title,
        body,
        link: '/settings',
        createdAt: now,
      })),
    });
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
