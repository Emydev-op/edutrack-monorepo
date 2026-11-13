import type { StatusTone } from '@edutrack/ui/lib/status';

const TONES: Record<string, StatusTone> = {
  // Invoices
  Draft: 'neutral',
  Issued: 'info',
  'Partially paid': 'warning',
  Paid: 'success',
  Overdue: 'error',
  Cancelled: 'neutral',
  // Installments
  'Part paid': 'warning',
  'Due soon': 'warning',
  Upcoming: 'neutral',
  // Payments
  'Pending verification': 'warning',
  Confirmed: 'success',
  Rejected: 'error',
  'Credit applied': 'info',
  // Refunds
  'Awaiting approval': 'warning',
  Approved: 'info',
  // Expenses
  Submitted: 'info',
  // Structures, accounts, vendors, discounts, plans
  'Not created': 'neutral',
  Published: 'success',
  Active: 'success',
  Inactive: 'neutral',
  Archived: 'neutral',
  // Statement lines
  Matched: 'success',
  'Possible match': 'warning',
  'Already recorded': 'neutral',
  'No match': 'error',
  Ignored: 'neutral',
};

/** Badge tone for any finance status. */
export const financeTone = (status: string): StatusTone => TONES[status] ?? 'neutral';

/** "8 Sep 2026" from an ISO date. */
export const fmtDay = (iso: string | null | undefined, year = true) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        ...(year && { year: 'numeric' }),
      })
    : '—';

/** Today as YYYY-MM-DD in the browser's timezone, for date inputs. */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** ₦1.2M / ₦850k / ₦900 for compact figures. */
export const compactNaira = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `₦${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 1000
      ? `₦${Math.round(n / 1000).toLocaleString('en-NG')}k`
      : `₦${Math.round(n).toLocaleString('en-NG')}`;
