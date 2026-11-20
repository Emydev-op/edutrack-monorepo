import { computed } from 'vue';

import { useOverviewQuery } from '@/api/services/parent';
import { useChildrenStore } from '@/stores/children';

/** The child the switcher shows, from the frame's children list. */
export function useCurrentChild() {
  const overview = useOverviewQuery();
  const store = useChildrenStore();
  const children = computed(() => overview.data.value?.children ?? []);
  const child = computed(
    () => children.value.find((c) => c.id === store.selectedId) ?? children.value[0] ?? null,
  );
  const id = computed(() => child.value?.id ?? null);
  return { overview, children, child, id };
}
