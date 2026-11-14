import { Injectable } from '@nestjs/common';
import { Clock, DAY } from '../../common/clock/clock.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PlatformInvoiceKind } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  addDays,
  addMonths,
  daysBetween,
  formatDay,
  formatLong,
  formatNaira,
  formatNairaShort,
  lagosToday,
  shortMonth,
  toMillions,
} from '../shared/format.js';
import { ENROLLED, schoolInclude, setupOf, type SchoolWithView } from '../schools/school-view.js';
import { SchoolsService } from '../schools/schools.service.js';
import { overdueInvoice } from '../subscriptions/subscriptions.service.js';

export const REVENUE_RANGES = ['7d', '30d', '3m', '6m', '12m'] as const;
export type RevenueRange = (typeof REVENUE_RANGES)[number];
export const GROWTH_RANGES = ['6m', '12m'] as const;
export type GrowthRange = (typeof GROWTH_RANGES)[number];

const RANGE_LABEL: Record<RevenueRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  '12m': 'Last 12 months',
};

/** Onboarding schools with no progress for this long are "stalled". */
const STALLED_DAYS = 30;
/** Renewals within this many days count as "expiring soon". */
const EXPIRING_DAYS = 30;
/** Administrator invitations pending longer than this need a nudge. */
const PENDING_INVITE_DAYS = 7;

const LIVE_SUBSCRIPTION = ['ACTIVE', 'EXPIRING', 'GRACE_PERIOD'] as const;

const dayMonth = (d: Date) => `${d.getUTCDate()} ${shortMonth(d)}`;

/** ISO week number of a calendar date. */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

interface Bucket {
  label: string;
  /** Inclusive start, exclusive end, as Lagos calendar dates (midnight UTC). */
  start: Date;
  end: Date;
}

/** The chart's buckets for a range, oldest first, ending today. */
export function revenueBuckets(range: RevenueRange, today: Date): Bucket[] {
  const tomorrow = addDays(today, 1);
  if (range === '7d')
    return Array.from({ length: 7 }, (_, i) => {
      const start = addDays(today, i - 6);
      return {
        label: i === 0 ? dayMonth(start) : String(start.getUTCDate()),
        start,
        end: addDays(start, 1),
      };
    });
  if (range === '30d') {
    // 30 days in four buckets of 7, 7, 8 and 8 days, labelled by ISO week.
    const sizes = [7, 7, 8, 8];
    let start = addDays(tomorrow, -30);
    return sizes.map((size) => {
      const bucket = { label: `Wk ${isoWeek(start)}`, start, end: addDays(start, size) };
      start = bucket.end;
      return bucket;
    });
  }
  const months = { '3m': 3, '6m': 6, '12m': 12 }[range];
  const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return Array.from({ length: months }, (_, i) => {
    const start = addMonths(thisMonth, i - months + 1);
    const end = i === months - 1 ? tomorrow : addMonths(start, 1);
    return { label: shortMonth(start), start, end };
  });
}

const KIND_GROUP: Record<PlatformInvoiceKind, 'renewals' | 'newSchools' | 'upgrades'> = {
  RENEWAL: 'renewals',
  NEW_SCHOOL: 'newSchools',
  SETUP_FEE: 'newSchools',
  UPGRADE: 'upgrades',
  ADJUSTMENT: 'upgrades',
};

