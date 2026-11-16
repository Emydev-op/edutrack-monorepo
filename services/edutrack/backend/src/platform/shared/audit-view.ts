import { deviceLabel } from '../../auth/tokens.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { formatStamp } from './format.js';

/** How back-office timelines and audit tables show audit events. */

const TONE_BY_VERB: [RegExp, 'success' | 'warning' | 'error' | 'info' | 'neutral'][] = [
  [/(reactivate|renew|publish|restore|accept)/, 'success'],
  [/(suspend|restrict|cancel|delete)/, 'error'],
  [/(grace|extend|expir)/, 'warning'],
  [/(create|provision|invite|resend)/, 'neutral'],
];
export const toneOf = (action: string) =>
  TONE_BY_VERB.find(([re]) => re.test(action))?.[1] ?? 'info';

export const valueOf = (json: Prisma.JsonValue | null): string => {
  const value = (json as { value?: unknown } | null)?.value;
  if (value === undefined || value === null || value === '') return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
};

/** An audit event as the back office's audit tables show it. */
export function toAuditEntry(e: {
  id: string;
  createdAt: Date;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}) {
  return {
    id: e.id,
    timestamp: formatStamp(e.createdAt),
    actor: e.actorName ?? 'EduTrack',
    action: e.action,
    entity: e.entityType,
    entityId: e.entityId ?? '—',
    previousValue: valueOf(e.before),
    newValue: valueOf(e.after),
    ipDevice: e.ip ? `${e.ip} · ${deviceLabel(e.userAgent ?? undefined)}` : '—',
    requestId: e.requestId ?? '—',
  };
}
