import type { Attendance } from '@/types';

type Mark = Attendance['days'][number]['mark'];

/** Calendar cell colours per mark. */
export const MARK_CLASS: Record<Mark, string> = {
  Present: 'bg-success-subtle text-success-strong',
  Late: 'bg-warning-subtle text-warning-strong',
  Absent: 'bg-error-subtle text-error-strong font-semibold',
  Excused: 'bg-info-subtle text-info-strong',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Weekday calendars (Mon–Fri) for every month the register covers: each school day of the month
 * with its mark, and how many blank cells come before the 1st's week day.
 */
export function calendarMonths(days: Attendance['days']) {
  if (!days.length) return [];
  const marks = new Map(days.map((d) => [d.date, d.mark]));
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();
  return months.map((ym) => {
    const [y, m] = ym.split('-').map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: { date: string; mark: Mark | null }[] = [];
    let offset = 0;
    for (let d = 1; d <= last; d++) {
      const date = `${ym}-${String(d).padStart(2, '0')}`;
      const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      if (!cells.length) offset = wd - 1;
      cells.push({ date, mark: marks.get(date) ?? null });
    }
    return { label: `${MONTHS[m - 1]} ${y}`, offset, days: cells };
  });
}
