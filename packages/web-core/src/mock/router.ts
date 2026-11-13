export interface MockRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  /** Request headers, lower-cased (e.g. `authorization`), for handlers that need the caller. */
  headers: Record<string, string>;
}

type Handler = (req: MockRequest) => unknown;
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** An error the mock API answers with, shaped like the NestJS error body. */
export class MockHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    /** Per-field messages for 422s, sent as `fields` in the body (e.g. `{ reason: 'Too short' }`). */
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

interface Route {
  method: Method;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const routes: Route[] = [];

function compile(path: string) {
  const keys: string[] = [];
  const source = path.replace(/:([A-Za-z]+)/g, (_, key: string) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { pattern: new RegExp(`^${source}$`), keys };
}

function register(method: Method) {
  return (path: string, handler: Handler) => routes.push({ method, ...compile(path), handler });
}

export const mock = {
  get: register('get'),
  post: register('post'),
  patch: register('patch'),
  put: register('put'),
  delete: register('delete'),
};

export function resolve(method: string, path: string) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    const params = Object.fromEntries(
      route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1]!)]),
    );
    return { handler: route.handler, params };
  }
  return null;
}

/** Applies search + pagination the way list endpoints will on the server. */
export function paginate<T>(
  rows: T[],
  query: Record<string, string>,
  searchable: (row: T) => string,
) {
  const search = (query.search ?? '').trim().toLowerCase();
  const filtered = search
    ? rows.filter((row) => searchable(row).toLowerCase().includes(search))
    : rows;
  const pageSize = Number(query.pageSize ?? 10);
  const page = Math.max(1, Number(query.page ?? 1));
  return {
    data: filtered.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      page,
      pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    },
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Reads the loose dates in the seed data ("Today 09:02", "Yesterday", "7 Dec", "8 Dec 2026 · 09:02")
 * as ISO dates, so date-range filters behave like they will against real timestamps.
 */
export function isoDateOf(value: string): string | null {
  const now = new Date();
  if (/^(Today|Just now)/i.test(value) || /just now/i.test(value)) return isoOf(now);
  if (/^Yesterday/i.test(value))
    return isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const match = /^(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?/.exec(value);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2]!);
  if (month < 0) return null;
  return isoOf(new Date(Number(match[3] ?? 2026), month, Number(match[1])));
}

/** True when `value` falls inside the optional inclusive range. Undatable values never match a range. */
export function inDateRange(value: string, from?: string, to?: string) {
  if (!from && !to) return true;
  const iso = isoDateOf(value);
  if (!iso) return false;
  return (!from || iso >= from) && (!to || iso <= to);
}
