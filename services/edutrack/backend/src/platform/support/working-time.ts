/**
 * Support SLAs count working time: Monday to Friday, 08:00–17:00 Lagos time (UTC+1, no daylight
 * saving), skipping public holidays. Holidays are `YYYY-MM-DD` calendar dates.
 */
export type Holidays = ReadonlySet<string>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Lagos is UTC+1 all year. */
const OFFSET = HOUR;
const OPEN = 8 * HOUR;
const CLOSE = 17 * HOUR;
/** Days we walk before giving up (keeps a corrupt date from looping for ever). */
const MAX_DAYS = 3660;

/** Start of the Lagos calendar day holding `local` (a Lagos wall-clock time as UTC ms). */
const dayStart = (local: number) => Math.floor(local / DAY) * DAY;

function isWorkday(start: number, holidays: Holidays) {
  const date = new Date(start);
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(date.toISOString().slice(0, 10));
}

/** Working milliseconds between two instants (0 if `to` is not after `from`). */
export function workingMsBetween(from: Date, to: Date, holidays: Holidays): number {
  const a = from.getTime() + OFFSET;
  const b = to.getTime() + OFFSET;
  if (b <= a) return 0;
  let total = 0;
  for (let day = dayStart(a), n = 0; day <= b && n < MAX_DAYS; day += DAY, n++) {
    if (!isWorkday(day, holidays)) continue;
    const start = Math.max(a, day + OPEN);
    const end = Math.min(b, day + CLOSE);
    if (end > start) total += end - start;
  }
  return total;
}

/** The instant `ms` of working time after `from`. With `ms` ≤ 0 it is `from` itself. */
export function addWorkingMs(from: Date, ms: number, holidays: Holidays): Date {
  if (ms <= 0) return from;
  let left = ms;
  const a = from.getTime() + OFFSET;
  for (let day = dayStart(a), n = 0; n < MAX_DAYS; day += DAY, n++) {
    if (!isWorkday(day, holidays)) continue;
    const start = Math.max(a, day + OPEN);
    const end = day + CLOSE;
    if (end <= start) continue;
    if (left <= end - start) return new Date(start + left - OFFSET);
    left -= end - start;
  }
  throw new Error('Working time out of range');
}

/** The instant `ms` of working time before `to` (for demo data written "N working hours ago"). */
export function subtractWorkingMs(to: Date, ms: number, holidays: Holidays): Date {
  if (ms <= 0) return to;
  let left = ms;
  const b = to.getTime() + OFFSET;
  for (let day = dayStart(b), n = 0; n < MAX_DAYS; day -= DAY, n++) {
    if (!isWorkday(day, holidays)) continue;
    const start = day + OPEN;
    const end = Math.min(b, day + CLOSE);
    if (end <= start) continue;
    if (left <= end - start) return new Date(end - left - OFFSET);
    left -= end - start;
  }
  throw new Error('Working time out of range');
}
