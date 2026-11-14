import { createHttpClient, getApiErrorMessage } from '@edutrack/web-core/http';
import { isAxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'vue-sonner';

import { env } from '@/config/env';
import router from '@/router';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import type { LoginResponse } from '@/types';

/** Tells the API which portal is calling (sign-in, refresh cookie name, permissions). */
export const PORTAL_HEADER = { 'X-EduTrack-Portal': 'platform' } as const;

/** The one Axios instance the back office uses. Services never call axios directly. */
export const apiClient = createHttpClient({
  baseURL: env.apiUrl,
  getAccessToken: () => useAuthStore().token,
});
apiClient.defaults.withCredentials = true;
Object.assign(apiClient.defaults.headers.common, PORTAL_HEADER);

if (env.useMocks) {
  // The client owns its adapter, so every module instance (including after hot reloads) uses the
  // mock. It is loaded on demand, so the mock API and its seed data never ship in production.
  const mockAdapter = import('./mock').then((m) => m.mockAdapter);
  apiClient.defaults.adapter = async (config) => (await mockAdapter)(config);
}

let refreshing: Promise<LoginResponse> | null = null;

/**
 * Swaps the refresh cookie for a new access token. Parallel callers share one request, and a
 * 409 REFRESH_CONFLICT (another tab refreshed first; the browser already has the new cookie) is
 * retried once.
 */
export function refreshSession(): Promise<LoginResponse> {
  refreshing ??= (async () => {
    const call = () =>
      apiClient.post<LoginResponse>('/v1/auth/refresh', {}, { skipAuthRefresh: true });
    try {
      return (await call()).data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) return (await call()).data;
      throw error;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Don't try a token refresh when this request answers 401 (auth calls themselves). */
    skipAuthRefresh?: boolean;
    _retried?: boolean;
  }
}

function signedOut() {
  const auth = useAuthStore();
  if (!auth.isAuthenticated) return;
  auth.clear();
  void router.replace({ name: routesPath.auth.login.name, query: { reason: 'expired' } });
}

// An expired access token is refreshed once and the request retried; if the session itself has
// ended, the user goes back to sign-in.
apiClient.interceptors.response.use(undefined, async (error: unknown) => {
  if (!isAxiosError(error) || error.response?.status !== 401 || !error.config)
    return Promise.reject(error);
  const config = error.config as InternalAxiosRequestConfig;
  if (config.skipAuthRefresh || config._retried || config.url?.startsWith('/v1/auth/'))
    return Promise.reject(error);
  if (!useAuthStore().isAuthenticated) return Promise.reject(error);
  try {
    const session = await refreshSession();
    useAuthStore().setSession({ token: session.accessToken, user: session.user });
  } catch {
    signedOut();
    return Promise.reject(error);
  }
  config._retried = true;
  config.headers.set('Authorization', `Bearer ${useAuthStore().token}`);
  return apiClient.request(config);
});

// Server and network failures get a toast here; 4xx errors are shown by the screen that made the
// request (inline form errors, empty states), so they are not toasted twice.
apiClient.interceptors.response.use(undefined, (error: unknown) => {
  if (isAxiosError(error) && (!error.response || error.response.status >= 500)) {
    toast.error(getApiErrorMessage(error, 'The server did not respond. Try again in a moment.'));
  }
  return Promise.reject(error);
});
