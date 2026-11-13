import { useSessionStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { ShellContext } from '@/types';

import { useAuthStore } from './auth';

/**
 * The term everything is viewed in, plus the API's clock. Fed by DashboardLayout from
 * `GET /v1/context`; read it through `useTermContext()`. A choice lasts for the browser tab, so
 * every new sign-in starts in the active term.
 */
export const useContextStore = defineStore('context', () => {
  const auth = useAuthStore();
  const shell = ref<ShellContext | null>(null);
  const chosen = useSessionStorage<Record<string, string>>('edutrack.teacher-portal.term', {});
  const changed = ref(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const terms = computed(() => shell.value?.terms ?? []);
  const activeTermId = computed(() => shell.value?.activeTermId ?? null);
  const termId = computed(() => {
    const pick = auth.user ? chosen.value[auth.user.id] : undefined;
    if (pick && terms.value.some((t) => t.id === pick)) return pick;
    return activeTermId.value ?? terms.value[0]?.id ?? '';
  });
  const term = computed(() => terms.value.find((t) => t.id === termId.value) ?? null);

  function useShell(next: ShellContext) {
    shell.value = next;
  }

  function setTerm(id: string) {
    if (!auth.user || id === termId.value) return;
    chosen.value = { ...chosen.value, [auth.user.id]: id };
    changed.value = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (changed.value = false), 3500);
  }

  return { shell, terms, activeTermId, termId, term, changed, useShell, setTerm };
});
