import type { Paginated } from '@edutrack/shared';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { ActivityItem, ActivityQuery, AuditEntry } from '@/types';

import { cleanParams, getRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export function useActivityQuery(params: MaybeRefOrGetter<ActivityQuery>) {
  return useQuery({
    queryKey: computed(() => queryKeys.activity.list(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<Paginated<ActivityItem>>('/v1/platform/activity', {
        params: cleanParams(toValue(params)),
      }),
    placeholderData: keepPreviousData,
  });
}

export function useAuditQuery(params: MaybeRefOrGetter<ActivityQuery>) {
  return useQuery({
    queryKey: computed(() => queryKeys.audit.list(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<Paginated<AuditEntry>>('/v1/platform/audit', {
        params: cleanParams(toValue(params)),
      }),
    placeholderData: keepPreviousData,
  });
}

/** Names that appear in the back-office trail, for the Actor filters. */
export const useAuditActorsQuery = () =>
  useQuery({
    queryKey: queryKeys.audit.actors(),
    queryFn: () => getRequest<string[]>('/v1/platform/audit/actors'),
    staleTime: 5 * 60_000,
  });

export function useAuditEntryQuery(id: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    queryKey: computed(() => queryKeys.audit.detail(toValue(id) ?? '')),
    queryFn: () => getRequest<AuditEntry>(`/v1/platform/audit/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });
}
