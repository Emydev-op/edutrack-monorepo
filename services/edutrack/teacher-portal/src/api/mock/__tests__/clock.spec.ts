import { describe, expect, it } from 'vitest';

import {
  MOCK_NOW,
  closureReason,
  isSchoolDay,
  isoToday,
  previousSchoolDays,
  schoolDaysBetween,
  whenLabel,
} from '../clock';

describe('Demo clock and school calendar', () => {
  it('runs on Tuesday 8 December 2026, 08:15', () => {
    expect(MOCK_NOW).toBe('2026-12-08T08:15:00+01:00');
    expect(isoToday()).toBe('2026-12-08');
    expect(isSchoolDay('2026-12-08')).toBe(true);
  });

  it('knows weekends, holidays, the mid-term break and the staff development day', () => {
    expect(isSchoolDay('2026-12-12')).toBe(false); // Saturday
    expect(isSchoolDay('2026-12-13')).toBe(false); // Sunday
    expect(closureReason('2026-10-01')).toMatch(/Independence/);
    expect(isSchoolDay('2026-10-28')).toBe(true);
    expect(isSchoolDay('2026-10-29')).toBe(false);
    expect(isSchoolDay('2026-11-02')).toBe(false); // last day of the break (a Monday)
    expect(isSchoolDay('2026-11-03')).toBe(true);
    expect(closureReason('2026-11-20')).toBe('Staff development day');
  });

  it('has no school days outside a term', () => {
    expect(isSchoolDay('2026-09-11')).toBe(false); // the Friday before term
    expect(isSchoolDay('2026-09-14')).toBe(true);
    expect(isSchoolDay('2026-12-18')).toBe(true);
    expect(closureReason('2026-12-21')).toBe('Between terms');
    expect(isSchoolDay('2027-01-11')).toBe(false);
    expect(isSchoolDay('2027-01-12')).toBe(true);
  });

  it('counts school days between dates and before today', () => {
    expect(schoolDaysBetween('2026-11-16', '2026-11-22')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
    ]);
    expect(schoolDaysBetween('2026-10-26', '2026-11-04')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-11-03',
      '2026-11-04',
    ]);
    expect(previousSchoolDays(5)).toEqual([
      '2026-12-07',
      '2026-12-04',
      '2026-12-03',
      '2026-12-02',
      '2026-12-01',
    ]);
    expect(previousSchoolDays(2, '2026-11-03')).toEqual(['2026-10-28', '2026-10-27']);
  });

  it('labels times relative to the clock', () => {
    expect(whenLabel('2026-12-08T08:15')).toBe('Just now');
    expect(whenLabel('2026-12-08T07:40')).toBe('35m ago');
    expect(whenLabel('2026-12-08T06:00')).toBe('Today 06:00');
    expect(whenLabel('2026-12-07T15:42')).toBe('Yesterday 15:42');
    expect(whenLabel('2026-12-03T11:10')).toBe('3 Dec');
    expect(whenLabel('2025-07-03T11:10')).toBe('3 Jul 2025');
  });
});
