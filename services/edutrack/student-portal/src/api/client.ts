import {
  createHttpClient,
  getApiErrorCode,
  getApiErrorMessage,
  unwrapEnvelope,
} from '@edutrack/web-core/http';
import { isAxiosError } from 'axios';
import { toast } from 'vue-sonner';

import { env } from '@/config/env';
import router from '@/router';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import type { LoginResponse } from '@/types';

/** The one Axios instance the Student Portal uses. Services never call axios directly. */
export const apiClient = createHttpClient({
  baseURL: env.apiUrl,
  getAccessToken: () => useAuthStore().token,
  getTenantId: () => useAuthStore().school?.id,
  // Access tokens last 15 minutes; the refresh cookie keeps the session going while it's in use.
  refreshAccessToken: async () => {
    const call = () => apiClient.post<LoginResponse>('/v1/auth/refresh', {});
    let session: LoginResponse;
    try {
      session = (await call()).data;
    } catch (error) {
      // Another tab refreshed at the same moment; the browser already has the new cookie.
      if (!isAxiosError(error) || error.response?.status !== 409) throw error;
      session = (await call()).data;
    }
    useAuthStore().refreshed(session);
    return session.accessToken;
  },
  onUnauthorized: () => {
    const auth = useAuthStore();
    if (!auth.isAuthenticated) return;
    auth.clear();
    void router.replace({ name: routesPath.auth.login.name, query: { reason: 'expired' } });
  },
});

apiClient.defaults.withCredentials = true;
// Sign-in, refresh and sign-out need to know which portal is asking (the session is per portal).
apiClient.defaults.headers.common['X-EduTrack-Portal'] = 'student';
// The API answers `{ success, message, data }`; screens get `data`, toasts read `messageOf()`.
unwrapEnvelope(apiClient);

/** Codes that close the portal while signed in, and the sign-in page's reason for each. */
const CLOSES: Record<string, string> = {
  // The school's subscription lapsed: the portal opens again once it's renewed.
  SUBSCRIPTION_LAPSED: 'lapsed',
  // The student has left the school (past the read-only window), or logins were closed.
  STUDENT_LEFT: 'left',
};

// Server and network failures get a toast here; 4xx errors are shown by the screen that made the
// request (inline errors, notices, empty states), so they are not toasted twice.
apiClient.interceptors.response.use(undefined, (error: unknown) => {
  const reason = CLOSES[getApiErrorCode(error) ?? ''];
  if (reason) {
    const auth = useAuthStore();
    if (auth.isAuthenticated) {
      auth.clear();
      void router.replace({ name: routesPath.auth.login.name, query: { reason } });
    }
    return Promise.reject(error);
  }
  if (isAxiosError(error) && (!error.response || error.response.status >= 500)) {
    toast.error(getApiErrorMessage(error, 'The server did not respond. Try again in a moment.'));
  }
  return Promise.reject(error);
});
