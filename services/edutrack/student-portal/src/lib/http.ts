import { createHttpClient } from '@edutrack/web-core/http';

import router from '@/router';
import { useSessionStore } from '@/stores/session';

/** Axios instance for this portal. Every API composable goes through it. */
export const http = createHttpClient({
  baseURL: import.meta.env.VITE_API_URL,
  getAccessToken: () => useSessionStore().accessToken,
  getTenantId: () => useSessionStore().tenantId,
  onUnauthorized: () => {
    useSessionStore().clear();
    void router.push({ name: 'login' });
  },
});
