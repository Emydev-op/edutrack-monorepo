import type { StatusTone } from '@edutrack/ui/lib/status';

import { moduleName, MODULE_BY_ID, OPTIONAL_MODULES, PORTAL_MODULES } from '@/config/plan-modules';
import { formatCount, formatNaira } from '@edutrack/app-kit/lib/format';
import type {
  BillingPeriod,
  PlanDefinition,
  PlanLimitKey,
  PlanPricing,
  PlanSchoolUsage,
  PlanStatus,
} from '@/types';

export const BILLING_PERIODS: { key: BillingPeriod; label: string; short: string }[] = [
  { key: 'annual', label: 'Per year', short: '/ year' },
  { key: 'term', label: 'Per term', short: '/ term' },
  { key: 'month', label: 'Per month', short: '/ month' },
];

export const PLAN_LIMITS: { key: PlanLimitKey; label: string; hint: string; unit?: string }[] = [
  { key: 'students', label: 'Students', hint: 'Enrolled students across all branches' },
  { key: 'branches', label: 'Branches', hint: 'Campuses the school can run' },
  { key: 'users', label: 'Staff accounts', hint: 'People with school sign-in' },
  { key: 'storage', label: 'Storage', hint: 'For documents and materials', unit: 'GB' },
];

export const PLAN_STATUS_TONE: Record<PlanStatus, StatusTone> = {
  Active: 'success',
  Draft: 'info',
  Archived: 'neutral',
};

export function priceText(pricing: PlanPricing): string {
  if (pricing.model === 'custom') return 'Custom · quoted';
  if (pricing.model === 'per_student') {
    const min = pricing.minimumPerTerm ? ` · min ${formatNaira(pricing.minimumPerTerm)}` : '';
    return `${formatNaira(pricing.perStudent ?? 0)} / student / term${min}`;
  }
  return (
    BILLING_PERIODS.filter((p) => pricing.prices[p.key])
      .map((p) => `${formatNaira(pricing.prices[p.key]!)} ${p.short}`)
      .join(' · ') || '—'
  );
}

export function limitText(plan: Pick<PlanDefinition, 'limits'>, key: PlanLimitKey): string {
  const value = plan.limits[key];
  if (value === null) return 'Unlimited';
  const unit = PLAN_LIMITS.find((l) => l.key === key)?.unit;
  return unit ? `${formatCount(value)} ${unit}` : formatCount(value);
}

/** Optional modules on the plan (core modules come with every plan). */
export const optionalModuleCount = (modules: readonly string[]) =>
  modules.filter((id) => MODULE_BY_ID[id] && !MODULE_BY_ID[id].core && !MODULE_BY_ID[id].comingSoon)
    .length;
export const OPTIONAL_MODULE_TOTAL = OPTIONAL_MODULES.length;

export const portalNames = (modules: readonly string[]) =>
  PORTAL_MODULES.filter((p) => modules.includes(p.id)).map((p) =>
    p.name.replace(/ (Workspace|Portal)$/, ''),
  );

/** What changed between the saved plan and the edit, as [label, "before → after"] rows. */
export function planChanges(before: PlanDefinition, after: PlanDefinition): [string, string][] {
  const out: [string, string][] = [];
  const name = after.name.trim();
  if (before.name !== name) out.push(['Name', `${before.name} → ${name}`]);
  if (priceText(before.pricing) !== priceText(after.pricing))
    out.push(['Price', `${priceText(before.pricing)} → ${priceText(after.pricing)}`]);
  if (before.trialDays !== after.trialDays)
    out.push(['Trial', `${before.trialDays} → ${after.trialDays} days`]);
  if (before.setupFee !== after.setupFee)
    out.push(['Setup fee', `${formatNaira(before.setupFee)} → ${formatNaira(after.setupFee)}`]);
  for (const { key, label } of PLAN_LIMITS) {
    if (limitText(before, key) !== limitText(after, key))
      out.push([label, `${limitText(before, key)} → ${limitText(after, key)}`]);
  }
  if (before.smsCreditsPerTerm !== after.smsCreditsPerTerm)
    out.push([
      'SMS credits',
      `${formatCount(before.smsCreditsPerTerm)} → ${formatCount(after.smsCreditsPerTerm)}`,
    ]);
  const added = after.modules.filter((id) => !before.modules.includes(id));
  const removed = before.modules.filter((id) => !after.modules.includes(id));
  if (added.length) out.push(['Added', added.map(moduleName).join(', ')]);
  if (removed.length) out.push(['Removed', removed.map(moduleName).join(', ')]);
  if (before.support !== after.support)
    out.push(['Support', `${before.support} → ${after.support}`]);
  if (before.description !== after.description.trim()) out.push(['Description', 'Updated']);
  return out;
}

/** Limits the edit lowers (or makes finite), which take effect at each school's renewal. */
export const loweredLimits = (before: PlanDefinition, after: PlanDefinition) =>
  PLAN_LIMITS.filter(({ key }) => {
    const next = after.limits[key];
    const prev = before.limits[key];
    return next !== null && (prev === null || next < prev);
  });

/** Schools already using more than the edited plan allows. */
export const schoolsOverLimit = (usage: PlanSchoolUsage[], plan: PlanDefinition) =>
  usage.filter(
    (s) =>
      (plan.limits.students !== null && s.students > plan.limits.students) ||
      (plan.limits.branches !== null && s.branches > plan.limits.branches),
  );

/** Combinations that work but are probably a mistake. */
export function planWarnings(plan: PlanDefinition): string[] {
  const has = (id: string) => plan.modules.includes(id);
  const { prices, model } = plan.pricing;
  return [
    model === 'flat' && prices.annual && prices.term && prices.term * 3 < prices.annual
      ? 'Three terms cost less than a year. Check the annual price.'
      : '',
    !has('parent') && !has('student')
      ? 'No parent or student portal: families only get email or SMS.'
      : '',
    has('online') && !has('parent') ? 'Online payments work best with the Parent Portal on.' : '',
    has('sms') && !plan.smsCreditsPerTerm ? 'SMS is on but the plan has no SMS credits.' : '',
  ].filter(Boolean);
}
