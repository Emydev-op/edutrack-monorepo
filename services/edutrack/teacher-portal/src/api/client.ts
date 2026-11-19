import {
  createHttpClient,
  getApiErrorCode,
  getApiErrorMessage,
  unwrapEnvelope,
} from '@edutrack/web-core/http';
import axios, { isAxiosError } from 'axios';
import { toast } from 'vue-sonner';

import { env } from '@/config/env';
import router from '@/router';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';
import type { LoginResponse } from '@/types';

import { isRealRoute } from './real-routes';

/** The one Axios instance the Teacher Workspace uses. Services never call axios directly. */
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
apiClient.defaults.headers.common['X-EduTrack-Portal'] = 'teacher';
// The API answers `{ success, message, data }`; screens get `data`, toasts read `messageOf()`.
unwrapEnvelope(apiClient);

// Loaded on demand, so the mock API and its seed data never ship when nothing uses them.
const loadMock = () => import('./mock');
const network = axios.getAdapter(axios.defaults.adapter);

if (env.useMocks) {
  apiClient.defaults.adapter = async (config) => (await loadMock()).mockAdapter(config);
} else {
  // Sections already on the backend call it; the rest stay on the mock until their phase is
  // built (see real-routes.ts). The mock knows teachers by its own tokens, so mock calls carry the
  // token of the mock teacher with the signed-in teacher's email.
  apiClient.defaults.adapter = async (config) => {
    const path = (config.url ?? '').split('?')[0]!;
    if (isRealRoute(config.method, path)) return network(config);
    const mock = await loadMock();
    const email = useAuthStore().user?.email;
    if (email) config.headers.set('Authorization', `Bearer ${mock.mockTokenForEmail(email)}`);
    return mock.mockAdapter(config);
  };
}

// Server and network failures get a toast here; 4xx errors are shown by the screen that made the
// request (inline errors, access notices, empty states), so they are not toasted twice.
apiClient.interceptors.response.use(undefined, (error: unknown) => {
  // The school's subscription lapsed while signed in: the workspace closes until it's renewed.
  if (getApiErrorCode(error) === 'SUBSCRIPTION_LAPSED') {
    const auth = useAuthStore();
    if (auth.isAuthenticated) {
      auth.clear();
      void router.replace({ name: routesPath.auth.login.name, query: { reason: 'lapsed' } });
    }
    return Promise.reject(error);
  }
  if (isAxiosError(error) && (!error.response || error.response.status >= 500)) {
    toast.error(getApiErrorMessage(error, 'The server did not respond. Try again in a moment.'));
  }
  return Promise.reject(error);
});
