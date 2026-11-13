import { Prisma } from '../generated/prisma/client.js';
import {
  ReadOnlySupportSessionError,
  TenantContextError,
  TenantMismatchError,
} from './tenant.errors.js';

/**
 * Every model with a `schoolId` column, read from Prisma's generated scalar-field enums so a new
 * school-owned model is scoped the moment it is added to the schema.
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.values(Prisma.ModelName).filter((model) => {
    const fields = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[
      `${model}ScalarFieldEnum`
    ];
    return Boolean(fields && 'schoolId' in fields);
  }),
);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);
const UPDATE_DATA_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn', 'upsert']);
export const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

type Args = Record<string, unknown> | undefined;
type Data = Record<string, unknown>;

const toArray = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** Throws when a where clause names another school, directly or through a compound unique key. */
function assertWhereSchool(where: Data, schoolId: string, model: string, operation: string) {
  if (typeof where.schoolId === 'string' && where.schoolId !== schoolId)
    throw new TenantMismatchError(model, operation);
  for (const [key, value] of Object.entries(where)) {
    if (!key.startsWith('schoolId_') || !value || typeof value !== 'object') continue;
    const compound = (value as Data).schoolId;
    if (compound !== undefined && compound !== schoolId)
      throw new TenantMismatchError(model, operation);
  }
}

/** Sets or checks the tenant on data written by a create. */
function scopeCreateData(data: Data, schoolId: string, model: string, operation: string): Data {
  if (data.school !== undefined) {
    const connectId = (data.school as { connect?: { id?: unknown } }).connect?.id;
    if (connectId !== schoolId) throw new TenantMismatchError(model, operation);
    return data;
  }
  if (data.schoolId !== undefined && data.schoolId !== schoolId)
    throw new TenantMismatchError(model, operation);
  return { ...data, schoolId };
}

/** An update may never move a row to another school. */
function checkUpdateData(data: Data, schoolId: string, model: string, operation: string) {
  if (data.schoolId !== undefined && data.schoolId !== schoolId)
    throw new TenantMismatchError(model, operation);
  if (data.school !== undefined) throw new TenantMismatchError(model, operation);
}

/**
 * Rewrites a model operation's arguments so it can only touch rows of `schoolId`:
 * - reads, updates and deletes get `AND: [{ schoolId }]` (works for findUnique too: Prisma accepts
 *   extra filters next to the unique key);
 * - creates get `schoolId` set, and refuse another school's id;
 * - updates refuse to change `schoolId`;
 * - an explicit other `schoolId` anywhere at the top level throws `TenantMismatchError`.
 *
 * Nested writes and `include`s are not rewritten. They stay inside the tenant because every
 * school-owned relation is a composite (school_id, id) foreign key; see conventions.md.
 */
export function scopeArgs(model: string, operation: string, args: Args, schoolId: string): Data {
  if (!WHERE_OPERATIONS.has(operation) && !CREATE_OPERATIONS.has(operation))
    throw new TenantContextError(model, `${operation} (not supported by the tenant scope)`);
  const next: Data = { ...args };

  if (WHERE_OPERATIONS.has(operation)) {
    const where = (next.where ?? {}) as Data;
    assertWhereSchool(where, schoolId, model, operation);
    next.where = { ...where, AND: [...toArray(where.AND), { schoolId }] };
  }

  if (operation === 'upsert') {
    next.create = scopeCreateData((next.create ?? {}) as Data, schoolId, model, operation);
  } else if (CREATE_OPERATIONS.has(operation)) {
    const data = next.data;
    next.data = Array.isArray(data)
      ? data.map((row: Data) => scopeCreateData(row, schoolId, model, operation))
      : scopeCreateData((data ?? {}) as Data, schoolId, model, operation);
  }

  if (UPDATE_DATA_OPERATIONS.has(operation)) {
    const data = (operation === 'upsert' ? next.update : next.data) as Data | undefined;
    if (data) checkUpdateData(data, schoolId, model, operation);
  }
  return next;
}

export interface TenantScopeOptions {
  /** The tenant for the current call; undefined means "no tenant" and the query throws. */
  schoolId: () => string | undefined;
  /** True while a platform support session is acting: writes are refused (read-only access). */
  readOnly?: () => boolean;
}

/** The Prisma client extension behind `TenantPrismaService`. */
export function tenantScopeExtension(options: TenantScopeOptions) {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const schoolId = options.schoolId();
          if (!schoolId) throw new TenantContextError(model, operation);
          if (options.readOnly?.() && WRITE_OPERATIONS.has(operation))
            throw new ReadOnlySupportSessionError(model, operation);
          return query(scopeArgs(model, operation, args as Args, schoolId) as typeof args);
        },
      },
    },
  });
}
