/** The plans schools are on today. New plans can be created, but schools still reference these. */
export type PlanName = 'Starter' | 'Growth' | 'Enterprise';

export type PlanStatus = 'Active' | 'Draft' | 'Archived';
/** Fixed price per period, a price per enrolled student, or quoted per school by sales. */
export type PricingModel = 'flat' | 'per_student' | 'custom';
export type BillingPeriod = 'annual' | 'term' | 'month';
export type PlanLimitKey = 'students' | 'branches' | 'users' | 'storage';
export type SupportTier = 'Standard' | 'Priority';

export interface PlanPricing {
  model: PricingModel;
  /** Flat prices in naira for each period the plan is offered on. */
  prices: Partial<Record<BillingPeriod, number>>;
  perStudent?: number;
  /** Per-student plans: the least a school pays in a term. */
  minimumPerTerm?: number;
}

/** What a plan offers: the part platform staff edit. */
export interface PlanDefinition {
  name: string;
  description: string;
  pricing: PlanPricing;
  trialDays: number;
  setupFee: number;
  /** `null` means unlimited. Storage is in GB. */
  limits: Record<PlanLimitKey, number | null>;
  smsCreditsPerTerm: number;
  modules: string[];
  support: SupportTier;
}

export interface PlanVersion {
  version: number;
  at: string;
  by: string;
  summary: string;
}

export interface Plan extends PlanDefinition {
  id: string;
  status: PlanStatus;
  /** Schools subscribed to this plan. */
  schools: number;
  version: number;
  history: PlanVersion[];
}

export interface CreatePlanPayload extends PlanDefinition {
  status: 'Active' | 'Draft';
}

/** A school on a plan and how much of it they use, to check edits against. */
export interface PlanSchoolUsage {
  schoolId: string;
  name: string;
  students: number;
  branches: number;
}
