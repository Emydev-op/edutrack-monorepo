import type { PageQuery } from './common';
import type { PlanName } from './plans';
import type { SchoolStatus } from './schools';

export type SubscriptionStatus = Exclude<SchoolStatus, 'Onboarding' | 'Suspended'>;

export interface SubscriptionRow {
  schoolId: string;
  schoolName: string;
  plan: PlanName;
  studentUsage: string;
  branchUsage: string;
  renews: string;
  billing: 'Paid' | 'Overdue';
  status: SubscriptionStatus;
}

export interface SubscriptionQuery extends PageQuery {
  status?: SubscriptionStatus;
}

export interface SchoolSubscription {
  plan: PlanName;
  price: string;
  studentLimit: string;
  branchLimit: string;
  renews: string;
  payment: 'Paid' | 'Overdue';
  status: SchoolStatus;
}

export type SubscriptionAction =
  | { action: 'change_plan'; plan: PlanName }
  | { action: 'extend'; period: '1 month' | '3 months' | '6 months'; reason: string }
  | { action: 'enter_grace' }
  | { action: 'restrict'; reason: string }
  | { action: 'cancel'; reason: string }
  | { action: 'reactivate' };
