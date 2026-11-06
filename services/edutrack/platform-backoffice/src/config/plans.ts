import type { PlanName } from '@/types';

/** Plan prices and limits as shown to platform staff. The API is the source of truth for billing. */
export const PLAN_LIMIT_LABEL: Record<
  PlanName,
  { price: string; students: string; branches: string }
> = {
  Starter: { price: '₦650,000', students: '500', branches: '2' },
  Growth: { price: '₦1,850,000', students: '1,500', branches: '5' },
  Enterprise: { price: 'Custom', students: 'Unlimited', branches: 'Unlimited' },
};
