/**
 * The mock API's clock and school calendar. `MOCK_NOW` is the ONE place the demo date lives:
 * every "today" in the mock (and, through `GET /v1/context`, in the UI) comes from here. The
 * real API uses the real date. Components never call `new Date()` for "today".
 */
export const MOCK_NOW = '2026-12-08T08:15:00+01:00';

let current = MOCK_NOW;
/**
 * TESTS ONLY: moves the demo clock (e.g. past the result entry deadline). Pass an ISO moment
 * with offset, like `MOCK_NOW`; call with no argument to put it back.
 */
export function setMockNow(iso: string = MOCK_NOW) {
  current = iso;
}

/** The demo moment as a Date. */
export const now = () => new Date(current);

/** Local (Lagos) "YYYY-MM-DDTHH:mm" of the demo moment: the format the mock stores times in. */
export const nowLocal = () => current.slice(0, 16);

/** Today's date, "YYYY-MM-DD", on the demo clock. */
export const isoToday = () => current.slice(0, 10);

/* ---------- Calendar ---------- */

/** Days with no classes. Dates are inclusive "YYYY-MM-DD". */
export const PUBLIC_HOLIDAYS: [date: string, name: string][] = [
  ['2026-05-01', 'Workers’ Day'],
  ['2026-05-27', 'Children’s Day'],
  ['2026-06-12', 'Democracy Day'],
  ['2026-10-01', 'Independence Day'],
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-26', 'Boxing Day'],
  ['2027-01-01', 'New Year’s Day'],
];

/** Breaks and school closures inside a term. */
export const CLOSURES: { from: string; to: string; name: string }[] = [
  { from: '2026-06-01', to: '2026-06-05', name: 'Third Term mid-term break' },
  { from: '2026-10-29', to: '2026-11-02', name: 'Mid-term break' },
  { from: '2026-11-20', to: '2026-11-20', name: 'Staff development day' },
];

/** Term dates the calendar helpers know about (kept in step with `school-db.ts` TERMS). */
export const TERM_DATES: { id: string; start: string; end: string }[] = [
  { id: 't-2526-3', start: '2026-04-27', end: '2026-07-24' },
  { id: 't-2627-1', start: '2026-09-14', end: '2026-12-18' },
  { id: 't-2627-2', start: '2027-01-12', end: '2027-04-09' },
];

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Adds whole days to an ISO date. */
export const addDays = (iso: string, days: number) => fromUtc(toUtc(iso) + days * DAY_MS);

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (iso: string) => new Date(toUtc(iso)).getUTCDay();

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** "Mon" … "Fri" for a weekday date, `null` at weekends. */
export function weekdayName(iso: string): Weekday | null {
  const d = weekdayOf(iso);
  return d >= 1 && d <= 5 ? WEEKDAYS[d - 1]! : null;
}

/** Why a date has no classes, or `null` when it is a school day. */
export function closureReason(iso: string): string | null {
  const d = weekdayOf(iso);
  if (d === 0 || d === 6) return 'Weekend';
  const holiday = PUBLIC_HOLIDAYS.find(([date]) => date === iso);
  if (holiday) return `Public holiday · ${holiday[1]}`;
  const closure = CLOSURES.find((c) => iso >= c.from && iso <= c.to);
  if (closure) return closure.name;
  if (!TERM_DATES.some((t) => iso >= t.start && iso <= t.end)) return 'Between terms';
  return null;
}

/** A weekday inside a term that isn't a public holiday, the mid-term break or a closure day. */
export const isSchoolDay = (iso: string) => closureReason(iso) === null;

/** Every school day from `from` to `to`, both inclusive, oldest first. */
export function schoolDaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isSchoolDay(d)) out.push(d);
  return out;
}

/**
 * The `n` school days before `before` (default today, not included), most recent first. Stops
 * early when it runs out of term (looks back at most a year).
 */
export function previousSchoolDays(n: number, before = isoToday()): string[] {
  const out: string[] = [];
  let d = addDays(before, -1);
  for (let guard = 0; out.length < n && guard < 366; guard++, d = addDays(d, -1))
    if (isSchoolDay(d)) out.push(d);
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "8 Dec 2026" (or "8 Dec" with `year: false`). */
export function formatDay(iso: string, year = true) {
  const label = `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
  return year ? `${label} ${iso.slice(0, 4)}` : label;
}

/**
 * A short "when" label for a local "YYYY-MM-DDTHH:mm" relative to the demo clock:
 * "Just now", "25m ago", "Today 07:40", "Yesterday 16:10", "3 Dec".
 */
export function whenLabel(at: string): string {
  const minutes =
    Math.round((toUtc(at.slice(0, 10)) - toUtc(isoToday())) / 60_000) +
    (+at.slice(11, 13) * 60 + +at.slice(14, 16)) -
    (+nowLocal().slice(11, 13) * 60 + +nowLocal().slice(14, 16));
  const ago = -minutes;
  if (ago >= 0 && ago < 1) return 'Just now';
  if (ago > 0 && ago < 60) return `${ago}m ago`;
  const day = at.slice(0, 10);
  if (day === isoToday()) return `Today ${at.slice(11, 16)}`;
  if (day === addDays(isoToday(), -1)) return `Yesterday ${at.slice(11, 16)}`;
  return formatDay(day, day.slice(0, 4) !== isoToday().slice(0, 4));
}
