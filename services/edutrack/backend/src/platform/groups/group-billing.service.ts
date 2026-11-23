import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Plan, Prisma } from '../../generated/prisma/client.js';
import type { BillingPeriod } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  addDays,
  addMonths,
  formatDay,
  formatMonth,
  formatNaira,
  lagosToday,
  PERIOD_MONTHS,
  PERIOD_SUFFIX,
} from '../shared/format.js';
import { PlatformAuditService } from '../shared/platform-audit.service.js';
import { nextPlatformNumber, platformInvoiceNumber } from '../shared/platform-sequence.js';
import { startingPrice } from '../schools/provisioning.service.js';

type Db = Prisma.TransactionClient | PrismaService;

export const PERIOD_LABEL: Record<BillingPeriod, string> = {
  ANNUAL: 'Annual',
  TERM: 'Termly',
  MONTH: 'Monthly',
};
const PERIOD_FROM_LABEL = Object.fromEntries(
  Object.entries(PERIOD_LABEL).map(([k, v]) => [v, k as BillingPeriod]),
) as Record<string, BillingPeriod>;

/** Subscriptions EduTrack staff stopped on purpose; the group plan doesn't reopen them. */
const HELD = ['RESTRICTED', 'CANCELLED'];

/** What a school pays for its plan on its own (when it leaves group billing). */
function ownPrice(plan: Plan, period: BillingPeriod): bigint {
  const flat = {
    ANNUAL: plan.annualPriceKobo,
    TERM: plan.termPriceKobo,
    MONTH: plan.monthPriceKobo,
  }[period];
  return plan.pricingModel === 'FLAT' && flat !== null ? flat : startingPrice(plan).priceKobo;
}

/**
 * One bill per group (Back office › Groups › Billing): the group has one plan at one agreed price
 * for the whole group, whatever the number of schools. Member schools' subscriptions follow it —
 * same plan, period and renewal date, with no price of their own — and EduTrack invoices the group,
 * not the schools. Recording the group's payment moves every school's renewal on. A school that
 * leaves the group, or a group that stops group billing, goes back to paying for its plan itself.
 */
