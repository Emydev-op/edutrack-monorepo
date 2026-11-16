import type { Prisma } from '../../generated/prisma/client.js';
import type { StudentStatus } from '../../generated/prisma/enums.js';
import type { TenantPrismaClient } from '../../tenancy/tenant-prisma.service.js';
import { formatDay } from '../../platform/shared/format.js';
import type { HistoryEntry } from '../shared/school-audit.service.js';

/** Students counted as on the roll (a branch with any of these can't be deactivated). */
export const ON_ROLL: StudentStatus[] = ['ACTIVE', 'INCOMPLETE_PROFILE'];

/** Plans without a branch limit report this, so the screens' "x of y" still reads. */
export const UNLIMITED_BRANCHES = 999;

/** Audit history in the School Admin timeline shape (`when` instead of `at`). */
export const timeline = (entries: HistoryEntry[]) =>
  entries.map((e) => ({
    id: e.id,
    title: e.title,
    detail: e.detail,
    when: formatDay(new Date(e.at)),
  }));

/** `Mrs. Adaeze Okonkwo`. */
export const personName = (p: { title: string | null; firstName: string; lastName: string }) =>
  [p.title, p.firstName, p.lastName].filter(Boolean).join(' ');

/** Branch code prefix from the school's name: `Greenfield Academy` → `GA-`. */
export const codePrefix = (schoolName: string) =>
  `${schoolName
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 3)}-`;

export const STATUS_LABEL = { ACTIVE: 'Active', INACTIVE: 'Inactive' } as const;

export const ACCOUNT_LABEL = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
  REVOKED: 'Revoked',
} as const;

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The tenant client inside `this.tenant.db.$transaction(async (tx) => …)`. */
export type TenantTx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];

/** The same transaction typed for helpers written against the plain client (audit). */
export const plainTx = (tx: TenantTx) => tx as unknown as Prisma.TransactionClient;
