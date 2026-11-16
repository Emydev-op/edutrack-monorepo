import axios, { type AxiosInstance, isAxiosError } from 'axios';
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

  client.interceptors.response.use(undefined, (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401) options.onUnauthorized?.();
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
