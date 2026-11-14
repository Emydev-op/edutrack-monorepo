import { MINUTE } from '../common/clock/clock.js';

export interface LockoutRules {
  /** Wrong passwords in a row that pause sign-in. */
  attempts: number;
  /** How long sign-in stays paused. */
  minutes: number;
}

export interface LockoutCounters {
  failedSignInCount: number;
  lockedUntil: Date | null;
}

/** Where an account stands right now: paused, or open (with stale counters cleared if a pause ran out). */
export function lockStatus(
  counters: LockoutCounters,
  now: Date,
): { locked: true } | { locked: false; reset: boolean } {
  if (counters.lockedUntil && counters.lockedUntil > now) return { locked: true };
  return { locked: false, reset: Boolean(counters.lockedUntil) };
}

/** After a wrong password brought the count to `failedCount`: pause now, or how many tries remain. */
export function afterFailure(
  failedCount: number,
  rules: LockoutRules,
  now: Date,
): { locked: true; lockedUntil: Date } | { locked: false; attemptsLeft: number } {
  if (failedCount >= rules.attempts)
    return { locked: true, lockedUntil: new Date(now.getTime() + rules.minutes * MINUTE) };
  return { locked: false, attemptsLeft: rules.attempts - failedCount };
}

/** The strictest of several schools' rules (a user can belong to more than one school). */
export function strictest(rules: LockoutRules[], fallback: LockoutRules): LockoutRules {
  if (rules.length === 0) return fallback;
  return {
    attempts: Math.min(...rules.map((r) => r.attempts)),
    minutes: Math.max(...rules.map((r) => r.minutes)),
  };
}

export const incorrectMessage = (attemptsLeft: number, usedPhone: boolean) =>
  `The ${usedPhone ? 'phone number' : 'email'} or password you entered is incorrect. ` +
  `${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left before sign-in is paused.`;

export const lockedMessage = (minutes: number) =>
  `Too many unsuccessful attempts. Sign-in is paused for ${minutes} minutes on this account.`;
