import { describe, expect, it } from 'vitest';

import { initials } from '../format';
import { meetsPasswordPolicy, passwordRules } from '../password';

describe('password policy', () => {
  it('requires length, mixed case, a number and a symbol', () => {
    expect(meetsPasswordPolicy('Edutrack2026!')).toBe(true);
    expect(meetsPasswordPolicy('edutrack2026!')).toBe(false);
    expect(meetsPasswordPolicy('Short1!')).toBe(false);
    expect(
      passwordRules('Abcdefghij')
        .filter((r) => !r.met)
        .map((r) => r.label),
    ).toEqual(['A number', 'A symbol']);
  });
});

describe('initials', () => {
  it('drops honorifics', () => {
    expect(initials('Mrs. Ifeoma Briggs')).toBe('IB');
    expect(initials('Tolu Bamidele')).toBe('TB');
  });
});
