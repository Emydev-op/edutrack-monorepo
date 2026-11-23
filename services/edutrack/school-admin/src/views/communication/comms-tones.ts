import type { StatusTone } from '@edutrack/ui/lib/status';

import type { Channel } from '@/types';

const TONES: Record<string, StatusTone> = {
  Draft: 'neutral',
  Scheduled: 'info',
  Sent: 'success',
  Withdrawn: 'warning',
  Expired: 'neutral',
  Queued: 'warning',
  Delivered: 'success',
  Read: 'success',
  Failed: 'error',
  Unread: 'info',
  On: 'success',
  Off: 'neutral',
  'Pending approval': 'warning',
  Approved: 'success',
  Rejected: 'error',
  'Not requested': 'neutral',
};

/** Badge tone for announcement and delivery statuses. */
export const commsTone = (status: string): StatusTone => TONES[status] ?? 'neutral';

/** Delivery "Sent" means sent but no receipt yet, so it reads as waiting. */
export const deliveryTone = (status: string): StatusTone =>
  status === 'Sent' ? 'info' : commsTone(status);

export const channelLabel = (ch: Channel) => ch;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local "YYYY-MM-DDTHH:mm" now plus some minutes. */
export function localStamp(minutes = 0) {
  const d = new Date(Date.now() + minutes * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "16 Nov 2026, 08:00" from a local date-time. */
export function fmtStamp(at: string | null | undefined) {
  if (!at) return '—';
  const [y, m, d] = at.slice(0, 10).split('-').map(Number) as [number, number, number];
  const time = at.slice(11, 16);
  return `${d} ${MONTHS[m - 1]} ${y}${time ? `, ${time}` : ''}`;
}

export const fmtCount = (n: number) => n.toLocaleString('en-NG');

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * When a message was sent, as people say it: "Just now", "12 min ago", "14:05" today,
 * "Yesterday", "Tue" this week, then "12 Nov" (with the year once it's another year).
 */
export function fmtAgo(iso: string, now = new Date()) {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000);
  if (days === 0) return clock(d);
  if (days === 1) return 'Yesterday';
  if (days < 7) return DAYS[d.getDay()]!;
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? date : `${date} ${d.getFullYear()}`;
}

/** Full time for a message bubble: "14:05" today, else "12 Nov, 14:05". */
export function fmtMessageTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return clock(d);
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${clock(d)}`;
}
