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
