import { useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type { Dashboard } from '@/types';

import { getRequest } from '../helpers';
import { queryKeys } from '../query-keys';

/**
 * The dashboard for the selected term. Every write elsewhere in the app invalidates
 * `queryKeys.dashboard.all`, so its figures and to-do list follow the real state.
 * `simulate` (mock only) makes named blocks fail, to show the partial-failure state.
 */
export function useDashboardQuery(simulate: MaybeRefOrGetter<string | undefined> = undefined) {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => queryKeys.dashboard.key(termId.value, toValue(simulate) ?? '')),
    queryFn: () =>
      getRequest<Dashboard>('/v1/dashboard', {
        params: { term: termId.value, simulate: toValue(simulate) || undefined },
      }),
    enabled: computed(() => Boolean(termId.value)),
  });
}
