import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  ActivityItem,
  AttentionItem,
  DashboardSummary,
  GrowthRange,
  GrowthReport,
  RevenueRange,
  RevenueReport,
  School,
  SubscriptionHealthItem,
} from '@/types';

import { getRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export const useDashboardSummaryQuery = () =>
  useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: () => getRequest<DashboardSummary>('/v1/dashboard/summary'),
  });

export const useRevenueQuery = (range: MaybeRefOrGetter<RevenueRange>) =>
  useQuery({
    queryKey: computed(() => queryKeys.dashboard.revenue(toValue(range))),
    queryFn: () =>
      getRequest<RevenueReport>('/v1/dashboard/revenue', { params: { range: toValue(range) } }),
    placeholderData: keepPreviousData,
  });

export const useGrowthQuery = (range: MaybeRefOrGetter<GrowthRange>) =>
  useQuery({
    queryKey: computed(() => queryKeys.dashboard.growth(toValue(range))),
    queryFn: () =>
      getRequest<GrowthReport>('/v1/dashboard/growth', { params: { range: toValue(range) } }),
    placeholderData: keepPreviousData,
  });

export const useAttentionQuery = () =>
  useQuery({
    queryKey: queryKeys.dashboard.attention(),
    queryFn: () => getRequest<AttentionItem[]>('/v1/dashboard/attention'),
  });

export const useSubscriptionHealthQuery = () =>
  useQuery({
    queryKey: queryKeys.dashboard.health(),
    queryFn: () => getRequest<SubscriptionHealthItem[]>('/v1/dashboard/subscription-health'),
  });

export const useOnboardingSchoolsQuery = () =>
  useQuery({
    queryKey: queryKeys.dashboard.onboarding(),
    queryFn: () => getRequest<School[]>('/v1/dashboard/onboarding'),
  });

export const useRecentActivityQuery = () =>
  useQuery({
    queryKey: queryKeys.activity.recent(),
    queryFn: () => getRequest<ActivityItem[]>('/v1/activity/recent'),
  });
