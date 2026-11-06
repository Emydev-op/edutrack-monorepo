import { describe, expect, it } from 'vitest';

import { CORE_MODULES, dependentsOf, requirementsOf } from '@/config/plan-modules';
import { emptyPlanForm, formToPlan, planToForm } from '@/schema/plan';
import type { PlanDefinition } from '@/types';

import { loweredLimits, planChanges, planWarnings, priceText } from '../plan-format';

const plan = (patch: Partial<PlanDefinition> = {}): PlanDefinition => ({
  ...formToPlan({
    ...emptyPlanForm(),
    name: 'Growth',
    periods: {
      annual: { offered: true, price: 1_850_000 },
      term: { offered: true, price: 680_000 },
      month: { offered: false, price: null },
    },
    limits: {
      students: { unlimited: false, value: 1500 },
      branches: { unlimited: false, value: 5 },
      users: { unlimited: false, value: 80 },
      storage: { unlimited: true, value: null },
    },
  }),
  ...patch,
});

describe('module dependencies', () => {
  it('turns on everything a module needs, through the whole chain', () => {
    expect(requirementsOf('promotion').sort()).toEqual(['assess', 'results', 'subjects']);
    expect(requirementsOf('fees')).toEqual([]);
  });

  it('finds the enabled modules that stop working without one', () => {
    const on = [...CORE_MODULES, 'subjects', 'assign', 'timetable', 'assess', 'teacher'];
    expect(dependentsOf('subjects', on).sort()).toEqual([
      'assess',
      'assign',
      'teacher',
      'timetable',
    ]);
    expect(dependentsOf('assess', on)).toEqual([]);
  });
});

describe('plan form', () => {
  it('round-trips a saved plan without inventing changes', () => {
    const saved = plan();
    expect(planChanges(saved, formToPlan(planToForm(saved)))).toEqual([]);
  });

  it('drops prices for periods that are switched off and for other pricing models', () => {
    const form = planToForm(plan());
    form.periods.term.offered = false;
    expect(formToPlan(form).pricing.prices).toEqual({ annual: 1_850_000 });
    expect(formToPlan({ ...form, model: 'custom' }).pricing).toEqual({
      model: 'custom',
      prices: {},
    });
  });
});

describe('plan changes', () => {
  it('describes each change as before → after', () => {
    const before = plan();
    const after = plan({
      limits: { ...before.limits, students: 1200, storage: 50 },
      modules: [...before.modules.filter((m) => m !== 'results'), 'fees'],
    });
    expect(planChanges(before, after)).toEqual([
      ['Students', '1,500 → 1,200'],
      ['Storage', 'Unlimited → 50 GB'],
      ['Added', 'Fees & invoices'],
      ['Removed', 'Results & report cards'],
    ]);
    expect(loweredLimits(before, after).map((l) => l.key)).toEqual(['students', 'storage']);
  });

  it('formats each pricing model', () => {
    expect(priceText(plan().pricing)).toBe('₦1,850,000 / year · ₦680,000 / term');
    expect(
      priceText({ model: 'per_student', prices: {}, perStudent: 1500, minimumPerTerm: 250_000 }),
    ).toBe('₦1,500 / student / term · min ₦250,000');
  });

  it('warns about likely mistakes without blocking the save', () => {
    const p = plan({
      pricing: { model: 'flat', prices: { annual: 900_000, term: 200_000 } },
      modules: [...CORE_MODULES, 'fees', 'online', 'sms'],
      smsCreditsPerTerm: 0,
    });
    expect(planWarnings(p)).toEqual([
      'Three terms cost less than a year. Check the annual price.',
      'No parent or student portal: families only get email or SMS.',
      'Online payments work best with the Parent Portal on.',
      'SMS is on but the plan has no SMS credits.',
    ]);
  });
});
