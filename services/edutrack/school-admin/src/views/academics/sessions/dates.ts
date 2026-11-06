import type { TermEvent, TermEventType } from '@/types';

/** ISO date helpers in UTC, so a date never shifts with the device's time zone. */
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(ms(v));
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86400000);
export const addDays = (iso: string, n: number) =>
  new Date(ms(iso) + n * 86400000).toISOString().slice(0, 10);
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function fmtDate(iso: string, opts: { year?: boolean; weekday?: boolean } = {}) {
  if (!isIso(iso)) return '—';
  return new Date(ms(iso)).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(opts.year !== false && { year: 'numeric' }),
    ...(opts.weekday && { weekday: 'short' }),
  });
}

export const fmtRange = (start: string, end: string, year = true) =>
  start === end
    ? fmtDate(start, { year })
    : `${fmtDate(start, { year: false })} – ${fmtDate(end, { year })}`;

export const EVENT_TYPES: { value: TermEventType; label: string }[] = [
  { value: 'resumption', label: 'Resumption' },
  { value: 'midterm', label: 'Mid-term break' },
  { value: 'ca', label: 'CA week' },
  { value: 'exams', label: 'Examinations' },
  { value: 'pta', label: 'PTA meeting' },
  { value: 'results', label: 'Results publication' },
  { value: 'custom', label: 'Other event' },
];
export const eventLabel = (t: TermEventType) => EVENT_TYPES.find((e) => e.value === t)?.label ?? t;

/** The Saturday on or after a date. */
const saturday = (iso: string) => {
  const d = new Date(ms(iso)).getUTCDay();
  return addDays(iso, (6 - d + 7) % 7);
};

/** Typical term events: resumption, PTA, CA week, mid-term break and exams. */
export function suggestEvents(start: string, end: string): Omit<TermEvent, 'id'>[] {
  if (!isIso(start) || !isIso(end) || end <= start) return [];
  const len = daysBetween(start, end);
  const mid = addDays(start, Math.round(len / 2) - 2);
  const pta = saturday(addDays(start, 14));
  const ca = addDays(start, Math.round(len * 0.35));
  return [
    { type: 'resumption', name: 'Resumption', start, end: start },
    { type: 'pta', name: 'PTA meeting', start: pta, end: pta },
    { type: 'ca', name: 'CA week', start: ca, end: addDays(ca, 4) },
    { type: 'midterm', name: 'Mid-term break', start: mid, end: addDays(mid, 4) },
    { type: 'exams', name: 'Examinations', start: addDays(end, -13), end: addDays(end, -1) },
  ];
}

/** Spreads terms evenly across the session with a two-week break between them. */
export function evenTerms(start: string, end: string, count: number) {
  const gap = count > 1 ? 14 : 0;
  const len = Math.floor((daysBetween(start, end) - gap * (count - 1)) / count);
  return Array.from({ length: count }, (_, i) => {
    const s = addDays(start, i * (len + gap));
    return { start: s, end: i === count - 1 ? end : addDays(s, len) };
  });
}
