import {
  EVENTS,
  eventFromDb,
  eventToDb,
  render,
  smsLength,
  smsUnits,
  variablesIn,
} from './comms-catalog.js';
import { atLabel, fromLocalStamp, inWindow, localStamp, nextLocal } from './comms-time.js';

describe('comms catalog', () => {
  it('counts SMS pages as networks do', () => {
    expect(smsLength('').pages).toBe(0);
    expect(smsLength('a'.repeat(160)).pages).toBe(1);
    expect(smsLength('a'.repeat(161)).pages).toBe(2);
    expect(smsLength('a'.repeat(306)).pages).toBe(2);
    expect(smsLength('a'.repeat(307)).pages).toBe(3);
    // Extension characters count twice.
    expect(smsLength('[]'.repeat(40)).length).toBe(160);
    // Unicode: 70 a page, 67 when split.
    expect(smsLength(`🎉${'a'.repeat(69)}`)).toMatchObject({ unicode: true, pages: 1 });
    expect(smsLength(`🎉${'a'.repeat(70)}`).pages).toBe(2);
    // ₦ and curly quotes are made SMS-safe before counting units.
    expect(smsUnits(`₦40,000 ’${'a'.repeat(140)}`)).toBe(1);
  });

  it('fills in variables and keeps unknown ones as written', () => {
    expect(render('[first_name] was absent [today]', { first_name: 'Emmanuel' })).toBe(
      'Emmanuel was absent [today]',
    );
    expect(variablesIn('[a] and [b_c]')).toEqual(['a', 'b_c']);
  });

  it('maps event keys to the database enum and back', () => {
    for (const e of EVENTS) expect(eventFromDb(eventToDb(e.key))).toBe(e.key);
    expect(eventToDb('attendance.absent')).toBe('ATTENDANCE_ABSENT');
  });

  it('has default wording for every channel an event can use', () => {
    for (const e of EVENTS.filter((x) => x.key !== 'announcement'))
      for (const c of e.available) expect(e.templates[c]?.body).toBeTruthy();
  });
});

describe('comms time (Lagos)', () => {
  it('converts local stamps', () => {
    expect(localStamp(new Date('2026-11-20T21:30:00.000Z'))).toBe('2026-11-20T22:30');
    expect(fromLocalStamp('2026-11-20T12:00').toISOString()).toBe('2026-11-20T11:00:00.000Z');
    expect(atLabel(new Date('2026-11-20T09:00:00Z'), new Date('2026-11-20T10:00:00Z'))).toBe(
      'Today 10:00',
    );
  });

  it('handles quiet hours across midnight', () => {
    expect(inWindow('22:30', '21:00', '07:00')).toBe(true);
    expect(inWindow('06:59', '21:00', '07:00')).toBe(true);
    expect(inWindow('07:00', '21:00', '07:00')).toBe(false);
    expect(nextLocal(new Date('2026-11-20T21:30:00.000Z'), '07:00').toISOString()).toBe(
      '2026-11-21T06:00:00.000Z',
    );
    expect(nextLocal(new Date('2026-11-21T03:00:00.000Z'), '07:00').toISOString()).toBe(
      '2026-11-21T06:00:00.000Z',
    );
  });
});
