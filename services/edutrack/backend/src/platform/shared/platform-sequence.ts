import type { Prisma } from '../../generated/prisma/client.js';
import type { PlatformNumberKind } from '../../generated/prisma/enums.js';

/**
 * Takes the next platform-wide number atomically (an upsert that increments, so two requests
 * never get the same one). Run it inside the transaction that uses the number.
 */
export async function nextPlatformNumber(
  tx: Prisma.TransactionClient,
  kind: PlatformNumberKind,
  scope = '',
): Promise<number> {
  const row = await tx.platformSequence.upsert({
    where: { kind_scope: { kind, scope } },
    create: { kind, scope, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  return row.nextValue - 1;
}

/** `ET-2026-00042`. */
export const platformInvoiceNumber = (year: number, n: number) =>
  `ET-${year}-${String(n).padStart(5, '0')}`;
