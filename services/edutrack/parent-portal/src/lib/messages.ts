/**
 * Times for Messages. Message times are instants (ISO), shown in Lagos time: "Just now",
 * "5 min ago", "14:05", "Yesterday", "Mon", "8 Dec".
 */
const LAGOS = 'Africa/Lagos';
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS, dateStyle: 'short' }).format(d);
const clock = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: LAGOS,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
const dayMonth = (d: Date, year: boolean) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: LAGOS,
    day: 'numeric',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
  }).format(d);
const daysApart = (a: Date, b: Date) =>
  Math.round((Date.parse(dayOf(b)) - Date.parse(dayOf(a))) / 86_400_000);

/** Short time for the conversation list. */
export function timeAgo(iso: string, now: Date = new Date()) {
  const at = new Date(iso);
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const days = daysApart(at, now);
  if (days <= 0) return clock(at);
  if (days === 1) return 'Yesterday';
  if (days < 7)
    return new Intl.DateTimeFormat('en-GB', { timeZone: LAGOS, weekday: 'short' }).format(at);
  return dayMonth(at, dayOf(at).slice(0, 4) !== dayOf(now).slice(0, 4));
}

/** Time under a chat bubble: "14:05" today, "Yesterday, 14:05", else "8 Dec, 14:05". */
export function messageTime(iso: string, now: Date = new Date()) {
  const at = new Date(iso);
  const days = daysApart(at, now);
  if (days <= 0) return clock(at);
  if (days === 1) return `Yesterday, ${clock(at)}`;
  return `${dayMonth(at, dayOf(at).slice(0, 4) !== dayOf(now).slice(0, 4))}, ${clock(at)}`;
}

export const SUBJECT_MAX = 120;
export const BODY_MAX = 2000;
