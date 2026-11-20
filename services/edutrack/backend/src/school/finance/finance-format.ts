import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type {
  ActiveStatus,
  BankAccountKind,
  DiscountAppliesTo,
  DiscountBasis,
  DiscountKind,
  ExpenseStatus,
  FeeCategory,
  FeeCharged,
  FeeType,
  InvoiceLineCategory,
  LateFeeKind,
  PaymentMethod,
  PaymentSource,
  PaymentStatus,
  RefundStatus,
  StatementMatch,
  TransferReference,
} from '../../generated/prisma/enums.js';

/**
 * Finance wording, money and dates, as the School Admin mock has them
 * (`school-admin/src/api/mock/handlers/finance-shared.ts`, `finance-ledger.ts`). The API speaks
 * whole naira and `YYYY-MM-DD` dates like the screens; the database keeps kobo (BigInt).
 */

/* ---------------- Money ---------------- */

/** Kobo → naira (a number the screens add up). */
export const naira = (kobo: bigint | null | undefined) => (kobo ? Number(kobo) / 100 : 0);
/** Naira → kobo. */
export const kobo = (n: number) => BigInt(Math.round(n * 100));

/** "₦185,000" ("−₦5,000" when negative). */
export const money = (n: number) =>
  `${n < 0 ? '−' : ''}₦${Math.abs(Math.round(n)).toLocaleString('en-NG')}`;
