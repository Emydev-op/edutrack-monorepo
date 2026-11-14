import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { AuthUser, LoginResponse } from '@/types';

interface Session {
  token: string;
  user: AuthUser;
}

/**
 * The signed-in platform user. The access token lives only in memory; the API keeps the session in
 * an HttpOnly refresh cookie ("Remember this device" makes it last 30 days), and `restore()` turns
 * that cookie back into a session when the page loads.
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null);
  const user = ref<AuthUser | null>(null);
  let restoring: Promise<boolean> | null = null;

  const isAuthenticated = computed(() => token.value !== null);
  const fullName = computed(() =>
    user.value ? `${user.value.firstName} ${user.value.lastName}` : '',
  );
  const initials = computed(() =>
    user.value
      ? `${user.value.firstName[0] ?? ''}${user.value.lastName[0] ?? ''}`.toUpperCase()
      : '',
  );

  /** `remember` is decided by the API's cookie at sign-in; kept for callers that pass it. */
  function setSession(session: Session, _remember?: boolean) {
    token.value = session.token;
    user.value = session.user;
  }

  function updateUser(patch: Partial<AuthUser>) {
    if (!user.value) return;
    user.value = { ...user.value, ...patch };
  }

  function clear() {
    token.value = null;
    user.value = null;
  }

  /**
   * Restores the session from the refresh cookie, once per page load (later calls share the first
   * answer). Resolves to whether someone is signed in.
   */
  function restore(refresh: () => Promise<LoginResponse>): Promise<boolean> {
    if (isAuthenticated.value) return Promise.resolve(true);
    restoring ??= refresh()
      .then((session) => {
        setSession({ token: session.accessToken, user: session.user });
        return true;
      })
      .catch(() => false);
    return restoring;
  }

  return {
    token,
    user,
    isAuthenticated,
    fullName,
    initials,
    setSession,
    updateUser,
    clear,
    restore,
  };
});
