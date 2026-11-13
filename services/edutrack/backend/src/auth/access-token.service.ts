import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Clock } from '../common/clock/clock.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.validation.js';
import { Portal } from '../generated/prisma/enums.js';

/** What an access token says. Short-lived; the session behind it is checked on every request. */
export interface AccessClaims {
  /** User id. */
  sub: string;
  sessionId: string;
  portal: Portal;
  /** The school signed into (absent for the platform back office). */
  schoolId?: string;
  /** The SchoolMembership acting (absent for the platform back office). */
  membershipId?: string;
}

const ISSUER = 'edutrack-api';
const AUDIENCE = 'edutrack-portals';
const PORTALS = new Set<string>(Object.values(Portal));

/** Signs and verifies access tokens (HS256 JWT). The clock is injectable so tests can expire them. */
@Injectable()
export class AccessTokenService {
  readonly ttlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  sign(claims: AccessClaims): { accessToken: string; expiresIn: number } {
    const iat = Math.floor(this.clock.nowMs() / 1000);
    const payload: Record<string, unknown> = { ...claims, iat, exp: iat + this.ttlSeconds };
    for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key];
    const accessToken = this.jwt.sign(payload, {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return { accessToken, expiresIn: this.ttlSeconds };
  }

  /** Verifies signature, issuer, audience and expiry (unless `ignoreExpiration`, used by logout). */
  verify(token: string, { ignoreExpiration = false } = {}): AccessClaims {
    let payload: Record<string, unknown>;
    try {
      payload = this.jwt.verify(token, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        clockTimestamp: Math.floor(this.clock.nowMs() / 1000),
        ignoreExpiration,
      });
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw AppException.unauthorized(
        expired ? 'Your session has expired. Sign in again.' : 'Sign in to continue.',
        expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      );
    }
    const { sub, sessionId, portal, schoolId, membershipId } = payload;
    if (
      typeof sub !== 'string' ||
      typeof sessionId !== 'string' ||
      typeof portal !== 'string' ||
      !PORTALS.has(portal) ||
      (schoolId !== undefined && typeof schoolId !== 'string') ||
      (membershipId !== undefined && typeof membershipId !== 'string')
    )
      throw AppException.unauthorized('Sign in to continue.', 'TOKEN_INVALID');
    return {
      sub,
      sessionId,
      portal: portal as Portal,
      schoolId: schoolId as string | undefined,
      membershipId: membershipId as string | undefined,
    };
  }
}
