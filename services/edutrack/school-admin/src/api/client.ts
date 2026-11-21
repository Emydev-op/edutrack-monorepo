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
import { useContextStore } from '@/stores/context';
import type { LoginResponse } from '@/types';

import { isRealRoute } from './real-routes';

/** The one Axios instance School Admin uses. Services never call axios directly. */
export const apiClient = createHttpClient({
  baseURL: env.apiUrl,
  getAccessToken: () => useAuthStore().token,
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
apiClient.defaults.headers.common['X-EduTrack-Portal'] = 'school_admin';
// Every answer is `{ success, message, data }`; screens get `data`, toasts read `messageOf()`.
unwrapEnvelope(apiClient);

// Reads carry the header's working session, term and branch, so every screen shows the session
// it's switched to (a past session's records). Writes always act on the active session.
apiClient.interceptors.request.use((config) => {
  if ((config.method ?? 'get').toLowerCase() !== 'get' || !useAuthStore().isAuthenticated)
    return config;
  const { session, term, branch } = useContextStore().current;
  if (session) config.headers.set('X-EduTrack-Session', encodeURIComponent(session));
  if (term) config.headers.set('X-EduTrack-Term', encodeURIComponent(term));
  if (branch) config.headers.set('X-EduTrack-Branch', encodeURIComponent(branch));
  return config;
});

// The mock is loaded on demand, so it and its seed data never ship when nothing uses it.
const loadMock = () => import('./mock');
const network = axios.getAdapter(axios.defaults.adapter);

if (env.useMocks) {
  // The client owns its adapter, so every module instance (including after hot reloads) uses it.
  apiClient.defaults.adapter = async (config) => (await loadMock()).mockAdapter(config);
} else {
  // Sections already on the backend call it; the rest stay on the mock until their phase is built
  // (see real-routes.ts). The mock knows people by its own tokens, so mock calls carry the token
  // of the mock account with the signed-in person's email.
  apiClient.defaults.adapter = async (config) => {
    const path = (config.url ?? '').split('?')[0]!;
    if (isRealRoute(config.method, path)) return network(config);
    const mock = await loadMock();
    const auth = useAuthStore();
    const email = auth.user?.email;
    const token = email ? mock.mockTokenForEmail(email, auth.school?.slug) : null;
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return mock.mockAdapter(config);
  };
}

// Server and network failures get a toast here; 4xx errors are shown by the screen that made the
// request (inline form errors, empty states), so they are not toasted twice.
apiClient.interceptors.response.use(undefined, (error: unknown) => {
  // The subscription lapsed while signed in: show the view-only banner. The screen that made the
  // request shows the API's message, as for any other refusal.
  if (getApiErrorCode(error) === 'SUBSCRIPTION_READ_ONLY')
    useAuthStore().updateSchool({ subscriptionStatus: 'Restricted' });
  if (isAxiosError(error) && (!error.response || error.response.status >= 500)) {
    toast.error(getApiErrorMessage(error, 'The server did not respond. Try again in a moment.'));
  }
  return Promise.reject(error);
});
