import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Portal } from '../../generated/prisma/enums.js';
import type { PlatformPermission } from '../permissions/platform-permissions.js';
import type { SchoolPermission } from '../permissions/school-permissions.js';

export const IS_PUBLIC = 'auth:public';
export const PORTALS = 'auth:portals';
export const REQUIRED_PERMISSIONS = 'auth:permissions';
export const PLATFORM_ONLY = 'auth:platform';

/** No access token needed (sign-in, refresh, invitations, health). Everything else requires one. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only sessions of these portals may call the route. */
export const Portals = (...portals: Portal[]) =>
  applyDecorators(SetMetadata(PORTALS, portals), ApiBearerAuth());

/**
 * School routes: the caller's membership (School Admin or Teacher Workspace session) must hold
 * every listed permission through its roles, e.g. `@RequirePermission('students.view')`.
 * Implies a school session, so the tenant is always set inside the handler.
 */
export const RequirePermission = (...permissions: SchoolPermission[]) =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS, permissions),
    ApiBearerAuth(),
    ApiForbiddenResponse({ description: `Needs: ${permissions.join(', ')}` }),
  );

/**
 * Back-office routes: a platform session of an ACTIVE platform staff member whose role holds every
 * listed permission (`@PlatformOnly('Schools.View')`). With no arguments, any active staff member.
 */
export const PlatformOnly = (...permissions: PlatformPermission[]) =>
  applyDecorators(
    SetMetadata(PLATFORM_ONLY, permissions),
    ApiBearerAuth(),
    ApiForbiddenResponse({ description: 'Platform staff only' }),
  );

/** Swagger: a route that needs the bearer access token. */
export const Authenticated = () =>
  applyDecorators(ApiBearerAuth(), ApiUnauthorizedResponse({ description: 'Not signed in' }));
