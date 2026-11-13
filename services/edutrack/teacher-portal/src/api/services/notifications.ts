import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { EmailPreference, NotificationList } from '@/types';

import { getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export interface NotificationQuery {
  filter?: 'all' | 'unread';
  page?: number;
  pageSize?: number;
}

const LIST = queryKeys.notifications.key('list');

export function useNotificationsQuery(params: MaybeRefOrGetter<NotificationQuery> = {}) {
  return useQuery({
    queryKey: computed(() => [...LIST, toValue(params)]),
    queryFn: () => getRequest<NotificationList>('/v1/notifications', { params: toValue(params) }),
    placeholderData: keepPreviousData,
    // Other people's actions (returns, reviews, reminders) add items in the background.
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postRequest(`/v1/notifications/${encodeURIComponent(id)}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST }),
  });
}

export function useMarkAllNotificationsReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postRequest<{ marked: number }>('/v1/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST }),
  });
}

const PREFS = queryKeys.notifications.key('preferences');

export const useEmailPreferencesQuery = () =>
  useQuery({
    queryKey: PREFS,
    queryFn: () => getRequest<EmailPreference[]>('/v1/notifications/preferences'),
  });

export function useSaveEmailPreferencesMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: Record<string, boolean>) =>
      putRequest<EmailPreference[]>('/v1/notifications/preferences', changes),
    onSuccess: (rows) => qc.setQueryData(PREFS, rows),
  });
}
