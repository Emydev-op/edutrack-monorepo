import { describe, expect, it } from 'vitest';

import { isNigerianMobile, nigerianPhoneProblem } from '../phone';

describe('Nigerian mobile numbers', () => {
  it.each([
    '0803 412 7781',
    '08134567890',
    '07034567890',
    '09034567890',
    '09134567890',
    '+234 813 456 7890',
  ])('accepts %s', (n) => {
    expect(isNigerianMobile(n)).toBe(true);
    expect(nigerianPhoneProblem(n)).toBeNull();
  });

  it('says how many digits were typed', () => {
    expect(nigerianPhoneProblem('080345654500')).toBe(
      'Nigerian mobile numbers have 11 digits; this has 12',
    );
    expect(nigerianPhoneProblem('0813456789')).toContain('this has 10');
  });

  it('explains landlines and missing leading zero', () => {
    expect(nigerianPhoneProblem('01234567890')).toContain('start with 070');
    expect(nigerianPhoneProblem('8134567890')).toContain('Start with 0');
  });

  it('accepts an empty value (optional fields)', () => {
    expect(nigerianPhoneProblem('')).toBeNull();
  });
});
