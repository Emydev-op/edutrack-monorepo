import { HttpStatus } from '@nestjs/common';
import { flattenPermissions } from '../../auth/permissions/school-permissions.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PlatformStaffStatus } from '../../generated/prisma/enums.js';
import { isUuid } from './params.js';

/** The back office names predefined roles by their key (`admin`, `ops`…), custom roles by id. */
export const roleRef = (role: { id: string; key: string | null }) => role.key ?? role.id;

/** Where to find a role from the id the back office sends (a key or a UUID). */
export const roleWhere = (ref: string): Prisma.PlatformRoleWhereUniqueInput =>
  isUuid(ref) ? { id: ref.toLowerCase() } : { key: ref };

export const USER_NOT_FOUND = 'That user doesn’t exist.';
export const ROLE_NOT_FOUND = 'That role doesn’t exist.';
/** The predefined role that holds every permission. At least one active member must keep it. */
export const ADMIN_ROLE_KEY = 'admin';

export const STAFF_STATUS_LABEL: Record<PlatformStaffStatus, string> = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
};
export const STAFF_STATUS_BY_LABEL = Object.fromEntries(
  Object.entries(STAFF_STATUS_LABEL).map(([k, v]) => [v, k]),
) as Record<string, PlatformStaffStatus>;

export const unprocessable = (message: string, code = 'VALIDATION') =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, message, code);

/** Every `Area.Action` a role grants. */
export const permissionsOf = (role: { permissions: Prisma.JsonValue }) =>
  new Set(flattenPermissions([role.permissions]));

/** True when `role` grants nothing beyond `mine`, so the holder of `mine` may hand it out. */
export const withinPermissions = (
  role: { permissions: Prisma.JsonValue },
  mine: { permissions: Prisma.JsonValue },
) => {
  const own = permissionsOf(mine);
  return [...permissionsOf(role)].every((p) => own.has(p));
};
