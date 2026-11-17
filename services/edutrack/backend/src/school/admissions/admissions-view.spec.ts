import {
  admissionNoMatcher,
  admissionScope,
  bareName,
  birthProblem,
  formatAdmissionNo,
  parseDay,
  stateOf,
} from './admissions-view.js';

describe('admission numbers', () => {
  it('formats the year, branch code and zero-padded counter', () => {
    expect(formatAdmissionNo('STU-[YYYY]-[####]', 1249, 2026, 'GFA-MC')).toBe('STU-2026-1249');
    expect(formatAdmissionNo('[BR]/[YY]/[###]', 7, 2026, 'GFA-MC')).toBe('GFA-MC/26/007');
    expect(formatAdmissionNo('ADM[######]', 12, 2026, 'X')).toBe('ADM000012');
  });

  it('reads the running number back for this year and branch only', () => {
    const m = admissionNoMatcher('STU-[YYYY]-[####]', 2026, 'GFA-MC');
    expect(m.exec('STU-2026-1248')?.[1]).toBe('1248');
    expect(m.exec('STU-2025-1300')).toBeNull();
    expect(admissionNoMatcher('[BR]/[YY]/[###]', 2026, 'GFA-MC').exec('GFA-LK/26/004')).toBeNull();
  });

  it('counts yearly when the year shows, per branch when [BR] shows', () => {
    expect(admissionScope('STU-[YYYY]-[####]', 2026, 'GFA-MC')).toBe('2026');
    expect(admissionScope('[BR]-[####]', 2026, 'GFA-MC')).toBe('GFA-MC');
    expect(admissionScope('[BR]/[YY]/[###]', 2026, 'GFA-MC')).toBe('2026|GFA-MC');
    expect(admissionScope('ADM[####]', 2026, 'GFA-MC')).toBe('');
  });
});

describe('form values', () => {
  it('reads real dates in either format', () => {
    expect(parseDay('2014-05-12')?.toISOString()).toBe('2014-05-12T00:00:00.000Z');
    expect(parseDay('12/05/2014')?.toISOString()).toBe('2014-05-12T00:00:00.000Z');
    expect(parseDay('1/2/2015')?.toISOString()).toBe('2015-02-01T00:00:00.000Z');
    expect(parseDay('31/02/2014')).toBeNull();
    expect(parseDay('2014-13-01')).toBeNull();
    expect(parseDay('yesterday')).toBeNull();
  });

  it('flags impossible birthdays', () => {
    const today = new Date('2026-11-17T00:00:00Z');
    expect(birthProblem(new Date('2027-01-01T00:00:00Z'), today)).toMatch(/future/);
    expect(birthProblem(new Date('2026-06-01T00:00:00Z'), today)).toMatch(/at least a year/);
    expect(birthProblem(new Date('1990-01-01T00:00:00Z'), today)).toMatch(/over 30/);
    expect(birthProblem(new Date('2014-05-12T00:00:00Z'), today)).toBeNull();
  });

  it('compares guardian names without titles and spells states the standard way', () => {
    expect(bareName('Mr.  Obinna Nwosu')).toBe('obinna nwosu');
    expect(bareName('Hajia Fatima Bello')).toBe('fatima bello');
    expect(stateOf('akwa ibom')).toBe('Akwa Ibom');
    expect(stateOf('Abuja')).toBe('FCT');
    expect(stateOf('Lagos State')).toBe('Lagos');
    expect(stateOf('Atlantis')).toBeNull();
  });
});
