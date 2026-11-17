import type { Prisma } from '../../generated/prisma/client.js';
import type { TenantPrismaClient } from '../../tenancy/tenant-prisma.service.js';

/** The client inside `TenantPrismaService.db.$transaction(async (tx) => …)`. */
export type TenantTx = Omit<
  TenantPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/**
 * The tenant transaction client typed as Prisma's plain `TransactionClient`, for helpers that take
 * one (`SchoolAuditService.record(entry, asTx(tx))`). Same object, still tenant-scoped.
 */
export const asTx = (tx: TenantTx) => tx as unknown as Prisma.TransactionClient;
