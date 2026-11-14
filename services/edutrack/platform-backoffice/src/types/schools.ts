import type { PageQuery } from './common';
import type { PlanName } from './plans';

export type SchoolStatus =
  | 'Active'
  | 'Onboarding'
  | 'Expiring'
  | 'Grace period'
  | 'Restricted'
  | 'Suspended'
  | 'Expired'
  | 'Cancelled';

export type AcademicSection = 'Nursery' | 'Primary' | 'Junior Secondary' | 'Senior Secondary';

export interface School {
  id: string;
  name: string;
  legalName: string;
  type: string;
  state: string;
  plan: PlanName;
  status: SchoolStatus;
  students: number;
  branches: number;
  renews: string;
  setupProgress: number;
  currentStep: string;
  admin: string;
  contactEmail: string;
  phone: string;
  subdomain: string;
  createdAt: string;
  brandColor: string | null;
}

export interface SchoolQuery extends PageQuery {
  status?: SchoolStatus;
  plan?: PlanName;
  state?: string;
}

export interface UpdateSchoolPayload {
  name: string;
  contactEmail: string;
  phone: string;
  state: string;
}

export interface SchoolAdministrator {
  id: string;
  name: string;
  email: string;
  role: 'School Admin' | 'Owner';
  scope: string;
  invitedAt: string;
  status: 'Active' | 'Invited';
  note?: string;
}

export interface InviteSchoolAdminPayload {
  name: string;
  email: string;
  role: SchoolAdministrator['role'];
  scope: string;
}

export interface SchoolUsage {
  activeStaff: number;
  parentSignIns: number;
  smsSent: number;
  smsNote?: string;
  storageUsedGb: number;
  /** `null`: the plan has unlimited storage. */
  storageLimitGb: number | null;
}

export interface PlatformInvoice {
  id: string;
  period: string;
  amount: string;
  /** Due: issued and not yet past its due date. */
  status: 'Paid' | 'Due' | 'Overdue';
}

export interface ProvisionSchoolPayload {
  name: string;
  legalName: string;
  ownership: 'Private' | 'Public' | 'Mission';
  registrationNumber: string;
  email: string;
  phone: string;
  state: string;
  lga: string;
  brandColor: string;
  sections: AcademicSection[];
  branches: { name: string; address: string }[];
  plan: PlanName;
  startDate: string;
  /** First administrators. Each gets an invitation; scope is "All branches" or one branch name. */
  admins: { name: string; email: string; phone: string; position: string; scope: string }[];
}
