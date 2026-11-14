import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { platformPermissions } from '../../auth/auth.presenter.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import { paginated, toSkipTake } from '../../common/pagination/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { SubscriptionStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  addDays,
  addMonths,
  formatCount,
  formatDay,
  formatLimit,
  formatNaira,
  lagosToday,
  PERIOD_MONTHS,
  PERIOD_SUFFIX,
  schoolStatusLabel,
  SUBSCRIPTION_STATUS_BY_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
} from '../shared/format.js';
import { SCHOOL_NOT_FOUND } from '../shared/params.js';
import { PlatformAuditService } from '../shared/platform-audit.service.js';
import type { SubscriptionActionDto } from '../schools/dto/schools.dto.js';
import type { SubscriptionListQuery } from './dto/subscriptions.dto.js';
import { ENROLLED } from '../schools/school-view.js';
import { SchoolsService } from '../schools/schools.service.js';
import { startingPrice } from '../schools/provisioning.service.js';

/** Days of full access after a missed renewal before the school is restricted. */
export const GRACE_DAYS = 14;

const EXTEND_MONTHS = { '1 month': 1, '3 months': 3, '6 months': 6 } as const;

const ACTION_LABEL: Record<SubscriptionActionDto['action'], string> = {
  change_plan: 'Plan changed',
  extend: 'Subscription extended',
  enter_grace: 'Grace period started',
  restrict: 'School restricted',
  cancel: 'Subscription cancelled',
  reactivate: 'Subscription reactivated',
};

