import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { Clock } from '../../common/clock/clock.js';
import type { Portal } from '../../generated/prisma/enums.js';
import { AccessTokenService } from '../access-token.service.js';
import {
  IS_PUBLIC,
  PLATFORM_ONLY,
  PORTALS,
  REQUIRED_PERMISSIONS,
} from '../decorators/auth.decorators.js';
import { HOST_PORTALS } from '../portal-access.service.js';
import { SessionService } from '../session.service.js';

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Global guard: every route needs a valid access token unless marked `@Public()`. Besides the JWT
 * signature and expiry it checks that the session behind the token is still live (revocation is
 * immediate: the Redis snapshot is dropped on revoke) and, for school-subdomain portals, that the
 * Host is the session's school. Then it fills the request context, which sets the tenant.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  private readonly logger = new Logger(AccessTokenGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(req);
    if (!token) throw AppException.unauthorized();
    const claims = this.tokens.verify(token);

    const session = await this.sessions.snapshot(claims.sessionId);
    if (
      !session ||
      session.revoked ||
      session.expiresAt <= this.clock.nowMs() ||
      session.userId !== claims.sub ||
      session.portal !== claims.portal ||
      (session.schoolId ?? undefined) !== claims.schoolId
    )
      throw AppException.unauthorized('Your session has ended. Sign in again.', 'SESSION_ENDED');

    const ctx = RequestContext.get();
    if (HOST_PORTALS.has(claims.portal) && ctx?.hostSchool?.id !== claims.schoolId)
      throw AppException.forbidden(
        'This session belongs to another school. Sign in on this school’s address.',
        'TENANT_MISMATCH',
      );

    const allowed = this.reflector.getAllAndOverride<Portal[] | undefined>(PORTALS, targets);
    if (allowed && !allowed.includes(claims.portal))
      throw AppException.forbidden('This isn’t available in this portal.', 'WRONG_PORTAL');
    const needsSchool = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS,
      targets,
    );
    if (needsSchool && !claims.membershipId)
      throw AppException.forbidden('This needs a school session.', 'NO_TENANT');
    const platformOnly = this.reflector.getAllAndOverride<string[] | undefined>(
      PLATFORM_ONLY,
      targets,
    );
    if (platformOnly && claims.portal !== 'PLATFORM')
      throw AppException.forbidden('Platform staff only.', 'PLATFORM_ONLY');

    RequestContext.patch({
      userId: claims.sub,
      sessionId: claims.sessionId,
      portal: claims.portal,
      schoolId: claims.schoolId,
      membershipId: claims.membershipId,
      supportSessionId: session.supportSessionId ?? undefined,
    });
    this.sessions
      .touch(claims.sessionId)
      .catch((error: unknown) => this.logger.warn({ msg: 'touch failed', error: String(error) }));
    return true;
  }
}
