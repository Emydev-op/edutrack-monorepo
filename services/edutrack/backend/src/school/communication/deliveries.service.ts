import { HttpStatus, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { RecipientRole } from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import {
  CHANNELS,
  channelLabel,
  channelToDb,
  eventDef,
  eventFromDb,
  eventToDb,
  render,
  smsSafe,
  type Channel,
  type ChannelTemplate,
} from './comms-catalog.js';
import { CommsDispatchService } from './comms-dispatch.service.js';
import { STATUS_LABEL, statsFrom, statusToDb, type ChannelStats } from './comms-stats.js';
import { atLabel, localDay, localStamp } from './comms-time.js';
import type { DeliveryDetailQuery, DeliveryQuery } from './dto/comms.dto.js';
import { SmsLedgerService } from './sms-ledger.service.js';

const count = (n: number) => n.toLocaleString('en-NG');
const ROLE_NOUN: Record<RecipientRole, string> = {
  PARENT: 'parents',
  STUDENT: 'students',
  TEACHER: 'teachers',
  STAFF: 'staff',
};
const ROLE_LABEL: Record<RecipientRole, string> = {
  PARENT: 'Parent',
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  STAFF: 'Staff',
};
/** Retryable: failed on the transport or for lack of units (not a missing or wrong contact). */
const RETRYABLE: Prisma.MessageDeliveryWhereInput = {
  status: 'FAILED',
  retryable: true,
  channel: { in: ['EMAIL', 'SMS'] },
};

/** Where a message came from, in School Admin. */
function sourceOf(m: { sourceType: string | null; sourceId: string | null }) {
  if (!m.sourceType || !m.sourceId) return null;
  switch (m.sourceType) {
    case 'Announcement':
      return { label: 'Announcement', to: `/communication/announcements/${m.sourceId}` };
    case 'AttendanceRegister':
      return { label: 'Class register', to: '/academics/attendance' };
    case 'ResultPublication':
      return { label: 'Results', to: '/academics/results' };
    default:
      return null;
  }
}

/**
 * Communication › Delivery logs: every message the school sent (announcements and automatic
 * ones), one row per message and channel, with each recipient's outcome; failed email and SMS
 * can be sent again.
 */
@Injectable()
export class DeliveriesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly dispatch: CommsDispatchService,
    private readonly ledger: SmsLedgerService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private async names(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    if (!wanted.length) return new Map<string, string>();
    const users = await this.db.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  }

  async list(q: DeliveryQuery) {
    const needle = (q.search ?? '').trim();
    const event = q.event ? eventDef(q.event) : null;
    const messages =
      q.event && !event
        ? []
        : await this.db.message.findMany({
            where: {
              purgedAt: null,
              ...(event && { event: eventToDb(event.key) }),
              ...(q.channel && { channels: { has: channelToDb(q.channel as Channel) } }),
              ...(needle && {
                OR: [
                  { title: { contains: needle, mode: 'insensitive' } },
                  { audienceLabel: { contains: needle, mode: 'insensitive' } },
                ],
              }),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 2000,
          });
    const ids = messages.map((m) => m.id);
    const [groups, roles, singles] = await Promise.all([
      ids.length
        ? this.db.messageDelivery.groupBy({
            by: ['messageId', 'channel', 'status'],
            where: { messageId: { in: ids } },
            _count: { _all: true },
          })
        : [],
      ids.length
        ? this.db.messageRecipient.groupBy({
            by: ['messageId', 'role'],
            where: { messageId: { in: ids } },
            _count: { _all: true },
          })
        : [],
      this.db.messageDelivery.findMany({
        where: {
          messageId: { in: messages.filter((m) => m.recipientCount === 1).map((m) => m.id) },
        },
        include: { recipient: { select: { name: true } } },
      }),
    ]);
    const stats = statsFrom(groups);
    const now = this.clock.now();
    const rows = messages.flatMap((m) =>
      stats(m.id).map((s) => {
        const single =
          s.recipients === 1
            ? singles.find((d) => d.messageId === m.id && channelLabel(d.channel) === s.channel)
            : null;
        const roleSet = roles.filter((r) => r.messageId === m.id).map((r) => r.role);
        const key = eventFromDb(m.event);
        return {
          id: `${m.id}~${s.channel}`,
          messageId: m.id,
          title: m.title,
          event: key,
          eventLabel: eventDef(key)?.label ?? key,
          recipient: single
            ? single.recipient.name
            : `${count(s.recipients)} ${roleSet.length === 1 ? ROLE_NOUN[roleSet[0]!] : 'recipients'}`,
          recipients: s.recipients,
          channel: s.channel,
          status: single ? STATUS_LABEL[single.status] : aggregateStatus(s),
          failed: s.failed,
          detail: single ? single.detail : aggregateDetail(s),
          at: localStamp(m.createdAt),
          atLabel: atLabel(m.createdAt, now),
        };
      }),
    );
    const filtered = rows.filter(
      (r) =>
        (!q.channel || r.channel === q.channel) &&
        (!q.status || (q.status === 'Failed' ? r.failed > 0 : r.status === q.status)),
    );
    const total = filtered.length;
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const todayStart = new Date(`${localDay(now)}T00:00:00.000+01:00`);
    const [today, week, retryable, queued] = await Promise.all([
      this.db.messageDelivery.count({ where: { createdAt: { gte: todayStart } } }),
      this.db.messageDelivery.groupBy({
        by: ['status'],
        where: { createdAt: { gte: weekAgo } },
        _count: { _all: true },
      }),
      this.db.messageDelivery.count({ where: RETRYABLE }),
      this.db.messageDelivery.count({ where: { status: 'QUEUED' } }),
    ]);
    let ok = 0;
    let attempted = 0;
    let failed = 0;
    for (const g of week) {
      if (g.status !== 'QUEUED') attempted += g._count._all;
      if (g.status !== 'QUEUED' && g.status !== 'FAILED') ok += g._count._all;
      if (g.status === 'FAILED') failed += g._count._all;
    }
    return {
      rows: filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
      summary: {
        today,
        deliveredRate: attempted ? Math.round((ok / attempted) * 1000) / 10 : null,
        failed,
        retryable,
        queued,
      },
    };
  }

  private async message(id: string) {
    const m = await this.db.message.findFirst({ where: { id } });
    if (!m) throw AppException.notFound('Message not found');
    return m;
  }

  async detail(id: string, q: DeliveryDetailQuery) {
    const m = await this.message(id);
    const recipients = await this.db.messageRecipient.findMany({
      where: { messageId: id },
      include: { deliveries: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const channel = q.channel ? channelToDb(q.channel as Channel) : null;
    const status = q.status ? statusToDb(q.status) : null;
    const needle = (q.search ?? '').trim().toLowerCase();
    const rows = recipients
      .map((r) => ({
        key: r.id,
        name: r.name,
        role: ROLE_LABEL[r.role],
        outcomes: CHANNELS.flatMap((label) => {
          const d = r.deliveries.find((x) => channelLabel(x.channel) === label);
          if (!d) return [];
          const retryable = d.retryable && d.status === 'FAILED';
          return [
            {
              channel: label,
              address: d.address,
              status: STATUS_LABEL[d.status],
              detail: d.detail,
              retryable,
              fix:
                d.status === 'FAILED' && !retryable && label !== 'In-app'
                  ? r.guardianId
                    ? `/students/parents/${r.guardianId}`
                    : r.staffId
                      ? `/staff/${r.staffId}`
                      : null
                  : null,
            },
          ];
        }),
        _deliveries: r.deliveries,
      }))
      .filter(
        (row) =>
          (!channel || row._deliveries.some((d) => d.channel === channel)) &&
          (!status ||
            row._deliveries.some(
              (d) => (!channel || d.channel === channel) && d.status === status,
            )) &&
          (!needle ||
            `${row.name} ${row.outcomes.map((o) => o.address).join(' ')}`
              .toLowerCase()
              .includes(needle)),
      )
      .map(({ _deliveries: _d, ...row }) => row);
    const total = rows.length;
    const groups = await this.db.messageDelivery.groupBy({
      by: ['messageId', 'channel', 'status'],
      where: { messageId: id },
      _count: { _all: true },
    });
    const retryable = await this.db.messageDelivery.count({
      where: { messageId: id, ...RETRYABLE },
    });
    const names = await this.names([m.createdById]);
    const key = eventFromDb(m.event);
    const content = (m.content ?? {}) as Partial<Record<Channel, ChannelTemplate>>;
    const vars = (recipients[0]?.variables ?? {}) as Record<string, string>;
    const channels = m.channels.map(channelLabel);
    return {
      id: m.id,
      title: m.title,
      event: key,
      eventLabel: eventDef(key)?.label ?? key,
      by: names.get(m.createdById ?? '') ?? 'EduTrack',
      at: localStamp(m.createdAt),
      atLabel: atLabel(m.createdAt, this.clock.now()),
      audience: m.audienceLabel,
      sender: m.sender,
      source: sourceOf(m),
      stats: statsFrom(groups)(m.id),
      smsUnits: m.smsUnits,
      retryable,
      content: CHANNELS.filter((c) => channels.includes(c)).map((c) => {
        const t = content[c] ?? { subject: '', body: '' };
        const body = render(t.body, vars);
        return {
          channel: c,
          subject: render(t.subject, vars),
          body: c === 'SMS' ? smsSafe(body) : body,
        };
      }),
      rows: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  private async afterRetry(retried: number) {
    const schoolId = RequestContext.schoolId()!;
    const [stillFailed, settings] = await Promise.all([
      this.db.messageDelivery.count({ where: RETRYABLE }),
      this.ledger.read(this.db as unknown as Prisma.TransactionClient, schoolId),
    ]);
    return { retried, stillFailed, credit: settings.smsBalanceUnits };
  }

  async retry(id: string) {
    await this.message(id);
    const { retried, flush } = await this.dispatch.resend({ messageId: id, ...RETRYABLE });
    if (!retried)
      throw new AppException(
        HttpStatus.CONFLICT,
        'Nothing here can be retried. Fix the contact details shown, then send again.',
        'NOTHING_TO_RETRY',
      );
    await flush();
    const r = await this.afterRetry(retried);
    return {
      ...r,
      stillFailed: await this.db.messageDelivery.count({ where: { messageId: id, ...RETRYABLE } }),
    };
  }

  async retryFailed() {
    const { retried, flush } = await this.dispatch.resend(RETRYABLE);
    if (!retried)
      throw new AppException(
        HttpStatus.CONFLICT,
        'There are no failed messages that can be retried.',
        'NOTHING_TO_RETRY',
      );
    await flush();
    return this.afterRetry(retried);
  }
}

function aggregateStatus(s: ChannelStats) {
  return s.failed === s.recipients
    ? 'Failed'
    : s.queued === s.recipients
      ? 'Queued'
      : s.sent
        ? 'Sent'
        : s.read === s.recipients
          ? 'Read'
          : 'Delivered';
}

function aggregateDetail(s: ChannelStats) {
  return [
    s.failed && `${count(s.failed)} of ${count(s.recipients)} failed`,
    s.queued && `${count(s.queued)} queued`,
    s.sent && `${count(s.sent)} handed to the ${s.channel === 'SMS' ? 'SMS' : 'email'} provider`,
    s.read &&
      s.channel !== 'SMS' &&
      `${count(s.read)} ${s.channel === 'Email' ? 'opened' : 'read'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
