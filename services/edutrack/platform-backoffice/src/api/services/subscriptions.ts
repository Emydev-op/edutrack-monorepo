import type { Paginated } from '@edutrack/shared';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { SubscriptionQuery, SubscriptionRow } from '@/types';

import { cleanParams, getRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export function useSubscriptionsQuery(params: MaybeRefOrGetter<SubscriptionQuery>) {
  return useQuery({
    queryKey: computed(() => queryKeys.subscriptions.list(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<Paginated<SubscriptionRow>>('/v1/platform/subscriptions', {
        params: cleanParams(toValue(params)),
      }),
    placeholderData: keepPreviousData,
  });
}
