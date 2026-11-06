import axios, { type AxiosInstance, isAxiosError } from 'axios';
import { TENANT_HEADER, type ApiErrorResponse } from '@edutrack/shared';

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

/** Extracts a human-readable message from an API error for toasts and form errors. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (isAxiosError<ApiErrorResponse>(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return error instanceof Error ? error.message : fallback;
}
