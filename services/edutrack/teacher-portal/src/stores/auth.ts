import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { queryClient } from '@/api/query-client';
import type { AuthUser, SchoolSummary } from '@/types';

const STORAGE_KEY = 'edutrack.teacher-portal.session';

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
 * The signed-in teacher. "Remember this device" keeps the session in localStorage; otherwise it
 * lives in sessionStorage and ends with the browser tab. What the teacher's roles unlock comes
 * from `GET /v1/me` (`useMeQuery`), not from here.
 */
export const useAuthStore = defineStore('auth', () => {
  const initial = readSession();
  const token = ref<string | null>(initial?.token ?? null);
  const user = ref<AuthUser | null>(initial?.user ?? null);
  const school = ref<SchoolSummary | null>(initial?.school ?? null);

  const isAuthenticated = computed(() => token.value !== null);
  const fullName = computed(() => user.value?.displayName ?? '');
  const initials = computed(() =>
    user.value
      ? `${user.value.firstName[0] ?? ''}${user.value.lastName[0] ?? ''}`.toUpperCase()
      : '',
  );

  function setSession(session: StoredSession, remember: boolean) {
    // Never show one teacher's cached classes, scores or students to the next person who signs in
    // on the same device (a session can also end by expiring, without the sign-out menu).
    queryClient.clear();
    token.value = session.token;
    user.value = session.user;
    school.value = session.school;
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function clear() {
    token.value = null;
    user.value = null;
    school.value = null;
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return { token, user, school, isAuthenticated, fullName, initials, setSession, clear };
});
