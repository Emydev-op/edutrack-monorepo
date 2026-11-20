import { describe, expect, it } from 'vitest';

import type { ResultSummary } from '@/types';

import { feeLine, homeworkTone, resultLine } from '../summaries';
import { notificationTarget } from '../notifications';
import { calendarMonths } from '../attendance';

const base: ResultSummary = {
  termId: 't1',
  term: 'First Term · 2026/2027',
  status: 'not-published',
  average: null,
  position: null,
  plannedOn: null,
  held: null,
  previous: null,
};

describe('resultLine', () => {
  it('shows a published card’s average and position', () => {
    const r = resultLine({ ...base, status: 'published', average: '71.4%', position: '7th of 14' });
    expect(r).toMatchObject({
      title: 'First Term · 2026/2027 · Average 71.4% · 7th of 14',
      badge: 'Published',
    });
  });

  it('says when results are planned, and the last published term', () => {
    const r = resultLine({
      ...base,
      plannedOn: 'Mon 14 Dec 2026',
      previous: { ...base, term: 'Third Term · 2025/2026', status: 'published', average: '72.3%' },
    });
    expect(r.title).toBe('First Term · 2026/2027 results will be published on Mon 14 Dec 2026');
    expect(r.sub).toBe('Last published: Third Term · 2025/2026 · 72.3%');
  });

  it('never shows why a card is held', () => {
    const r = resultLine({
      ...base,
      status: 'held',
      held: { message: 'Please contact the school.' },
    });
    expect(r).toMatchObject({ badge: 'On hold', sub: 'Please contact the school.' });
  });
});

describe('feeLine and homeworkTone', () => {
  it('labels the fee badge', () => {
    expect(feeLine({ outstanding: 0, pending: 0, overdue: false })).toEqual({
      text: 'Nothing outstanding',
      status: 'Paid',
    });
    expect(feeLine({ outstanding: 40000, pending: 0, overdue: true }).status).toBe('Overdue');
    expect(feeLine({ outstanding: 40000, pending: 40000, overdue: true }).status).toBe('Pending');
  });

  it('colours assignment statuses', () => {
    expect(homeworkTone('Returned')).toBe('success');
    expect(homeworkTone('Not submitted', true)).toBe('error');
    expect(homeworkTone('Not submitted')).toBe('warning');
  });
});

describe('notificationTarget', () => {
  it('opens the screen the notification links to, on the right child', () => {
    expect(notificationTarget({ to: '/results', childId: 'c1' })).toEqual({
      name: 'results',
      query: { child: 'c1' },
    });
    expect(notificationTarget({ to: '/assignments/a1', childId: null })).toEqual({
      name: 'assignment',
      params: { assignmentId: 'a1' },
      query: {},
    });
    expect(notificationTarget({ to: '/somewhere', childId: null })).toEqual({
      name: 'home',
      query: {},
    });
  });
});

describe('calendarMonths', () => {
  it('lays out weekdays with the marks and the offset of the first day', () => {
    const months = calendarMonths([
      { date: '2026-12-01', mark: 'Present', reason: null },
      { date: '2026-12-02', mark: 'Absent', reason: 'Unwell' },
    ]);
    expect(months).toHaveLength(1);
    expect(months[0]!.label).toBe('December 2026');
    // 1 Dec 2026 is a Tuesday: one blank (Monday) before it.
    expect(months[0]!.offset).toBe(1);
    expect(months[0]!.days.slice(0, 2)).toEqual([
      { date: '2026-12-01', mark: 'Present' },
      { date: '2026-12-02', mark: 'Absent' },
    ]);
    expect(months[0]!.days).toHaveLength(23);
  });
});
