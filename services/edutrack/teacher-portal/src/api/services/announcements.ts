import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { AnnouncementDetail, AnnouncementSummary } from '@/types';

import { getRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export const useAnnouncementsQuery = (search: MaybeRefOrGetter<string> = '') =>
  useQuery({
    queryKey: computed(() => queryKeys.announcements.key('list', toValue(search))),
    queryFn: () =>
      getRequest<AnnouncementSummary[]>('/v1/announcements', {
        params: { search: toValue(search) || undefined },
      }),
    placeholderData: keepPreviousData,
  });

export const useAnnouncementQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.announcements.key('detail', toValue(id))),
    queryFn: () =>
      getRequest<AnnouncementDetail>(`/v1/announcements/${encodeURIComponent(toValue(id))}`),
  });
