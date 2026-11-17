import { Injectable } from '@nestjs/common';
import {
  flattenPermissions,
  type SchoolPermission,
} from '../../auth/permissions/school-permissions.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

/**
 * The signed-in member's school permissions, read live from their roles (as the guards do), for
 * rules inside a route: medical notes need `students.edit`, exits need `students.archive`.
 */
@Injectable()
export class MemberPermissions {
  constructor(private readonly tenant: TenantPrismaService) {}

  async granted(): Promise<Set<string>> {
    const ctx = RequestContext.get();
    if (!ctx?.membershipId) return new Set();
    const membership = await this.tenant.db.schoolMembership.findFirst({
      where: { id: ctx.membershipId, userId: ctx.userId, status: 'ACTIVE' },
      select: { roles: { select: { role: { select: { permissions: true, archivedAt: true } } } } },
    });
    return new Set(
      flattenPermissions(
        (membership?.roles ?? []).filter((r) => !r.role.archivedAt).map((r) => r.role.permissions),
      ),
    );
  }

  async has(permission: SchoolPermission): Promise<boolean> {
    return (await this.granted()).has(permission);
  }

  /** 403 unless the member has the permission. */
  async require(permission: SchoolPermission, message?: string): Promise<void> {
    if (!(await this.has(permission))) throw AppException.forbidden(message);
  }
}
