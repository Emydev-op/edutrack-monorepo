import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

import { useContextStore } from '@/stores/context';
import type { DashboardFinance, DashboardSummary } from '@/types';

import { getRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export function useDashboardQuery() {
  const ctx = useContextStore();
  return useQuery({
    queryKey: computed(() => queryKeys.dashboard.summary(ctx.current)),
    queryFn: () => getRequest<DashboardSummary>('/v1/dashboard', { params: ctx.current }),
  });
}

export function useDashboardFinanceQuery() {
  const ctx = useContextStore();
  return useQuery({
    queryKey: computed(() => queryKeys.dashboard.finance(ctx.current)),
    queryFn: () => getRequest<DashboardFinance>('/v1/dashboard/finance', { params: ctx.current }),
  });
}
