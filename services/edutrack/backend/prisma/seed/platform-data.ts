/**
 * Back-office demo data: full plan definitions, schools in every subscription state (so the
 * dashboard, subscriptions and attention list have something to show), platform invoices for the
 * revenue chart, setup progress, and the provisioning history. Dates are relative to the seed's
 * `now`, so the dashboard looks the same whenever it is seeded.
 */
import { CORE_MODULES } from '@edutrack/shared';
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  MembershipStatus,
  PlatformInvoiceKind,
  SchoolOwnership,
  SchoolStatus,
  SubscriptionStatus,
} from '../../src/generated/prisma/enums.js';
import { PREDEFINED_SCHOOL_ROLES } from '../../src/auth/permissions/school-permissions.js';
import { sha256 } from '../../src/auth/tokens.js';

const DAY = 86_400_000;

/** A stable UUID (v4 layout) derived from a name, for demo rows that must keep their id. */
export function demoUuid(name: string): string {
  const h = sha256(`edutrack-demo:${name}`);
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const ACADEMICS = ['subjects', 'assign', 'timetable', 'assess', 'results', 'promotion'];

/** Starter, Growth and Enterprise as the back office's plan editor shows them. */
export const PLAN_SEEDS = [
  {
    name: 'Starter',
    description: 'For single-campus schools getting started with results and fees.',
    pricingModel: 'FLAT',
    annualPriceKobo: 65_000_000n,
    termPriceKobo: 25_000_000n,
    trialDays: 14,
    setupFeeKobo: 0n,
    studentLimit: 500,
    branchLimit: 2,
    userLimit: 25,
    storageLimitGb: 10,
    smsCreditsPerTerm: 1_000,
    modules: [...CORE_MODULES, ...ACADEMICS, 'fees', 'announce', 'email', 'teacher', 'parent'],
    supportTier: 'STANDARD',
  },
  {
    name: 'Growth',
    description: 'For growing schools with several campuses and online payments.',
    pricingModel: 'FLAT',
    annualPriceKobo: 185_000_000n,
    termPriceKobo: 70_000_000n,
    trialDays: 14,
    setupFeeKobo: 15_000_000n,
    studentLimit: 1500,
    branchLimit: 5,
    userLimit: 100,
    storageLimitGb: 50,
    smsCreditsPerTerm: 5_000,
    modules: [
      ...CORE_MODULES,
      ...ACADEMICS,
      'homework',
      'fees',
      'online',
      'discounts',
      'expenses',
      'announce',
      'email',
      'sms',
      'teacher',
      'parent',
      'student',
      'reports',
      'export',
    ],
    supportTier: 'STANDARD',
  },
  {
    name: 'Enterprise',
    description: 'For school groups: unlimited campuses, priority support, quoted per school.',
    pricingModel: 'CUSTOM',
    annualPriceKobo: null,
    termPriceKobo: null,
    trialDays: 0,
    setupFeeKobo: 0n,
    studentLimit: null,
    branchLimit: null,
    userLimit: null,
    storageLimitGb: 500,
    smsCreditsPerTerm: 20_000,
    modules: [
      ...CORE_MODULES,
      ...ACADEMICS,
      'homework',
      'fees',
      'online',
      'discounts',
      'expenses',
      'payroll',
      'inventory',
      'announce',
      'email',
      'sms',
      'whatsapp',
      'teacher',
      'parent',
      'student',
      'reports',
      'export',
    ],
    supportTier: 'PRIORITY',
  },
] as const;

interface ExtraSchool {
  slug: string;
  name: string;
  legalName: string;
  schoolType: string;
  ownership: SchoolOwnership;
  state: string;
  city: string;
  brandColor: string;
  plan: (typeof PLAN_SEEDS)[number]['name'];
  /** Custom (Enterprise) price per year. */
  priceKobo?: bigint;
  status: SchoolStatus;
  provisionedDaysAgo: number;
  subscription: {
    status: SubscriptionStatus;
    /** Renewal date relative to today (negative: in the past). */
    renewsInDays: number;
    graceEndsInDays?: number;
    restrictedDaysAgo?: number;
    reason?: string;
  };
  suspended?: { daysAgo: number; reason: string };
  admin: {
    email: string;
    firstName: string;
    lastName: string;
    status: MembershipStatus;
    /** Pending invitations: days since it was first sent, and until it expires. */
    invitedDaysAgo?: number;
    expiresInDays?: number;
  };
  branches: [code: string, name: string][];
  /** Setup checklist steps confirmed (in order); 16 = finished. */
  setupSteps: number;
  /** An unpaid renewal invoice that is past due. */
  overdue?: boolean;
}

const EXTRA_SCHOOLS: ExtraSchool[] = [
  {
    slug: 'kingsway',
    name: 'Kingsway International School',
    legalName: 'Kingsway International Schools Ltd',
    schoolType: 'Combined',
    ownership: 'PRIVATE',
    state: 'Rivers',
    city: 'Port Harcourt',
    brandColor: '#0F5E4B',
    plan: 'Enterprise',
    priceKobo: 450_000_000n,
    status: 'ACTIVE',
    provisionedDaysAgo: 640,
    subscription: { status: 'ACTIVE', renewsInDays: 38 },
    admin: {
      email: 'ifeoma.briggs@kingsway.edu.ng',
      firstName: 'Ifeoma',
      lastName: 'Briggs',
      status: 'ACTIVE',
    },
    branches: [
      ['KIS-MC', 'Main Campus'],
      ['KIS-GR', 'GRA Campus'],
      ['KIS-TR', 'Trans-Amadi Campus'],
    ],
    setupSteps: 16,
  },
  {
    slug: 'hillcrest',
    name: 'Hillcrest Nursery & Primary',
    legalName: 'Hillcrest Nursery and Primary School',
    schoolType: 'Nursery, Primary',
    ownership: 'PRIVATE',
    state: 'Oyo',
    city: 'Ibadan',
    brandColor: '#7A4FB5',
    plan: 'Starter',
    status: 'ACTIVE',
    provisionedDaysAgo: 355,
    subscription: { status: 'EXPIRING', renewsInDays: 12 },
    admin: {
      email: 'bola.ajayi@hillcrest.edu.ng',
      firstName: 'Bola',
      lastName: 'Ajayi',
      status: 'ACTIVE',
    },
    branches: [['HNP-MC', 'Main Campus']],
    setupSteps: 16,
  },
  {
    slug: 'unity',
    name: 'Unity Model College',
    legalName: 'Unity Model College',
    schoolType: 'Junior Secondary, Senior Secondary',
    ownership: 'PUBLIC',
    state: 'Kaduna',
    city: 'Kaduna',
    brandColor: '#1F6FEB',
    plan: 'Growth',
    status: 'ACTIVE',
    provisionedDaysAgo: 372,
    subscription: { status: 'GRACE_PERIOD', renewsInDays: -7, graceEndsInDays: 7 },
    admin: {
      email: 'musa.danjuma@unitycollege.ng',
      firstName: 'Musa',
      lastName: 'Danjuma',
      status: 'ACTIVE',
    },
    branches: [['UMC-MC', 'Main Campus']],
    setupSteps: 16,
    overdue: true,
  },
  {
    slug: 'royal',
    name: 'Royal Crest Schools',
    legalName: 'Royal Crest Schools Limited',
    schoolType: 'Combined',
    ownership: 'PRIVATE',
    state: 'FCT',
    city: 'Gwarinpa',
    brandColor: '#B5462E',
    plan: 'Starter',
    status: 'ACTIVE',
    provisionedDaysAgo: 393,
    subscription: {
      status: 'RESTRICTED',
      renewsInDays: -28,
      restrictedDaysAgo: 14,
      reason: 'Payment failed twice · Paystack',
    },
    admin: {
      email: 'grace.etim@royalcrest.ng',
      firstName: 'Grace',
      lastName: 'Etim',
      status: 'ACTIVE',
    },
    branches: [['RCS-MC', 'Main Campus']],
    setupSteps: 14,
    overdue: true,
  },
  {
    slug: 'brookfield',
    name: 'Brookfield Schools',
    legalName: 'Brookfield Schools Ltd',
    schoolType: 'Nursery, Primary',
    ownership: 'PRIVATE',
    state: 'Ogun',
    city: 'Abeokuta',
    brandColor: '#2E7D32',
    plan: 'Growth',
    status: 'ONBOARDING',
    provisionedDaysAgo: 34,
    subscription: { status: 'ACTIVE', renewsInDays: 331 },
    admin: {
      email: 'toyin.bello@brookfield.ng',
      firstName: 'Toyin',
      lastName: 'Bello',
      status: 'ACTIVE',
    },
    branches: [
      ['BRS-MC', 'Main Campus'],
      ['BRS-OK', 'Oke-Ilewo Campus'],
    ],
    setupSteps: 7,
  },
  {
    slug: 'lagoon',
    name: 'Lagoon View College',
    legalName: 'Lagoon View College',
    schoolType: 'Junior Secondary, Senior Secondary',
    ownership: 'MISSION',
    state: 'Lagos',
    city: 'Ikoyi',
    brandColor: '#00796B',
    plan: 'Starter',
    status: 'ONBOARDING',
    provisionedDaysAgo: 13,
    subscription: { status: 'ACTIVE', renewsInDays: 352 },
    admin: {
      email: 'peter.okon@lagoonview.ng',
      firstName: 'Peter',
      lastName: 'Okon',
      status: 'INVITED',
      invitedDaysAgo: 13,
      expiresInDays: 1,
    },
    branches: [['LVC-MC', 'Main Campus']],
    setupSteps: 0,
  },
  {
    slug: 'pinnacle',
    name: 'Pinnacle Heights Academy',
    legalName: 'Pinnacle Heights Academy Ltd',
    schoolType: 'Combined',
    ownership: 'PRIVATE',
    state: 'Enugu',
    city: 'Enugu',
    brandColor: '#455A64',
    plan: 'Growth',
    status: 'SUSPENDED',
    provisionedDaysAgo: 290,
    subscription: { status: 'ACTIVE', renewsInDays: 75 },
    suspended: { daysAgo: 20, reason: 'Proprietor’s request: ownership dispute' },
    admin: {
      email: 'chidi.eze@pinnacleheights.ng',
      firstName: 'Chidi',
      lastName: 'Eze',
      status: 'ACTIVE',
    },
    branches: [['PHA-MC', 'Main Campus']],
    setupSteps: 16,
  },
];

const SETUP_KEYS = [
  'school-profile',
  'branches',
  'academic-sections',
  'session',
  'terms',
  'classes',
  'subjects',
  'assessment',
  'organogram-roles',
  'staff',
  'assignments',
  'students',
  'guardians',
  'fees',
  'timetable',
  'notifications',
];

/** A calendar date (`@db.Date`): midnight UTC of the Lagos day `days` from `now`. */
function calendar(now: Date, days = 0): Date {
  const lagos = new Date(now.getTime() + 60 * 60_000 + days * DAY);
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()));
}
const addYears = (d: Date, years: number) =>
  new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));

