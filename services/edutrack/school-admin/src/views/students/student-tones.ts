import type { StatusTone } from '@edutrack/ui/lib/status';

import type { ApplicationStage } from '@/types';

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
  'Offer sent': 'brand',
  'Offer accepted': 'info',
  'Offer expired': 'warning',
  Admitted: 'success',
  Rejected: 'error',
  Declined: 'neutral',
  Invited: 'info',
  'No account': 'neutral',
  Closed: 'neutral',
  Left: 'neutral',
};

/** Badge colours for student, fee, document, application and portal states. */
export const tone = (status: string): StatusTone => TONES[status] ?? 'neutral';

/** Admission stages in pipeline order, for filters. */
export const APPLICATION_STAGES: ApplicationStage[] = [
  'Pending',
  'Under review',
  'Offer sent',
  'Offer accepted',
  'Admitted',
  'Rejected',
  'Declined',
];
