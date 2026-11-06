import type { StatusTone } from '@edutrack/ui/lib/status';

const TONES: Record<string, StatusTone> = {
  Active: 'success',
  'Incomplete profile': 'warning',
  Transferred: 'neutral',
  Withdrawn: 'neutral',
  Graduated: 'brand',
  Paid: 'success',
  'Partially paid': 'warning',
  Overdue: 'error',
  Verified: 'success',
  Missing: 'warning',
  Optional: 'neutral',
  Promoted: 'success',
  Pending: 'warning',
  'Under review': 'warning',
  'Offer accepted': 'info',
  Admitted: 'success',
  Rejected: 'error',
  Invited: 'info',
  'No account': 'neutral',
};

/** Badge colours for student, fee, document, application and portal states. */
export const tone = (status: string): StatusTone => TONES[status] ?? 'neutral';
