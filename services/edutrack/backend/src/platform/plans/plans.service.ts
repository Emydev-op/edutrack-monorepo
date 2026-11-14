import { Injectable } from '@nestjs/common';
import { CORE_MODULES, MODULE_BY_ID, moduleName, requirementsOf } from '@edutrack/shared';
import { AppException } from '../../common/errors/app.exception.js';
import type { Plan as PlanRow, Prisma } from '../../generated/prisma/client.js';
import type { PlanStatus, PricingModel } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  formatCount,
  formatDay,
  formatLimit,
  formatNaira,
  toKobo,
  toNaira,
} from '../shared/format.js';
import { PLAN_NOT_FOUND } from '../shared/params.js';
import { PlatformAuditService } from '../shared/platform-audit.service.js';
import {
  MAX_NAIRA,
  type CreatePlanDto,
  type PlanDefinitionDto,
  type PlanStatusDto,
} from './dto/plans.dto.js';

/** The plan as the back office edits it (prices in naira). */
export interface PlanDefinition {
  name: string;
  description: string;
  pricing: {
    model: 'flat' | 'per_student' | 'custom';
    prices: Partial<Record<'annual' | 'term' | 'month', number>>;
    perStudent?: number;
    minimumPerTerm?: number;
  };
  trialDays: number;
  setupFee: number;
  limits: Record<'students' | 'branches' | 'users' | 'storage', number | null>;
  smsCreditsPerTerm: number;
  modules: string[];
  support: 'Standard' | 'Priority';
}

const MODEL: Record<PricingModel, PlanDefinition['pricing']['model']> = {
  FLAT: 'flat',
  PER_STUDENT: 'per_student',
  CUSTOM: 'custom',
};
const MODEL_BY_NAME = { flat: 'FLAT', per_student: 'PER_STUDENT', custom: 'CUSTOM' } as const;
const STATUS: Record<PlanStatus, 'Active' | 'Draft' | 'Archived'> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
};

const STATUS_SUMMARY: Record<string, string> = {
  'plan.published': 'Published',
  'plan.archived': 'Archived',
  'plan.restored': 'Restored',
};
const STATUS_ACTIONS = Object.keys(STATUS_SUMMARY);

const withHistory = {
  versions: { orderBy: { version: 'desc' } },
  _count: { select: { subscriptions: true } },
} satisfies Prisma.PlanInclude;
type PlanWithHistory = Prisma.PlanGetPayload<{ include: typeof withHistory }>;

export function planDefinition(p: PlanRow): PlanDefinition {
  const prices: PlanDefinition['pricing']['prices'] = {};
  if (p.annualPriceKobo !== null) prices.annual = toNaira(p.annualPriceKobo);
  if (p.termPriceKobo !== null) prices.term = toNaira(p.termPriceKobo);
  if (p.monthPriceKobo !== null) prices.month = toNaira(p.monthPriceKobo);
  return {
    name: p.name,
    description: p.description,
    pricing: {
      model: MODEL[p.pricingModel],
      prices,
      ...(p.perStudentKobo !== null && { perStudent: toNaira(p.perStudentKobo) }),
      ...(p.minimumPerTermKobo !== null && { minimumPerTerm: toNaira(p.minimumPerTermKobo) }),
    },
    trialDays: p.trialDays,
    setupFee: toNaira(p.setupFeeKobo) ?? 0,
    limits: {
      students: p.studentLimit,
      branches: p.branchLimit,
      users: p.userLimit,
      storage: p.storageLimitGb,
    },
    smsCreditsPerTerm: p.smsCreditsPerTerm,
    modules: p.modules,
    support: p.supportTier === 'PRIORITY' ? 'Priority' : 'Standard',
  };
}

