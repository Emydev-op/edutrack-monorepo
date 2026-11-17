import { Injectable } from '@nestjs/common';
import { PREDEFINED_SCHOOL_ROLES } from '../../auth/permissions/school-permissions.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { SchoolRole } from '../../generated/prisma/client.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import {
  auditDb,
  cleanPermissions,
  grants,
  ROLE_SCOPE_LABEL,
  ROLE_TYPE_LABEL,
  roleScopeOf,
} from './access.js';
import type { RoleDto } from './dto/users.dto.js';

export const ROLE_NOT_FOUND = 'This role doesn’t exist.';

const PREDEFINED_ORDER = PREDEFINED_SCHOOL_ROLES.map((r) => r.key);

/**
 * Settings › Roles. Predefined roles (copied into every school) are locked; custom roles can be
 * created, edited and deleted. Role names are what the Users screens send and show.
 */
@Injectable()
export class SchoolRolesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /** People holding each role (revoked invitations aren't counted). */
  private async counts(roleIds?: string[]) {
    const rows = await this.db.membershipRole.groupBy({
      by: ['roleId'],
      where: {
        ...(roleIds && { roleId: { in: roleIds } }),
        membership: { kind: 'STAFF', status: { not: 'REVOKED' } },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.roleId, r._count._all]));
  }

  private view(r: SchoolRole, users: number) {
    return {
      id: r.id,
      name: r.name,
      type: ROLE_TYPE_LABEL[r.type],
      scope: ROLE_SCOPE_LABEL[r.scope],
      description: r.description,
      permissions: cleanPermissions(r.permissions),
      users,
    };
  }

  private async load(id: string) {
    const role = isUuid(id)
      ? await this.db.schoolRole.findFirst({ where: { id, archivedAt: null } })
      : null;
    if (!role) throw AppException.notFound(ROLE_NOT_FOUND);
    return role;
  }

  async list() {
    const roles = await this.db.schoolRole.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const counts = await this.counts();
    const rank = (r: SchoolRole) => {
      const i = r.key ? PREDEFINED_ORDER.indexOf(r.key) : -1;
      return i === -1 ? PREDEFINED_ORDER.length : i;
    };
    return roles
      .sort((a, b) => rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => this.view(r, counts.get(r.id) ?? 0));
  }

  async get(id: string) {
    const role = await this.load(id);
    return this.view(role, (await this.counts([role.id])).get(role.id) ?? 0);
  }

  private async validate(dto: RoleDto, currentId?: string) {
    const taken = await this.db.schoolRole.findFirst({
      where: {
        name: { equals: dto.name, mode: 'insensitive' },
        ...(currentId && { id: { not: currentId } }),
      },
      select: { id: true },
    });
    if (taken) throw AppException.validation({ name: 'A role with this name already exists.' });
    const permissions = cleanPermissions(dto.permissions);
    if (!Object.keys(permissions).length)
      throw AppException.validation({ permissions: 'Give the role at least one permission.' });
    return { name: dto.name, scope: roleScopeOf(dto.scope)!, permissions };
  }

  async create(dto: RoleDto) {
    const { name, scope, permissions } = await this.validate(dto);
    const role = await this.db.$transaction(async (tx) => {
      const row = await tx.schoolRole.create({
        data: {
          schoolId: RequestContext.schoolId()!,
          name,
          type: 'CUSTOM',
          scope,
          description: dto.description ?? '',
          permissions,
        },
      });
      await this.audit.record(
        {
          action: 'role.create',
          area: 'Users',
          entity: 'Role',
          entityId: row.id,
          summary: `Created role · ${name}`,
          detail: `${Object.values(permissions).flat().length} permissions`,
          after: { name, scope: dto.scope, permissions },
        },
        auditDb(tx),
      );
      return row;
    });
    return this.view(role, 0);
  }

  async update(id: string, dto: RoleDto) {
    const role = await this.load(id);
    if (role.type === 'PREDEFINED')
      throw AppException.conflict(
        'Predefined roles can’t be edited. Duplicate it to make a custom version.',
        'ROLE_LOCKED',
      );
    const { name, scope, permissions } = await this.validate(dto, role.id);

    // Editing a role you hold must not take away your own access to roles.
    const ctx = RequestContext.get();
    const mine = await this.db.membershipRole.findMany({
      where: { membershipId: ctx?.membershipId ?? '', role: { archivedAt: null } },
      select: { roleId: true, role: { select: { permissions: true } } },
    });
    if (mine.some((r) => r.roleId === role.id)) {
      const after = mine.map((r) => (r.roleId === role.id ? permissions : r.role.permissions));
      if (!grants(after, 'settings.roles'))
        throw AppException.conflict(
          'This change would remove your own access to roles.',
          'SELF_LOCKOUT',
        );
    }

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.schoolRole.update({
        where: { id: role.id },
        data: { name, scope, description: dto.description ?? '', permissions },
      });
      await this.audit.record(
        {
          action: 'role.update',
          area: 'Users',
          entity: 'Role',
          entityId: role.id,
          summary: `Updated role · ${name}`,
          before: {
            name: role.name,
            scope: ROLE_SCOPE_LABEL[role.scope],
            permissions: cleanPermissions(role.permissions),
          },
          after: { name, scope: dto.scope, permissions },
        },
        auditDb(tx),
      );
      return row;
    });
    return this.view(updated, (await this.counts([role.id])).get(role.id) ?? 0);
  }

  async remove(id: string) {
    const role = await this.load(id);
    if (role.type === 'PREDEFINED')
      throw AppException.conflict('Predefined roles can’t be deleted.', 'ROLE_LOCKED');
    const holders = (await this.counts([role.id])).get(role.id) ?? 0;
    if (holders)
      throw AppException.conflict(
        `${holders} user${holders > 1 ? 's have' : ' has'} this role. Remove it from them first.`,
        'ROLE_IN_USE',
      );
    await this.db.$transaction(async (tx) => {
      // Revoked invitations may still list it; position suggestions go with the role.
      await tx.membershipRole.deleteMany({ where: { roleId: role.id } });
      await tx.schoolRole.delete({ where: { id: role.id } });
      await this.audit.record(
        {
          action: 'role.delete',
          area: 'Users',
          entity: 'Role',
          entityId: role.id,
          summary: `Deleted role · ${role.name}`,
          before: { name: role.name, permissions: cleanPermissions(role.permissions) },
        },
        auditDb(tx),
      );
    });
    return { ok: true as const, name: role.name };
  }
}
