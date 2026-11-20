/** School Admin › Reports: the catalog and the shapes one report answers with (`types/reports.ts`). */

export type ReportGroup = 'Academic' | 'Students' | 'Staff' | 'Financial' | 'Communication';
export type ReportFilterKey = 'term' | 'section' | 'from' | 'to' | 'status';

export type SchoolReportId =
  | 'collection'
  | 'outstanding'
  | 'income-expenditure'
  | 'cash-book'
  | 'payments'
  | 'discounts'
  | 'result-completion'
  | 'subject-performance'
  | 'grade-distribution'
  | 'enrollment'
  | 'attendance'
  | 'admissions'
  | 'movements'
  | 'staff'
  | 'teacher-workload'
  | 'message-delivery';

export interface ReportCatalogItem {
  id: SchoolReportId;
  group: ReportGroup;
  title: string;
  description: string;
  filters: ReportFilterKey[];
  /** False while the module the report reads isn't built yet; it can't be opened. */
  available: boolean;
  /** The module it waits for ("Finance", "Communication"), when not available. */
  availableWith: string | null;
}

export interface ReportFilter {
  key: ReportFilterKey;
  label: string;
  options?: { value: string; label: string }[];
  kind: 'select' | 'date';
  value: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'right';
  money?: boolean;
  percent?: boolean;
}

export type ReportCell = string | number | null;
export type RouteTo = {
  name: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
};

export interface ReportRow {
  cells: Record<string, ReportCell>;
  to?: RouteTo;
}

export interface ReportMetric {
  label: string;
  value: string;
  hint?: string;
  hintTone?: 'success' | 'warning' | 'error' | 'neutral';
}

/** What a report builder returns; the service adds the head and `blocked`. */
export interface Built {
  scope: string;
  filters: ReportFilter[];
  metrics: ReportMetric[];
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, ReportCell> | null;
  note: string;
  emptyText: string;
}

const FINANCE = 'Finance';
const COMMS = 'Communication';

type Seed = [SchoolReportId, ReportGroup, string, string, ReportFilterKey[], string?];

const SEEDS: Seed[] = [
  [
    'result-completion',
    'Academic',
    'Result completion',
    'Result sheets by status for the term, per section or class.',
    ['term', 'section'],
  ],
  [
    'subject-performance',
    'Academic',
    'Subject performance',
    'Average score, pass rate, highest and lowest per subject, from approved sheets.',
    ['term', 'section'],
  ],
  [
    'grade-distribution',
    'Academic',
    'Grade distribution',
    'How many results fall in each grade, per class, from approved sheets.',
    ['term', 'section'],
  ],
  [
    'enrollment',
    'Students',
    'Enrollment by class',
    'Active students per class arm by gender, new this session and capacity used.',
    ['section'],
  ],
  [
    'attendance',
    'Students',
    'Attendance by class',
    'Attendance rate per class arm for the term, with registers not taken.',
    ['term', 'section'],
  ],
  [
    'admissions',
    'Students',
    'Admissions',
    'Applications by stage, and how many became admitted students.',
    ['status'],
  ],
  [
    'movements',
    'Students',
    'Transfers, withdrawals & graduations',
    'Students who left active enrollment, with where they went and why.',
    ['status', 'from', 'to'],
  ],
  [
    'staff',
    'Staff',
    'Staff by department',
    'Current staff per department by type, employment and portal access.',
    [],
  ],
  [
    'teacher-workload',
    'Staff',
    'Teacher workload',
    'Periods a week against each teacher’s maximum, subjects and classes.',
    ['status'],
  ],
  [
    'collection',
    'Financial',
    'Fee collection by class',
    'How much of the term’s billing has been collected, per class.',
    ['term'],
    FINANCE,
  ],
  [
    'outstanding',
    'Financial',
    'Outstanding balances',
    'Students who owe, including earlier sessions, by how long it has been overdue.',
    [],
    FINANCE,
  ],
  [
    'income-expenditure',
    'Financial',
    'Income vs expenditure',
    'Money received and spent each month this session.',
    [],
    FINANCE,
  ],
  [
    'cash-book',
    'Financial',
    'Cash book',
    'Opening balance, money in, money out and closing balance per account.',
    ['term'],
    FINANCE,
  ],
  [
    'payments',
    'Financial',
    'Payments by method & account',
    'Payments received in a period, by payment method and the account paid into.',
    ['status', 'from', 'to'],
    FINANCE,
  ],
  [
    'discounts',
    'Financial',
    'Discounts & waivers',
    'Discounts given on the term’s invoices, by type, and their share of billing.',
    ['term'],
    FINANCE,
  ],
  [
    'message-delivery',
    'Communication',
    'Message delivery summary',
    'Messages sent in a period, by event and channel, and how many reached people.',
    ['from', 'to'],
    COMMS,
  ],
];

export const CATALOG: ReportCatalogItem[] = SEEDS.map(
  ([id, group, title, description, filters, waitsFor]) => ({
    id,
    group,
    title,
    description,
    filters,
    available: !waitsFor,
    availableWith: waitsFor ?? null,
  }),
);

export const GROUPS: ReportGroup[] = [
  'Academic',
  'Students',
  'Staff',
  'Financial',
  'Communication',
];
