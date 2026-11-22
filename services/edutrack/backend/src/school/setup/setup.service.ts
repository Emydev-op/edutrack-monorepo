import { planIncludes } from '../../common/plan/plan-access.js';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { flattenPermissions } from '../../auth/permissions/school-permissions.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import {
  FOUNDATION_STEPS,
  SETUP_STEPS,
  type SetupGroup,
  type SetupStepDefinition,
  STEP_MODULE,
} from './setup-catalog.js';
import { SETUP_STEP_SOURCES, type SetupStepSource, type StepTarget } from './setup-step-source.js';

export interface SetupStepView {
  id: string;
  group: SetupGroup;
  name: string;
  description: string;
  to: StepTarget;
  done: boolean;
  required: boolean;
  prerequisite: string | null;
  /** Completes from its own screen (no "Mark done"). */
  auto: boolean;
}

export interface SetupProgressView {
  intro: string;
  steps: SetupStepView[];
  finished: boolean;
  onboarding: boolean;
  /**
   * The first-sign-in foundation is in place (`foundationSteps` done and a session with terms
   * running). Until then School Admin keeps the school's admins in the Setup Center.
   */
  foundationComplete: boolean;
  foundationSteps: string[];
}

const joinNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');

/**
 * The Setup Center. Steps with a source (`SETUP_STEP_SOURCES`) describe the school's data and
 * complete when their checks pass; the others keep their stored state (`SetupStepState`) until
 * their modules are built, and are marked done by hand.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly setupState: SetupStateService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
    @Inject(SETUP_STEP_SOURCES) private readonly sources: SetupStepSource[],
  ) {}

  private source(id: string) {
    return this.sources.find((s) => s.id === id);
  }

  private async stepView(def: SetupStepDefinition, confirmed: Set<string>): Promise<SetupStepView> {
    const base = {
      id: def.id,
      group: def.group,
      name: def.name,
      required: def.required,
      prerequisite: def.prerequisite,
    };
    const source = this.source(def.id);
    if (!source)
      return {
        ...base,
        description: def.description,
        to: def.to,
        done: confirmed.has(def.id),
        auto: false,
      };
    const live = await source.state();
    return { ...base, description: live.description, to: live.to, done: live.done, auto: true };
  }

  async view(): Promise<SetupProgressView> {
    const schoolId = RequestContext.schoolId();
    const [school, sections, confirmed, running] = await Promise.all([
      this.tenant.db.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: {
          name: true,
          status: true,
          setupFinishedAt: true,
          subscription: { select: { plan: { select: { modules: true } } } },
        },
      }),
      this.tenant.db.section.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { name: true, code: true },
      }),
      this.setupState.confirmedKeys(),
      this.tenant.db.academicSession.findFirst({
        where: { status: 'ACTIVE', terms: { some: {} } },
        select: { id: true },
      }),
    ]);
    const steps: SetupStepView[] = [];
    // Features outside the school's plan aren't part of its setup.
    const modules = school.subscription?.plan.modules;
    for (const def of SETUP_STEPS) {
      const module = STEP_MODULE[def.id];
      if (module && !planIncludes(modules, module)) continue;
      steps.push(await this.stepView(def, confirmed));
    }
    const onboarding = school.status === 'ONBOARDING';
    const finished = Boolean(school.setupFinishedAt);
    const foundationSteps = [...FOUNDATION_STEPS];
    return {
      intro:
        onboarding || !sections.length
          ? 'Steps adapt to your offering. Choose your sections first; the classes, subjects and grading steps follow from them.'
          : `Steps adapt to your offering. ${school.name} runs ${joinNames(sections.map((s) => s.name))}${
              sections.some((s) => s.code === 'NUR')
                ? ', so nursery grading descriptors are included'
                : ''
            }.`,
      steps,
      finished,
      onboarding,
      foundationComplete:
        finished ||
        (Boolean(running) && foundationSteps.every((id) => steps.find((s) => s.id === id)?.done)),
      foundationSteps,
    };
  }

  /** The signed-in member's permissions, for steps whose permission depends on the step. */
  private async permissions(): Promise<Set<string>> {
    const membershipId = RequestContext.get()?.membershipId;
    const membership = membershipId
      ? await this.tenant.db.schoolMembership.findFirst({
          where: { id: membershipId },
          select: {
            roles: { select: { role: { select: { permissions: true, archivedAt: true } } } },
          },
        })
      : null;
    return new Set(
      flattenPermissions(
        (membership?.roles ?? []).filter((r) => !r.role.archivedAt).map((r) => r.role.permissions),
      ),
    );
  }

  async complete(id: string): Promise<SetupStepView> {
    const def = SETUP_STEPS.find((s) => s.id === id);
    if (!def) throw AppException.notFound('Setup step not found', 'SETUP_STEP_NOT_FOUND');
    if (!(await this.permissions()).has(def.permission)) throw AppException.forbidden();
    const source = this.source(id);
    if (source?.complete) await source.complete();
    else if (source) {
      const blocker = (await source.state()).blockers?.[0];
      if (blocker)
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, blocker, 'SETUP_STEP_BLOCKED');
    }
    await this.tenant.db.$transaction(async (tx) => {
      await this.setupState.confirm(id, tx);
      await this.audit.record(
        {
          action: 'setup.complete',
          area: 'Setup',
          entity: 'SetupStep',
          entityId: id,
          summary: `${def.name} marked as done`,
        },
        asTx(tx),
      );
    });
    return this.stepView(def, await this.setupState.confirmedKeys());
  }

  async finish(): Promise<SetupProgressView> {
    if (!(await this.permissions()).has('settings.profile')) throw AppException.forbidden();
    const view = await this.view();
    if (view.finished) return view;
    const left = view.steps.filter((s) => s.required && !s.done);
    if (left.length)
      throw new AppException(
        HttpStatus.CONFLICT,
        `Finish the required steps first: ${left.map((s) => s.name).join(', ')}.`,
        'SETUP_STEPS_LEFT',
      );
    const schoolId = RequestContext.schoolId();
    await this.tenant.db.$transaction(async (tx) => {
      // Recorded first: a read-only support session is refused here, before the school changes.
      await this.audit.record(
        {
          action: 'setup.finish',
          area: 'Setup',
          entity: 'School',
          entityId: schoolId,
          summary: 'Setup marked complete',
        },
        asTx(tx),
      );
      await tx.school.update({
        where: { id: schoolId },
        data: { setupFinishedAt: this.clock.now() },
      });
      // Finishing setup ends onboarding: the back office now shows the school as Active (with its
      // subscription status) and renewal reminders apply. A suspended school stays suspended.
      await tx.school.updateMany({
        where: { id: schoolId, status: 'ONBOARDING' },
        data: { status: 'ACTIVE' },
      });
    });
    return { ...view, finished: true, foundationComplete: true };
  }
}
