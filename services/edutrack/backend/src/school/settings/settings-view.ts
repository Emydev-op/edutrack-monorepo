import type { SenderIdStatus, SubscriptionStatus } from '../../generated/prisma/enums.js';

/** Settings › History areas (AuditEvent.area for `settings.update` events). */
export const SETTINGS_AREAS = ['School', 'Academic', 'Finance', 'Security'] as const;
export type SettingsArea = (typeof SETTINGS_AREAS)[number];

/** The audit action every per-setting change is recorded under. */
export const SETTINGS_ACTION = 'settings.update';

export const onOff = (v: boolean) => (v ? 'On' : 'Off');

/* ---------------- Numbering ---------------- */

export type NumberingKind = 'admission' | 'staff';

export const NUMBERING_LABEL: Record<NumberingKind, string> = {
  admission: 'Admission number',
  staff: 'Staff ID',
};

const SEQ = /\[(#{3,6})\]/g;
const TOKEN = /\[[^\]]*\]/g;

/**
 * What's wrong with a numbering format, or null. Identical to School Admin's
 * `src/lib/numbering.ts`: one running number `[###]`–`[######]`, optional `[YYYY]`/`[YY]`,
 * capital letters, numbers, hyphens and slashes, 24 characters at most.
 */
export function patternProblem(pattern: string): string | null {
  const p = pattern.trim();
  if (!p) return 'Enter a format.';
  if (p.length > 24) return 'Keep the format to 24 characters or fewer.';
  if ((p.match(SEQ) ?? []).length !== 1)
    return 'Include one running number, written [###] to [######].';
  const unknown = (p.match(TOKEN) ?? []).filter((t) => !/^\[(#{3,6}|YYYY|YY)\]$/.test(t));
  if (unknown.length) return `${unknown[0]} isn’t a format code. Use [YYYY], [YY] or [####].`;
  if (!/^[A-Z0-9/-]*$/.test(p.replace(TOKEN, '')))
    return 'Use capital letters, numbers, hyphens and slashes only.';
  return null;
}

/** The pattern without its codes, to tell admission numbers and staff IDs apart. */
export const literalPart = (pattern: string) => pattern.replace(TOKEN, '');

/* ---------------- Localisation ---------------- */

const COUNTRY: Record<string, string> = { NG: 'Nigeria' };
const CURRENCY: Record<string, string> = { NGN: 'Nigerian Naira (₦, NGN)' };
const TIMEZONE: Record<string, string> = { 'Africa/Lagos': 'Africa/Lagos (WAT, UTC+1)' };

export const countryLabel = (code: string) => COUNTRY[code] ?? code;
export const currencyLabel = (code: string) => CURRENCY[code] ?? code;
export const timezoneLabel = (tz: string) => TIMEZONE[tz] ?? tz;

/** `street, city, LGA, state` → `Street → City → LGA → State`. */
export const addressFormatLabel = (stored: string) =>
  stored
    .split(/\s*,\s*/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' → ');

/* ---------------- Academic & finance switches ---------------- */

export const ACADEMIC_LABEL = {
  reweightExempt: 'Re-weight exempt components',
  promotionSuggestions: 'Suggest promotion decisions',
  blockPromotionOnFees: 'Block promotion when fees are outstanding',
} as const;
export type AcademicKey = keyof typeof ACADEMIC_LABEL;

export const FINANCE_LABEL = {
  verifyTransfers: 'Verify bank transfers before confirming',
  allowPartial: 'Allow part payments',
  autoSibling: 'Apply the sibling discount automatically',
  holdReportCards: 'Hold report cards with unpaid fees',
} as const;
export type FinanceKey = keyof typeof FINANCE_LABEL;

/** "Descriptive · Excellent, Good" / "CA 1 20% · CA 2 20% · Exam 60%". */
export function schemeSummary(s: {
  mode: 'descriptive' | 'scores';
  components: { name: string; weight: number }[];
  ratings: { name: string }[];
}): string {
  if (s.mode === 'descriptive')
    return `Descriptive · ${s.ratings.map((r) => r.name).join(', ') || 'no ratings yet'}`;
  return s.components.map((c) => `${c.name} ${c.weight}%`).join(' · ') || 'No components yet';
}

/* ---------------- Sign-in rules ---------------- */

export interface SignInRules {
  idleTimeoutMinutes: number;
  lockoutAttempts: number;
  lockoutMinutes: number;
  /** 0 means passwords never expire. */
  passwordExpiryDays: number;
}
export type RuleKey = keyof SignInRules;

/** [min, max, label, unit] per rule, as Settings › Security shows them. */
export const RULE_LIMITS: Record<RuleKey, [number, number, string, string]> = {
  idleTimeoutMinutes: [5, 240, 'Sign out after idle', 'minutes'],
  lockoutAttempts: [3, 10, 'Failed attempts before lockout', 'attempts'],
  lockoutMinutes: [5, 1440, 'Lockout length', 'minutes'],
  passwordExpiryDays: [30, 365, 'Password expiry', 'days'],
};
export const RULE_KEYS = Object.keys(RULE_LIMITS) as RuleKey[];

/** The 422 message for a rule out of range. */
export function ruleProblem(key: RuleKey, v: unknown): string | null {
  if (key === 'passwordExpiryDays' && v === 0) return null;
  const [min, max, label, unit] = RULE_LIMITS[key];
  if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max) return null;
  return `${label} must be a whole number from ${min} to ${max} ${unit}${key === 'passwordExpiryDays' ? ', or 0 for never' : ''}.`;
}

/** "Every 90 days", "Never", "15 minutes": how the change history shows a rule. */
export const ruleText = (key: RuleKey, v: number) =>
  key === 'passwordExpiryDays'
    ? v === 0
      ? 'Never'
      : `Every ${v} days`
    : `${v} ${RULE_LIMITS[key][3]}`;

/* ---------------- Subscription ---------------- */

/** What School Admin's Subscription tab shows. */
export type SchoolSubscriptionStatus = 'Active' | 'Renewal due' | 'Overdue' | 'Restricted';

/** Days before renewal when the tab starts saying "Renewal due" (the back office's Expiring window). */
export const RENEWAL_WINDOW_DAYS = 30;

/**
 * The back office's status in the school's words: Expiring (or Active inside the renewal window,
 * before the daily job moves it) is "Renewal due", the grace period "Overdue", and Restricted,
 * Expired and Cancelled (all of which make School Admin view-only) "Restricted".
 */
export function schoolSubscriptionStatus(
  status: SubscriptionStatus,
  daysToRenewal: number,
): SchoolSubscriptionStatus {
  switch (status) {
    case 'RESTRICTED':
    case 'EXPIRED':
    case 'CANCELLED':
      return 'Restricted';
    case 'GRACE_PERIOD':
      return 'Overdue';
    case 'EXPIRING':
      return daysToRenewal < 0 ? 'Overdue' : 'Renewal due';
    case 'ACTIVE':
      return daysToRenewal < 0
        ? 'Overdue'
        : daysToRenewal <= RENEWAL_WINDOW_DAYS
          ? 'Renewal due'
          : 'Active';
  }
}

export const SENDER_ID_STATUS: Record<
  SenderIdStatus,
  'Not requested' | 'Pending approval' | 'Approved' | 'Rejected'
> = {
  NOT_REQUESTED: 'Not requested',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** The subscription price per year in naira (term and month prices annualised). */
export function annualNaira(priceKobo: bigint, period: 'ANNUAL' | 'TERM' | 'MONTH'): number {
  const perYear = period === 'TERM' ? 3n : period === 'MONTH' ? 12n : 1n;
  return Number(priceKobo * perYear) / 100;
}
