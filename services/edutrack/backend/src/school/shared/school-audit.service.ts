import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PLATFORM_AREA } from '../../platform/shared/platform-audit.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

/** Change-history areas (Settings › History groups by these) and module names. */
export type SchoolAuditArea =
  'School' | 'Branches' | 'Organogram' | 'Users' | 'Staff' | 'Academic' | 'Setup';

export interface SchoolAuditEntry {
  /** Dotted verb: branch.create, staff.deactivate, profile.update… */
  action: string;
  area: SchoolAuditArea;
  /** Record type shown in timelines: 'Branch', 'Staff', 'Position', 'User', 'School'… */
  entity: string;
  entityId?: string | null;
  /** One plain-language line: "Lekki Campus added". */
  summary: string;
  /** Optional second line ("Address and sections updated"). */
  detail?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

type Db = Pick<Prisma.TransactionClient, 'auditEvent' | 'user'>;

/** One line of a record's history, as the School Admin timelines show it. */
export interface HistoryEntry {
  id: string;
  title: string;
  /** "Adaeze Okonkwo · Address and sections updated". */
  detail: string;
  at: string;
}

/**
 * The append-only audit trail for school-side changes. Runs in the signed-in school (the tenant
 * client stamps `schoolId`), records who did it by name at the time, and where from. Pass the
 * transaction client when the change itself runs in a transaction, so both commit together.
 */
@Injectable()
export class SchoolAuditService {
  constructor(private readonly tenant: TenantPrismaService) {}

  async record(entry: SchoolAuditEntry, db: Db = this.tenant.db as unknown as Db): Promise<void> {
    const ctx = RequestContext.get();
    const actor = ctx?.userId
      ? await db.user.findUnique({
          where: { id: ctx.userId },
          select: { firstName: true, lastName: true },
        })
      : null;
    await db.auditEvent.create({
      data: {
        schoolId: ctx?.schoolId ?? null,
        actorKind: ctx?.supportSessionId ? 'PLATFORM_STAFF' : ctx?.userId ? 'USER' : 'SYSTEM',
        actorUserId: ctx?.userId ?? null,
        actorName: actor ? `${actor.firstName} ${actor.lastName}` : 'EduTrack',
        action: entry.action,
        area: entry.area,
        entityType: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        detail: entry.detail ?? null,
        before: entry.before as Prisma.InputJsonValue | undefined,
        after: entry.after as Prisma.InputJsonValue | undefined,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        requestId: ctx?.requestId ?? null,
        supportSessionId: ctx?.supportSessionId ?? null,
      },
    });
  }

  /**
   * A record's history, newest first (`entityId` omitted: every event of that type). School-side
   * changes only: the back office's actions on the school (suspend, plan changes…) are left out.
   */
  async history(entity: string, entityId?: string, take = 50): Promise<HistoryEntry[]> {
    const events = await this.tenant.db.auditEvent.findMany({
      where: {
        entityType: entity,
        ...(entityId && { entityId }),
        OR: [{ area: null }, { area: { not: PLATFORM_AREA } }],
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return events.map((e) => ({
      id: e.id,
      title: e.summary,
      detail: [e.actorName ?? 'EduTrack', e.detail].filter(Boolean).join(' · '),
      at: e.createdAt.toISOString(),
    }));
  }
}
