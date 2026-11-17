import { childAccess, isCurrentStudent, leftOnOf, readOnlyUntil } from './school-portal-rules.js';

const NOW = new Date('2026-11-17T10:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('school portal rules (leavers)', () => {
  it('gives parents full access while the child is on the roll', () => {
    expect(childAccess({ status: 'ACTIVE', leftOn: null }, NOW)).toBe('full');
    expect(childAccess({ status: 'INCOMPLETE_PROFILE', leftOn: null }, NOW)).toBe('full');
    expect(isCurrentStudent({ status: 'GRADUATED' })).toBe(false);
  });

  it('keeps read-only access for two years after the child left, then none', () => {
    const left = { status: 'GRADUATED' as const, leftOn: day('2025-07-18') };
    expect(childAccess(left, NOW)).toBe('read-only');
    expect(readOnlyUntil(day('2025-07-18'))).toEqual(day('2027-07-18'));
    expect(childAccess(left, day('2027-07-17'))).toBe('read-only');
    expect(childAccess(left, day('2027-07-18'))).toBeNull();
    expect(childAccess({ status: 'TRANSFERRED', leftOn: day('2024-11-16') }, NOW)).toBeNull();
  });

  it('falls back to the exit or graduation date, and drops deleted students', () => {
    expect(leftOnOf({ status: 'WITHDRAWN', leftOn: null, exitOn: day('2026-01-10') })).toEqual(
      day('2026-01-10'),
    );
    expect(childAccess({ status: 'WITHDRAWN', leftOn: null }, NOW)).toBe('read-only');
    expect(childAccess({ status: 'ACTIVE', leftOn: null, deletedAt: NOW }, NOW)).toBeNull();
  });
});
