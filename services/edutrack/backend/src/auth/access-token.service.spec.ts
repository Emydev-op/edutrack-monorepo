import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FixedClock } from '../common/clock/clock.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.validation.js';
import { AccessTokenService } from './access-token.service.js';

const SECRET = 'x'.repeat(48);
const config = { get: () => 900 } as unknown as ConfigService<Env, true>;
const claims = {
  sub: 'user-1',
  sessionId: 'session-1',
  portal: 'TEACHER' as const,
  schoolId: 'school-1',
  membershipId: 'membership-1',
};

function service(clock: FixedClock, secret = SECRET) {
  return new AccessTokenService(new JwtService({ secret }), clock, config);
}

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    return error instanceof AppException ? error.code : String(error);
  }
  return null;
}

describe('AccessTokenService', () => {
  it('round-trips the claims and reports the lifetime', () => {
    const tokens = service(new FixedClock());
    const { accessToken, expiresIn } = tokens.sign(claims);
    expect(expiresIn).toBe(900);
    expect(tokens.verify(accessToken)).toEqual(claims);
  });

  it('omits school claims for platform tokens', () => {
    const tokens = service(new FixedClock());
    const { accessToken } = tokens.sign({ sub: 'u', sessionId: 's', portal: 'PLATFORM' });
    expect(tokens.verify(accessToken)).toEqual({
      sub: 'u',
      sessionId: 's',
      portal: 'PLATFORM',
      schoolId: undefined,
      membershipId: undefined,
    });
  });

  it('expires after the TTL on the injected clock', () => {
    const clock = new FixedClock(Date.UTC(2026, 10, 13, 10));
    const tokens = service(clock);
    const { accessToken } = tokens.sign(claims);
    clock.advance(899_000);
    expect(tokens.verify(accessToken).sub).toBe('user-1');
    clock.advance(2_000);
    expect(codeOf(() => tokens.verify(accessToken))).toBe('TOKEN_EXPIRED');
    // Logout still identifies the session of an expired token.
    expect(tokens.verify(accessToken, { ignoreExpiration: true }).sessionId).toBe('session-1');
  });

  it('rejects tampered tokens and other secrets', () => {
    const clock = new FixedClock();
    const { accessToken } = service(clock).sign(claims);
    const [h, p, s] = accessToken.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: 'attacker' })).toString(
      'base64url',
    );
    expect(codeOf(() => service(clock).verify(`${h}.${forged}.${s}`))).toBe('TOKEN_INVALID');
    expect(codeOf(() => service(clock, 'y'.repeat(48)).verify(accessToken))).toBe('TOKEN_INVALID');
    expect(codeOf(() => service(clock).verify(`${h}.${p}.`))).toBe('TOKEN_INVALID');
  });

  it('refuses the "none" algorithm', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ ...claims, iss: 'edutrack-api', aud: 'edutrack-portals', exp: 9e9 }),
    ).toString('base64url');
    expect(codeOf(() => service(new FixedClock()).verify(`${header}.${body}.`))).toBe(
      'TOKEN_INVALID',
    );
  });
});
