import type { Channel as DbChannel, DeliveryStatus } from '../../generated/prisma/enums.js';
import type { TenantPrismaClient } from '../../tenancy/tenant-prisma.service.js';
import { CHANNELS, channelLabel, type Channel } from './comms-catalog.js';

export type DeliveryStatusLabel = 'Queued' | 'Sent' | 'Delivered' | 'Read' | 'Failed';

export const STATUS_LABEL: Record<DeliveryStatus, DeliveryStatusLabel> = {
  QUEUED: 'Queued',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  READ: 'Read',
  FAILED: 'Failed',
};
export const statusToDb = (s: string) => s.toUpperCase() as DeliveryStatus;

export interface ChannelStats {
  channel: Channel;
  recipients: number;
  delivered: number;
  read: number;
  queued: number;
  sent: number;
  failed: number;
}

const empty = (channel: Channel): ChannelStats => ({
  channel,
  recipients: 0,
  delivered: 0,
  read: 0,
  queued: 0,
  sent: 0,
  failed: 0,
});

/** Adds `n` deliveries in a status to a channel's counts. */
export function tally(s: ChannelStats, status: DeliveryStatus, n: number) {
  s.recipients += n;
  if (status === 'DELIVERED') s.delivered += n;
  else if (status === 'READ') {
    s.delivered += n;
    s.read += n;
  } else if (status === 'QUEUED') s.queued += n;
  else if (status === 'SENT') s.sent += n;
  else s.failed += n;
}

/** Per-channel counts for messages, from grouped deliveries. */
export function statsFrom(
  groups: {
    messageId: string;
    channel: DbChannel;
    status: DeliveryStatus;
    _count: { _all: number };
  }[],
) {
  const out = new Map<string, Map<Channel, ChannelStats>>();
  for (const g of groups) {
    const ch = channelLabel(g.channel);
    const byChannel = out.get(g.messageId) ?? new Map<Channel, ChannelStats>();
    const s = byChannel.get(ch) ?? empty(ch);
    tally(s, g.status, g._count._all);
    byChannel.set(ch, s);
    out.set(g.messageId, byChannel);
  }
  return (messageId: string) =>
    CHANNELS.map((c) => out.get(messageId)?.get(c)).filter((s): s is ChannelStats => !!s);
}

/** One message's per-channel counts. */
export async function channelStats(db: TenantPrismaClient, messageId: string) {
  const groups = await db.messageDelivery.groupBy({
    by: ['messageId', 'channel', 'status'],
    where: { messageId },
    _count: { _all: true },
  });
  return statsFrom(groups)(messageId);
}
