import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { AuthUser, SchoolSummary } from '@/types';

const STORAGE_KEY = 'edutrack.school-admin.session';

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
 * The signed-in school administrator and their school. "Remember this device" keeps the session
 * in localStorage; otherwise it lives in sessionStorage and ends with the browser tab.
 */
export const useAuthStore = defineStore('auth', () => {
  const initial = readSession();
  const token = ref<string | null>(initial?.token ?? null);
  const user = ref<AuthUser | null>(initial?.user ?? null);
  const school = ref<SchoolSummary | null>(initial?.school ?? null);

  const isAuthenticated = computed(() => token.value !== null);
  const fullName = computed(() =>
    user.value ? `${user.value.firstName} ${user.value.lastName}` : '',
  );
  const initials = computed(() =>
    user.value
      ? `${user.value.firstName[0] ?? ''}${user.value.lastName[0] ?? ''}`.toUpperCase()
      : '',
  );

  function setSession(session: StoredSession, remember: boolean) {
    token.value = session.token;
    user.value = session.user;
    school.value = session.school;
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(session));
  }

  /** Keeps the sidebar and sign-out copy in step after the school profile changes. */
  function updateSchool(patch: Partial<SchoolSummary>) {
    if (!school.value || !token.value || !user.value) return;
    school.value = { ...school.value, ...patch };
    const storage = localStorage.getItem(STORAGE_KEY) ? localStorage : sessionStorage;
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: token.value, user: user.value, school: school.value }),
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
    token,
    user,
    school,
    isAuthenticated,
    fullName,
    initials,
    setSession,
    updateSchool,
    clear,
  };
});
