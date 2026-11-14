import { Injectable, Logger } from '@nestjs/common';
import { isNigerianState, lgasOf } from '@edutrack/shared';
import { normalizePhone } from '../../auth/identifiers.js';
import { InvitationService } from '../../auth/invitation.service.js';
import { PREDEFINED_SCHOOL_ROLES } from '../../auth/permissions/school-permissions.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Plan, Prisma } from '../../generated/prisma/client.js';
import type { BillingPeriod } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PlatformAlertsService } from '../alerts/platform-alerts.service.js';
import { RESERVED_SUBDOMAINS } from '../../tenancy/tenant-resolver.service.js';
import { addDays, addMonths, lagosToday, PERIOD_MONTHS, slugify } from '../shared/format.js';
import { PlatformAuditService } from '../shared/platform-audit.service.js';
import { nextPlatformNumber, platformInvoiceNumber } from '../shared/platform-sequence.js';
import type { ProvisionSchoolDto } from './dto/schools.dto.js';
import { SchoolsService } from './schools.service.js';

const SECTION_CODES: Record<ProvisionSchoolDto['sections'][number], string> = {
  Nursery: 'NUR',
  Primary: 'PRI',
  'Junior Secondary': 'JSS',
  'Senior Secondary': 'SSS',
};
const SECTION_ORDER = Object.keys(SECTION_CODES);
const OWNERSHIP = { Private: 'PRIVATE', Public: 'PUBLIC', Mission: 'MISSION' } as const;

/** Initials for codes: `Lagoon View College` → `LVC`, `Main Campus` → `MC`. */
const initials = (name: string, max: number) =>
  name
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !/^(of|the|and|&)$/i.test(w))
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, max) || 'SCH';

/** The price a new subscription starts at, and the billing period it is charged on. */
export function startingPrice(plan: Plan): { period: BillingPeriod; priceKobo: bigint } {
  if (plan.pricingModel === 'CUSTOM') return { period: 'ANNUAL', priceKobo: 0n };
  if (plan.pricingModel === 'PER_STUDENT')
    // A new school has no students yet: it starts at the plan's termly minimum.
    return { period: 'TERM', priceKobo: plan.minimumPerTermKobo ?? 0n };
  if (plan.annualPriceKobo !== null) return { period: 'ANNUAL', priceKobo: plan.annualPriceKobo };
  if (plan.termPriceKobo !== null) return { period: 'TERM', priceKobo: plan.termPriceKobo };
  return { period: 'MONTH', priceKobo: plan.monthPriceKobo ?? 0n };
}

