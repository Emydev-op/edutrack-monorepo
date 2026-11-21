import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { queryClient } from '@/api/query-client';
import type { AuthUser, SchoolSummary } from '@/types';

const STORAGE_KEY = 'edutrack.student-portal.session';

interface StoredSession {
  token: string;
  user: AuthUser;
  school: SchoolSummary;
}

function readSession(): StoredSession | null {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as StoredSession;
    } catch {
      storage.removeItem(STORAGE_KEY);
    }
  }
  return null;
}

/**
 * The signed-in student. "Remember this device" keeps the session in localStorage; otherwise it
 * lives in sessionStorage and ends with the browser tab. Their class and school come from
 * `GET /v1/student/overview` (`useOverviewQuery`).
 */
export const useAuthStore = defineStore('auth', () => {
  const initial = readSession();
  const token = ref<string | null>(initial?.token ?? null);
  const user = ref<AuthUser | null>(initial?.user ?? null);
  const school = ref<SchoolSummary | null>(initial?.school ?? null);

  const isAuthenticated = computed(() => token.value !== null);
  /** "Remember this device": the session is kept in localStorage and isn't signed out when idle. */
  const remembered = () => !!localStorage.getItem(STORAGE_KEY);
  const fullName = computed(() => user.value?.displayName ?? '');
  const initials = computed(() =>
    user.value
      ? `${user.value.firstName[0] ?? ''}${user.value.lastName[0] ?? ''}`.toUpperCase()
      : '',
  );

  function setSession(session: StoredSession, remember: boolean) {
    // Never show one student's cached homework or results to the next person who signs in on
    // the same device (a session can also end by expiring, without the sign-out menu).
    queryClient.clear();
    token.value = session.token;
    user.value = session.user;
    school.value = session.school;
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(session));
  }

  /** A renewed session (token refresh): kept where it was stored, without clearing the cache. */
  function refreshed(session: { accessToken: string; user: AuthUser; school: SchoolSummary }) {
    token.value = session.accessToken;
    user.value = session.user;
    school.value = session.school;
    const storage = localStorage.getItem(STORAGE_KEY) ? localStorage : sessionStorage;
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: session.accessToken, user: session.user, school: session.school }),
    );
  }

  function clear() {
    token.value = null;
    user.value = null;
    school.value = null;
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return {
    remembered,
    token,
    user,
    school,
    isAuthenticated,
    fullName,
    initials,
    setSession,
    refreshed,
    clear,
  };
});
