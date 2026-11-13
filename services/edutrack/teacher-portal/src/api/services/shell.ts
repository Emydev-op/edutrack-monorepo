import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type { Me, MyScope, NavCounts, SearchResult, ShellContext } from '@/types';

import { getRequest } from '../helpers';
import { queryClient } from '../query-client';
import { queryKeys } from '../query-keys';

const fetchMe = () => getRequest<Me>('/v1/me');
const fetchContext = () => getRequest<ShellContext>('/v1/context');

/** The signed-in teacher and what their roles unlock. Cached for the session. */
export const useMeQuery = () =>
  useQuery({ queryKey: queryKeys.me.all, queryFn: fetchMe, staleTime: 5 * 60_000 });

/** Terms, active term, today and now, from the API's clock. */
export const useShellContextQuery = () =>
  useQuery({ queryKey: queryKeys.context.all, queryFn: fetchContext, staleTime: 5 * 60_000 });

/** For the router's access guard: the cached `me`, fetched once if needed. */
export const loadMe = () =>
  queryClient.ensureQueryData({ queryKey: queryKeys.me.all, queryFn: fetchMe });

/**
 * What the teacher is assigned to in a term (default: the selected term). Use it for class and
 * subject pickers and "what you do teach" notices.
 */
export function useMyScopeQuery(termId?: MaybeRefOrGetter<string>) {
  const ctx = useTermContext();
  const term = computed(() => toValue(termId) ?? ctx.termId.value);
  return useQuery({
    queryKey: computed(() => queryKeys.me.key('scope', term.value)),
    queryFn: () => getRequest<MyScope>('/v1/my-scope', { params: { term: term.value } }),
    enabled: computed(() => Boolean(term.value)),
  });
}

/** Sidebar badges for the selected term. Invalidate `queryKeys.navCounts.all` after changes. */
export function useNavCountsQuery() {
  const ctx = useTermContext();
  return useQuery({
    queryKey: computed(() => queryKeys.navCounts.key(ctx.termId.value)),
    queryFn: () => getRequest<NavCounts>('/v1/nav-counts', { params: { term: ctx.termId.value } }),
    enabled: computed(() => Boolean(ctx.termId.value)),
    refetchInterval: 60_000,
  });
}

export function useSearchQuery(q: MaybeRefOrGetter<string>) {
  const ctx = useTermContext();
  return useQuery({
    queryKey: computed(() => queryKeys.search.key(ctx.termId.value, toValue(q))),
    queryFn: () =>
      getRequest<SearchResult[]>('/v1/search', {
        params: { q: toValue(q), term: ctx.termId.value },
      }),
    placeholderData: keepPreviousData,
  });
}
