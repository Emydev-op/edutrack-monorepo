import type { StatusTone } from '@edutrack/ui/lib/status';

import type { BoardingSettings, Exeat, ExeatKind, SickBayOutcome } from '@/types';

/** Boarding house wording and time helpers shared by the exeat, gate, roll call and sick bay pages. */

export const EXEAT_KINDS: ExeatKind[] = [
  'Weekend',
  'Medical',
  'Family event',
  'Emergency',
  'Term break',
  'Other',
];
/** Kinds the office gives one boarder at a time (Term break has its own dialog). */
export const SINGLE_EXEAT_KINDS = EXEAT_KINDS.filter((k) => k !== 'Term break');
/** Kinds that need a reason. */
export const REASON_KINDS: ExeatKind[] = ['Medical', 'Emergency', 'Other'];

export const SICK_BAY_OUTCOMES: SickBayOutcome[] = [
  'Back to class',
  'Admitted',
  'Sent home',
  'Referred to hospital',
];
export const OUTCOME_TONE: Record<SickBayOutcome, StatusTone> = {
  'Back to class': 'success',
  Admitted: 'warning',
  'Sent home': 'info',
  'Referred to hospital': 'error',
};

/** The exeat's badge: Overdue beats Out, a late return shows as such. */
export function exeatBadge(e: Pick<Exeat, 'status' | 'overdue' | 'lateReturn'>): {
  label: string;
  tone: StatusTone;
} {
  if (e.overdue && e.status === 'Out') return { label: 'Overdue', tone: 'error' };
  if (e.status === 'Returned' && e.lateReturn) return { label: 'Returned late', tone: 'warning' };
  const tones: Record<Exeat['status'], StatusTone> = {
    Requested: 'info',
    Approved: 'success',
    Declined: 'error',
    Cancelled: 'neutral',
    Out: 'brand',
    Returned: 'neutral',
  };
  return { label: e.status, tone: tones[e.status] };
}

/** Who collects: "Mrs Adaeze Okafor (Aunt)" or "A parent". */
export const pickupLabel = (e: Pick<Exeat, 'pickup'>) =>
  e.pickup ? `${e.pickup.name} (${e.pickup.relationship})` : 'A parent';

/** "JSS 2B · Unity House, Room 4". */
export function studentPlace(s: {
  className?: string;
  hostel?: string | null;
  room?: string | null;
}) {
  const place = [s.hostel, s.room].filter(Boolean).join(', ');
  return [s.className, place].filter(Boolean).join(' · ');
}

const LAGOS = 'Africa/Lagos';
const dateTimeFmt = new Intl.DateTimeFormat('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: LAGOS,
});
const timeFmt = new Intl.DateTimeFormat('en-NG', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: LAGOS,
});
const dayFmt = new Intl.DateTimeFormat('en-NG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: LAGOS,
});

/** "Fri 4 Dec, 15:00", or "—". */
export function whenLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(dateTimeFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

/** "15:00". */
export function timeLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFmt.format(d);
}

/** A calendar date ("2026-12-04" or an ISO time) as "Fri, 4 Dec 2026". */
export function dayLabel(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00+01:00` : date);
  return Number.isNaN(d.getTime()) ? date : dayFmt.format(d);
}

/** Lagos local parts of a moment, as "YYYY-MM-DDTHH:mm". */
export function lagosLocal(d: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: LAGOS,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/** Today in Lagos, "YYYY-MM-DD". */
export const lagosToday = () => lagosLocal().slice(0, 10);

/** A Lagos local time `days` from now at `time` ("16:00"): defaults for the exeat forms. */
export function lagosAt(days: number, time: string): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${lagosLocal(d).slice(0, 10)}T${time}`;
}

/** The campuses that take boarders, from Boarding set-up. */
export const boardingCampuses = (settings: BoardingSettings | undefined) =>
  (settings?.campuses ?? []).filter((c) => c.sections.some((s) => s.boarding));

/** The native select used across the boarding forms. */
export const SELECT_CLASS =
  'h-9 w-full rounded-md border bg-card px-2.5 text-sm aria-invalid:border-destructive';

/** A student picked in a boarding form. */
export interface PickedStudent {
  id: string;
  name: string;
  /** "SS 2A · ADM/2021/014". */
  detail: string;
  branchId?: string;
}
