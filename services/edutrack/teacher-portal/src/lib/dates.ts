/**
 * Formatting for the API's date strings ("YYYY-MM-DD" and local "YYYY-MM-DDTHH:mm"). Pure string
 * work: "today" always comes from `useTermContext().today`, never from the browser clock.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const weekdayIndex = (iso: string) => new Date(utc(iso)).getUTCDay();

/** "8 Dec 2026"; `year: false` → "8 Dec". */
export function formatDay(iso: string | null | undefined, year = true) {
  if (!iso) return '';
  const label = `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
  return year ? `${label} ${iso.slice(0, 4)}` : label;
}

/** "Tue 8 Dec 2026" (`long`: "Tuesday 8 December 2026" style with short month). */
export function formatWeekday(
  iso: string | null | undefined,
  options: { long?: boolean; year?: boolean } = {},
) {
  if (!iso) return '';
  const day = (options.long ? LONG_DAYS : DAYS)[weekdayIndex(iso)];
  return `${day} ${formatDay(iso, options.year ?? true)}`;
}

/** "11 Dec 2026, 23:59" */
export function formatDateTime(local: string | null | undefined, year = true) {
  if (!local) return '';
  return `${formatDay(local.slice(0, 10), year)}, ${local.slice(11, 16)}`;
}

/** "Fri 11 Dec, 23:59" — deadlines. */
export function formatDeadline(local: string | null | undefined) {
  if (!local) return '';
  return `${DAYS[weekdayIndex(local)]} ${formatDay(local.slice(0, 10), false)}, ${local.slice(11, 16)}`;
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD…"); negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) =>
  Math.round((utc(to.slice(0, 10)) - utc(from.slice(0, 10))) / 86_400_000);
