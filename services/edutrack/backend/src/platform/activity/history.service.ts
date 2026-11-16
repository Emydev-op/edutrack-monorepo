import { ApiPropertyOptional } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AppException } from '../../common/errors/app.exception.js';
import { PaginationQueryDto, paginated, toSkipTake } from '../../common/pagination/pagination.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toAuditEntry } from '../shared/audit-view.js';
import { addDays, formatStamp } from '../shared/format.js';
import { PLATFORM_AREA, type PlatformEntity } from '../shared/platform-audit.service.js';

export const HISTORY_ENTITIES: PlatformEntity[] = [
  'School',
  'Subscription',
  'User',
  'Issue',
  'Support session',
  'Plan',
  'Role',
  'Settings',
  'Invitation',
  'Audit',
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class HistoryQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Actor name, as listed by /platform/audit/actors' })
  @IsOptional()
  @MaxLength(120)
  @IsString()
  actor?: string;

  @ApiPropertyOptional({ enum: HISTORY_ENTITIES })
  @IsOptional()
  @IsIn(HISTORY_ENTITIES, { message: 'Unknown entity.' })
  entity?: PlatformEntity;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(120)
  @IsString()
  schoolName?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Inclusive, Lagos time' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'Use a YYYY-MM-DD date.' })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Inclusive, Lagos time' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'Use a YYYY-MM-DD date.' })
  dateTo?: string;
}

/** Midnight in Lagos (UTC+1, no daylight saving) at the start of a YYYY-MM-DD day. */
const lagosMidnight = (day: string) => new Date(`${day}T00:00:00+01:00`);

/**
 * The back office's activity feed and audit log: every back-office action (area `Platform`),
 * newest first, filtered by actor, entity, school and date.
 */
@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private where(
    query: HistoryQuery,
    searchFields: (q: string) => Prisma.AuditEventWhereInput[],
  ): Prisma.AuditEventWhereInput {
    const search = query.search?.trim();
    const from = query.dateFrom && lagosMidnight(query.dateFrom);
    const to = query.dateTo && addDays(lagosMidnight(query.dateTo), 1);
    return {
      area: PLATFORM_AREA,
      ...(query.actor && { actorName: query.actor }),
      ...(query.entity && { entityType: query.entity }),
      ...(query.schoolName && {
        school: { name: { equals: query.schoolName, mode: 'insensitive' } },
      }),
      ...((from || to) && {
        createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) },
      }),
      ...(search && { OR: searchFields(search) }),
    };
  }

  async activity(query: HistoryQuery) {
    const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });
    const where = this.where(query, (q) => [
      { summary: contains(q) },
      { actorName: contains(q) },
      { school: { name: contains(q) } },
    ]);
    const [rows, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        include: { school: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return paginated(
      rows.map((e) => ({
        id: e.id,
        when: formatStamp(e.createdAt),
        actor: e.actorName ?? 'EduTrack',
        summary: e.summary,
        schoolName: e.school?.name ?? '—',
        entity: e.entityType,
      })),
      total,
      query,
    );
  }

  async audit(query: HistoryQuery) {
    const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });
    const where = this.where(query, (q) => [
      { actorName: contains(q) },
      { action: contains(q) },
      { entityId: contains(q) },
    ]);
    const [rows, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return paginated(rows.map(toAuditEntry), total, query);
  }

  async entry(id: string) {
    const event = await this.prisma.auditEvent.findFirst({ where: { id, area: PLATFORM_AREA } });
    if (!event) throw AppException.notFound('That audit entry doesn’t exist.');
    return toAuditEntry(event);
  }

  /** Everyone who appears in the back-office trail, for the Actor filters. */
  async actors() {
    const rows = await this.prisma.auditEvent.findMany({
      where: { area: PLATFORM_AREA, actorName: { not: null } },
      distinct: ['actorName'],
      select: { actorName: true },
    });
    return rows.map((r) => r.actorName!).sort((a, b) => a.localeCompare(b));
  }
}