@Injectable()
export class GroupBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly clock: Clock,
  ) {}

  private async group(id: string) {
    const g = await this.prisma.schoolGroup.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!g) throw AppException.notFound('Group not found', 'GROUP_NOT_FOUND');
    return g;
  }

  /** The group's plan, price, renewal and invoices. */
  async view(id: string) {
    const g = await this.group(id);
    const today = lagosToday(this.clock.now());
    const invoices = await this.prisma.platformInvoice.findMany({
      where: { groupId: id, status: { not: 'VOID' } },
      orderBy: [{ issuedOn: 'desc' }, { number: 'desc' }],
    });
    const schools = await this.prisma.subscription.findMany({
      where: { school: { groupId: id } },
      include: { plan: true },
    });
    // What the schools would pay on their own, to show the group price against.
    const separately = schools.reduce((sum, s) => sum + ownPrice(s.plan, s.billingPeriod), 0n);
    const overdue = invoices.some((i) => i.status === 'ISSUED' && i.dueOn < today);
    return {
      plan: g.plan?.name ?? null,
      period: g.billingPeriod ? PERIOD_LABEL[g.billingPeriod] : null,
      priceKobo: g.priceKobo !== null ? Number(g.priceKobo) : null,
      price:
        g.priceKobo !== null && g.billingPeriod
          ? `${formatNaira(g.priceKobo)}${PERIOD_SUFFIX[g.billingPeriod]}`
          : null,
      separately: g.plan ? formatNaira(separately) : null,
      startedOn: g.startedOn ? formatDay(g.startedOn) : null,
      renewsOn: g.renewsOn ? g.renewsOn.toISOString().slice(0, 10) : null,
      renewsOnLabel: g.renewsOn ? formatDay(g.renewsOn) : null,
      billingContactEmail: g.billingContactEmail,
      status: !g.plan
        ? 'Not set'
        : overdue
          ? 'Overdue'
          : g.renewsOn && g.renewsOn < today
            ? 'Lapsed'
            : 'Active',
      invoices: invoices.map((inv) => ({
        number: inv.number,
        period: `${formatMonth(inv.periodStart)} – ${formatMonth(inv.periodEnd)}`,
        amount: formatNaira(inv.amountKobo),
        dueOn: formatDay(inv.dueOn),
        status:
          inv.status === 'PAID'
            ? ('Paid' as const)
            : inv.dueOn < today
              ? ('Overdue' as const)
              : ('Due' as const),
        reference: inv.paymentReference,
      })),
    };
  }

  /** Sets or changes the group plan and its price; member schools follow at once. */
  async setPlan(
    id: string,
    input: {
      plan: string;
      period: string;
      priceNaira: number;
      renewsOn?: string;
      billingContactEmail?: string;
    },
  ) {
    const g = await this.group(id);
    const fields: Record<string, string> = {};
    const plan = await this.prisma.plan.findFirst({
      where: { name: { equals: input.plan.trim(), mode: 'insensitive' } },
    });
    if (!plan) fields.plan = 'Choose a plan.';
    else if (plan.status !== 'ACTIVE' && plan.id !== g.planId)
      fields.plan = `${plan.name} isn’t offered any more.`;
    const period = PERIOD_FROM_LABEL[input.period];
    if (!period) fields.period = 'Choose Annual, Termly or Monthly.';
    if (!Number.isFinite(input.priceNaira) || input.priceNaira < 0)
      fields.priceNaira = 'Enter the group’s price.';
    const today = lagosToday(this.clock.now());
    let renewsOn = g.renewsOn;
    if (input.renewsOn) {
      const d = new Date(`${input.renewsOn}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) fields.renewsOn = 'Enter a valid date.';
      else renewsOn = d;
    }
    if (Object.keys(fields).length)
      throw AppException.validation(fields, 'Check the highlighted fields.');
    // A first group plan runs one period from today unless a renewal date is given.
    renewsOn ??= addDays(addMonths(today, PERIOD_MONTHS[period!]), -1);
    const priceKobo = BigInt(Math.round(input.priceNaira * 100));
    const before = g.plan
      ? `${g.plan.name} · ${formatNaira(g.priceKobo ?? 0n)}${PERIOD_SUFFIX[g.billingPeriod!]}`
      : 'No group plan';
    await this.prisma.$transaction(async (tx) => {
      await tx.schoolGroup.update({
        where: { id },
        data: {
          planId: plan!.id,
          billingPeriod: period,
          priceKobo,
          renewsOn,
          startedOn: g.startedOn ?? today,
          ...(input.billingContactEmail !== undefined && {
            billingContactEmail: input.billingContactEmail.trim().toLowerCase() || null,
          }),
        },
      });
      await this.syncMembers(id, tx);
      await this.audit.record(
        {
          action: 'group.billing',
          entity: 'Subscription',
          entityId: id,
          summary: `Group plan set · ${g.name}`,
          previous: before,
          next: `${plan!.name} · ${formatNaira(priceKobo)}${PERIOD_SUFFIX[period!]}`,
        },
        tx,
      );
    });
    return this.view(id);
  }

  /** Stops group billing: every school goes back to paying for its plan itself. */
  async stop(id: string) {
    const g = await this.group(id);
    if (!g.planId)
      throw AppException.conflict('This group isn’t billed as a group.', 'NO_GROUP_PLAN');
    const open = await this.prisma.platformInvoice.count({
      where: { groupId: id, status: 'ISSUED' },
    });
    if (open)
      throw AppException.conflict(
        'Record the payment for, or void, the group’s open invoice first.',
        'GROUP_INVOICE_OPEN',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.schoolGroup.update({
        where: { id },
        data: {
          planId: null,
          billingPeriod: null,
          priceKobo: null,
          renewsOn: null,
          startedOn: null,
        },
      });
      await this.syncMembers(id, tx);
      await this.audit.record(
        {
          action: 'group.billing_stop',
          entity: 'Subscription',
          entityId: id,
          summary: `Group billing stopped · ${g.name}`,
          previous: g.plan?.name ?? null,
          next: 'Schools billed separately',
        },
        tx,
      );
    });
    return this.view(id);
  }

  /**
   * Keeps member schools' subscriptions on the group plan: same plan, period and renewal date,
   * no price of their own, and a lapsed school opened again once the group is paid up (schools
   * EduTrack restricted or cancelled stay as they are). Schools no longer in the group, or in a
   * group without a plan, go back to their own price, keeping the renewal date already paid for.
   */
  async syncMembers(id: string, db: Db = this.prisma) {
    const g = await db.schoolGroup.findUniqueOrThrow({ where: { id }, include: { plan: true } });
    const today = lagosToday(this.clock.now());
    const subs = await db.subscription.findMany({
      where: { OR: [{ groupId: id }, { school: { groupId: id } }] },
      include: { school: { select: { groupId: true } }, plan: true },
    });
    for (const s of subs) {
      const member = s.school.groupId === id && !!g.plan;
      if (!member) {
        if (s.groupId === id)
          await db.subscription.update({
            where: { id: s.id },
            data: { groupId: null, priceKobo: ownPrice(s.plan, s.billingPeriod) },
          });
        continue;
      }
      const reopen = !HELD.includes(s.status) && s.status !== 'ACTIVE' && g.renewsOn! >= today;
      await db.subscription.update({
        where: { id: s.id },
        data: {
          groupId: id,
          planId: g.plan!.id,
          planVersion: g.plan!.version,
          billingPeriod: g.billingPeriod!,
          priceKobo: 0n,
          renewsOn: g.renewsOn!,
          trialEndsOn: null,
          ...(reopen && { status: 'ACTIVE', graceEndsOn: null }),
        },
      });
    }
  }

  /**
   * Invoices the group for its plan: the current period if it was never invoiced, else the next
   * one from the renewal date. One open invoice at a time.
   */
  async issueInvoice(id: string) {
    const g = await this.group(id);
    if (!g.planId || !g.renewsOn || !g.billingPeriod || g.priceKobo === null)
      throw AppException.conflict('Set the group plan first.', 'NO_GROUP_PLAN');
    if (g.priceKobo === 0n)
      throw AppException.conflict('The group plan has no price to invoice.', 'NOTHING_TO_INVOICE');
    const open = await this.prisma.platformInvoice.findFirst({
      where: { groupId: id, status: 'ISSUED' },
    });
    if (open)
      throw AppException.conflict(
        `${open.number} is still open. Record its payment first.`,
        'GROUP_INVOICE_OPEN',
      );
    const last = await this.prisma.platformInvoice.findFirst({
      where: { groupId: id, status: { not: 'VOID' } },
      orderBy: { periodEnd: 'desc' },
    });
    const today = lagosToday(this.clock.now());
    const coversNow = !last || last.periodEnd < g.renewsOn;
    const periodStart = coversNow ? (g.startedOn ?? today) : addDays(g.renewsOn, 1);
    const periodEnd = coversNow
      ? g.renewsOn
      : addMonths(g.renewsOn, PERIOD_MONTHS[g.billingPeriod]);
    const dueOn = coversNow ? today : g.renewsOn > today ? g.renewsOn : today;
    const number = await this.prisma.$transaction(async (tx) => {
      const year = today.getUTCFullYear();
      const n = platformInvoiceNumber(
        year,
        await nextPlatformNumber(tx, 'PLATFORM_INVOICE', String(year)),
      );
      await tx.platformInvoice.create({
        data: {
          number: n,
          groupId: id,
          kind: last ? 'RENEWAL' : 'NEW_SCHOOL',
          periodStart,
          periodEnd,
          amountKobo: g.priceKobo!,
          issuedOn: today,
          dueOn,
        },
      });
      await this.audit.record(
        {
          action: 'group.invoice',
          entity: 'Subscription',
          entityId: id,
          summary: `Group invoice ${n} issued · ${g.name} · ${formatNaira(g.priceKobo!)}`,
        },
        tx,
      );
      return n;
    });
    return { number, ...(await this.view(id)) };
  }

  /** Records the group's payment: the invoice is paid and every school's renewal moves on. */
  async recordPayment(id: string, number: string, reference: string) {
    const g = await this.group(id);
    const inv = await this.prisma.platformInvoice.findFirst({ where: { groupId: id, number } });
    if (!inv) throw AppException.notFound('Invoice not found', 'NOT_FOUND');
    if (inv.status !== 'ISSUED')
      throw AppException.conflict('This invoice isn’t open.', 'INVOICE_NOT_OPEN');
    await this.prisma.$transaction(async (tx) => {
      await tx.platformInvoice.update({
        where: { id: inv.id },
        data: {
          status: 'PAID',
          paidAt: this.clock.now(),
          paymentReference: reference.trim() || null,
        },
      });
      if (g.renewsOn && inv.periodEnd > g.renewsOn)
        await tx.schoolGroup.update({ where: { id }, data: { renewsOn: inv.periodEnd } });
      await this.syncMembers(id, tx);
      await this.audit.record(
        {
          action: 'group.payment',
          entity: 'Subscription',
          entityId: id,
          summary: `Group payment recorded · ${g.name} · ${inv.number}`,
          next: `Renews ${formatDay(inv.periodEnd > (g.renewsOn ?? inv.periodEnd) ? inv.periodEnd : g.renewsOn!)}`,
        },
        tx,
      );
    });
    return this.view(id);
  }
}