/**
 * Creates a school from the back office's provisioning wizard: the school and its settings,
 * sections, branches, predefined roles, subscription and first invoice, and invites its first
 * administrators. Everything is one transaction; the invitations are sent once it commits.
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly invitations: InvitationService,
    private readonly audit: PlatformAuditService,
    private readonly alerts: PlatformAlertsService,
    private readonly clock: Clock,
  ) {}

  private async validate(dto: ProvisionSchoolDto) {
    await this.schools.ensureNameFree(dto.name);
    if (!isNigerianState(dto.state))
      throw AppException.validation({ state: 'Select a Nigerian state.' });
    if (!lgasOf(dto.state).includes(dto.lga))
      throw AppException.validation({ lga: `${dto.lga} isn’t an LGA in ${dto.state}.` });
    const phone = normalizePhone(dto.phone);
    if (!phone)
      throw AppException.validation({ phone: 'Enter a phone number, like 0809 120 4400.' });

    const branchNames = dto.branches.map((b) => b.name.toLowerCase());
    if (new Set(branchNames).size !== branchNames.length)
      throw AppException.validation({ branches: 'Give each branch a different name.' });

    const emails = dto.admins.map((a) => a.email);
    if (new Set(emails).size !== emails.length)
      throw AppException.validation({ admins: 'Each administrator needs a different email.' });
    if (!dto.admins.some((a) => a.scope.toLowerCase() === 'all branches'))
      throw AppException.validation({
        admins: 'At least one administrator must manage all branches.',
      });
    for (const a of dto.admins) {
      if (a.scope.toLowerCase() !== 'all branches' && !branchNames.includes(a.scope.toLowerCase()))
        throw AppException.validation({
          admins: `${a.scope} isn’t one of the branches you added.`,
        });
      if (a.phone && !normalizePhone(a.phone))
        throw AppException.validation({ admins: `Check ${a.name}’s phone number.` });
    }

    const plan = await this.prisma.plan.findFirst({
      where: { name: { equals: dto.plan, mode: 'insensitive' } },
    });
    if (!plan) throw AppException.validation({ plan: 'Choose a plan.' });
    if (plan.status !== 'ACTIVE')
      throw AppException.validation({ plan: `${plan.name} isn’t offered to new schools.` });
    if (plan.branchLimit !== null && dto.branches.length > plan.branchLimit)
      throw AppException.validation({
        branches: `${plan.name} allows ${plan.branchLimit} branch${plan.branchLimit === 1 ? '' : 'es'}. Remove a branch or choose a bigger plan.`,
      });

    const start = new Date(`${dto.startDate}T00:00:00Z`);
    const today = lagosToday(this.clock.now());
    if (Number.isNaN(start.getTime()) || dto.startDate !== start.toISOString().slice(0, 10))
      throw AppException.validation({ startDate: 'Pick a start date.' });
    if (start < addDays(today, -31))
      throw AppException.validation({
        startDate: 'The start date can’t be more than a month ago.',
      });
    if (start > addMonths(today, 12))
      throw AppException.validation({ startDate: 'The start date must be within the next year.' });

    return { plan, phone, start };
  }

  /** A free slug: `lagoon-view-college`, then `-2`, `-3`… Reserved words are never used. */
  private async slugFor(name: string): Promise<string> {
    const base = slugify(name) || 'school';
    const candidates = [base, ...Array.from({ length: 50 }, (_, i) => `${base}-${i + 2}`)].filter(
      (s) => !RESERVED_SUBDOMAINS.has(s),
    );
    const taken = new Set(
      (
        await this.prisma.school.findMany({
          where: { slug: { in: candidates } },
          select: { slug: true },
        })
      ).map((s) => s.slug.toLowerCase()),
    );
    const free = candidates.find((s) => !taken.has(s));
    if (!free) throw AppException.conflict('Choose a more distinctive school name.', 'SLUG_TAKEN');
    return free;
  }

  async provision(dto: ProvisionSchoolDto) {
    const { plan, phone, start } = await this.validate(dto);
    const slug = await this.slugFor(dto.name);
    const now = this.clock.now();
    const actorId = RequestContext.get()?.userId ?? null;
    const sections = SECTION_ORDER.filter((s) => dto.sections.includes(s as never));
    const { period, priceKobo } = startingPrice(plan);
    const trialEndsOn = plan.trialDays > 0 ? addDays(start, plan.trialDays) : null;
    const renewsOn = addDays(addMonths(start, PERIOD_MONTHS[period]), -1);

    const { schoolId, invitationIds } = await this.prisma.$transaction(
      async (tx) => {
        const school = await tx.school.create({
          data: {
            slug,
            name: dto.name,
            legalName: dto.legalName || dto.name,
            schoolType: sections.length > 2 ? 'Combined' : sections.join(', '),
            ownership: OWNERSHIP[dto.ownership],
            registrationNumber: dto.registrationNumber || null,
            status: 'ONBOARDING',
            brandColor: dto.brandColor ? dto.brandColor.toUpperCase() : null,
            email: dto.email,
            phone,
            lga: dto.lga,
            state: dto.state,
            provisionedAt: now,
            provisionedById: actorId,
            settings: { create: {} },
          },
        });
        const schoolId = school.id;

        const sectionIds = [];
        for (const [i, name] of sections.entries()) {
          const row = await tx.section.create({
            data: {
              schoolId,
              name,
              code: SECTION_CODES[name as keyof typeof SECTION_CODES],
              sortOrder: i,
            },
          });
          sectionIds.push(row.id);
        }

        const prefix = initials(dto.name, 3);
        const usedCodes = new Set<string>();
        for (const [i, b] of dto.branches.entries()) {
          let code = `${prefix}-${initials(b.name, 2)}`;
          for (let n = 2; usedCodes.has(code); n += 1)
            code = `${prefix}-${initials(b.name, 2)}${n}`;
          usedCodes.add(code);
          await tx.branch.create({
            data: {
              schoolId,
              name: b.name,
              code,
              street: b.address || null,
              lga: dto.lga,
              state: dto.state,
              isOriginal: i === 0,
              branchSections: {
                create: sectionIds.map((sectionId) => ({ sectionId })),
              },
            },
          });
        }

        for (const role of PREDEFINED_SCHOOL_ROLES)
          await tx.schoolRole.create({
            data: {
              schoolId,
              key: role.key,
              name: role.name,
              type: 'PREDEFINED',
              scope: role.scope,
              description: role.description,
              permissions: role.permissions as Prisma.InputJsonValue,
            },
          });

        const subscription = await tx.subscription.create({
          data: {
            schoolId,
            planId: plan.id,
            planVersion: plan.version,
            status: 'ACTIVE',
            billingPeriod: period,
            priceKobo,
            startedOn: start,
            renewsOn,
            trialEndsOn,
            billingContactName: dto.admins[0]!.name,
            billingContactEmail: dto.admins[0]!.email,
          },
        });

        // The first invoice is due when the trial ends (or on the start date). Custom plans are
        // quoted by sales and invoiced separately.
        const dueOn = trialEndsOn ?? start;
        const issue = async (kind: 'NEW_SCHOOL' | 'SETUP_FEE', amountKobo: bigint) => {
          const year = lagosToday(now).getUTCFullYear();
          const n = await nextPlatformNumber(tx, 'PLATFORM_INVOICE', String(year));
          await tx.platformInvoice.create({
            data: {
              number: platformInvoiceNumber(year, n),
              schoolId,
              subscriptionId: subscription.id,
              kind,
              periodStart: start,
              periodEnd: renewsOn,
              amountKobo,
              issuedOn: lagosToday(now),
              dueOn,
            },
          });
        };
        if (priceKobo > 0n) await issue('NEW_SCHOOL', priceKobo);
        if (plan.setupFeeKobo > 0n) await issue('SETUP_FEE', plan.setupFeeKobo);

        await this.audit.record(
          {
            action: 'tenant.create',
            entity: 'School',
            entityId: schoolId,
            schoolId,
            summary: `School provisioned · ${dto.name} on ${plan.name}`,
            next: 'Onboarding',
          },
          tx,
        );

        const invitationIds: string[] = [];
        for (const a of dto.admins) {
          const { invitationId } = await this.schools.inviteAdmin(
            schoolId,
            { name: a.name, email: a.email, role: 'School Admin', scope: a.scope },
            tx,
          );
          invitationIds.push(invitationId);
          // Keep the position and phone they were given, for the accept page and SMS.
          await tx.invitation.update({
            where: { id: invitationId },
            data: {
              ...(a.position && { position: a.position }),
              ...(a.phone && { phone: normalizePhone(a.phone) }),
            },
          });
        }
        return { schoolId, invitationIds };
      },
      { timeout: 20_000 },
    );

    for (const id of invitationIds) {
      try {
        await this.invitations.send(id);
      } catch (error) {
        // The school exists; the back office can resend from the Administrators tab.
        this.logger.error({
          msg: 'Provisioning invitation not sent',
          invitationId: id,
          error: String(error),
        });
      }
    }
    const school = await this.schools.get(schoolId);
    await this.alerts.tryNotify(
      'school.provisioned',
      {
        title: `${school.name} was provisioned`,
        detail: `${school.plan} · ${school.state} · onboarding has started`,
        link: `/schools/${schoolId}`,
        entityType: 'School',
        entityId: schoolId,
      },
      { permission: 'Schools.View', exclude: [RequestContext.get()?.userId] },
    );
    return school;
  }
}
