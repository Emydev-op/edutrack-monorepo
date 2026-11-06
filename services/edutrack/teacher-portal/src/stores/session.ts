import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * Who is signed in to this portal. Kept in memory for now; token storage and
 * refresh are decided with the auth architecture.
 */
export const useSessionStore = defineStore('session', () => {
  const accessToken = ref<string | null>(null);
  const tenantId = ref<string | null>(import.meta.env.VITE_TENANT_ID || null);

  const isAuthenticated = computed(() => accessToken.value !== null);

  function setAccessToken(token: string) {
    accessToken.value = token;
  }

  function clear() {
    accessToken.value = null;
  }

  return { accessToken, tenantId, isAuthenticated, setAccessToken, clear };
});
