import { isOverdue, slaOf } from './support-desk.js';
import { addWorkingMs, subtractWorkingMs, workingMsBetween } from './working-time.js';

const H = 3_600_000;
/** Lagos wall-clock time. */
const lagos = (s: string) => new Date(`${s}+01:00`);
const none = new Set<string>();

describe('working time (Mon–Fri 08:00–17:00 Lagos)', () => {
  it('counts only working hours', () => {
    // Wednesday 16:00 → Thursday 09:00 = 1 h + 1 h.
    expect(workingMsBetween(lagos('2026-11-11T16:00'), lagos('2026-11-12T09:00'), none)).toBe(
      2 * H,
    );
    // A whole weekend counts nothing.
    expect(workingMsBetween(lagos('2026-11-14T00:00'), lagos('2026-11-16T00:00'), none)).toBe(0);
    // Out of order is zero.
    expect(workingMsBetween(lagos('2026-11-12T10:00'), lagos('2026-11-12T09:00'), none)).toBe(0);
  });

  it('moves a deadline over evenings, weekends and holidays', () => {
    // Friday 16:00 + 2 working hours = Monday 09:00.
    expect(addWorkingMs(lagos('2026-11-13T16:00'), 2 * H, none)).toEqual(lagos('2026-11-16T09:00'));
    // Saturday counts from Monday 08:00.
    expect(addWorkingMs(lagos('2026-11-14T11:00'), H, none)).toEqual(lagos('2026-11-16T09:00'));
    // Monday 16 Nov as a holiday pushes it to Tuesday.
    expect(addWorkingMs(lagos('2026-11-13T16:00'), 2 * H, new Set(['2026-11-16']))).toEqual(
      lagos('2026-11-17T09:00'),
    );
    // Exactly at closing time stays on that day.
    expect(addWorkingMs(lagos('2026-11-12T08:00'), 9 * H, none)).toEqual(lagos('2026-11-12T17:00'));
  });

  it('walks back the same way', () => {
    expect(subtractWorkingMs(lagos('2026-11-16T09:00'), 2 * H, none)).toEqual(
      lagos('2026-11-13T16:00'),
    );
    expect(subtractWorkingMs(lagos('2026-11-14T12:00'), H, none)).toEqual(
      lagos('2026-11-13T16:00'),
    );
  });
});

describe('SLA clocks', () => {
  const base = {
    priority: 'URGENT' as const,
    status: 'OPEN' as const,
    createdAt: lagos('2026-11-13T16:30'),
    firstReplyAt: null,
    pausedSeconds: 0,
    slaMissed: false,
  };

  it('a Friday-evening ticket is not overdue over the weekend', () => {
    const sla = slaOf(base, lagos('2026-11-15T20:00'), none);
    // First reply (1 working hour) falls Monday 08:30.
    expect(sla.firstReply).toEqual({ state: 'ok', label: 'Due in 12h 30m' });
    expect(isOverdue(base, lagos('2026-11-15T20:00'), none)).toBe(false);
    expect(slaOf(base, lagos('2026-11-16T09:00'), none).firstReply).toEqual({
      state: 'over',
      label: 'Overdue by 30m',
    });
  });

  it('pauses while waiting, and counts paused working time', () => {
    const waiting = {
      ...base,
      status: 'WAITING_FOR_SCHOOL' as const,
      firstReplyAt: base.createdAt,
    };
    expect(slaOf(waiting, lagos('2026-11-20T10:00'), none).resolution).toEqual({
      state: 'paused',
      label: 'Paused · waiting for school',
    });
    // 8 working hours to resolve: Friday 16:30 → Monday 16:30, plus 2 paused hours → Tuesday 08:30.
    const resumed = { ...base, status: 'IN_PROGRESS' as const, firstReplyAt: base.createdAt };
    expect(
      slaOf({ ...resumed, pausedSeconds: 7200 }, lagos('2026-11-17T08:00'), none).resolution,
    ).toEqual({ state: 'soon', label: 'Due in 30m' });
    expect(slaOf(resumed, lagos('2026-11-17T08:00'), none).resolution.state).toBe('over');
  });

  it('done tickets show met or missed', () => {
    expect(slaOf({ ...base, status: 'RESOLVED' }, lagos('2026-12-01T10:00'), none)).toMatchObject({
      firstReply: { state: 'met' },
      resolution: { state: 'met', label: 'Met' },
    });
    expect(
      slaOf({ ...base, status: 'CLOSED', slaMissed: true }, lagos('2026-12-01T10:00'), none)
        .resolution,
    ).toEqual({ state: 'over', label: 'Missed' });
  });
});
