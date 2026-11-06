import type { StatusTone } from '@edutrack/ui/lib/status';

const TONES: Record<string, StatusTone> = {
  Active: 'success',
  Invited: 'info',
  Suspended: 'warning',
  Deactivated: 'neutral',
  'No account': 'neutral',
  Verified: 'success',
  Pending: 'warning',
  Missing: 'error',
  Optional: 'neutral',
};

/** Badge tone for staff, account and document statuses. */
export const staffTone = (status: string): StatusTone => TONES[status] ?? 'neutral';
