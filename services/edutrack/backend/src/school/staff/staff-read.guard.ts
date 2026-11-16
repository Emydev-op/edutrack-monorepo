import { applyDecorators, type CanActivate, Injectable, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse } from '@nestjs/swagger';
import {
  flattenPermissions,
  type SchoolPermission,
} from '../../auth/permissions/school-permissions.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

/**
 * Who may read the staff directory. There is no `staff` module in the role editor: managing staff
 * is part of Users & Roles (`settings.users`), and Academics needs the teacher list to assign
 * classes (`academics.view`), so either permission opens the read routes. Writes need
 * `settings.users` through `@RequirePermission`.
 */
export const STAFF_READ_PERMISSIONS: readonly SchoolPermission[] = [
  'settings.users',
  'academics.view',
];

/** `@RequirePermission` needs every permission; this needs any one (read from the roles, live). */
@Injectable()
export class StaffReadGuard implements CanActivate {
  constructor(private readonly tenant: TenantPrismaService) {}

  async canActivate(): Promise<boolean> {
    const ctx = RequestContext.get();
    if (!ctx?.membershipId || !ctx.schoolId) throw AppException.forbidden();
    const membership = await this.tenant.db.schoolMembership.findFirst({
      where: { id: ctx.membershipId, userId: ctx.userId, status: 'ACTIVE' },
      select: { roles: { select: { role: { select: { permissions: true, archivedAt: true } } } } },
    });
    if (!membership) throw AppException.forbidden();
    const granted = new Set(
      flattenPermissions(
        membership.roles.filter((r) => !r.role.archivedAt).map((r) => r.role.permissions),
      ),
    );
    if (!STAFF_READ_PERMISSIONS.some((p) => granted.has(p))) throw AppException.forbidden();
    return true;
  }
}

/** Read routes: `settings.users` or `academics.view`. */
export const CanReadStaff = () =>
  applyDecorators(
    UseGuards(StaffReadGuard),
    ApiBearerAuth(),
    ApiForbiddenResponse({ description: `Needs one of: ${STAFF_READ_PERMISSIONS.join(', ')}` }),
  );
