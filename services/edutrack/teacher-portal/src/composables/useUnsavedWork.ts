import { onScopeDispose, toValue, useId, watch, type MaybeRefOrGetter } from 'vue';

import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { useUnsavedStore } from '@/stores/unsaved';

/**
 * Guards a form or score sheet with unsaved changes: asks before leaving the page or closing the
 * tab, and names the work in the sign-out warning (e.g. "Score sheet · JSS 2B Mathematics").
 */
export function useUnsavedWork(
  isDirty: MaybeRefOrGetter<boolean>,
  label: MaybeRefOrGetter<string>,
) {
  const store = useUnsavedStore();
  const key = useId();
  useUnsavedChanges(isDirty);
  watch(
    () => [toValue(isDirty), toValue(label)] as const,
    ([dirty, text]) => store.set(key, dirty ? text : null),
    { immediate: true },
  );
  onScopeDispose(() => store.set(key, null));
}
