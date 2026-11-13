import type { StatusTone } from '@edutrack/ui/lib/status';

import type { TicketSla, TicketStatus } from '@/types';

export const TICKET_TONE: Record<TicketStatus, StatusTone> = {
  Open: 'info',
  'In progress': 'info',
  'Waiting for School': 'warning',
  Resolved: 'success',
  Closed: 'neutral',
};

export const SLA_TONE: Record<TicketSla['state'], string> = {
  ok: 'text-muted-foreground',
  soon: 'text-warning-strong',
  over: 'text-error-strong',
  met: 'text-success-strong',
  late: 'text-warning-strong',
};

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "Today 10:14", "Yesterday 09:20", "3 Nov 10:14", or with the year when it isn't this year. */
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay(d, now)) return `Today ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday ${time}`;
  const day = `${d.getDate()} ${MONTH[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? `${day} ${time}` : `${day} ${d.getFullYear()}`;
}

export function fileSize(bytes: number) {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
