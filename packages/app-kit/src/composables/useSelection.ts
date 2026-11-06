import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

/** Row selection for bulk actions. Clears itself when the visible rows change. */
export function useSelection<T>(rows: MaybeRefOrGetter<T[]>, keyOf: (row: T) => string) {
  const selected = ref(new Set<string>());

  const keys = computed(() => toValue(rows).map(keyOf));
  const count = computed(() => selected.value.size);
  const allSelected = computed(
    () => keys.value.length > 0 && keys.value.every((k) => selected.value.has(k)),
  );
  const someSelected = computed(() => count.value > 0 && !allSelected.value);

  const isSelected = (row: T) => selected.value.has(keyOf(row));
  function toggle(row: T) {
    const next = new Set(selected.value);
    const key = keyOf(row);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selected.value = next;
  }
  const toggleAll = () => (selected.value = allSelected.value ? new Set() : new Set(keys.value));
  const clear = () => (selected.value = new Set());
  const selectedRows = () => toValue(rows).filter(isSelected);

  watch(keys, clear);

  return {
    selected,
    count,
    allSelected,
    someSelected,
    isSelected,
    toggle,
    toggleAll,
    clear,
    selectedRows,
  };
}
