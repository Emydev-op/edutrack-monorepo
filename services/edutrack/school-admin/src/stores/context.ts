import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { ContextOptions, WorkingContext } from '@/types';

import { useAuthStore } from './auth';

const FALLBACK: WorkingContext = {
  branch: 'Main Campus',
  session: '2026/2027',
  term: 'First Term',
};

/**
 * The branch, session and term everything is viewed and recorded in. Remembered per school on
 * this device. `changed` flashes a confirmation after the user switches.
 */
export const useContextStore = defineStore('context', () => {
  const auth = useAuthStore();
  const saved = useStorage<Record<string, WorkingContext>>('edutrack.school-admin.context', {});
  const options = ref<ContextOptions | null>(null);
  const changed = ref(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const current = computed<WorkingContext>(() => {
    const id = auth.school?.id;
    const defaults = options.value?.defaults ?? FALLBACK;
    const chosen = (id && saved.value[id]) || defaults;
    // A branch that was renamed, deactivated or deleted falls back to the default branch.
    const branches = options.value?.branches;
    return branches && !branches.some((b) => b.name === chosen.branch)
      ? { ...chosen, branch: defaults.branch }
      : chosen;
  });
  /** Single-campus schools don't pick a branch until they add a second one. */
  const singleBranch = computed(() => (options.value?.branches.length ?? 0) <= 1);
  const sessionStatus = computed(
    () => options.value?.sessions.find((s) => s.name === current.value.session)?.status ?? 'Active',
  );
  const activeSession = computed(
    () => options.value?.sessions.find((s) => s.status === 'Active')?.name ?? FALLBACK.session,
  );

  function useOptions(next: ContextOptions) {
    options.value = next;
  }

  function set(patch: Partial<WorkingContext>) {
    const id = auth.school?.id;
    if (!id) return;
    saved.value = { ...saved.value, [id]: { ...current.value, ...patch } };
    changed.value = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (changed.value = false), 3500);
  }

  return { current, options, singleBranch, sessionStatus, activeSession, changed, useOptions, set };
});
