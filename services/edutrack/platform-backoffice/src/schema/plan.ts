import { toTypedSchema } from '@vee-validate/yup';
import * as yup from 'yup';

import { CORE_MODULES } from '@/config/plan-modules';
import type {
  BillingPeriod,
  Plan,
  PlanDefinition,
  PlanLimitKey,
  PricingModel,
  SupportTier,
} from '@/types';

/** The plan editor's values. Numbers are `null` while a field is empty. */
export interface PlanFormValues {
  name: string;
  description: string;
  model: PricingModel;
  /** A period is offered when it has an entry; its price can still be empty while typing. */
  periods: Record<BillingPeriod, { offered: boolean; price: number | null }>;
  perStudent: number | null;
  minimumPerTerm: number | null;
  trialDays: number | null;
  setupFee: number | null;
  limits: Record<PlanLimitKey, { unlimited: boolean; value: number | null }>;
  smsCreditsPerTerm: number | null;
  modules: string[];
  support: SupportTier;
}

const amount = () =>
  yup
    .number()
    .nullable()
    .default(null)
    .transform((v: number) => (Number.isNaN(v) ? null : v));

const limit = (label: string) =>
  yup.object({
    unlimited: yup.boolean().default(false),
    value: amount().when('unlimited', ([isUnlimited], s) =>
      isUnlimited
        ? s
        : s
            .required(`${label} must be at least 1, or unlimited`)
            .min(1, `${label} must be at least 1, or unlimited`),
    ),
  });

const period = yup.object({ offered: yup.boolean().default(false), price: amount() });

/** `takenNames` are the other plans' names, which this plan can't reuse. */
export const planFormSchema = (takenNames: () => string[]) =>
  toTypedSchema(
    yup.object({
      name: yup
        .string()
        .trim()
        .required('Give the plan a name')
        .test('unique', 'Another plan already uses this name', (name = '') =>
          takenNames().every((n) => n.toLowerCase() !== name.trim().toLowerCase()),
        ),
      description: yup.string().trim().default(''),
      model: yup.mixed<PricingModel>().oneOf(['flat', 'per_student', 'custom']).required(),
      periods: yup
        .object({ annual: period, term: period, month: period })
        .test('one-price', 'Set a price for at least one billing period', function (periods) {
          if (this.parent.model !== 'flat') return true;
          return Object.values(periods ?? {}).some((p) => p.offered && (p.price ?? 0) > 0);
        }),
      perStudent: amount().when('model', ([model], s) =>
        model === 'per_student'
          ? s.required('Enter the price per student').min(1, 'Enter the price per student')
          : s,
      ),
      minimumPerTerm: amount(),
      trialDays: amount(),
      setupFee: amount(),
      limits: yup.object({
        students: limit('Student limit'),
        branches: limit('Branch limit'),
        users: limit('Staff accounts'),
        storage: limit('Storage'),
      }),
      smsCreditsPerTerm: amount(),
      modules: yup.array(yup.string().required()).default([]),
      support: yup.mixed<SupportTier>().oneOf(['Standard', 'Priority']).required(),
    }),
  );

const LIMIT_KEYS: PlanLimitKey[] = ['students', 'branches', 'users', 'storage'];
const PERIODS: BillingPeriod[] = ['annual', 'term', 'month'];

export const emptyPlanForm = (): PlanFormValues => ({
  name: '',
  description: '',
  model: 'flat',
  periods: {
    annual: { offered: true, price: null },
    term: { offered: false, price: null },
    month: { offered: false, price: null },
  },
  perStudent: null,
  minimumPerTerm: null,
  trialDays: 14,
  setupFee: null,
  limits: {
    students: { unlimited: false, value: null },
    branches: { unlimited: false, value: 1 },
    users: { unlimited: false, value: null },
    storage: { unlimited: false, value: 10 },
  },
  smsCreditsPerTerm: 0,
  modules: [...CORE_MODULES, 'subjects', 'assign', 'assess', 'results'],
  support: 'Standard',
});

export function planToForm(plan: PlanDefinition): PlanFormValues {
  const { pricing } = plan;
  return {
    name: plan.name,
    description: plan.description,
    model: pricing.model,
    periods: Object.fromEntries(
      PERIODS.map((k) => [k, { offered: k in pricing.prices, price: pricing.prices[k] ?? null }]),
    ) as PlanFormValues['periods'],
    perStudent: pricing.perStudent ?? null,
    minimumPerTerm: pricing.minimumPerTerm ?? null,
    trialDays: plan.trialDays,
    setupFee: plan.setupFee || null,
    limits: Object.fromEntries(
      LIMIT_KEYS.map((k) => [k, { unlimited: plan.limits[k] === null, value: plan.limits[k] }]),
    ) as PlanFormValues['limits'],
    smsCreditsPerTerm: plan.smsCreditsPerTerm,
    modules: [...plan.modules],
    support: plan.support,
  };
}

/** The plan the form describes, as the API stores it. Fields the pricing model ignores are dropped. */
export function formToPlan(v: PlanFormValues): PlanDefinition {
  const prices: PlanDefinition['pricing']['prices'] = {};
  if (v.model === 'flat')
    for (const k of PERIODS)
      if (v.periods[k].offered && v.periods[k].price) prices[k] = v.periods[k].price;
  return {
    name: v.name.trim(),
    description: v.description.trim(),
    pricing: {
      model: v.model,
      prices,
      ...(v.model === 'per_student' && {
        perStudent: v.perStudent ?? 0,
        ...(v.minimumPerTerm ? { minimumPerTerm: v.minimumPerTerm } : {}),
      }),
    },
    trialDays: v.trialDays ?? 0,
    setupFee: v.setupFee ?? 0,
    limits: Object.fromEntries(
      LIMIT_KEYS.map((k) => [k, v.limits[k].unlimited ? null : (v.limits[k].value ?? 0)]),
    ) as PlanDefinition['limits'],
    smsCreditsPerTerm: v.smsCreditsPerTerm ?? 0,
    modules: v.modules,
    support: v.support,
  };
}

/** A copy of `plan` to start a new draft from. */
export const duplicatePlanForm = (plan: Plan): PlanFormValues => ({
  ...planToForm(plan),
  name: `${plan.name} (copy)`,
});
