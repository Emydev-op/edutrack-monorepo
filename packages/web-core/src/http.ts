import axios, { type AxiosInstance, type InternalAxiosRequestConfig, isAxiosError } from 'axios';
import {
  TENANT_HEADER,
  type ApiErrorResponse,
  type ApiFailure,
  type ApiSuccess,
} from '@edutrack/shared';

export interface HttpClientOptions {
  baseURL: string;
  /** Returns the current access token, if any. Called on every request. */
  getAccessToken?: () => string | null | undefined;
  /** Returns the current tenant (school) id, if any. Called on every request. */
  getTenantId?: () => string | null | undefined;
  /** Called when the API answers 401, e.g. to clear the session and redirect to login. */
  onUnauthorized?: () => void;
  /**
   * Swaps the HttpOnly refresh cookie for a new access token and stores it, returning the token.
   * With it, a 401 (the 15-minute access token ran out) is refreshed once and the request
   * retried; `onUnauthorized` only runs when the refresh fails too (the session really ended).
   * Without it every 401 signs the person out.
   */
  refreshAccessToken?: () => Promise<string>;
  timeoutMs?: number;
}

export function createHttpClient(options: HttpClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeoutMs ?? 30_000,
    headers: { Accept: 'application/json' },
  });

  client.interceptors.request.use((config) => {
    const token = options.getAccessToken?.();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);

    const tenantId = options.getTenantId?.();
    if (tenantId) config.headers.set(TENANT_HEADER, tenantId);

    return config;
  });

  // Parallel requests that all hit an expired token share one refresh.
  let refreshing: Promise<string> | null = null;
  const refresh = () =>
    (refreshing ??= options.refreshAccessToken!().finally(() => {
      refreshing = null;
    }));

  client.interceptors.response.use(undefined, async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== 401) return Promise.reject(error);
    const config = error.config as
      (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    // Sign-in, refresh and sign-out answer 401 for their own reasons; never refresh for those.
    const authCall = config?.url?.startsWith('/v1/auth/') ?? false;
    if (options.refreshAccessToken && config && !config._retried && !authCall) {
      let token: string;
      try {
        token = await refresh();
      } catch {
        options.onUnauthorized?.();
        return Promise.reject(error);
      }
      config._retried = true;
      config.headers.set('Authorization', `Bearer ${token}`);
      // A second 401 lands back here with `_retried` set and signs out below.
      return client.request(config);
    }
    if (!authCall || config?.url === '/v1/auth/refresh') options.onUnauthorized?.();
    return Promise.reject(error);
  });

  return client;
}

const isEnvelope = (body: unknown): body is ApiSuccess<unknown> =>
  typeof body === 'object' && body !== null && (body as { success?: unknown }).success === true;

/** Success messages of unwrapped responses, keyed by the data object they came with. */
const messages = new WeakMap<object, string>();

/**
 * Unwraps the API's `{ success, message, data, meta? }` envelope, so services and screens get the
 * data itself (`{ data, meta }` for paged lists, matching `Paginated<T>`). The message stays
 * available through `messageOf(result)`. Errors keep their body (`ApiFailure`).
 */
export function unwrapEnvelope(client: AxiosInstance) {
  client.interceptors.response.use((response) => {
    const body: unknown = response.data;
    if (!isEnvelope(body)) return response;
    const data = body.meta ? { data: body.data, meta: body.meta } : body.data;
    if (typeof data === 'object' && data !== null && body.message) messages.set(data, body.message);
    response.data = data;
    return response;
  });
}

/**
 * The API's message for a result (e.g. "Ticket assigned to Ibrahim Yusuf."), for the success
 * toast. Falls back to the screen's own wording when the response had none (mock API, no data).
 */
export function messageOf(result: unknown, fallback: string): string {
  return (typeof result === 'object' && result !== null && messages.get(result)) || fallback;
}

/** The stable error code (`ACCOUNT_LOCKED`, `VALIDATION`…) of an API error, if any. */
export function getApiErrorCode(error: unknown): string | undefined {
  if (!isAxiosError<ApiFailure | ApiErrorResponse>(error)) return undefined;
  const failure = error.response?.data?.error;
  return typeof failure === 'string' ? failure : failure?.code;
}

/** Per-field messages of a 422, keyed by property path. */
export function getApiErrorFields(error: unknown): Record<string, string> {
  if (!isAxiosError<ApiFailure>(error)) return {};
  const failure = error.response?.data?.error;
  return (typeof failure === 'object' && failure?.fields) || {};
}

/** Extracts a human-readable message from an API error for toasts and form errors. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (isAxiosError<ApiFailure | ApiErrorResponse>(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return error instanceof Error ? error.message : fallback;
}
