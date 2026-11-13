import type { ReportCell, ReportColumn, ReportGroup } from '@/types';

import { formatNaira } from '@edutrack/app-kit/lib/format';

export const GROUP_HINTS: Record<ReportGroup, string> = {
  Academic: 'Result sheets, scores and grades for a term',
  Students: 'Enrollment, admissions and students who left',
  Staff: 'Staff numbers, access and teaching load',
  Financial: 'Billing, collections, balances and spending',
  Communication: 'Messages sent and whether they reached people',
};

/** How a report cell is shown on screen and in print. */
export function showCell(col: ReportColumn, value: ReportCell | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (col.money && typeof value === 'number') return formatNaira(value);
  if (col.percent && typeof value === 'number') return `${value}%`;
  return typeof value === 'number' ? value.toLocaleString('en-NG') : value;
}

/** The raw value written to CSV: numbers stay numbers so spreadsheets can add them up. */
export const csvCell = (value: ReportCell | undefined): string | number =>
  value === null || value === undefined ? '' : value;

/** Sorts numbers numerically and text alphabetically; empty values always go last. */
export function compareCells(a: ReportCell | undefined, b: ReportCell | undefined): number {
  const empty = (v: ReportCell | undefined) => v === null || v === undefined || v === '';
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

/** A file name from the report title and what it covers. */
export const fileNameFor = (title: string, scope: string) =>
  `${`${title} ${scope}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()}.csv`;
