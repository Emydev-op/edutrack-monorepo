import { CORE_MODULES, MODULE_BY_ID, requirementsOf } from '@/config/plan-modules';
import type { CreatePlanPayload, Plan, PlanDefinition, PlanStatus } from '@/types';
import { PLAN_LIMITS, planChanges } from '@/views/plans/plan-format';

import { audit, ME, plans, schools } from '../db';
import { mock, MockHttpError } from '@edutrack/web-core/mock';
import { requireText } from './shared';

function findPlan(id: string) {
  const plan = plans.find((p) => p.id === id);
  if (!plan) throw new MockHttpError(404, 'Plan not found');
  return plan;
}

const isCount = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Checks a plan the way the API does, so the editor's own validation can be tested against it. */
function readDefinition(body: unknown, id?: string): PlanDefinition {
  const p = body as PlanDefinition;
  const name = requireText(p.name, 'Give the plan a name');
  if (plans.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase()))
    throw new MockHttpError(409, 'Another plan already uses this name');

  const { model, prices = {}, perStudent } = p.pricing ?? {};
  if (model === 'flat' && !Object.values(prices).some((v) => (v ?? 0) > 0))
    throw new MockHttpError(422, 'Set a price for at least one billing period');
  if (model === 'per_student' && !((perStudent ?? 0) > 0))
    throw new MockHttpError(422, 'Enter the price per student');
  if (!['flat', 'per_student', 'custom'].includes(model ?? ''))
    throw new MockHttpError(422, 'Choose how the plan is priced');

  for (const { key, label } of PLAN_LIMITS) {
    const value = p.limits?.[key];
    if (value !== null && !(isCount(value) && value! > 0))
      throw new MockHttpError(422, `${label} must be at least 1, or unlimited`);
  }

  const modules = new Set([...CORE_MODULES, ...(p.modules ?? [])]);
  for (const id of modules) {
    const mod = MODULE_BY_ID[id];
    if (!mod) throw new MockHttpError(422, `Unknown module “${id}”`);
    if (mod.comingSoon) throw new MockHttpError(422, `${mod.name} isn’t available yet`);
    const missing = requirementsOf(id).filter((req) => !modules.has(req));
    if (missing.length)
      throw new MockHttpError(
        422,
        `${mod.name} needs ${missing.map((req) => MODULE_BY_ID[req]!.name).join(', ')}`,
      );
  }

  return {
    name,
    description: (p.description ?? '').trim(),
    pricing: p.pricing,
    trialDays: isCount(p.trialDays) ? p.trialDays : 0,
    setupFee: isCount(p.setupFee) ? p.setupFee : 0,
    limits: p.limits,
    smsCreditsPerTerm: isCount(p.smsCreditsPerTerm) ? p.smsCreditsPerTerm : 0,
    modules: [...modules],
    support: p.support === 'Priority' ? 'Priority' : 'Standard',
  };
}

const today = () =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(),
  );
const record = (plan: Plan, summary: string) =>
  plan.history.unshift({ version: plan.version, at: today(), by: ME.name, summary });

mock.get('/v1/platform/plans', () => plans);

mock.get('/v1/platform/plans/:id', ({ params }) => findPlan(params.id!));

mock.get('/v1/platform/plans/:id/schools', ({ params }) => {
  const plan = findPlan(params.id!);
  return schools
    .filter((s) => s.plan === plan.name)
    .map((s) => ({ schoolId: s.id, name: s.name, students: s.students, branches: s.branches }));
});

mock.post('/v1/platform/plans', ({ body }) => {
  const { status } = body as CreatePlanPayload;
  const definition = readDefinition(body);
  const slug = definition.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const plan: Plan = {
    ...definition,
    id: plans.some((p) => p.id === slug) ? `${slug}-${Date.now().toString(36).slice(-3)}` : slug,
    status: status === 'Active' ? 'Active' : 'Draft',
    schools: 0,
    version: 1,
    history: [],
  };
  record(plan, plan.status === 'Active' ? 'Created and published' : 'Created as draft');
  plans.push(plan);
  audit({
    summary: `${plan.status === 'Active' ? 'Published' : 'Created draft'} plan · ${plan.name}`,
    action: 'plan.create',
    entity: 'Plan',
    entityId: plan.id,
    next: plan.status,
  });
  return plan;
});

mock.patch('/v1/platform/plans/:id', ({ params, body }) => {
  const plan = findPlan(params.id!);
  const definition = readDefinition(body, plan.id);
  const changes = planChanges(plan, definition);
  if (!changes.length) return plan;
  Object.assign(plan, definition, { version: plan.version + 1 });
  record(plan, `${changes.map(([label]) => label).join(', ')} changed`);
  audit({
    summary: `Edited plan · ${plan.name}`,
    action: 'plan.update',
    entity: 'Plan',
    entityId: plan.id,
    previous: `v${plan.version - 1}`,
    next: `v${plan.version}`,
  });
  return plan;
});

mock.post('/v1/platform/plans/:id/status', ({ params, body }) => {
  const plan = findPlan(params.id!);
  const next = (body as { status: PlanStatus }).status;
  if (next !== 'Active' && next !== 'Archived')
    throw new MockHttpError(422, 'A plan can only be published, restored or archived');
  if (next === plan.status) return plan;
  const previous = plan.status;
  plan.status = next;
  const verb = next === 'Archived' ? 'Archived' : previous === 'Draft' ? 'Published' : 'Restored';
  record(plan, verb);
  audit({
    summary: `${verb} plan · ${plan.name}`,
    action: `plan.${verb.toLowerCase()}`,
    entity: 'Plan',
    entityId: plan.id,
    previous,
    next,
  });
  return plan;
});

mock.delete('/v1/platform/plans/:id', ({ params }) => {
  const plan = findPlan(params.id!);
  if (plan.status !== 'Draft' || plan.schools > 0)
    throw new MockHttpError(409, 'Only drafts that no school uses can be deleted');
  plans.splice(plans.indexOf(plan), 1);
  audit({
    summary: `Deleted draft plan · ${plan.name}`,
    action: 'plan.delete',
    entity: 'Plan',
    entityId: plan.id,
    previous: 'Draft',
  });
  return { ok: true };
});
