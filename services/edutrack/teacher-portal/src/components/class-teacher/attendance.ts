import type { StatusTone } from '@edutrack/ui/lib/status';

import type { AttendanceMark } from '@/types';

export const MARKS: AttendanceMark[] = ['Present', 'Absent', 'Late', 'Excused'];

/** One tone per attendance mark, the same on the register, history and report cards. */
export const MARK_TONES: Record<AttendanceMark, StatusTone> = {
  Present: 'success',
  Absent: 'error',
  Late: 'warning',
  Excused: 'info',
};

/** Selected-button classes per mark (solid enough to read at a glance on a phone). */
export const MARK_SELECTED: Record<AttendanceMark, string> = {
  Present: 'border-success bg-success-subtle text-success-strong',
  Absent: 'border-error bg-error-subtle text-error-strong',
  Late: 'border-warning bg-warning-subtle text-warning-strong',
  Excused: 'border-info bg-info-subtle text-info-strong',
};

/** "92.9%" or "—". */
export const percentLabel = (p: number | null | undefined) =>
  p === null || p === undefined ? '—' : `${p}%`;