interface SeedContext {
  now: Date;
  passwordHash: string;
  /** Platform staff who provisions the demo schools. */
  tolu: string;
}

/** Upserts the plans and returns their ids by name. */
export async function seedPlans(prisma: PrismaClient, ctx: SeedContext) {
  const ids = new Map<string, string>();
  for (const p of PLAN_SEEDS) {
    const data = {
      description: p.description,
      status: 'ACTIVE' as const,
      pricingModel: p.pricingModel,
      annualPriceKobo: p.annualPriceKobo,
      termPriceKobo: p.termPriceKobo,
      monthPriceKobo: null,
      perStudentKobo: null,
      minimumPerTermKobo: null,
      trialDays: p.trialDays,
      setupFeeKobo: p.setupFeeKobo,
      studentLimit: p.studentLimit,
      branchLimit: p.branchLimit,
      userLimit: p.userLimit,
      storageLimitGb: p.storageLimitGb,
      smsCreditsPerTerm: p.smsCreditsPerTerm,
      modules: [...new Set(p.modules)],
      supportTier: p.supportTier,
      version: 1,
    };
    const row = await prisma.plan.upsert({
      where: { name: p.name },
      create: { name: p.name, ...data },
      update: data,
    });
    ids.set(p.name, row.id);
    // Demo plans have exactly one version: the one they were created with.
    await prisma.planVersion.deleteMany({ where: { planId: row.id, version: { gt: 1 } } });
    const snapshot = { name: p.name, modules: data.modules } as Prisma.InputJsonValue;
    await prisma.planVersion.upsert({
      where: { planId_version: { planId: row.id, version: 1 } },
      create: {
        planId: row.id,
        version: 1,
        summary: 'Created and published',
        snapshot,
        createdById: ctx.tolu,
        createdAt: new Date(ctx.now.getTime() - 700 * DAY),
      },
      update: { summary: 'Created and published', snapshot, createdById: ctx.tolu },
    });
  }
  return ids;
}

