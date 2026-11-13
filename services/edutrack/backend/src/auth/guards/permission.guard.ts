import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PLATFORM_ONLY, REQUIRED_PERMISSIONS } from '../decorators/auth.decorators.js';
import { flattenPermissions } from '../permissions/school-permissions.js';

/**
 * Global guard after `AccessTokenGuard`: enforces `@RequirePermission(...)` against the current
 * membership's (non-archived) roles and `@PlatformOnly(...)` against the platform staff role.
 * Permissions are read on every request, so a role change applies at once.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const school = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS,
      targets,
    );
    const platform = this.reflector.getAllAndOverride<string[] | undefined>(PLATFORM_ONLY, targets);
    if (!school && !platform) return true;
    const ctx = RequestContext.get();

    if (school) {
      if (!ctx?.membershipId || !ctx.schoolId) throw AppException.forbidden();
      const membership = await this.prisma.schoolMembership.findFirst({
        where: {
          id: ctx.membershipId,
          schoolId: ctx.schoolId,
          userId: ctx.userId,
          status: 'ACTIVE',
        },
        select: {
          roles: { select: { role: { select: { permissions: true, archivedAt: true } } } },
        },
      });
      if (!membership) throw AppException.forbidden();
      const granted = new Set(
        flattenPermissions(
          membership.roles.filter((r) => !r.role.archivedAt).map((r) => r.role.permissions),
        ),
      );
      if (!school.every((p) => granted.has(p))) throw AppException.forbidden();
    }

    if (platform) {
      if (ctx?.portal !== 'PLATFORM' || !ctx.userId)
        throw AppException.forbidden('Platform staff only.', 'PLATFORM_ONLY');
      const staff = await this.prisma.platformStaff.findUnique({
        where: { userId: ctx.userId },
        select: { status: true, role: { select: { permissions: true } } },
      });
      if (!staff || staff.status !== 'ACTIVE')
        throw AppException.forbidden('Platform staff only.', 'PLATFORM_ONLY');
      const granted = new Set(flattenPermissions([staff.role.permissions]));
      if (!platform.every((p) => granted.has(p))) throw AppException.forbidden();
    }
    return true;
  }
}
