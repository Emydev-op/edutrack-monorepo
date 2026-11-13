import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { ContextOptions, NavCounts, NotificationItem, SearchResult } from '@/types';

import { getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export const useContextOptionsQuery = () =>
  useQuery({
    queryKey: queryKeys.contextOptions,
    queryFn: () => getRequest<ContextOptions>('/v1/context-options'),
    staleTime: Infinity,
  });

export const useNavCountsQuery = () =>
  useQuery({
    queryKey: queryKeys.navCounts,
    queryFn: () => getRequest<NavCounts>('/v1/nav-counts'),
  });

export const useNotificationsQuery = () =>
  useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => getRequest<NotificationItem[]>('/v1/notifications'),
    // Automatic messages (payments, scheduled sends, ticket replies) add items in the background.
    refetchInterval: 60_000,
  });

export function useMarkNotificationsReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postRequest('/v1/notifications/read-all'),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.notifications }),
        qc.invalidateQueries({ queryKey: queryKeys.comms.key('inbox') }),
      ]),
  });
}

export const useSearchQuery = (q: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.search(toValue(q))),
    queryFn: () => getRequest<SearchResult[]>('/v1/search', { params: { q: toValue(q) } }),
  });