/** Paid renewals (and the first sale) over the last year, plus overdue renewals where set. */
async function seedInvoices(
  prisma: PrismaClient,
  schoolId: string,
  subscriptionId: string,
  key: string,
  opts: {
    now: Date;
    priceKobo: bigint;
    renewsOn: Date;
    provisionedDaysAgo: number;
    setupFeeKobo: bigint;
    overdue?: boolean;
    onboarding: boolean;
  },
) {
  const today = calendar(opts.now);
  const invoices: {
    kind: PlatformInvoiceKind;
    periodStart: Date;
    amountKobo: bigint;
    paidDaysAgo: number | null;
    dueOn?: Date;
  }[] = [];
  const periodStart = addYears(opts.renewsOn, -1);
  const startedDaysAgo = Math.round((today.getTime() - periodStart.getTime()) / DAY);
  if (opts.priceKobo > 0n) {
    const firstSale =
      opts.provisionedDaysAgo <= 366 && startedDaysAgo <= opts.provisionedDaysAgo + 1;
    if (opts.overdue) {
      // Last year's period was paid; the renewal that fell due is unpaid.
      invoices.push({
        kind: 'NEW_SCHOOL',
        periodStart: addYears(periodStart, -1),
        amountKobo: opts.priceKobo,
        paidDaysAgo: startedDaysAgo + 365 + 3,
      });
      invoices.push({
        kind: 'RENEWAL',
        periodStart,
        amountKobo: opts.priceKobo,
        paidDaysAgo: null,
        dueOn: periodStart,
      });
    } else if (opts.onboarding) {
      invoices.push({
        kind: 'NEW_SCHOOL',
        periodStart,
        amountKobo: opts.priceKobo,
        paidDaysAgo: opts.provisionedDaysAgo > 20 ? opts.provisionedDaysAgo - 3 : null,
        dueOn: calendar(opts.now, -opts.provisionedDaysAgo + 14),
      });
      if (opts.setupFeeKobo > 0n)
        invoices.push({
          kind: 'SETUP_FEE',
          periodStart,
          amountKobo: opts.setupFeeKobo,
          paidDaysAgo: opts.provisionedDaysAgo > 20 ? opts.provisionedDaysAgo - 3 : null,
          dueOn: calendar(opts.now, -opts.provisionedDaysAgo + 14),
        });
    } else {
      invoices.push({
        kind: firstSale ? 'NEW_SCHOOL' : 'RENEWAL',
        periodStart,
        amountKobo: opts.priceKobo,
        paidDaysAgo: Math.max(1, startedDaysAgo + 4),
      });
    }
  }
  for (const [i, inv] of invoices.entries()) {
    const number = `ET-DEMO-${key.toUpperCase()}-${i + 1}`;
    // Invoices go out 14 days before they fall due; paid ones were due a week before payment.
    const dueOn = inv.dueOn ?? calendar(opts.now, -(inv.paidDaysAgo ?? 0) + 7);
    const issuedOn = new Date(dueOn.getTime() - 14 * DAY);
    const data = {
      schoolId,
      subscriptionId,
      kind: inv.kind,
      status: inv.paidDaysAgo === null ? ('ISSUED' as const) : ('PAID' as const),
      periodStart: inv.periodStart,
      periodEnd: new Date(addYears(inv.periodStart, 1).getTime() - DAY),
      amountKobo: inv.amountKobo,
      issuedOn,
      dueOn,
      paidAt:
        inv.paidDaysAgo === null ? null : new Date(opts.now.getTime() - inv.paidDaysAgo * DAY),
      paymentReference: inv.paidDaysAgo === null ? null : `PSK-${key.toUpperCase()}-${i + 1}`,
    };
    await prisma.platformInvoice.upsert({
      where: { number },
      create: { number, ...data },
      update: data,
    });
  }
  await prisma.platformInvoice.deleteMany({
    where: {
      schoolId,
      number: {
        startsWith: 'ET-DEMO-',
        notIn: invoices.map((_, i) => `ET-DEMO-${key.toUpperCase()}-${i + 1}`),
      },
    },
  });
}

