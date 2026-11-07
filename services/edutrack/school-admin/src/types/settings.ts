/** Settings: configuration, not records. Every change is logged in the change history. */

export type SettingsTab =
  'school' | 'academic' | 'finance' | 'notifications' | 'subscription' | 'modules' | 'security';

/* ---------------- School ---------------- */

export type NumberingKind = 'admission' | 'staff';

export interface NumberingFormat {
  kind: NumberingKind;
  label: string;
  /** e.g. STU-[YYYY]-[####]. */
  pattern: string;
  /** The number the next record gets with the saved pattern. */
  next: string;
  /** The running number the next record gets, for previewing an edited pattern. */
  nextSeq: number;
}

export interface SchoolSettings {
  localisation: {
    country: string;
    currency: string;
    timezone: string;
    dateFormat: string;
    addressFormat: string;
  };
  numbering: NumberingFormat[];
  /** Set in Finance → Billing settings. */
  invoicePrefix: string;
  receiptPrefix: string;
  setup: { finished: boolean; done: number; total: number };
}

export type NumberingPayload = Record<NumberingKind, string>;

/* ---------------- Academic ---------------- */

export interface AcademicPolicy {
  showPosition: boolean;
  reweightExempt: boolean;
  promotionSuggestions: boolean;
  blockPromotionOnFees: boolean;
}

export interface AcademicSettings extends AcademicPolicy {
  /** Terms in the current session; null before the first session exists. */
  termsPerSession: number | null;
  session: string | null;
  passMark: number;
  /** "Junior Secondary · CA 1 20% · CA 2 20% · Exam 60%". */
  schemes: { section: string; summary: string }[];
  promotionRule: string | null;
}

/* ---------------- Finance ---------------- */

export interface FinanceToggles {
  allowPartial: boolean;
  autoSibling: boolean;
  verifyTransfers: boolean;
}

/* ---------------- Subscription & modules ---------------- */

export type SubscriptionStatus = 'Active' | 'Renewal due' | 'Overdue' | 'Restricted';

export interface SubscriptionView {
  plan: string;
  cycle: 'Annual';
  price: number;
  startedOn: string;
  renewsOn: string;
  /** Negative once the renewal date has passed. */
  daysToRenewal: number;
  status: SubscriptionStatus;
  billingContact: string;
  usage: {
    students: number;
    studentLimit: number;
    branches: number;
    branchLimit: number;
    staffAccounts: number;
    smsUnits: number;
    smsUsedThisTerm: number;
    senderId: string;
    senderIdStatus: 'Not requested' | 'Pending approval' | 'Approved' | 'Rejected';
  };
  modules: { name: string; included: boolean }[];
}

export type ModuleStatus = 'Active' | 'Not on plan' | 'Coming soon';

export interface ModuleRow {
  name: string;
  covers: string;
  status: ModuleStatus;
}

/* ---------------- Security ---------------- */

export interface SignInRules {
  idleTimeoutMinutes: number;
  lockoutAttempts: number;
  lockoutMinutes: number;
  /** 0 means passwords never expire. */
  passwordExpiryDays: number;
}

export interface SessionRow {
  id: string;
  device: string;
  location: string;
  /** ISO date-time. */
  lastActive: string;
  current: boolean;
}

export interface SecurityView {
  account: {
    name: string;
    email: string;
    position: string;
    role: string;
    /** ISO date. */
    passwordChangedOn: string;
    /** ISO date, or null when passwords never expire. */
    passwordExpiresOn: string | null;
  };
  sessions: SessionRow[];
  rules: SignInRules;
}

export interface ChangePasswordPayload {
  current: string;
  next: string;
}

/* ---------------- Change history ---------------- */

export type SettingsArea = 'School' | 'Academic' | 'Finance' | 'Security';

export interface SettingsChange {
  id: string;
  area: SettingsArea;
  setting: string;
  from: string;
  to: string;
  by: string;
  /** ISO date-time. */
  at: string;
}
