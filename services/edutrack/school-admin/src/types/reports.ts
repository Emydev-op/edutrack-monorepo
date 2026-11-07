import type { RouteLocationRaw } from 'vue-router';

/** Reports types: the school-wide catalog and one computed report. */

export type ReportGroup = 'Academic' | 'Students' | 'Staff' | 'Financial' | 'Communication';

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
  /** Filters this report understands, besides the working branch. */
  filters: ReportFilterKey[];
}

export interface ReportCatalog {
  groups: { name: ReportGroup; reports: ReportCatalogItem[] }[];
}

export type ReportFilterKey = 'term' | 'section' | 'from' | 'to' | 'status';

export interface ReportFilter {
  key: ReportFilterKey;
  label: string;
  /** Select options; date filters have none. */
  options?: { value: string; label: string }[];
  kind: 'select' | 'date';
  /** The value the report used (after defaults were applied). */
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

export interface ReportRow {
  cells: Record<string, ReportCell>;
  /** Opens the record behind the row. */
  to?: RouteLocationRaw;
}

export interface ReportMetric {
  label: string;
  value: string;
  hint?: string;
  hintTone?: 'success' | 'warning' | 'error' | 'neutral';
}

export interface SchoolReport {
  id: SchoolReportId;
  group: ReportGroup;
  title: string;
  description: string;
  /** What the figures cover, e.g. "2026/2027 · First Term · Main Campus". */
  scope: string;
  generatedAt: string;
  filters: ReportFilter[];
  metrics: ReportMetric[];
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, ReportCell> | null;
  /** Explains where the figures come from or what is left out. */
  note: string;
  emptyText: string;
  /** Set when the report can't be produced yet (e.g. no session), with what to do first. */
  blocked: {
    title: string;
    message: string;
    action: { label: string; to: RouteLocationRaw };
  } | null;
}

/** Query sent for one report; empty values mean "use the default". */
export interface ReportQuery {
  branch: string;
  session: string;
  term?: string;
  section?: string;
  from?: string;
  to?: string;
  status?: string;
}
