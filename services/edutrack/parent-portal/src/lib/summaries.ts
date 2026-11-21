import type { FeeBadge, ResultSummary } from '@/types';

import { naira } from './money';

/** One line about a term's results for Home and a child's page. */
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
      sub: 'Please contact the school.',
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

/** "₦45,000 outstanding" / "Nothing outstanding", with a status label for the badge. */
export function feeLine(f: FeeBadge): { text: string; status: string } {
  if (f.outstanding <= 0) return { text: 'Nothing outstanding', status: 'Paid' };
  const text = `${naira(f.outstanding)} outstanding`;
  if (f.pending >= f.outstanding) return { text, status: 'Pending' };
  return { text, status: f.overdue ? 'Overdue' : 'Due' };
}

/** Badge tones for a child's assignment status. */
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