/** The price line the back office shows for a plan: `₦1,850,000`, `₦2,500 / student`, `Custom`. */
export function planPriceLabel(p: PlanRow): string {
  if (p.pricingModel === 'CUSTOM') return 'Custom';
  if (p.pricingModel === 'PER_STUDENT')
    return p.perStudentKobo === null ? 'Custom' : `${formatNaira(p.perStudentKobo)} / student`;
  const kobo = p.annualPriceKobo ?? p.termPriceKobo ?? p.monthPriceKobo;
  return kobo === null ? 'Custom' : formatNaira(kobo);
}

function priceText(d: PlanDefinition): string {
  const { model, prices, perStudent, minimumPerTerm } = d.pricing;
  if (model === 'custom') return 'Custom';
  if (model === 'per_student')
    return `₦${formatCount(perStudent ?? 0)} / student${minimumPerTerm ? ` (min ₦${formatCount(minimumPerTerm)} / term)` : ''}`;
  return (['annual', 'term', 'month'] as const)
    .filter((k) => prices[k] !== undefined)
    .map((k) => `₦${formatCount(prices[k]!)} / ${k === 'annual' ? 'year' : k}`)
    .join(', ');
}

const LIMIT_LABELS = [
  ['students', 'Students'],
  ['branches', 'Branches'],
  ['users', 'Staff accounts'],
  ['storage', 'Storage'],
] as const;

