import type { TimetableStatus, Weekday } from '../../generated/prisma/enums.js';

/**
 * How timetables are addressed on the wire, as in the School Admin mock: a grid key is
 * `"<Day>-<period id>"` (`"Monday-P3"`), and a period id is `P` + its position in the section's
 * bell schedule, so ids never contain a dash and stay the same when times change.
 */

export const DAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

export const DAY_LABEL: Record<Weekday, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
};
export const DAY_BY_LABEL = Object.fromEntries(
  Object.entries(DAY_LABEL).map(([k, v]) => [v, k]),
) as Record<string, Weekday>;

export const STATUS_LABEL: Record<TimetableStatus, 'Draft' | 'Reviewed' | 'Published'> = {
  DRAFT: 'Draft',
  REVIEWED: 'Reviewed',
  PUBLISHED: 'Published',
};

/** `P3` for the period at position 3. */
export const periodKey = (sortOrder: number) => `P${sortOrder}`;

/** `"Monday-P3"`. */
export const slotKey = (day: Weekday, sortOrder: number) =>
  `${DAY_LABEL[day]}-${periodKey(sortOrder)}`;

/** `"Monday-P3"` → day and position, or null. */
export function parseSlot(key: string): { day: Weekday; sortOrder: number } | null {
  const m = /^([A-Za-z]+)-P(\d+)$/.exec(key);
  const day = m && DAY_BY_LABEL[m[1]!];
  return day ? { day, sortOrder: Number(m[2]) } : null;
}

/** A `time` column (1970-01-01T08:40Z) as `08:40`. */
export const hhmm = (d: Date) => d.toISOString().slice(11, 16);

/** `08:40` → a `time` value. */
export const fromHhmm = (t: string) => new Date(`1970-01-01T${t}:00.000Z`);