/** An unpaid invoice past its due date makes billing "Overdue". */
export const overdueInvoice = (today: Date): Prisma.PlatformInvoiceWhereInput => ({
  status: 'ISSUED',
  dueOn: { lt: today },
});

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: PlatformAuditService,
    private readonly clock: Clock,
  ) {}

  /** Every subscription of a school that isn't suspended, with usage against its plan. */
  async list(query: SubscriptionListQuery) {
    const today = lagosToday(this.clock.now());
    const status = query.status ? SUBSCRIPTION_STATUS_BY_LABEL[query.status] : undefined;
    const search = query.search?.trim();
    const where: Prisma.SubscriptionWhereInput = {
      school: {
        status: { not: 'SUSPENDED' },
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
      },
      ...(status && { status }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        include: {
          plan: true,
          school: {
            select: {
              id: true,
              name: true,
              _count: {
                select: {
                  students: { where: { status: { in: ENROLLED } } },
                  branches: { where: { status: 'ACTIVE' } },
                },
              },
            },
          },
          invoices: { where: overdueInvoice(today), select: { id: true }, take: 1 },
        },
        orderBy: [{ renewsOn: 'asc' }, { school: { name: 'asc' } }],
        ...toSkipTake(query),
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return paginated(
      rows.map((s) => ({
        schoolId: s.school.id,
        schoolName: s.school.name,
        plan: s.plan.name,
        studentUsage: `${formatCount(s.school._count.students)} / ${formatLimit(s.plan.studentLimit)}`,
        branchUsage: `${s.school._count.branches} / ${formatLimit(s.plan.branchLimit)}`,
        renews: formatDay(s.renewsOn, { calendar: true }),
        billing: s.invoices.length > 0 ? ('Overdue' as const) : ('Paid' as const),
        status: SUBSCRIPTION_STATUS_LABEL[s.status],
      })),
      total,
      query,
    );
  }

  private async loadSubscription(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!school) throw AppException.notFound(SCHOOL_NOT_FOUND);
    if (!school.subscription)
      throw AppException.notFound('This school has no subscription yet.', 'NO_SUBSCRIPTION');
    return { school, subscription: school.subscription };
  }

  async forSchool(schoolId: string) {
    const { school, subscription: s } = await this.loadSubscription(schoolId);
    const today = lagosToday(this.clock.now());
    const overdue = await this.prisma.platformInvoice.count({
      where: { subscriptionId: s.id, ...overdueInvoice(today) },
    });
    const custom = s.plan.pricingModel === 'CUSTOM' && s.priceKobo === 0n;
    const status = schoolStatusLabel(school.status, s.status);
    return {
      plan: s.plan.name,
      price: custom ? 'Custom' : `${formatNaira(s.priceKobo)}${PERIOD_SUFFIX[s.billingPeriod]}`,
      studentLimit: formatLimit(s.plan.studentLimit),
      branchLimit: formatLimit(s.plan.branchLimit),
      renews: formatDay(s.renewsOn, { calendar: true }),
      payment: overdue > 0 ? ('Overdue' as const) : ('Paid' as const),
      status: status === 'Onboarding' ? SUBSCRIPTION_STATUS_LABEL[s.status] : status,
    };
  }

  /** Restricting or cancelling takes features away from a school: it needs Subscriptions.Suspend. */
  private async requireSuspend(userId: string) {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { userId },
      include: { role: true },
    });
    if (!staff || !platformPermissions(staff).includes('Subscriptions.Suspend'))
      throw AppException.forbidden();
  }

  /**
   * Changes a school's subscription. Every action is audited with the plan and status before and
   * after. Moving the renewal date never creates an invoice by itself.
   */
  async act(schoolId: string, dto: SubscriptionActionDto, user: AuthUserContext) {
    if (dto.action === 'restrict' || dto.action === 'cancel')
      await this.requireSuspend(user.userId);
    const { school, subscription: s } = await this.loadSubscription(schoolId);
    const now = this.clock.now();
    const today = lagosToday(now);
    const before = `${s.plan.name} · ${SUBSCRIPTION_STATUS_LABEL[s.status]}`;
    let data: Prisma.SubscriptionUncheckedUpdateInput = {};
    let planName = s.plan.name;
    let next: SubscriptionStatus = s.status;
    const refuse = (message: string, code: string) => AppException.conflict(message, code);

    switch (dto.action) {
      case 'change_plan': {
        const plan = await this.prisma.plan.findFirst({
          where: { name: { equals: dto.plan!, mode: 'insensitive' } },
        });
        if (!plan) throw AppException.validation({ plan: 'Choose a plan.' });
        if (plan.id === s.planId)
          throw refuse(`${school.name} is already on ${plan.name}.`, 'SAME_PLAN');
        if (plan.status !== 'ACTIVE')
          throw AppException.validation({ plan: `${plan.name} isn’t offered any more.` });
        // Keep the billing period when the new plan offers it; the price follows the new plan.
        const samePeriod =
          plan.pricingModel === 'FLAT' &&
          { ANNUAL: plan.annualPriceKobo, TERM: plan.termPriceKobo, MONTH: plan.monthPriceKobo }[
            s.billingPeriod
          ];
        const { period, priceKobo } = samePeriod
          ? { period: s.billingPeriod, priceKobo: samePeriod }
          : startingPrice(plan);
        data = { planId: plan.id, planVersion: plan.version, billingPeriod: period, priceKobo };
        planName = plan.name;
        break;
      }
      case 'extend': {
        // From the later of the current renewal date and today, so an overdue school gets the
        // full extension.
        const from = s.renewsOn > today ? s.renewsOn : today;
        const renewsOn = addMonths(from, EXTEND_MONTHS[dto.period!]);
        if (s.status !== 'CANCELLED') next = 'ACTIVE';
        data = { renewsOn, graceEndsOn: null, restrictedAt: null, statusReason: dto.reason };
        break;
      }
      case 'enter_grace':
        if (s.status === 'GRACE_PERIOD')
          throw refuse('The grace period has already started.', 'ALREADY_IN_GRACE');
        if (s.status === 'CANCELLED')
          throw refuse('Reactivate the subscription before starting a grace period.', 'CANCELLED');
        next = 'GRACE_PERIOD';
        data = { graceEndsOn: addDays(today, GRACE_DAYS), restrictedAt: null };
        break;
      case 'restrict':
        if (s.status === 'RESTRICTED')
          throw refuse('This school is already restricted.', 'ALREADY_RESTRICTED');
        next = 'RESTRICTED';
        data = { restrictedAt: now, statusReason: dto.reason };
        break;
      case 'cancel':
        if (s.status === 'CANCELLED')
          throw refuse('This subscription is already cancelled.', 'ALREADY_CANCELLED');
        next = 'CANCELLED';
        data = { cancelledAt: now, statusReason: dto.reason };
        break;
      case 'reactivate': {
        if (!['RESTRICTED', 'CANCELLED', 'EXPIRED', 'GRACE_PERIOD'].includes(s.status))
          throw refuse('This subscription is already active.', 'ALREADY_ACTIVE');
        next = 'ACTIVE';
        // Payment was received: a lapsed subscription starts a new period today.
        const renewsOn =
          s.renewsOn < today
            ? addDays(addMonths(today, PERIOD_MONTHS[s.billingPeriod]), -1)
            : s.renewsOn;
        data = {
          renewsOn,
          graceEndsOn: null,
          restrictedAt: null,
          cancelledAt: null,
          statusReason: null,
        };
        break;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id: s.id }, data: { ...data, status: next } });
      await this.audit.record(
        {
          action: `subscription.${dto.action}`,
          entity: 'Subscription',
          entityId: school.id,
          schoolId: school.id,
          summary: `${ACTION_LABEL[dto.action]} · ${school.name}${dto.reason ? ` · “${dto.reason}”` : ''}`,
          previous: before,
          next: `${planName} · ${SUBSCRIPTION_STATUS_LABEL[next]}`,
          ...(dto.action === 'extend' && { after: { period: dto.period } }),
        },
        tx,
      );
    });
    return this.schools.get(school.id);
  }
}
