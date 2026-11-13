import type { StatusTone } from '@edutrack/ui/lib/status';

import type { SheetStatus } from '@/types';

/** One tone per sheet status, the same everywhere in the Teacher Workspace. */
export const SHEET_TONES: Record<SheetStatus, StatusTone> = {
  'Not started': 'neutral',
  Draft: 'neutral',
  Submitted: 'info',
  'Under review': 'info',
  Returned: 'error',
  Approved: 'success',
  Published: 'brand',
};

/** "Submitted · with HOD" for sheets waiting on the HOD; the status word otherwise. */
export const sheetStatusLabel = (status: SheetStatus, withHod = false) =>
  status === 'Submitted' && withHod ? 'Submitted · with HOD' : status;

/** "Saved 08:16" today, "Saved 7 Dec, 16:40" before. */
export function savedLabel(savedAt: string | null, today: string) {
  if (!savedAt) return 'Not saved yet';
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const time = savedAt.slice(11, 16);
  if (savedAt.slice(0, 10) === today) return `Saved ${time}`;
  return `Saved ${+savedAt.slice(8, 10)} ${MONTHS[+savedAt.slice(5, 7) - 1]}, ${time}`;
}

/** "3 days left", "14 hours left", "Closed" for a local "YYYY-MM-DDTHH:mm" deadline. */
export function countdown(deadline: string | null, now: string) {
  if (!deadline || !now) return null;
  const minutes = (local: string) =>
    Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10)) / 60_000 +
    +local.slice(11, 13) * 60 +
    +local.slice(14, 16);
  const left = minutes(deadline) - minutes(now);
  if (left < 0) return { label: 'Closed', urgent: true, closed: true };
  const days = Math.floor(left / 1440);
  if (days >= 1)
    return { label: `${days} day${days === 1 ? '' : 's'} left`, urgent: days < 2, closed: false };
  const hours = Math.max(1, Math.floor(left / 60));
  return { label: `${hours} hour${hours === 1 ? '' : 's'} left`, urgent: true, closed: false };
}
