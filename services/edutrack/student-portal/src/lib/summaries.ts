import type { ResultSummary } from '@/types';

/** One line about a term's results for Home. */
export function resultLine(r: ResultSummary): { title: string; sub: string; badge: string | null } {
  if (r.status === 'published')
    return {
      title: [r.term, r.average && `Average ${r.average}`, r.position].filter(Boolean).join(' · '),
      sub: 'Published · tap to view the report card',
      badge: 'Published',
    };
  if (r.status === 'held')
    return {
      title: `${r.term} results are on hold`,
      sub: 'Results on hold, please contact the school.',
      badge: 'On hold',
    };
  const planned = r.plannedOn
    ? `${r.term} results will be published on ${r.plannedOn}`
    : `${r.term} results aren’t published yet`;
  const prev = r.previous;
  return {
    title: planned,
    sub: prev
      ? `Last published: ${[prev.term, prev.average, prev.position].filter(Boolean).join(' · ')}`
      : 'You’ll get a notification when they’re out.',
    badge: null,
  };
}

/** Badge tones for an assignment's status. */
export function homeworkTone(status: string, pastDue = false) {
  switch (status) {
    case 'Returned':
      return 'success' as const;
    case 'Submitted':
    case 'Graded':
      return 'info' as const;
    case 'Late':
      return 'warning' as const;
    case 'Not submitted':
      return pastDue ? ('error' as const) : ('warning' as const);
    default:
      return 'neutral' as const;
  }
}

/** "08:40" in Lagos (the timetable's clock). */
export const lagosTime = (now: Date = new Date()) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);

/** The lesson on now, else the next one today (breaks are already left out), else none. */
export function nextLesson<L extends { start: string; end: string }>(
  lessons: L[],
  time: string,
): { lesson: L; now: boolean } | null {
  const current = lessons.find((l) => l.start <= time && time < l.end);
  if (current) return { lesson: current, now: true };
  const next = lessons.find((l) => l.start > time);
  return next ? { lesson: next, now: false } : null;
}
