import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from './staff-records.service.js';

/** `SchoolAuditService.record` takes a plain transaction client; the tenant one has the same API. */
export const asAuditDb = (db: Db) =>
  db as unknown as Pick<Prisma.TransactionClient, 'auditEvent' | 'user'>;

const notices = new WeakMap<object, string>();

/**
 * Attaches the success message a result should answer with (what the screen's toast says), without
 * adding a field to the JSON. Controllers read it back with `noticeOf` in `@ResponseMessage`.
 */
export function withNotice<T extends object>(result: T, message: string): T {
  notices.set(result, message);
  return result;
}

export const noticeOf = (result: unknown, fallback: string): string =>
  (result !== null && typeof result === 'object' ? notices.get(result) : undefined) ?? fallback;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