async function seedSetup(
  prisma: PrismaClient,
  schoolId: string,
  steps: number,
  now: Date,
  by: string | null,
) {
  await prisma.setupStepState.deleteMany({
    where: { schoolId, stepKey: { notIn: SETUP_KEYS.slice(0, steps) } },
  });
  for (const stepKey of SETUP_KEYS.slice(0, steps))
    await prisma.setupStepState.upsert({
      where: { schoolId_stepKey: { schoolId, stepKey } },
      create: { schoolId, stepKey, confirmedAt: now, confirmedById: by },
      update: { confirmedAt: now },
    });
  await prisma.school.update({
    where: { id: schoolId },
    data: { setupFinishedAt: steps >= SETUP_KEYS.length ? now : null },
  });
}

async function seedAudit(
  prisma: PrismaClient,
  key: string,
  data: Omit<Prisma.AuditEventUncheckedCreateInput, 'id'>,
) {
  const id = demoUuid(`audit:${key}`);
  await prisma.auditEvent.upsert({ where: { id }, create: { id, ...data }, update: data });
}

/**
 * Seeds the back-office demo schools and history. Greenfield and Crestview (from the identity
 * seed) get invoices, setup progress and history too.
 */
export async function seedPlatformData(
  prisma: PrismaClient,
  ctx: SeedContext,
  planIds: Map<string, string>,
  existing: { greenfield: string; crestview: string },
) {
  const { now } = ctx;
  const plans = new Map(PLAN_SEEDS.map((p) => [p.name, p]));
  const provisioned = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY);

  // Greenfield (Growth, active, 13 of 16 setup steps) and Crestview (Starter, just provisioned).
  const core = [
    {
      key: 'greenfield',
      id: existing.greenfield,
      plan: 'Growth',
      daysAgo: 480,
      steps: 13,
      onboarding: false,
    },
    {
      key: 'crestview',
      id: existing.crestview,
      plan: 'Starter',
      daysAgo: 9,
      steps: 2,
      onboarding: true,
    },
  ] as const;
  for (const c of core) {
    const plan = plans.get(c.plan)!;
    const renewsOn = c.onboarding ? calendar(now, 356) : calendar(now, 260);
    const sub = await prisma.subscription.update({
      where: { schoolId: c.id },
      data: {
        planId: planIds.get(c.plan)!,
        priceKobo: plan.annualPriceKobo ?? 0n,
        startedOn: addYears(renewsOn, -1),
        renewsOn,
        billingContactName: c.key === 'greenfield' ? 'Adaeze Okonkwo' : 'Emem Udo',
        billingContactEmail:
          c.key === 'greenfield' ? 'adaeze.okonkwo@greenfield.edu.ng' : 'e.udo@crestviewcollege.ng',
      },
    });
    await prisma.school.update({
      where: { id: c.id },
      data: { provisionedAt: provisioned(c.daysAgo) },
    });
    await seedInvoices(prisma, c.id, sub.id, c.key, {
      now,
      priceKobo: plan.annualPriceKobo ?? 0n,
      renewsOn,
      provisionedDaysAgo: c.daysAgo,
      setupFeeKobo: plan.setupFeeKobo,
      onboarding: c.onboarding,
    });
    await seedSetup(prisma, c.id, c.steps, now, null);
    await seedAudit(prisma, `${c.key}:create`, {
      schoolId: c.id,
      actorKind: 'PLATFORM_STAFF',
      actorUserId: ctx.tolu,
      actorName: 'Tolu Bamidele',
      action: 'tenant.create',
      area: 'Platform',
      entityType: 'School',
      entityId: c.id,
      summary: `School provisioned · ${c.key === 'greenfield' ? 'Greenfield Academy' : 'Crestview College'} on ${c.plan}`,
      after: { value: 'Onboarding' },
      createdAt: provisioned(c.daysAgo),
    });
  }

  for (const s of EXTRA_SCHOOLS) {
    const plan = plans.get(s.plan)!;
    const schoolData = {
      name: s.name,
      legalName: s.legalName,
      schoolType: s.schoolType,
      ownership: s.ownership,
      status: s.status,
      brandColor: s.brandColor,
      email: `info@${s.slug}.edutrack-demo.ng`,
      phone: `+23480955${String(EXTRA_SCHOOLS.indexOf(s)).padStart(2, '0')}100`,
      city: s.city,
      state: s.state,
      provisionedAt: provisioned(s.provisionedDaysAgo),
      provisionedById: ctx.tolu,
      suspendedAt: s.suspended ? provisioned(s.suspended.daysAgo) : null,
      suspensionReason: s.suspended?.reason ?? null,
    };
    const school = await prisma.school.upsert({
      where: { slug: s.slug },
      create: { slug: s.slug, ...schoolData, createdAt: provisioned(s.provisionedDaysAgo) },
      update: schoolData,
    });
    await prisma.schoolSettings.upsert({
      where: { schoolId: school.id },
      create: { schoolId: school.id },
      update: {},
    });
    for (const [i, [code, name]] of s.branches.entries())
      await prisma.branch.upsert({
        where: { schoolId_code: { schoolId: school.id, code } },
        create: {
          schoolId: school.id,
          code,
          name,
          city: s.city,
          state: s.state,
          isOriginal: i === 0,
        },
        update: { name, status: 'ACTIVE' },
      });
    const roleIds = new Map<string, string>();
    for (const role of PREDEFINED_SCHOOL_ROLES) {
      const fields = {
        name: role.name,
        type: 'PREDEFINED' as const,
        scope: role.scope,
        description: role.description,
        permissions: role.permissions as Prisma.InputJsonValue,
        archivedAt: null,
      };
      const row = await prisma.schoolRole.upsert({
        where: { schoolId_key: { schoolId: school.id, key: role.key } },
        create: { schoolId: school.id, key: role.key, ...fields },
        update: fields,
      });
      roleIds.set(role.key, row.id);
    }

    // The school's administrator (Owner).
    const invited = s.admin.status === 'INVITED';
    const userData = {
      firstName: s.admin.firstName,
      lastName: s.admin.lastName,
      status: 'ACTIVE' as const,
      passwordHash: invited ? null : ctx.passwordHash,
      passwordChangedAt: invited ? null : now,
      emailVerifiedAt: invited ? null : now,
      failedSignInCount: 0,
      lockedUntil: null,
      deletedAt: null,
    };
    const user = await prisma.user.upsert({
      where: { email: s.admin.email },
      create: { email: s.admin.email, ...userData },
      update: userData,
    });
    const membershipData = {
      status: s.admin.status,
      scope: 'SCHOOL' as const,
      invitedAt: provisioned(s.admin.invitedDaysAgo ?? s.provisionedDaysAgo),
      activatedAt: invited ? null : provisioned(s.provisionedDaysAgo - 1),
    };
    const membership = await prisma.schoolMembership.upsert({
      where: { schoolId_userId_kind: { schoolId: school.id, userId: user.id, kind: 'STAFF' } },
      create: {
        schoolId: school.id,
        userId: user.id,
        kind: 'STAFF',
        ...membershipData,
        createdAt: provisioned(s.provisionedDaysAgo),
      },
      update: membershipData,
    });
    await prisma.membershipRole.upsert({
      where: {
        membershipId_roleId: { membershipId: membership.id, roleId: roleIds.get('owner')! },
      },
      create: { schoolId: school.id, membershipId: membership.id, roleId: roleIds.get('owner')! },
      update: {},
    });
    if (invited) {
      const id = demoUuid(`invitation:${s.slug}-admin`);
      const data = {
        kind: 'SCHOOL_STAFF' as const,
        status: 'PENDING' as const,
        tokenHash: sha256(`demo-invitation:${s.slug}`),
        email: s.admin.email,
        userId: user.id,
        schoolId: school.id,
        membershipId: membership.id,
        position: 'Principal',
        invitedById: ctx.tolu,
        sendCount: 2,
        lastSentAt: provisioned(6),
        expiresAt: new Date(now.getTime() + (s.admin.expiresInDays ?? 7) * DAY),
        acceptedAt: null,
        revokedAt: null,
      };
      await prisma.invitation.upsert({
        where: { id },
        create: { id, ...data, createdAt: provisioned(s.admin.invitedDaysAgo ?? 0) },
        update: data,
      });
    }

    const renewsOn = calendar(now, s.subscription.renewsInDays);
    const priceKobo = s.priceKobo ?? plan.annualPriceKobo ?? 0n;
    const subData = {
      planId: planIds.get(s.plan)!,
      planVersion: 1,
      status: s.subscription.status,
      billingPeriod: 'ANNUAL' as const,
      priceKobo,
      startedOn: addYears(renewsOn, -1),
      renewsOn,
      trialEndsOn: null,
      graceEndsOn:
        s.subscription.graceEndsInDays === undefined
          ? null
          : calendar(now, s.subscription.graceEndsInDays),
      restrictedAt:
        s.subscription.restrictedDaysAgo === undefined
          ? null
          : provisioned(s.subscription.restrictedDaysAgo),
      cancelledAt: null,
      statusReason: s.subscription.reason ?? null,
      billingContactName: `${s.admin.firstName} ${s.admin.lastName}`,
      billingContactEmail: s.admin.email,
    };
    const sub = await prisma.subscription.upsert({
      where: { schoolId: school.id },
      create: { schoolId: school.id, ...subData },
      update: subData,
    });
    await seedInvoices(prisma, school.id, sub.id, s.slug, {
      now,
      priceKobo,
      renewsOn,
      provisionedDaysAgo: s.provisionedDaysAgo,
      setupFeeKobo: plan.setupFeeKobo,
      overdue: s.overdue,
      onboarding: s.status === 'ONBOARDING',
    });
    await seedSetup(prisma, school.id, s.setupSteps, now, user.id);

    await seedAudit(prisma, `${s.slug}:create`, {
      schoolId: school.id,
      actorKind: 'PLATFORM_STAFF',
      actorUserId: ctx.tolu,
      actorName: 'Tolu Bamidele',
      action: 'tenant.create',
      area: 'Platform',
      entityType: 'School',
      entityId: school.id,
      summary: `School provisioned · ${s.name} on ${s.plan}`,
      after: { value: 'Onboarding' },
      createdAt: provisioned(s.provisionedDaysAgo),
    });
    if (s.suspended)
      await seedAudit(prisma, `${s.slug}:suspend`, {
        schoolId: school.id,
        actorKind: 'PLATFORM_STAFF',
        actorUserId: ctx.tolu,
        actorName: 'Tolu Bamidele',
        action: 'school.suspend',
        area: 'Platform',
        entityType: 'School',
        entityId: school.id,
        summary: `School suspended · ${s.name} · “${s.suspended.reason}”`,
        before: { value: 'Active', status: 'ACTIVE' },
        after: { value: 'Suspended', reason: s.suspended.reason },
        createdAt: provisioned(s.suspended.daysAgo),
      });
    if (s.subscription.status === 'RESTRICTED')
      await seedAudit(prisma, `${s.slug}:restrict`, {
        schoolId: school.id,
        actorKind: 'SYSTEM',
        actorName: 'EduTrack',
        action: 'subscription.restrict',
        area: 'Platform',
        entityType: 'Subscription',
        entityId: school.id,
        summary: `School restricted · ${s.name} · “${s.subscription.reason}”`,
        before: { value: `${s.plan} · Grace period` },
        after: { value: `${s.plan} · Restricted` },
        createdAt: provisioned(s.subscription.restrictedDaysAgo ?? 0),
      });
  }
}

