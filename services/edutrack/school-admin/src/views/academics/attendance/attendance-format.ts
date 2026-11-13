import type { StatusTone } from '@edutrack/ui/lib/status';

/** "94.2%", or "—" when nothing has been marked. */
export const pct = (rate: number | null) => (rate === null ? '—' : `${rate}%`);

/** Below 90% needs a look; below 80% is a concern. */
export const rateTone = (rate: number | null): StatusTone =>
  rate === null ? 'neutral' : rate >= 90 ? 'success' : rate >= 80 ? 'warning' : 'error';

/** "Mon 9 Nov" from an ISO date. */
export const dayLabel = (iso: string, withWeekday = true) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    ...(withWeekday && { weekday: 'short' }),
    day: 'numeric',
    month: 'short',
  });
