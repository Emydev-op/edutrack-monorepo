import type {
  BillingPeriod,
  SchoolOwnership,
  SchoolStatus,
  SubscriptionStatus,
} from '../../generated/prisma/enums.js';

/**
 * How the back office shows dates, money and statuses. The portals render these strings as they
 * are (the same ones their mock API returns), so they are worked out here, in Lagos time.
 */
const TZ = 'Africa/Lagos';

/** en-GB writes September as "Sept"; the portals use three-letter months. */
const sep = (text: string) => text.replace(/\bSept\b/g, 'Sep');

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: TZ,
});
const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: TZ,
});
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TZ,
});
const LONG_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TZ,
});

/** `8 Dec 2026`. Calendar (`@db.Date`) values are read in UTC so the day never shifts. */
export const formatDay = (date: Date, { calendar = false } = {}) =>
  sep(calendar ? DAY_FORMAT.format(midday(date)) : DAY_FORMAT.format(date));

/** `Sep 2026`. */
export const formatMonth = (date: Date) => sep(MONTH_FORMAT.format(midday(date)));

/** `8 Dec 2026 · 09:30`. */
export const formatStamp = (date: Date) =>
  `${sep(DAY_FORMAT.format(date))} · ${TIME_FORMAT.format(date)}`;

/** `Tuesday 8 December 2026, 09:30 WAT`. */
export const formatLong = (date: Date) =>
  `${LONG_FORMAT.format(date).replace(',', '')}, ${TIME_FORMAT.format(date)} WAT`;

/** A `@db.Date` value is midnight UTC; noon UTC is the same calendar day everywhere. */
const midday = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));

/** Today's calendar date in Lagos as a `@db.Date` value (midnight UTC). */
export function lagosToday(now: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
    .format(now)
    .split('-')
    .map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Calendar months, clamped to the end of shorter months (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), last)));
}

/** Whole days from `from` to `to` (calendar dates). */
export const daysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / 86_400_000);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `Sep` for a calendar date. */
export const shortMonth = (date: Date) => MONTHS[date.getUTCMonth()]!;

/** Relative time for activity feeds: `Just now`, `12 min ago`, `3 h ago`, `Yesterday`, `4 Dec`. */
export function formatAgo(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'Yesterday';
  return formatDay(date);
}

const NAIRA = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
const COUNT = new Intl.NumberFormat('en-NG');

/** Kobo to whole naira for the plan editor (prices are entered in naira). */
export const toNaira = (kobo: bigint | null | undefined) =>
  kobo === null || kobo === undefined ? undefined : Number(kobo / 100n);
export const toKobo = (naira: number) => BigInt(Math.round(naira)) * 100n;

/** `₦1,850,000`. */
export const formatNaira = (kobo: bigint) => `₦${NAIRA.format(Number(kobo / 100n))}`;

/** `₦8.9M` / `₦640K`, for dashboard stats. */
export function formatNairaShort(kobo: bigint): string {
  const naira = Number(kobo) / 100;
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (naira >= 1_000) return `₦${Math.round(naira / 1_000)}K`;
  return `₦${NAIRA.format(naira)}`;
}

/** Naira in millions, one decimal, for revenue charts. */
export const toMillions = (kobo: bigint) => Math.round(Number(kobo) / 100 / 100_000) / 10;

export const formatCount = (n: number) => COUNT.format(n);
export const formatLimit = (n: number | null) => (n === null ? 'Unlimited' : COUNT.format(n));

/** `+2348091204400` → `0809 120 4400`; other numbers as stored. */
export function displayPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : phone;
}

export const PERIOD_SUFFIX: Record<BillingPeriod, string> = {
  ANNUAL: ' / year',
  TERM: ' / term',
  MONTH: ' / month',
};
export const PERIOD_MONTHS: Record<BillingPeriod, number> = { ANNUAL: 12, TERM: 4, MONTH: 1 };

export const OWNERSHIP_LABEL: Record<SchoolOwnership, string> = {
  PRIVATE: 'Private',
  PUBLIC: 'Public',
  MISSION: 'Mission',
};

/** The back office's subscription statuses. */
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Active',
  EXPIRING: 'Expiring',
  GRACE_PERIOD: 'Grace period',
  RESTRICTED: 'Restricted',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};
export const SUBSCRIPTION_STATUS_BY_LABEL = Object.fromEntries(
  Object.entries(SUBSCRIPTION_STATUS_LABEL).map(([k, v]) => [v, k]),
) as Record<string, SubscriptionStatus>;

export const SCHOOL_STATUS_LABELS = [
  'Active',
  'Onboarding',
  'Expiring',
  'Grace period',
  'Restricted',
  'Suspended',
  'Expired',
  'Cancelled',
] as const;
export type SchoolStatusLabel = (typeof SCHOOL_STATUS_LABELS)[number];

/**
 * The status the back office shows for a school: the school's own status while it is onboarding
 * or suspended, otherwise its subscription's.
 */
export function schoolStatusLabel(
  school: SchoolStatus,
  subscription: SubscriptionStatus | null | undefined,
): SchoolStatusLabel {
  if (school === 'ONBOARDING') return 'Onboarding';
  if (school === 'SUSPENDED') return 'Suspended';
  return (subscription ? SUBSCRIPTION_STATUS_LABEL[subscription] : 'Active') as SchoolStatusLabel;
}

/** A URL-safe slug from a name: `St. Mary's College` → `st-marys-college`. */
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
