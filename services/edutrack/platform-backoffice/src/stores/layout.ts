import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Page-level chrome a view can set: the label of the record it shows in the breadcrumb. */
export const useLayoutStore = defineStore('layout', () => {
  const recordLabel = ref<string | null>(null);
  const setRecordLabel = (label: string | null) => (recordLabel.value = label);
  return { recordLabel, setRecordLabel };
});
