import { Injectable } from '@nestjs/common';
import {
  PLATFORM_PERMISSION_ACTIONS,
  PLATFORM_PERMISSION_AREAS,
  PREDEFINED_PLATFORM_ROLES,
} from '../../auth/permissions/platform-permissions.js';
import { AppException } from '../../common/errors/app.exception.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PlatformAuditService } from '../shared/platform-audit.service.js';
import { ROLE_NOT_FOUND, roleRef, roleWhere, unprocessable } from '../shared/staff.js';
import type { CreateRoleDto } from './dto/users.dto.js';

const PREDEFINED_ORDER = PREDEFINED_PLATFORM_ROLES.map((r) => r.key as string);
const AREAS = new Set<string>(PLATFORM_PERMISSION_AREAS);
const ACTIONS = new Set<string>(PLATFORM_PERMISSION_ACTIONS);

/** Platform roles: predefined ones (fixed) and custom ones built in the role editor. */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list() {
    const roles = await this.prisma.platformRole.findMany({
      include: { _count: { select: { staff: { where: { status: { not: 'DEACTIVATED' } } } } } },
    });
    const rank = (r: { key: string | null }) => {
      const i = r.key ? PREDEFINED_ORDER.indexOf(r.key) : -1;
      return i === -1 ? PREDEFINED_ORDER.length : i;
    };
    roles.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return roles.map((r) => this.view(r, r._count.staff));
  }

  private view(
    r: {
      id: string;
      key: string | null;
      name: string;
      description: string;
      permissions: Prisma.JsonValue;
      predefined: boolean;
    },
    activeUsers: number,
  ) {
    return {
      id: roleRef(r),
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      predefined: r.predefined,
      activeUsers,
    };
  }

  /** Keeps known areas and actions only, in the editor's order. Empty areas are dropped. */
  private permissionSet(input: Record<string, unknown>) {
    const out: Record<string, string[]> = {};
    for (const [area, actions] of Object.entries(input)) {
      if (!AREAS.has(area)) throw unprocessable(`Unknown permission area: ${area}.`);
      if (!Array.isArray(actions)) throw unprocessable(`List the ${area} permissions.`);
      for (const action of actions)
        if (typeof action !== 'string' || !ACTIONS.has(action))
          throw unprocessable(`Unknown permission: ${area}.${String(action)}.`);
      const chosen = PLATFORM_PERMISSION_ACTIONS.filter((a) => actions.includes(a));
      if (chosen.length) out[area] = chosen;
    }
    if (Object.keys(out).length === 0) throw unprocessable('Choose at least one permission.');
    return Object.fromEntries(
      PLATFORM_PERMISSION_AREAS.filter((a) => out[a]).map((a) => [a, out[a]!]),
    );
  }

  async create(dto: CreateRoleDto) {
    const permissions = this.permissionSet(dto.permissions);
    const taken = await this.prisma.platformRole.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
      select: { id: true },
    });
    const conflict = () =>
      AppException.conflict('A role with this name already exists.', 'ROLE_NAME_TAKEN');
    if (taken) throw conflict();
    const count = Object.values(permissions).reduce((n, list) => n + list.length, 0);
    try {
      const role = await this.prisma.$transaction(async (tx) => {
        const created = await tx.platformRole.create({
          data: { name: dto.name, description: dto.description || 'Custom role', permissions },
        });
        await this.audit.record(
          {
            action: 'role.create',
            entity: 'Role',
            entityId: created.id,
            summary: `Role created · ${dto.name}`,
            next: `${count} permission${count === 1 ? '' : 's'}`,
            after: { permissions },
          },
          tx,
        );
        return created;
      });
      return this.view(role, 0);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw conflict();
      throw error;
    }
  }

  async remove(ref: string) {
    const role = await this.prisma.platformRole.findUnique({
      where: roleWhere(ref),
      include: { staff: { select: { status: true } } },
    });
    if (!role) throw AppException.notFound(ROLE_NOT_FOUND);
    if (role.predefined)
      throw AppException.conflict('Predefined roles can’t be deleted.', 'ROLE_PREDEFINED');
    if (role.staff.length)
      throw AppException.conflict(
        role.staff.some((s) => s.status !== 'DEACTIVATED')
          ? 'Users still have this role. Move them to another role first.'
          : 'Deactivated users still have this role. Move them to another role first.',
        'ROLE_IN_USE',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.platformRole.delete({ where: { id: role.id } });
      await this.audit.record(
        {
          action: 'role.delete',
          entity: 'Role',
          entityId: role.id,
          summary: `Role deleted · ${role.name}`,
          previous: role.name,
          before: { permissions: role.permissions },
        },
        tx,
      );
    });
    return { ok: true };
  }
}
