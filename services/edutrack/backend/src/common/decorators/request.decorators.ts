import { createParamDecorator } from '@nestjs/common';
import type { AuthUserContext, ClientInfo } from '../../auth/auth-context.js';
import { RequestContext } from '../context/request-context.js';
import { AppException } from '../errors/app.exception.js';

/**
 * The signed-in caller: `{ userId, sessionId, portal, schoolId?, membershipId?, supportSessionId? }`.
 * Throws 401 on a public route with nobody signed in.
 */
export const CurrentUser = createParamDecorator((): AuthUserContext => {
  const ctx = RequestContext.get();
  if (!ctx?.userId || !ctx.sessionId || !ctx.portal) throw AppException.unauthorized();
  return {
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    portal: ctx.portal,
    schoolId: ctx.schoolId,
    membershipId: ctx.membershipId,
    supportSessionId: ctx.supportSessionId,
  };
});

/** The current tenant's school id. Throws 403 when the session isn't a school session. */
export const CurrentTenant = createParamDecorator((): string => {
  const schoolId = RequestContext.get()?.schoolId;
  if (!schoolId) throw AppException.forbidden('This needs a school session.', 'NO_TENANT');
  return schoolId;
});

/** IP, user agent and the Host's school, for auth flows that run before sign-in. */
export const Client = createParamDecorator((): ClientInfo => {
  const ctx = RequestContext.get();
  return {
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
    hostSchool: ctx?.hostSchool,
    unknownHostSlug: ctx?.unknownHostSlug,
  };
});