/**
 * Back-office notifications, preferences and settings back to their demo state: a few unread
 * alerts for Tolu (the daily checks add real ones), default channels, default security toggles.
 * Custom roles from earlier runs are removed when nobody holds them.
 */
export async function seedPlatformAccount(prisma: PrismaClient, ctx: SeedContext) {
  const { now } = ctx;
  const staff = await prisma.platformStaff.findMany({ select: { userId: true } });
  const userIds = staff.map((s) => s.userId);
  await prisma.notification.deleteMany({ where: { userId: { in: userIds }, schoolId: null } });
  await prisma.notificationPreference.deleteMany({
    where: { userId: { in: userIds }, schoolId: null },
  });
  await prisma.platformSetting.deleteMany({ where: { key: 'security' } });
  await prisma.platformRole.deleteMany({ where: { predefined: false, staff: { none: {} } } });

  const schools = await prisma.school.findMany({
    where: { slug: { in: ['unity', 'hillcrest'] } },
    include: { subscription: true },
  });
  const bySlug = new Map(schools.map((s) => [s.slug, s]));
  const unity = bySlug.get('unity')!;
  const hillcrest = bySlug.get('hillcrest')!;
  const chika = await prisma.user.findUniqueOrThrow({ where: { email: 'chika@edutrack.ng' } });
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
  const rows = [
    {
      key: 'unity-overdue',
      category: 'subscription.overdue',
      title: `${unity.name} has an overdue invoice`,
      body: 'Grace period · renewal not paid',
      link: `/schools/${unity.id}/billing`,
      entityType: 'Subscription',
      entityId: unity.subscription?.id ?? null,
      createdAt: ago(3),
      readAt: null,
    },
    {
      key: 'hillcrest-expiring',
      category: 'subscription.expiring',
      title: `${hillcrest.name} renews in 12 days`,
      body: 'Starter · send a renewal reminder',
      link: `/schools/${hillcrest.id}/subscription`,
      entityType: 'Subscription',
      entityId: hillcrest.subscription?.id ?? null,
      createdAt: ago(26),
      readAt: null,
    },
    {
      key: 'chika-expired',
      category: 'user.invitation',
      title: 'Chika Obi’s invitation expired',
      body: 'Users · resend it from their profile',
      link: `/users/${chika.id}`,
      entityType: 'Invitation',
      entityId: null,
      createdAt: ago(24 * 5),
      readAt: ago(24 * 4),
    },
  ];
  for (const { key, ...row } of rows)
    await prisma.notification.create({
      data: { id: demoUuid(`notification:${key}`), userId: ctx.tolu, ...row },
    });
}