/** A timestamp's Lagos calendar date (midnight UTC), to compare with bucket dates. */
const lagosDate = (at: Date) => lagosToday(at);

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly clock: Clock,
  ) {}

  async summary(userId: string) {
    const now = this.clock.now();
    const stalledBefore = new Date(now.getTime() - STALLED_DAYS * DAY);
    const [
      user,
      schools,
      active,
      onboarding,
      stalledOnboarding,
      suspended,
      expired,
      students,
      teachers,
      activeBranches,
      createdBranches,
    ] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true } }),
      this.prisma.school.count(),
      this.prisma.school.count({
        where: { status: 'ACTIVE', subscription: { status: { in: [...LIVE_SUBSCRIPTION] } } },
      }),
      this.prisma.school.count({ where: { status: 'ONBOARDING' } }),
      this.prisma.school.count({
        where: { status: 'ONBOARDING', provisionedAt: { lt: stalledBefore } },
      }),
      this.prisma.school.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.school.count({
        where: { status: 'ACTIVE', subscription: { status: 'EXPIRED' } },
      }),
      this.prisma.student.count({
        where: { status: { in: ENROLLED }, school: { status: { not: 'SUSPENDED' } } },
      }),
      this.prisma.staff.count({
        where: { kind: 'TEACHING', status: 'ACTIVE', school: { status: { not: 'SUSPENDED' } } },
      }),
      this.prisma.branch.count({
        where: { status: 'ACTIVE', school: { status: { not: 'SUSPENDED' } } },
      }),
      this.prisma.branch.count(),
    ]);
    return {
      greetingName: user?.firstName ?? '',
      generatedAt: formatLong(now),
      totals: {
        schools,
        active,
        activeShare: `${schools ? Math.round((active / schools) * 100) : 0}% of schools`,
        onboarding,
        stalledOnboarding,
        suspended,
        expired,
        students,
        teachers,
        activeBranches,
        createdBranches,
      },
    };
  }

  /** Paid platform invoices in the range, by source, against the period before it. */
  async revenue(range: RevenueRange) {
    const now = this.clock.now();
    const today = lagosToday(now);
    const buckets = revenueBuckets(range, today);
    const windowStart = buckets[0]!.start;
    const windowEnd = buckets.at(-1)!.end;
    const length = windowEnd.getTime() - windowStart.getTime();
    const shift = (d: Date) => new Date(d.getTime() - length);
    // Paid-at is a timestamp; widen by a day each side and bucket by Lagos date below.
    const paid = await this.prisma.platformInvoice.findMany({
      where: {
        status: 'PAID',
        paidAt: { gte: addDays(shift(windowStart), -1), lt: addDays(windowEnd, 1) },
      },
      select: { kind: true, amountKobo: true, paidAt: true },
    });

    const points = buckets.map((b) => ({
      label: b.label,
      renewals: 0n,
      newSchools: 0n,
      upgrades: 0n,
      previous: 0n,
    }));
    let total = 0n;
    let previousTotal = 0n;
    let renewals = 0;
    for (const inv of paid) {
      const day = lagosDate(inv.paidAt!);
      const i = buckets.findIndex((b) => day >= b.start && day < b.end);
      if (i >= 0) {
        points[i]![KIND_GROUP[inv.kind]] += inv.amountKobo;
        total += inv.amountKobo;
        if (inv.kind === 'RENEWAL') renewals += 1;
        continue;
      }
      const j = buckets.findIndex((b) => day >= shift(b.start) && day < shift(b.end));
      if (j >= 0) {
        points[j]!.previous += inv.amountKobo;
        previousTotal += inv.amountKobo;
      }
    }

    const [activeSubscriptions, overdueRows, expiringSoon] = await Promise.all([
      this.prisma.subscription.count({
        where: { status: { in: [...LIVE_SUBSCRIPTION] }, school: { status: { not: 'SUSPENDED' } } },
      }),
      this.prisma.platformInvoice.findMany({
        where: overdueInvoice(today),
        select: { schoolId: true, amountKobo: true },
      }),
      this.prisma.subscription.count({
        where: {
          status: { in: ['ACTIVE', 'EXPIRING'] },
          renewsOn: { gte: today, lte: addDays(today, EXPIRING_DAYS) },
          school: { status: { not: 'SUSPENDED' } },
        },
      }),
    ]);
    const overdueAmount = overdueRows.reduce((sum, r) => sum + r.amountKobo, 0n);

    return {
      label: RANGE_LABEL[range],
      total: toMillions(total),
      previousTotal: toMillions(previousTotal),
      points: points.map((p) => ({
        label: p.label,
        renewals: toMillions(p.renewals),
        newSchools: toMillions(p.newSchools),
        upgrades: toMillions(p.upgrades),
        previous: toMillions(p.previous),
      })),
      stats: {
        activeSubscriptions,
        renewals,
        overdue: new Set(overdueRows.map((r) => r.schoolId)).size,
        overdueAmount: formatNairaShort(overdueAmount),
        expiringSoon,
      },
    };
  }

  /**
   * Schools onboarded per month and how many were active, suspended and expired at each month's
   * end. Reconstructed from today's records (provisioning, suspension and renewal dates), so a
   * school suspended and reactivated in between isn't replayed.
   */
  async growth(range: GrowthRange) {
    const today = lagosToday(this.clock.now());
    const months = range === '12m' ? 12 : 6;
    const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const schools = await this.prisma.school.findMany({
      select: {
        status: true,
        provisionedAt: true,
        createdAt: true,
        suspendedAt: true,
        setupFinishedAt: true,
        subscription: { select: { status: true, renewsOn: true } },
      },
    });
    return {
      months: Array.from({ length: months }, (_, i) => {
        const start = addMonths(thisMonth, i - months + 1);
        const end = i === months - 1 ? addDays(today, 1) : addMonths(start, 1);
        let onboarded = 0;
        let active = 0;
        let suspended = 0;
        let expired = 0;
        for (const s of schools) {
          const since = lagosDate(s.provisionedAt ?? s.createdAt);
          if (since >= end) continue;
          if (since >= start) onboarded += 1;
          const lapsed =
            !!s.subscription &&
            ['EXPIRED', 'CANCELLED'].includes(s.subscription.status) &&
            s.subscription.renewsOn < end;
          if (s.status === 'SUSPENDED' && s.suspendedAt && lagosDate(s.suspendedAt) < end)
            suspended += 1;
          else if (lapsed) expired += 1;
          else if (s.status !== 'ONBOARDING') active += 1;
        }
        return { month: shortMonth(start), onboarded, active, suspended, expired };
      }),
    };
  }

  async subscriptionHealth() {
    const today = lagosToday(this.clock.now());
    const counts = await this.prisma.subscription.groupBy({
      by: ['status'],
      where: { school: { status: { not: 'SUSPENDED' } } },
      _count: { _all: true },
    });
    const count = (status: string) => counts.find((c) => c.status === status)?._count._all ?? 0;
    const expiringSoon = await this.prisma.subscription.count({
      where: {
        school: { status: { not: 'SUSPENDED' } },
        OR: [
          { status: 'EXPIRING' },
          { status: 'ACTIVE', renewsOn: { gte: today, lte: addDays(today, EXPIRING_DAYS) } },
        ],
      },
    });
    const activeOnly = await this.prisma.subscription.count({
      where: {
        school: { status: { not: 'SUSPENDED' } },
        status: 'ACTIVE',
        renewsOn: { gt: addDays(today, EXPIRING_DAYS) },
      },
    });
    return [
      { label: 'Active', status: 'Active', schools: activeOnly, tone: 'success' as const },
      {
        label: 'Expiring soon',
        status: 'Expiring',
        schools: expiringSoon,
        tone: 'warning' as const,
      },
      {
        label: 'Grace period',
        status: 'Grace period',
        schools: count('GRACE_PERIOD'),
        tone: 'warning' as const,
      },
      {
        label: 'Restricted',
        status: 'Restricted',
        schools: count('RESTRICTED'),
        tone: 'error' as const,
      },
      { label: 'Expired', status: 'Expired', schools: count('EXPIRED'), tone: 'neutral' as const },
    ];
  }

  /** What needs a person today, most urgent first. */
  async attention() {
    const now = this.clock.now();
    const today = lagosToday(now);
    const items: {
      id: string;
      status: string;
      text: string;
      context: string;
      action: string;
      to: string;
    }[] = [];

    const lapsed = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['GRACE_PERIOD', 'RESTRICTED'] },
        school: { status: { not: 'SUSPENDED' } },
      },
      include: { school: { select: { id: true, name: true } } },
      orderBy: [{ status: 'desc' }, { renewsOn: 'asc' }],
      take: 6,
    });
    for (const s of lapsed) {
      if (s.status === 'GRACE_PERIOD')
        items.push({
          id: `grace-${s.schoolId}`,
          status: 'Grace period',
          text: `${s.school.name}: renewal ended ${formatDay(s.renewsOn, { calendar: true })}${
            s.graceEndsOn
              ? `, grace period ends ${formatDay(s.graceEndsOn, { calendar: true })}`
              : ''
          }`,
          context: `Subscription · ${formatNaira(s.priceKobo)} due`,
          action: 'Manage',
          to: `/schools/${s.schoolId}/subscription`,
        });
      else
        items.push({
          id: `restricted-${s.schoolId}`,
          status: 'Restricted',
          text: `${s.school.name} restricted${s.restrictedAt ? ` since ${formatDay(s.restrictedAt)}` : ''} · read-only for staff`,
          context: s.statusReason ?? 'Renewal overdue',
          action: 'Open',
          to: `/schools/${s.schoolId}/subscription`,
        });
    }

    const open = {
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    } satisfies Prisma.SupportTicketWhereInput;
    const [urgent, unassigned, top] = await Promise.all([
      this.prisma.supportTicket.count({ where: { ...open, priority: 'URGENT' } }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN', assigneeUserId: null } }),
      this.prisma.supportTicket.findFirst({
        where: { ...open, priority: { in: ['URGENT', 'HIGH'] } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: { school: { select: { name: true } } },
      }),
    ]);
    if (urgent + unassigned > 0)
      items.push({
        id: 'support',
        status: urgent > 0 ? 'Urgent' : 'Unassigned',
        text: `${urgent} urgent and ${unassigned} unassigned support issue${urgent + unassigned === 1 ? '' : 's'}`,
        context: top ? `${top.number} ${top.school.name} · ${top.subject}` : 'Support desk',
        action: 'Support',
        to: '/support',
      });

    const stalled = await this.prisma.school.findMany({
      where: {
        status: 'ONBOARDING',
        provisionedAt: { lt: new Date(now.getTime() - STALLED_DAYS * DAY) },
      },
      include: schoolInclude,
      orderBy: { provisionedAt: 'asc' },
      take: 3,
    });
    for (const school of stalled) {
      const setup = setupOf(school);
      const view = this.schools.view(school);
      items.push({
        id: `stalled-${school.id}`,
        status: 'Onboarding',
        text: `${school.name} stuck at ${setup.progress}% setup for ${daysBetween(lagosDate(school.provisionedAt!), today)} days`,
        context: `Next step: ${setup.step} · admin ${view.admin.replace(/ \(invited\).*$/, '')}`,
        action: 'Open',
        to: `/schools/${school.id}`,
      });
    }

    const pending = await this.prisma.invitation.findMany({
      where: {
        kind: 'SCHOOL_STAFF',
        status: 'PENDING',
        createdAt: { lt: new Date(now.getTime() - PENDING_INVITE_DAYS * DAY) },
        membership: { roles: { some: { role: { key: { in: ['owner', 'school_admin'] } } } } },
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        school: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 3,
    });
    for (const inv of pending) {
      if (!inv.school) continue;
      const left = Math.ceil((inv.expiresAt.getTime() - now.getTime()) / DAY);
      items.push({
        id: `invite-${inv.id}`,
        status: 'Pending',
        text: `${inv.school.name} admin hasn’t accepted the invitation (${daysBetween(lagosDate(inv.createdAt), today)} days)`,
        context: `${inv.user.firstName} ${inv.user.lastName} · ${
          left > 0
            ? `invitation expires in ${left} day${left === 1 ? '' : 's'}`
            : 'invitation expired'
        }`,
        action: 'Resend',
        to: `/schools/${inv.school.id}/administrators`,
      });
    }
    return items.slice(0, 8);
  }

  /** Schools still setting up, newest first. */
  async onboarding() {
    const rows: SchoolWithView[] = await this.prisma.school.findMany({
      where: { status: { not: 'SUSPENDED' }, setupFinishedAt: null },
      include: schoolInclude,
      orderBy: [{ provisionedAt: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
    return rows
      .map((s) => this.schools.view(s))
      .filter((s) => s.status === 'Onboarding' || s.setupProgress < 100);
  }
}
