import type { StatusTone } from '@edutrack/ui/lib/status';

/** Account states across Users & Roles and staff lists. */
export const accountTone = (status: string): StatusTone =>
  (({
    Active: 'success',
    Invited: 'info',
    Suspended: 'error',
    Deactivated: 'neutral',
    Revoked: 'neutral',
    Cancelled: 'neutral',
    'No account': 'neutral',
  })[status] as StatusTone) ?? 'neutral';

/** "Cancelled" reads better than "Revoked" for an invitation the school withdrew. */
export const statusLabel = (status: string) => (status === 'Revoked' ? 'Cancelled' : status);
