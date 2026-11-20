import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { formatAgo } from '../../platform/shared/format.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { OfficeResultsService } from '../results/office-results.service.js';
import { SetupService } from '../setup/setup.service.js';

const LOCAL = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lagos',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
/** "2026-11-18T14:05" in Lagos time. */
const localStamp = (d: Date) => LOCAL.format(d).replace(', ', 'T');

/**
 * The signed-in person's notifications in this school (the header bell and Communication ›
 * Inbox), and the counts beside sidebar items. Notifications aren't tenant rows, so every query
 * filters by the user and the school explicitly.
 */
@Injectable()
export class SchoolInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly setup: SetupService,
    private readonly results: OfficeResultsService,
    private readonly clock: Clock,
  ) {}

  private mine(auth: AuthUserContext): Prisma.NotificationWhereInput {
    return { userId: auth.userId, schoolId: auth.schoolId! };
  }

  private item(n: {
    id: string;
    title: string;
    body: string;
    link: string | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: n.id,
      title: n.title,
      detail: n.body,
      when: formatAgo(n.createdAt, this.clock.now()),
      unread: !n.readAt,
      to: n.link ?? '/',
      at: localStamp(n.createdAt),
    };
  }

  /** The bell: the latest 20. */
  async latest(auth: AuthUserContext) {
    const rows = await this.prisma.notification.findMany({
      where: this.mine(auth),
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((n) => this.item(n));
  }

  async inbox(
    auth: AuthUserContext,
    q: { filter?: string; search?: string; page?: number; pageSize?: number },
  ) {
    const base = this.mine(auth);
    const needle = (q.search ?? '').trim();
    const where: Prisma.NotificationWhereInput = {
      ...base,
      ...(q.filter === 'unread' && { readAt: null }),
      ...(needle && {
        OR: [
          { title: { contains: needle, mode: 'insensitive' } },
          { body: { contains: needle, mode: 'insensitive' } },
        ],
      }),
    };
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 20, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const [rows, matching, unread, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...base, readAt: null } }),
      this.prisma.notification.count({ where: base }),
    ]);
    return {
      rows: rows.map((n) => this.item(n)),
      meta: {
        page,
        pageSize,
        total: matching,
        totalPages: Math.max(1, Math.ceil(matching / pageSize)),
      },
      unread,
      total,
    };
  }

  async read(auth: AuthUserContext, id: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...this.mine(auth), id },
      data: { readAt: this.clock.now() },
    });
    if (!count) throw AppException.notFound('Notification not found.', 'NOT_FOUND');
    return { ok: true };
  }

  async readAll(auth: AuthUserContext) {
    await this.prisma.notification.updateMany({
      where: { ...this.mine(auth), readAt: null },
      data: { readAt: this.clock.now() },
    });
    return { ok: true };
  }

  /** Sidebar counts, keyed by School Admin's route names. Only sections on the real API count. */
  async navCounts() {
    const [setup, support, results] = await Promise.all([
      this.setup.view(),
      this.tenant.db.supportTicket.count({
        where: { status: { in: ['WAITING_FOR_SCHOOL', 'RESOLVED'] } },
      }),
      this.results.waitingOnOffice().catch(() => 0),
    ]);
    return {
      setup: setup.finished ? 0 : setup.steps.filter((s) => s.required && !s.done).length,
      // Tickets waiting on the school's reply or confirmation.
      support,
      // Result sheets waiting on the academic office this term.
      results,
    };
  }
}
