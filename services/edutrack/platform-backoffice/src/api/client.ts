import { createHttpClient, getApiErrorMessage } from '@edutrack/web-core/http';
import { isAxiosError } from 'axios';
import { toast } from 'vue-sonner';

import { env } from '@/config/env';
import router from '@/router';
import { routesPath } from '@/router/routes-path';
import { useAuthStore } from '@/stores/auth';

/** The one Axios instance the back office uses. Services never call axios directly. */
export const apiClient = createHttpClient({
  baseURL: env.apiUrl,
  getAccessToken: () => useAuthStore().token,
  onUnauthorized: () => {
    const auth = useAuthStore();
    if (!auth.isAuthenticated) return;
    auth.clear();
    void router.replace({ name: routesPath.auth.login.name, query: { reason: 'expired' } });
  },
});

if (env.useMocks) {
  // The client owns its adapter, so every module instance (including after hot reloads) uses the
  // mock. It is loaded on demand, so the mock API and its seed data never ship in production.
  const mockAdapter = import('./mock').then((m) => m.mockAdapter);
  apiClient.defaults.adapter = async (config) => (await mockAdapter)(config);
}

// Server and network failures get a toast here; 4xx errors are shown by the screen that made the
// request (inline form errors, empty states), so they are not toasted twice.
apiClient.interceptors.response.use(undefined, (error: unknown) => {
  if (isAxiosError(error) && (!error.response || error.response.status >= 500)) {
    toast.error(getApiErrorMessage(error, 'The server did not respond. Try again in a moment.'));
  }
  return Promise.reject(error);
});
