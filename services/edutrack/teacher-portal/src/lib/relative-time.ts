/**
 * "just now", "5 min ago", "3 h ago", "Yesterday", "Tue", "8 Dec", "8 Dec 2025" for an ISO
 * timestamp. Message times are real instants, so this uses the browser clock.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function formatRelative(iso: string, now = new Date()) {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return `${Math.floor(mins / 60)} h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return DAYS[d.getDay()]!;
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

/** "14:05" today, else "8 Dec, 14:05" (with the year when it isn’t this year). */
export function formatMessageTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (startOfDay(d) === startOfDay(now)) return time;
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear()
    ? `${day}, ${time}`
    : `${day} ${d.getFullYear()}, ${time}`;
}
