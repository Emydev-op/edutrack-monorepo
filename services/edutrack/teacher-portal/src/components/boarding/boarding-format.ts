import type { StatusTone } from '@edutrack/ui/lib/status';

import type { Exeat, ExeatKind, ExeatStatus, MyHostel, RollCallMark, VisitOutcome } from '@/types';

export const EXEAT_KINDS: ExeatKind[] = [
  'Weekend',
  'Medical',
  'Family event',
  'Emergency',
  'Term break',
  'Other',
];
/** These kinds need a reason. */
export const reasonRequired = (kind: ExeatKind) =>
  kind === 'Medical' || kind === 'Emergency' || kind === 'Other';

export const EXEAT_STATUSES: ExeatStatus[] = [
  'Requested',
  'Approved',
  'Out',
  'Returned',
  'Declined',
  'Cancelled',
];
const EXEAT_TONES: Record<ExeatStatus, StatusTone> = {
  Requested: 'info',
  Approved: 'success',
  Out: 'warning',
  Returned: 'neutral',
  Declined: 'error',
  Cancelled: 'neutral',
};
/** "Overdue" beats the status for boarders out past their return time. */
export const exeatBadge = (e: Exeat): { label: string; tone: StatusTone } =>
  e.overdue
    ? { label: 'Overdue', tone: 'error' }
    : { label: e.status, tone: EXEAT_TONES[e.status] };

export const VISIT_OUTCOMES: VisitOutcome[] = [
  'Back to class',
  'Admitted',
  'Sent home',
  'Referred to hospital',
];

export const ROLL_MARKS: RollCallMark[] = ['Present', 'Absent', 'Excused'];
/** Selected-button classes per mark (solid enough to read at a glance on a phone). */
export const ROLL_SELECTED: Record<RollCallMark, string> = {
  Present: 'border-success bg-success-subtle text-success-strong',
  Absent: 'border-error bg-error-subtle text-error-strong',
  Excused: 'border-info bg-info-subtle text-info-strong',
};

/** A boarder to pick in a form (from My hostel, search or a recent record). */
export interface BoarderOption {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  /** "Amina House · Room 3" */
  place: string;
  medicalNotes: string;
}

/** Every boarder in the hostels I look after, sorted by name. */
export function boardersOf(data: MyHostel | undefined): BoarderOption[] {
  const out: BoarderOption[] = [];
  for (const h of data?.hostels ?? [])
    for (const room of h.rooms)
      for (const b of room.boarders)
        out.push({
          studentId: b.studentId,
          name: b.name,
          admissionNo: b.admissionNo,
          className: b.className,
          place: `${h.name} · ${room.name}`,
          medicalNotes: b.medicalNotes,
        });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** "YYYY-MM-DDTHH:mm" for a `datetime-local` input, `days` after `local` at `time`. */
export function localAt(local: string, days: number, time: string) {
  if (!local) return '';
  const d = new Date(Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.toISOString().slice(0, 10)}T${time}`;
}

/** "15:04" from an ISO time, in Lagos time. */
export const timeOf = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      })
        .format(new Date(iso))
        // "Thu, 26 Nov, 15:37" → "Thu 26 Nov, 15:37"
        .replace(',', '')
    : '';

/** "Fri 4 Dec, 15:04" from an ISO time, in Lagos time. */
export const dateTimeOf = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      })
        .format(new Date(iso))
        // "Thu, 26 Nov, 15:37" → "Thu 26 Nov, 15:37"
        .replace(',', '')
    : '';
