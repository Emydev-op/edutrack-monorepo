/**
 * Times as the school sees them. Every school is on Lagos time (UTC+1, no daylight saving), and
 * the screens send and show local "YYYY-MM-DDTHH:mm" stamps.
 */
const OFFSET = 60 * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-20T10:05" in Lagos. */
export const localStamp = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 16);

/** A local "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD") as an instant. */
export const fromLocalStamp = (s: string) =>
  new Date(Date.parse(`${s.length === 10 ? `${s}T00:00` : s.slice(0, 16)}:00.000+01:00`));

export const localDay = (d: Date) => localStamp(d).slice(0, 10);

export const LOCAL_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "Today 09:40", "Yesterday 21:14", "4 Nov 08:12", or "4 Nov 2025" for other years. */
export function atLabel(at: Date, now: Date) {
  const stamp = localStamp(at);
  const date = stamp.slice(0, 10);
  const time = stamp.slice(11, 16);
  const today = localDay(now);
  const yesterday = localDay(new Date(now.getTime() - 86_400_000));
  if (date === today) return `Today ${time}`;
  if (date === yesterday) return `Yesterday ${time}`;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const base = `${d} ${MONTHS[m - 1]}`;
  return y === Number(today.slice(0, 4)) ? `${base} ${time}` : `${base} ${y}`;
}

/** "19 Nov 2026" from an ISO date. */
export function longDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** A Postgres `time` column (1970-01-01T21:00Z) as "21:00". */
export const hhmm = (t: Date) => t.toISOString().slice(11, 16);
/** "21:00" as a value for a `time` column. */
export const timeValue = (s: string) => new Date(`1970-01-01T${s}:00.000Z`);

/** Whether a local "HH:mm" falls in a window that may run past midnight. */
export const inWindow = (time: string, start: string, end: string) =>
  start <= end ? time >= start && time < end : time >= start || time < end;

/** The next moment the local clock reads `end` after `now`. */
export function nextLocal(now: Date, end: string) {
  const day = localDay(now);
  const sameDay = fromLocalStamp(`${day}T${end}`);
  return sameDay > now ? sameDay : new Date(sameDay.getTime() + 86_400_000);
}
