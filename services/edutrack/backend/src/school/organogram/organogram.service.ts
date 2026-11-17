import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { auditDb, fullName, toTimeline, type TenantTx } from '../users/access.js';
import type { PositionDto } from './dto/organogram.dto.js';

export const POSITION_NOT_FOUND = 'This position doesn’t exist.';

const positionInclude = {
  holders: { include: { staff: true }, orderBy: { createdAt: 'asc' } },
  suggestedRoles: { include: { role: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PositionInclude;

type PositionRow = Prisma.PositionGetPayload<{ include: typeof positionInclude }>;

/** What the Setup Center's "Organogram & Roles" step shows and checks. */
export interface OrganogramStepState {
  /** Positions in the organogram. */
  positions: number;
  /** Positions nobody holds. */
  vacant: number;
  /** Roles (predefined and custom, not archived). */
  roles: number;
  /** The top position (the one with no parent) has at least one holder. */
  topHolder: boolean;
  /** The step was marked complete (`SetupStepState` 'organogram-roles' has `confirmedAt`). */
  confirmed: boolean;
}

/**
 * The school's organogram: positions, who reports to whom, holders, suggested roles and the
 * approvals each post gives. Exactly one position is at the top and the tree has no cycles.
 */
@Injectable()
export class OrganogramService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private view(p: PositionRow) {
    return {
      id: p.id,
      title: p.title,
      parentId: p.parentId,
      holderIds: p.holders.map((h) => h.staffId),
      holderNames: p.holders.map((h) => fullName(h.staff)),
      suggestedRoles: p.suggestedRoles.filter((r) => !r.role.archivedAt).map((r) => r.role.name),
      responsibilities: p.responsibilities,
      approvals: p.approvals,
    };
  }

  async chart() {
    const [positions, history] = await Promise.all([
      this.db.position.findMany({
        include: positionInclude,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.audit.history('Position'),
    ]);
    return {
      positions: positions.map((p) => this.view(p)),
      history: toTimeline(history, this.clock.now()),
    };
  }

  private async load(id: string) {
    const position = isUuid(id) ? await this.db.position.findFirst({ where: { id } }) : null;
    if (!position) throw AppException.notFound(POSITION_NOT_FOUND);
    return position;
  }

  /**
   * The setup step's facts, for the Setup endpoint ("12 positions · 1 vacant · 12 roles"). The
   * step can be completed when `positions >= 2 && topHolder`; `confirmed` is whether it was.
   */
  async organogramStepState(): Promise<OrganogramStepState> {
    const [positions, vacant, roles, top, step] = await Promise.all([
      this.db.position.count(),
      this.db.position.count({ where: { holders: { none: {} } } }),
      this.db.schoolRole.count({ where: { archivedAt: null } }),
      this.db.position.findFirst({
        where: { parentId: null },
        orderBy: { createdAt: 'asc' },
        select: { _count: { select: { holders: true } } },
      }),
      this.db.setupStepState.findFirst({
        where: { stepKey: 'organogram-roles' },
        select: { confirmedAt: true },
      }),
    ]);
    return {
      positions,
      vacant,
      roles,
      topHolder: (top?._count.holders ?? 0) > 0,
      confirmed: !!step?.confirmedAt,
    };
  }

  /** The mock's rules: unique title, one top, a real parent, no cycles, current staff, real roles. */
  private async validate(dto: PositionDto, currentId?: string) {
    const all = await this.db.position.findMany({
      select: { id: true, title: true, parentId: true },
    });
    const title = dto.title;
    if (all.some((x) => x.id !== currentId && x.title.toLowerCase() === title.toLowerCase()))
      throw AppException.validation({ title: 'This position already exists.' });
    const parentId = dto.parentId || null;
    if (!parentId && all.some((x) => !x.parentId && x.id !== currentId))
      throw AppException.validation({
        parentId: 'Only one position can be at the top. Choose who this reports to.',
      });
    if (parentId) {
      if (!all.some((x) => x.id === parentId))
        throw AppException.validation({ parentId: 'Choose who this position reports to.' });
      if (currentId) {
        const below = new Set<string>();
        const walk = (id: string) => {
          for (const p of all)
            if (p.parentId === id && !below.has(p.id)) {
              below.add(p.id);
              walk(p.id);
            }
        };
        walk(currentId);
        if (parentId === currentId || below.has(parentId))
          throw AppException.validation({
            parentId: 'A position can’t report to itself or to one of its own reports.',
          });
      }
    }
    const holderIds = [...new Set(dto.holderIds ?? [])];
    if (holderIds.some((id) => !isUuid(id)))
      throw AppException.validation({ holderIds: 'Holders must be current staff.' });
    if (holderIds.length) {
      const current = await this.db.staff.count({
        where: { id: { in: holderIds }, status: 'ACTIVE' },
      });
      if (current !== holderIds.length)
        throw AppException.validation({ holderIds: 'Holders must be current staff.' });
    }
    const names = [...new Set(dto.suggestedRoles ?? [])];
    const roles = names.length
      ? await this.db.schoolRole.findMany({
          where: { name: { in: names }, archivedAt: null },
          select: { id: true, name: true },
        })
      : [];
    if (roles.length !== names.length)
      throw AppException.validation({ suggestedRoles: 'One of those roles doesn’t exist.' });
    const roleIds = names.map((n) => roles.find((r) => r.name === n)!.id);
    return {
      title,
      parentId,
      holderIds,
      roleIds,
      responsibilities: dto.responsibilities ?? '',
      approvals: [...new Set(dto.approvals ?? [])],
      parentTitle: all.find((x) => x.id === parentId)?.title ?? 'top',
    };
  }

  private async get(id: string) {
    const p = await this.db.position.findFirstOrThrow({ where: { id }, include: positionInclude });
    return this.view(p);
  }

  async create(dto: PositionDto) {
    const v = await this.validate(dto);
    const schoolId = RequestContext.schoolId()!;
    const id = await this.db.$transaction(async (tx) => {
      const last = await tx.position.aggregate({ _max: { sortOrder: true } });
      const row = await tx.position.create({
        data: {
          schoolId,
          title: v.title,
          parentId: v.parentId,
          responsibilities: v.responsibilities,
          approvals: v.approvals,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      await this.setLinks(tx, schoolId, row.id, v.holderIds, v.roleIds);
      await this.audit.record(
        {
          action: 'position.create',
          area: 'Organogram',
          entity: 'Position',
          entityId: row.id,
          summary: `Added position · ${v.title}`,
          detail: `reports to ${v.parentTitle}`,
        },
        auditDb(tx),
      );
      return row.id;
    });
    return this.get(id);
  }

  private async setLinks(
    tx: TenantTx,
    schoolId: string,
    positionId: string,
    holderIds: string[],
    roleIds: string[],
  ) {
    await tx.positionHolder.deleteMany({ where: { positionId, staffId: { notIn: holderIds } } });
    await tx.positionHolder.createMany({
      data: holderIds.map((staffId) => ({ schoolId, positionId, staffId })),
      skipDuplicates: true,
    });
    await tx.positionSuggestedRole.deleteMany({
      where: { positionId, roleId: { notIn: roleIds } },
    });
    await tx.positionSuggestedRole.createMany({
      data: roleIds.map((roleId) => ({ schoolId, positionId, roleId })),
      skipDuplicates: true,
    });
  }

  async update(id: string, dto: PositionDto) {
    const position = await this.load(id);
    const v = await this.validate(dto, position.id);
    await this.db.$transaction(async (tx) => {
      await tx.position.update({
        where: { id: position.id },
        data: {
          title: v.title,
          parentId: v.parentId,
          responsibilities: v.responsibilities,
          approvals: v.approvals,
        },
      });
      await this.setLinks(tx, position.schoolId, position.id, v.holderIds, v.roleIds);
      await this.audit.record(
        {
          action: 'position.update',
          area: 'Organogram',
          entity: 'Position',
          entityId: position.id,
          summary: `Updated position · ${v.title}`,
          before: { title: position.title, parentId: position.parentId },
          after: { title: v.title, parentId: v.parentId },
        },
        auditDb(tx),
      );
    });
    return this.get(position.id);
  }

  async remove(id: string) {
    const position = await this.load(id);
    if (!position.parentId)
      throw AppException.conflict('The top position can’t be removed.', 'TOP_POSITION');
    const reports = await this.db.position.findMany({
      where: { parentId: position.id },
      select: { title: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (reports.length)
      throw AppException.conflict(
        `${reports.map((x) => x.title).join(', ')} report${reports.length === 1 ? 's' : ''} to ${position.title}. Move them first.`,
        'POSITION_HAS_REPORTS',
      );
    await this.db.$transaction(async (tx) => {
      await tx.position.delete({ where: { id: position.id } });
      await this.audit.record(
        {
          action: 'position.delete',
          area: 'Organogram',
          entity: 'Position',
          entityId: position.id,
          summary: `Removed position · ${position.title}`,
        },
        auditDb(tx),
      );
    });
    return { ok: true as const, title: position.title };
  }
}