/** Labels of what changed between two definitions, for the version history. */
export function planChanges(before: PlanDefinition, after: PlanDefinition): string[] {
  const out: string[] = [];
  if (before.name !== after.name) out.push('Name');
  if (before.description !== after.description) out.push('Description');
  if (priceText(before) !== priceText(after)) out.push('Price');
  if (before.trialDays !== after.trialDays) out.push('Trial');
  if (before.setupFee !== after.setupFee) out.push('Setup fee');
  for (const [key, label] of LIMIT_LABELS)
    if (formatLimit(before.limits[key]) !== formatLimit(after.limits[key])) out.push(label);
  if (before.smsCreditsPerTerm !== after.smsCreditsPerTerm) out.push('SMS credits');
  const added = after.modules.some((m) => !before.modules.includes(m));
  const removed = before.modules.some((m) => !after.modules.includes(m));
  if (added || removed) out.push('Modules');
  if (before.support !== after.support) out.push('Support');
  return out;
}

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  private async view(plan: PlanWithHistory) {
    const statusEvents = await this.prisma.auditEvent.findMany({
      where: {
        schoolId: null,
        entityType: 'Plan',
        entityId: plan.id,
        action: { in: STATUS_ACTIONS },
      },
      select: { action: true, actorName: true, createdAt: true, after: true },
    });
    const authorIds = [
      ...new Set(plan.versions.map((v) => v.createdById).filter((id): id is string => !!id)),
    ];
    const authors = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      ).map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );
    return {
      id: plan.id,
      ...planDefinition(plan),
      status: STATUS[plan.status],
      schools: plan._count.subscriptions,
      version: plan.version,
      history: [
        ...plan.versions.map((v) => ({
          version: v.version,
          createdAt: v.createdAt,
          by: (v.createdById && authors.get(v.createdById)) || 'EduTrack',
          summary: v.summary,
        })),
        ...statusEvents.map((e) => ({
          version: Number((e.after as { version?: number } | null)?.version ?? plan.version),
          createdAt: e.createdAt,
          by: e.actorName ?? 'EduTrack',
          summary: STATUS_SUMMARY[e.action] ?? e.action,
        })),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(({ createdAt, ...entry }) => ({ ...entry, at: formatDay(createdAt) })),
    };
  }

  private async load(id: string): Promise<PlanWithHistory> {
    const plan = await this.prisma.plan.findUnique({ where: { id }, include: withHistory });
    if (!plan) throw AppException.notFound(PLAN_NOT_FOUND);
    return plan;
  }

  async list() {
    const plans = await this.prisma.plan.findMany({
      include: withHistory,
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
    return Promise.all(plans.map((p) => this.view(p)));
  }

  async get(id: string) {
    return this.view(await this.load(id));
  }

  /** Schools on the plan and their usage, so the editor can warn before lowering a limit. */
  async schools(id: string) {
    await this.load(id);
    const subs = await this.prisma.subscription.findMany({
      where: { planId: id },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                students: { where: { status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] } } },
                branches: { where: { status: 'ACTIVE' } },
              },
            },
          },
        },
      },
      orderBy: { school: { name: 'asc' } },
    });
    return subs.map((s) => ({
      schoolId: s.school.id,
      name: s.school.name,
      students: s.school._count.students,
      branches: s.school._count.branches,
    }));
  }

  /** Business rules the DTO can't express; returns the definition as it will be saved. */
  private async check(dto: PlanDefinitionDto, id?: string): Promise<PlanDefinition> {
    const taken = await this.prisma.plan.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' }, ...(id && { id: { not: id } }) },
      select: { id: true },
    });
    if (taken)
      throw AppException.conflict('Another plan already uses this name.', 'PLAN_NAME_TAKEN');

    const { model } = dto.pricing;
    const prices: PlanDefinition['pricing']['prices'] = {};
    for (const key of ['annual', 'term', 'month'] as const) {
      const value = dto.pricing.prices?.[key];
      if (value !== undefined && value !== null && value > 0) prices[key] = Math.round(value);
    }
    const tooBig = [...Object.values(prices), dto.pricing.perStudent, dto.setupFee].some(
      (v) => (v ?? 0) > MAX_NAIRA,
    );
    if (tooBig) throw AppException.validation({ pricing: 'That price is too large.' });
    if (model === 'flat' && Object.keys(prices).length === 0)
      throw AppException.validation({
        'pricing.prices': 'Set a price for at least one billing period.',
      });
    if (model === 'per_student' && !((dto.pricing.perStudent ?? 0) > 0))
      throw AppException.validation({ 'pricing.perStudent': 'Enter the price per student.' });

    const modules = [...new Set([...CORE_MODULES, ...dto.modules])];
    for (const moduleId of modules) {
      const mod = MODULE_BY_ID[moduleId];
      if (!mod) throw AppException.validation({ modules: `Unknown module “${moduleId}”.` });
      if (mod.comingSoon)
        throw AppException.validation({ modules: `${mod.name} isn’t available yet.` });
      const missing = requirementsOf(moduleId).filter((req) => !modules.includes(req));
      if (missing.length)
        throw AppException.validation({
          modules: `${mod.name} needs ${missing.map(moduleName).join(', ')}.`,
        });
    }

    return {
      name: dto.name,
      description: dto.description ?? '',
      pricing: {
        model,
        prices: model === 'flat' ? prices : {},
        ...(model === 'per_student' && {
          perStudent: Math.round(dto.pricing.perStudent!),
          ...(dto.pricing.minimumPerTerm && {
            minimumPerTerm: Math.round(dto.pricing.minimumPerTerm),
          }),
        }),
      },
      trialDays: dto.trialDays ?? 0,
      setupFee: Math.round(dto.setupFee ?? 0),
      limits: {
        students: dto.limits.students,
        branches: dto.limits.branches,
        users: dto.limits.users,
        storage: dto.limits.storage,
      },
      smsCreditsPerTerm: dto.smsCreditsPerTerm ?? 0,
      modules,
      support: dto.support === 'Priority' ? 'Priority' : 'Standard',
    };
  }

  private columns(d: PlanDefinition) {
    const kobo = (v: number | undefined) => (v === undefined ? null : toKobo(v));
    return {
      name: d.name,
      description: d.description,
      pricingModel: MODEL_BY_NAME[d.pricing.model],
      annualPriceKobo: kobo(d.pricing.prices.annual),
      termPriceKobo: kobo(d.pricing.prices.term),
      monthPriceKobo: kobo(d.pricing.prices.month),
      perStudentKobo: kobo(d.pricing.perStudent),
      minimumPerTermKobo: kobo(d.pricing.minimumPerTerm),
      trialDays: d.trialDays,
      setupFeeKobo: toKobo(d.setupFee),
      studentLimit: d.limits.students,
      branchLimit: d.limits.branches,
      userLimit: d.limits.users,
      storageLimitGb: d.limits.storage,
      smsCreditsPerTerm: d.smsCreditsPerTerm,
      modules: d.modules,
      supportTier: d.support === 'Priority' ? ('PRIORITY' as const) : ('STANDARD' as const),
    };
  }

  async create(dto: CreatePlanDto, actorId: string) {
    const definition = await this.check(dto);
    const status = dto.status === 'Active' ? 'ACTIVE' : 'DRAFT';
    const plan = await this.prisma.$transaction(async (tx) => {
      const row = await tx.plan.create({ data: { ...this.columns(definition), status } });
      await tx.planVersion.create({
        data: {
          planId: row.id,
          version: 1,
          summary: status === 'ACTIVE' ? 'Created and published' : 'Created as draft',
          snapshot: definition as unknown as Prisma.InputJsonValue,
          createdById: actorId,
        },
      });
      await this.audit.record(
        {
          action: 'plan.create',
          entity: 'Plan',
          entityId: row.id,
          summary: `${status === 'ACTIVE' ? 'Published' : 'Created draft'} plan · ${row.name}`,
          next: STATUS[status],
        },
        tx,
      );
      return row;
    });
    return this.get(plan.id);
  }

  async update(id: string, dto: PlanDefinitionDto, actorId: string) {
    const current = await this.load(id);
    const definition = await this.check(dto, id);
    const changes = planChanges(planDefinition(current), definition);
    if (changes.length === 0) return this.view(current);
    const version = current.version + 1;
    await this.prisma.$transaction(async (tx) => {
      // Optimistic check: two editors saving at once can't both write the same version.
      const { count } = await tx.plan.updateMany({
        where: { id, version: current.version },
        data: { ...this.columns(definition), version },
      });
      if (count !== 1)
        throw AppException.conflict(
          'Someone else just changed this plan. Reload it and make your change again.',
          'PLAN_CHANGED',
        );
      await tx.planVersion.create({
        data: {
          planId: id,
          version,
          summary: `${changes.join(', ')} changed`,
          snapshot: definition as unknown as Prisma.InputJsonValue,
          createdById: actorId,
        },
      });
      await this.audit.record(
        {
          action: 'plan.update',
          entity: 'Plan',
          entityId: id,
          summary: `Edited plan · ${definition.name}`,
          previous: `v${current.version}`,
          next: `v${version}`,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async setStatus(id: string, dto: PlanStatusDto) {
    const plan = await this.load(id);
    const next = dto.status === 'Active' ? 'ACTIVE' : 'ARCHIVED';
    if (plan.status === next) return this.view(plan);
    const verb =
      next === 'ARCHIVED' ? 'Archived' : plan.status === 'DRAFT' ? 'Published' : 'Restored';
    await this.prisma.$transaction(async (tx) => {
      await tx.plan.update({ where: { id }, data: { status: next } });
      await this.audit.record(
        {
          action: `plan.${verb.toLowerCase()}`,
          entity: 'Plan',
          entityId: id,
          summary: `${verb} plan · ${plan.name}`,
          previous: STATUS[plan.status],
          next: STATUS[next],
          // Status changes don't make a new version (the offer is unchanged); the history shows
          // them from the audit trail at the version they happened on.
          after: { version: plan.version },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async remove(id: string) {
    const plan = await this.load(id);
    if (plan.status !== 'DRAFT' || plan._count.subscriptions > 0)
      throw AppException.conflict('Only drafts that no school uses can be deleted.', 'PLAN_IN_USE');
    await this.prisma.$transaction(async (tx) => {
      await tx.planVersion.deleteMany({ where: { planId: id } });
      await tx.plan.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'plan.delete',
          entity: 'Plan',
          entityId: id,
          summary: `Deleted draft plan · ${plan.name}`,
          previous: 'Draft',
        },
        tx,
      );
    });
    return { ok: true as const };
  }
}
