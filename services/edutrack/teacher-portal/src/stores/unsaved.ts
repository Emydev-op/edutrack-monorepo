import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * Work on open pages that isn't saved yet (score entries, forms), so signing out can say what
 * will be lost. Pages register through `useUnsavedWork()`.
 */
export const useUnsavedStore = defineStore('unsaved', () => {
  const entries = ref<Record<string, string>>({});
  const labels = computed(() => Object.values(entries.value));
  function set(key: string, label: string | null) {
    const next = { ...entries.value };
    if (label) next[key] = label;
    else delete next[key];
    entries.value = next;
  }
  const clear = () => (entries.value = {});
  return { entries, labels, set, clear };
});
