import { MINUTE } from '../common/clock/clock.js';
import { normalizePhone, parseIdentifier, initialsOf } from './identifiers.js';
import { afterFailure, incorrectMessage, lockStatus, strictest } from './lockout.js';
import {
  burnPasswordCheck,
  hashPassword,
  meetsPasswordPolicy,
  needsRehash,
  verifyPassword,
} from './password.js';
import { flattenPermissions, PREDEFINED_SCHOOL_ROLES } from './permissions/school-permissions.js';
import { deviceLabel, randomToken, sha256 } from './tokens.js';

describe('password policy', () => {
  it.each([
    ['Edutrack2026!', true],
    ['short1A!', false], // 8 characters: the portals require 10
    ['edutrack2026!', false],
    ['EDUTRACK2026!', false],
    ['Edutrackkkk!', false],
    ['Edutrack2026', false],
    [`Aa1!${'x'.repeat(200)}`, false],
  ])('%s → %s', (password, ok) => {
    expect(meetsPasswordPolicy(password)).toBe(ok);
  });
});

describe('password hashing', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('Edutrack2026!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Edutrack2026!')).toBe(true);
    expect(await verifyPassword(hash, 'edutrack2026!')).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it('treats malformed hashes and huge inputs as a mismatch', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
    expect(await verifyPassword(await hashPassword('x'), 'x'.repeat(500))).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHQ$aGFzaGhhc2g')).toBe(true);
    await expect(burnPasswordCheck('anything')).resolves.toBeUndefined();
  });
});

describe('lockout', () => {
  const now = new Date('2026-11-13T10:00:00Z');
  const rules = { attempts: 5, minutes: 15 };

  it('counts down, then pauses for the rule length', () => {
    expect(afterFailure(1, rules, now)).toEqual({ locked: false, attemptsLeft: 4 });
    expect(afterFailure(4, rules, now)).toEqual({ locked: false, attemptsLeft: 1 });
    expect(afterFailure(5, rules, now)).toEqual({
      locked: true,
      lockedUntil: new Date(now.getTime() + 15 * MINUTE),
    });
  });

  it('is locked until the pause ends, then resets', () => {
    const lockedUntil = new Date(now.getTime() + MINUTE);
    expect(lockStatus({ failedSignInCount: 5, lockedUntil }, now)).toEqual({ locked: true });
    expect(
      lockStatus({ failedSignInCount: 5, lockedUntil }, new Date(now.getTime() + 2 * MINUTE)),
    ).toEqual({
      locked: false,
      reset: true,
    });
    expect(lockStatus({ failedSignInCount: 2, lockedUntil: null }, now)).toEqual({
      locked: false,
      reset: false,
    });
  });

  it('uses the strictest rule across schools', () => {
    expect(strictest([], rules)).toEqual(rules);
    expect(
      strictest(
        [
          { attempts: 5, minutes: 15 },
          { attempts: 3, minutes: 30 },
        ],
        rules,
      ),
    ).toEqual({
      attempts: 3,
      minutes: 30,
    });
  });

  it('words the countdown like the portals', () => {
    expect(incorrectMessage(1, false)).toBe(
      'The email or password you entered is incorrect. 1 attempt left before sign-in is paused.',
    );
    expect(incorrectMessage(3, true)).toContain('phone number or password');
  });
});

describe('identifiers', () => {
  it.each([
    ['0803 412 7781', '+2348034127781'],
    ['0803-412-7781', '+2348034127781'],
    ['2348034127781', '+2348034127781'],
    ['+2348034127781', '+2348034127781'],
    ['+44 20 7946 0958', '+442079460958'],
    ['12345', null],
    ['0603 412 7781', null],
  ])('normalizePhone(%s) → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('reads an email or a phone from the sign-in box', () => {
    expect(parseIdentifier(' Adaeze.Okonkwo@Greenfield.edu.ng ')).toEqual({
      kind: 'email',
      value: 'adaeze.okonkwo@greenfield.edu.ng',
    });
    expect(parseIdentifier('0809 120 4455')).toEqual({ kind: 'phone', value: '+2348091204455' });
    expect(parseIdentifier('not an email')).toBeNull();
    expect(parseIdentifier('a@b')).toBeNull();
  });

  it('makes school initials', () => {
    expect(initialsOf('Greenfield Academy')).toBe('GA');
    expect(initialsOf('College of St. Mary')).toBe('CS');
  });
});

describe('tokens', () => {
  it('generates 256-bit URL-safe tokens and hashes them', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('labels devices', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      ),
    ).toBe('Chrome on macOS');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe(
      'Edge on Windows',
    );
    expect(deviceLabel(undefined)).toBe('Unknown device');
  });
});

describe('permissions', () => {
  it('flattens role maps into module.action strings', () => {
    expect(
      flattenPermissions([
        { students: ['view'], results: ['enter'] },
        { students: ['view', 'edit'] },
        null,
        [],
      ]),
    ).toEqual(['results.enter', 'students.edit', 'students.view']);
  });

  it('has a stable key for every predefined role', () => {
    const keys = PREDEFINED_SCHOOL_ROLES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining(['owner', 'school_admin', 'teacher', 'hod', 'academic_head']),
    );
  });
});
