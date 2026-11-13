import { Injectable } from '@nestjs/common';
import { RequestContext } from '../common/context/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { tenantScopeExtension } from './tenant-scope.js';

function createTenantClient(prisma: PrismaService) {
  return prisma.$extends(
    tenantScopeExtension({
      schoolId: () => RequestContext.get()?.schoolId,
      readOnly: () => Boolean(RequestContext.get()?.supportSessionId),
    }),
  );
}

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;

/**
 * The database client feature modules use. Every query on a model with `schoolId` is limited to
 * the current request's school (`RequestContext.schoolId`), and throws when there is none.
 *
 * ```ts
 * constructor(private readonly tenant: TenantPrismaService) {}
 * list() { return this.tenant.db.branch.findMany(); }          // this school's branches only
 * ```
 *
 * Jobs set the school explicitly: `RequestContext.forSchool(schoolId, () => this.tenant.db...)`.
 * Platform-wide code (back office, auth bootstrap, seed) uses `PrismaService` directly.
 */
@Injectable()
export class TenantPrismaService {
  readonly db: TenantPrismaClient;

  constructor(prisma: PrismaService) {
    this.db = createTenantClient(prisma);
  }
}
