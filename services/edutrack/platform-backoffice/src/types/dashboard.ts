export type RevenueRange = '7d' | '30d' | '3m' | '6m' | '12m';
export type GrowthRange = '6m' | '12m';

export interface DashboardSummary {
  greetingName: string;
  generatedAt: string;
  totals: {
    schools: number;
    active: number;
    activeShare: string;
    onboarding: number;
    stalledOnboarding: number;
    suspended: number;
    expired: number;
    students: number;
    teachers: number;
    activeBranches: number;
    createdBranches: number;
  };
}

export interface RevenuePoint {
  label: string;
  renewals: number;
  newSchools: number;
  upgrades: number;
  previous: number;
}

export interface RevenueReport {
  label: string;
  total: number;
  previousTotal: number;
  points: RevenuePoint[];
  stats: {
    activeSubscriptions: number;
    renewals: number;
    overdue: number;
    overdueAmount: string;
    expiringSoon: number;
  };
}

export interface GrowthReport {
  months: {
    month: string;
    onboarded: number;
    active: number;
    suspended: number;
    expired: number;
  }[];
}

export interface AttentionItem {
  id: string;
  status: string;
  text: string;
  context: string;
  action: string;
  to: string;
}

export interface SubscriptionHealthItem {
  label: string;
  status: string;
  schools: number;
  tone: 'success' | 'warning' | 'error' | 'neutral';
}
