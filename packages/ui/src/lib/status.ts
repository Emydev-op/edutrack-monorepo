export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'brand';

/**
 * Default tone for every status label used across EduTrack. Pass an explicit tone to
 * `StatusBadge` when the same word means something different in context.
 */
const STATUS_TONES: Record<string, StatusTone> = {
  Active: 'success',
  Paid: 'success',
  Approved: 'success',
  Confirmed: 'success',
  Delivered: 'success',
  Complete: 'success',
  Completed: 'success',
  Resolved: 'success',
  Accepted: 'success',
  Healthy: 'success',
  Provisioned: 'success',
  Published: 'brand',
  Custom: 'brand',
  Draft: 'neutral',
  Cancelled: 'neutral',
  Deactivated: 'neutral',
  Closed: 'neutral',
  Inactive: 'neutral',
  Archived: 'neutral',
  Predefined: 'neutral',
  'Coming soon': 'neutral',
  'Not started': 'neutral',
  Trial: 'info',
  Invited: 'info',
  Onboarding: 'info',
  Sent: 'info',
  Requested: 'info',
  Scheduled: 'info',
  New: 'info',
  Assigned: 'info',
  'In progress': 'warning',
  'In Progress': 'info',
  Pending: 'warning',
  Expiring: 'warning',
  'Grace period': 'warning',
  Open: 'warning',
  'Review needed': 'warning',
  'Waiting for School': 'warning',
  Overdue: 'error',
  Suspended: 'error',
  Restricted: 'error',
  Expired: 'error',
  Failed: 'error',
  Rejected: 'error',
  Urgent: 'error',
};

export function statusTone(label: string): StatusTone {
  return STATUS_TONES[label] ?? 'neutral';
}

/** Tailwind classes for each tone: subtle surface, strong text, solid dot. */
export const TONE_CLASSES: Record<StatusTone, { surface: string; text: string; dot: string }> = {
  success: { surface: 'bg-success-subtle', text: 'text-success-strong', dot: 'bg-success' },
  warning: { surface: 'bg-warning-subtle', text: 'text-warning-strong', dot: 'bg-warning' },
  error: { surface: 'bg-error-subtle', text: 'text-error-strong', dot: 'bg-error' },
  info: { surface: 'bg-info-subtle', text: 'text-info-strong', dot: 'bg-info' },
  neutral: { surface: 'bg-neutral-subtle', text: 'text-neutral-strong', dot: 'bg-neutral' },
  brand: { surface: 'bg-brand-subtle', text: 'text-brand-strong', dot: 'bg-primary' },
};
