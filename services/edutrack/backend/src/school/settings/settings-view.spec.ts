import {
  addressFormatLabel,
  annualNaira,
  patternProblem,
  ruleProblem,
  ruleText,
  schemeSummary,
  schoolSubscriptionStatus,
} from './settings-view.js';

describe('settings view helpers', () => {
  it('checks numbering formats like the School Admin form', () => {
    expect(patternProblem('STU-[YYYY]-[####]')).toBeNull();
    expect(patternProblem('GFA/ST/[YY]/[###]')).toBeNull();
    expect(patternProblem('')).toBe('Enter a format.');
    expect(patternProblem('STU-[####]-[###]')).toBe(
      'Include one running number, written [###] to [######].',
    );
    expect(patternProblem('[BR]-[####]')).toBe(
      '[BR] isn’t a format code. Use [YYYY], [YY] or [####].',
    );
    expect(patternProblem('stu-[####]')).toBe(
      'Use capital letters, numbers, hyphens and slashes only.',
    );
    expect(patternProblem('ABCDEFGHIJKLMNOPQRST-[####]')).toBe(
      'Keep the format to 24 characters or fewer.',
    );
  });

  it('checks sign-in rules, with 0 meaning passwords never expire', () => {
    expect(ruleProblem('lockoutAttempts', 3)).toBeNull();
    expect(ruleProblem('lockoutAttempts', 11)).toBe(
      'Failed attempts before lockout must be a whole number from 3 to 10 attempts.',
    );
    expect(ruleProblem('idleTimeoutMinutes', 7.5)).not.toBeNull();
    expect(ruleProblem('passwordExpiryDays', 0)).toBeNull();
    expect(ruleProblem('passwordExpiryDays', 0.5)).toBe(
      'Password expiry must be a whole number from 30 to 365 days, or 0 for never.',
    );
    expect(ruleText('passwordExpiryDays', 0)).toBe('Never');
    expect(ruleText('passwordExpiryDays', 90)).toBe('Every 90 days');
    expect(ruleText('lockoutMinutes', 15)).toBe('15 minutes');
  });

  it('puts the back office’s subscription status in the school’s words', () => {
    expect(schoolSubscriptionStatus('ACTIVE', 200)).toBe('Active');
    expect(schoolSubscriptionStatus('ACTIVE', 30)).toBe('Renewal due');
    expect(schoolSubscriptionStatus('EXPIRING', 12)).toBe('Renewal due');
    expect(schoolSubscriptionStatus('GRACE_PERIOD', -3)).toBe('Overdue');
    for (const s of ['RESTRICTED', 'EXPIRED', 'CANCELLED'] as const)
      expect(schoolSubscriptionStatus(s, 100)).toBe('Restricted');
  });

  it('formats prices, address formats and scheme summaries', () => {
    expect(annualNaira(185_000_000n, 'ANNUAL')).toBe(1_850_000);
    expect(annualNaira(70_000_000n, 'TERM')).toBe(2_100_000);
    expect(addressFormatLabel('street, city, LGA, state')).toBe('Street → City → LGA → State');
    expect(
      schemeSummary({
        mode: 'scores',
        components: [
          { name: 'CA 1', weight: 20 },
          { name: 'Exam', weight: 80 },
        ],
        ratings: [],
      }),
    ).toBe('CA 1 20% · Exam 80%');
    expect(schemeSummary({ mode: 'descriptive', components: [], ratings: [] })).toBe(
      'Descriptive · no ratings yet',
    );
  });
});