/** "₦6.4M", "₦640k", "₦900". */
export const millions = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `₦${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 1000
      ? `₦${Math.round(n / 1000).toLocaleString('en-NG')}k`
      : money(n);

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const last = <T>(xs: T[]): T | undefined => xs[xs.length - 1];

/* ---------------- Dates ---------------- */

export const DAY_MS = 86_400_000;
export const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
/** A `@db.Date` column as `YYYY-MM-DD`. */
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const dateOnly = (isoDay: string) => new Date(`${isoDay}T00:00:00.000Z`);
/** A timestamp's calendar day in Lagos. */
export const lagosIso = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d);
/** "8 Sep". */
export const shortDate = (isoDay: string) =>
  new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
/** "20 Nov 2026, 10:04" in Lagos, for timelines. */
export const stamp = (d: Date) =>
  `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })}`;

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/* ---------------- Errors ---------------- */

/** A finance rule the request breaks: 422 by default, with a stable code. */
export const finFail = (
  message: string,
  code = 'FINANCE_INVALID',
  status: number = HttpStatus.UNPROCESSABLE_ENTITY,
) => new AppException(status, message, code);
export const finConflict = (message: string, code = 'FINANCE_CONFLICT') =>
  new AppException(HttpStatus.CONFLICT, message, code);
export const notFound = (what: string, code: string) => AppException.notFound(what, code);

/** Whole naira, 0 < n ≤ ₦100m (or 0 when allowed). */
export function requireMoney(value: unknown, message: string, { allowZero = false } = {}) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || (!allowZero && n === 0))
    throw finFail(message, 'VALIDATION');
  if (n > 100_000_000) throw finFail('That amount is too large.', 'VALIDATION');
  return n;
}

export function requireDate(value: unknown, message: string) {
  if (typeof value !== 'string' || !ISO_DAY.test(value) || Number.isNaN(Date.parse(value)))
    throw finFail(message, 'VALIDATION');
  return value;
}

export function requireText(value: unknown, message: string, max = 300) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw finFail(message, 'VALIDATION');
  if (text.length > max) throw finFail(`Keep it to ${max} characters.`, 'VALIDATION');
  return text;
}

/* ---------------- Labels ---------------- */

const invert = <K extends string, V extends string>(m: Record<K, V>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<V, K>;

export const FEE_CATEGORY = {
  TUITION: 'Tuition',
  LEVY: 'Levy',
  EXAMS: 'Exams',
  ICT: 'ICT',
  BOOKS: 'Books',
  UNIFORM: 'Uniform',
  TRANSPORT: 'Transport',
  FEEDING: 'Feeding',
  BOARDING: 'Boarding',
  ACTIVITIES: 'Activities',
  ADMISSION: 'Admission',
  OTHER: 'Other',
} as const satisfies Record<FeeCategory, string>;
export type FeeCategoryLabel = (typeof FEE_CATEGORY)[FeeCategory];
export const FEE_CATEGORY_DB = invert(FEE_CATEGORY);
export const FEE_CATEGORIES = Object.values(FEE_CATEGORY);

export const LINE_CATEGORY = {
  ...FEE_CATEGORY,
  ADJUSTMENT: 'Adjustment',
  LATE_FEE: 'Late fee',
} as const satisfies Record<InvoiceLineCategory, string>;
export type LineCategoryLabel = (typeof LINE_CATEGORY)[InvoiceLineCategory];
export const LINE_CATEGORY_DB = invert(LINE_CATEGORY);

export const FEE_CHARGED = {
  EVERY_TERM: 'Every term',
  ONCE_A_SESSION: 'Once a session',
  NEW_STUDENTS_ONLY: 'New students only',
} as const satisfies Record<FeeCharged, string>;
export type FeeChargedLabel = (typeof FEE_CHARGED)[FeeCharged];
export const FEE_CHARGED_DB = invert(FEE_CHARGED);

export const FEE_TYPE = {
  COMPULSORY: 'Compulsory',
  OPTIONAL: 'Optional',
} as const satisfies Record<FeeType, string>;
export type FeeTypeLabel = (typeof FEE_TYPE)[FeeType];
export const FEE_TYPE_DB = invert(FEE_TYPE);

export const ACTIVE = { ACTIVE: 'Active', INACTIVE: 'Inactive' } as const satisfies Record<
  ActiveStatus,
  string
>;

export const DISCOUNT_BASIS = {
  SIBLING: 'Sibling',
  STAFF_CHILD: 'Staff child',
  SCHOLARSHIP: 'Scholarship',
  CUSTOM: 'Custom',
} as const satisfies Record<DiscountBasis, string>;
export type DiscountBasisLabel = (typeof DISCOUNT_BASIS)[DiscountBasis];
export const DISCOUNT_BASIS_DB = invert(DISCOUNT_BASIS);

export const DISCOUNT_KIND = {
  PERCENTAGE: 'Percentage',
  FIXED_AMOUNT: 'Fixed amount',
} as const satisfies Record<DiscountKind, string>;
export const DISCOUNT_APPLIES = {
  TUITION_ONLY: 'Tuition only',
  ALL_COMPULSORY: 'All compulsory items',
} as const satisfies Record<DiscountAppliesTo, string>;

export const METHOD = {
  BANK_TRANSFER: 'Bank transfer',
  POS: 'POS',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
} as const satisfies Record<PaymentMethod, string>;
export type MethodLabel = (typeof METHOD)[PaymentMethod];
export const METHOD_DB = invert(METHOD);
export const ALL_METHODS = Object.values(METHOD);

export const PAYMENT_STATUS = {
  PENDING_VERIFICATION: 'Pending verification',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
} as const satisfies Record<PaymentStatus, string>;
export type PaymentStatusLabel = (typeof PAYMENT_STATUS)[PaymentStatus];
export const PAYMENT_STATUS_DB = invert(PAYMENT_STATUS);

export const PAYMENT_SOURCE = {
  SCHOOL: 'School',
  PARENT_CLAIM: 'Parent claim',
  STATEMENT: 'Statement',
} as const satisfies Record<PaymentSource, string>;
export type PaymentSourceLabel = (typeof PAYMENT_SOURCE)[PaymentSource];
export const PAYMENT_SOURCE_DB = invert(PAYMENT_SOURCE);

export const REFUND_STATUS = {
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  PAID: 'Paid',
  REJECTED: 'Rejected',
} as const satisfies Record<RefundStatus, string>;
export type RefundStatusLabel = (typeof REFUND_STATUS)[RefundStatus];
export const REFUND_STATUS_DB = invert(REFUND_STATUS);

export const ACCOUNT_KIND = { BANK: 'Bank', CASH: 'Cash' } as const satisfies Record<
  BankAccountKind,
  string
>;

export const MATCH = {
  MATCHED: 'Matched',
  POSSIBLE_MATCH: 'Possible match',
  ALREADY_RECORDED: 'Already recorded',
  NO_MATCH: 'No match',
  IGNORED: 'Ignored',
  CONFIRMED: 'Confirmed',
} as const satisfies Record<StatementMatch, string>;
export type MatchLabel = (typeof MATCH)[StatementMatch];
export const MATCH_DB = invert(MATCH);

export const EXPENSE_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  PAID: 'Paid',
  REJECTED: 'Rejected',
} as const satisfies Record<ExpenseStatus, string>;
export type ExpenseStatusLabel = (typeof EXPENSE_STATUS)[ExpenseStatus];
export const EXPENSE_STATUS_DB = invert(EXPENSE_STATUS);

export const LATE_FEE = {
  NONE: 'None',
  FIXED_AMOUNT: 'Fixed amount',
  PERCENTAGE: 'Percentage',
} as const satisfies Record<LateFeeKind, string>;
export const LATE_FEE_DB = invert(LATE_FEE);

export const TRANSFER_REFERENCE = {
  ADMISSION_NUMBER: 'Admission number',
  INVOICE_NUMBER: 'Invoice number',
} as const satisfies Record<TransferReference, string>;

/* ---------------- Reference data ---------------- */

export const BANKS = [
  'Access Bank',
  'Ecobank',
  'Fidelity Bank',
  'First Bank',
  'FCMB',
  'GTBank',
  'Keystone Bank',
  'Moniepoint MFB',
  'Opay',
  'Polaris Bank',
  'Providus Bank',
  'Stanbic IBTC',
  'Sterling Bank',
  'UBA',
  'Union Bank',
  'Wema Bank',
  'Zenith Bank',
];

/** Expense categories every school starts with; schools add their own. */
export const EXPENSE_CATEGORIES = [
  'Maintenance',
  'Utilities',
  'Fuel',
  'Internet',
  'Stationery',
  'Laboratory',
  'Events',
  'Transport',
  'Security',
  'Cleaning',
  'ICT',
  'Catering',
  'Other',
];

/** Suggested fee items for a new school, with typical amounts per section code. */
export const SUGGESTED_ITEMS: [
  name: string,
  category: FeeCategoryLabel,
  charged: FeeChargedLabel,
  type: FeeTypeLabel,
  amounts: Record<string, number>,
][] = [
  [
    'Tuition',
    'Tuition',
    'Every term',
    'Compulsory',
    { NUR: 120000, PRI: 150000, JSS: 220000, SSS: 250000 },
  ],
  [
    'Development levy',
    'Levy',
    'Once a session',
    'Compulsory',
    { NUR: 25000, PRI: 25000, JSS: 25000, SSS: 25000 },
  ],
  [
    'Examination fee',
    'Exams',
    'Every term',
    'Compulsory',
    { NUR: 8000, PRI: 15000, JSS: 15000, SSS: 15000 },
  ],
  [
    'ICT fee',
    'ICT',
    'Every term',
    'Compulsory',
    { NUR: 10000, PRI: 10000, JSS: 10000, SSS: 10000 },
  ],
  [
    'PTA levy',
    'Levy',
    'Once a session',
    'Compulsory',
    { NUR: 5000, PRI: 5000, JSS: 5000, SSS: 5000 },
  ],
  [
    'Admission fee',
    'Admission',
    'New students only',
    'Compulsory',
    { NUR: 25000, PRI: 25000, JSS: 25000, SSS: 25000 },
  ],
  [
    'Textbooks',
    'Books',
    'Once a session',
    'Optional',
    { NUR: 20000, PRI: 30000, JSS: 45000, SSS: 45000 },
  ],
  [
    'Uniform',
    'Uniform',
    'New students only',
    'Optional',
    { NUR: 30000, PRI: 30000, JSS: 30000, SSS: 30000 },
  ],
  [
    'School bus',
    'Transport',
    'Every term',
    'Optional',
    { NUR: 60000, PRI: 60000, JSS: 60000, SSS: 60000 },
  ],
  [
    'Lunch',
    'Feeding',
    'Every term',
    'Optional',
    { NUR: 45000, PRI: 45000, JSS: 45000, SSS: 45000 },
  ],
];

/** Section code of a class level by its section's code or name ("JSS 2" → JSS). */
export const levelSection = (level: string) =>
  /nursery/i.test(level)
    ? 'NUR'
    : /^primary/i.test(level)
      ? 'PRI'
      : /^jss/i.test(level)
        ? 'JSS'
        : 'SSS';

export const ordinal = (n: number) =>
  `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n.toLocaleString('en-NG')} ${n === 1 ? word : many}`;

/** "JSS 2B", or "JSS 1 · not placed". */
export const classOf = (s: { level: string; arm: string | null }) =>
  s.arm ? `${s.level}${/\d$/.test(s.level) ? '' : ' '}${s.arm}` : `${s.level} · not placed`;

/** School Admin's finance route names (`school-admin/src/router/routes-path.ts`). */
export const FIN_ROUTE = {
  overview: 'finance',
  fees: 'fees',
  invoices: 'invoices',
  invoiceGenerate: 'invoices-generate',
  invoiceDetail: 'invoice',
  studentAccount: 'student-account',
  payments: 'payments',
  paymentDetail: 'payment',
  refundDetail: 'refund',
  expenses: 'expenses',
  expenseDetail: 'expense',
  accounts: 'bank-accounts',
} as const;
