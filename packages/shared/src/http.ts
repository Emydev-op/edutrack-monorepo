/** Header the portals send so the backend can resolve the current school (tenant). */
export const TENANT_HEADER = 'x-tenant-id';

/**
 * The error body of the portals' in-browser mock APIs (not yet moved to the envelope).
 * The real API answers `ApiFailure`.
 */
export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/** Every successful API response: `{ success: true, message, data, meta? }`. */
export interface ApiSuccess<T> {
  success: true;
  /** Written for the person using the portal (shown in toasts). */
  message: string;
  data: T;
  /** Only on paged lists. */
  meta?: PaginationMeta;
}

/** Every failed API response: `{ success: false, message, error: { code, fields? }, requestId? }`. */
export interface ApiFailure {
  success: false;
  /** Written for the person using the portal; shown as is. */
  message: string;
  error: {
    /** Stable machine code, e.g. ACCOUNT_LOCKED, VALIDATION, NOT_FOUND. */
    code: string;
    /** Per-field messages on 422s, keyed by property path. */
    fields?: Record<string, string>;
  };
  requestId?: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface HealthResponse {
  status: 'ok' | 'error' | 'shutting_down';
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string; message?: string }>;
}
