import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Back-office actions carry this area, so feeds can tell them from school-side events. */
export const PLATFORM_AREA = 'Platform';

/** Entities the back office's activity feed and audit log filter by. */
export type PlatformEntity =
  | 'School'
  | 'Subscription'
  | 'User'
  | 'Issue'
  | 'Support session'
  | 'Plan'
  | 'Role'
  | 'Settings'
  | 'Invitation'
  | 'Audit';

export interface PlatformAuditEntry {
  /** Dotted verb: school.suspend, plan.update, subscription.extend… */
  action: string;
  entity: PlatformEntity;
  entityId: string;
  /** One plain-language line for the activity feed. */
  summary: string;
  schoolId?: string | null;
  /** Shown as "Previous value" / "New value" in the audit log. */
  previous?: string | null;
  next?: string | null;
  /** Extra machine-readable state (e.g. the status before a suspension). */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

type Db = Pick<Prisma.TransactionClient, 'auditEvent' | 'user'>;

/**
 * Writes the append-only audit trail for back-office actions: who (the signed-in staff member, by
 * name at the time), what, before and after, from where (IP, device, request id).
 */
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: PlatformAuditEntry, db: Db = this.prisma): Promise<void> {
    const ctx = RequestContext.get();
    const actor = ctx?.userId
      ? await db.user.findUnique({
          where: { id: ctx.userId },
          select: { firstName: true, lastName: true },
        })
      : null;
    await db.auditEvent.create({
      data: {
        schoolId: entry.schoolId ?? null,
        actorKind: ctx?.userId ? 'PLATFORM_STAFF' : 'SYSTEM',
        actorUserId: ctx?.userId ?? null,
        actorName: actor ? `${actor.firstName} ${actor.lastName}` : 'EduTrack',
        action: entry.action,
        area: PLATFORM_AREA,
        entityType: entry.entity,
        entityId: entry.entityId,
        summary: entry.summary,
        before: { ...(entry.previous != null && { value: entry.previous }), ...entry.before },
        after: { ...(entry.next != null && { value: entry.next }), ...entry.after },
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });
  }
}
