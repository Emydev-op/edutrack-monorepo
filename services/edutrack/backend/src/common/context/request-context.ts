import { AsyncLocalStorage } from 'node:async_hooks';
import type { Portal } from '../../generated/prisma/enums.js';

/** The school resolved from the request's Host (or the dev header), before anyone signs in. */
export interface HostSchool {
  id: string;
  slug: string;
  name: string;
}

/**
 * Everything the code under a request (or a job) needs to know about who is acting and for which
 * school. Set by middleware (requestId, host school) and the auth guard (user, session, school).
 */
export interface RequestContextState {
  requestId: string;
  ip?: string;
  userAgent?: string;
  /** School resolved from the Host subdomain / custom domain / dev header. */
  hostSchool?: HostSchool;
  /** A subdomain that looks like a school but matches none (404 on routes that need it). */
  unknownHostSlug?: string;
  userId?: string;
  sessionId?: string;
  portal?: Portal;
  /** The tenant every school-scoped query runs against. */
  schoolId?: string;
  membershipId?: string;
  /** Read-only platform support access to a school (audited). */
  supportSessionId?: string;
}

const storage = new AsyncLocalStorage<RequestContextState>();

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

/**
 * Prisma queries are lazy: they run when first awaited. A query returned from a context callback
 * and awaited outside it would run with no tenant, so thenables are started inside the context.
 */
function runIn<T>(state: RequestContextState, fn: () => T): T {
  return storage.run(state, () => {
    const result = fn();
    return (isThenable(result) ? Promise.resolve(result) : result) as T;
  });
}

/**
 * Request-scoped context backed by AsyncLocalStorage. Read it anywhere (services, Prisma
 * extension, logger) without passing it through every call.
 *
 * - `RequestContext.get()` returns the current state (or undefined outside a request/job).
 * - `RequestContext.run(state, fn)` starts a context (middleware, BullMQ processors, tests).
 * - `RequestContext.forSchool(schoolId, fn)` runs `fn` with a tenant set, e.g. in a job.
 */
export const RequestContext = {
  run<T>(state: RequestContextState, fn: () => T): T {
    return runIn(state, fn);
  },

  get(): RequestContextState | undefined {
    return storage.getStore();
  },

  /** Updates the current context in place (the auth guard fills in the signed-in user). */
  patch(values: Partial<RequestContextState>): void {
    const state = storage.getStore();
    if (!state) throw new Error('RequestContext.patch() called outside a request context');
    Object.assign(state, values);
  },

  /** The tenant of the current context, if any. */
  schoolId(): string | undefined {
    return storage.getStore()?.schoolId;
  },

  /** Runs `fn` in a child context bound to one school (jobs, scripts, tests). */
  forSchool<T>(schoolId: string, fn: () => T): T {
    const parent = storage.getStore();
    return runIn({ ...parent, requestId: parent?.requestId ?? 'job', schoolId }, fn);
  },
};
