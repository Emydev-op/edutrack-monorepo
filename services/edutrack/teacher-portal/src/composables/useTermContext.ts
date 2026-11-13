import { storeToRefs } from 'pinia';
import { computed } from 'vue';

import { useContextStore } from '@/stores/context';

/**
 * The selected term and the API's clock, for every screen.
 *
 * - `termId`: send it as `?term=` and put it in query keys.
 * - `isReadOnly` / `readOnlyReason`: only the Active term is editable; disable every change and
 *   show the reason (the shell already shows a banner).
 * - `today` / `now`: "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm" from the API. Never use `new Date()`
 *   for "today".
 */
export function useTermContext() {
  const store = useContextStore();
  const { termId, term, terms, activeTermId, shell } = storeToRefs(store);
  const activeTerm = computed(() => terms.value.find((t) => t.id === activeTermId.value) ?? null);
  return {
    termId,
    term,
    terms,
    activeTermId,
    activeTerm,
    isActiveTerm: computed(() => term.value?.status === 'Active'),
    isReadOnly: computed(() => term.value?.status !== 'Active'),
    readOnlyReason: computed(() => term.value?.lockReason ?? null),
    today: computed(() => shell.value?.today ?? ''),
    now: computed(() => shell.value?.now ?? ''),
    /** The active term's result entry deadline, local "YYYY-MM-DDTHH:mm". */
    entryDeadline: computed(() => shell.value?.entryDeadline ?? null),
    isSchoolDay: computed(() => shell.value?.isSchoolDay ?? false),
    closedReason: computed(() => shell.value?.closedReason ?? null),
    calendar: computed(() => shell.value?.calendar ?? []),
    setTerm: (id: string) => store.setTerm(id),
    returnToActive: () => activeTermId.value && store.setTerm(activeTermId.value),
  };
}
