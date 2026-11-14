import type { Paginated } from '@edutrack/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  CreateIssuePayload,
  IssueQuery,
  IssueTransitionPayload,
  SupportIssue,
  SupportIssueDetail,
  SupportSummary,
  UpdateIssuePayload,
} from '@/types';

import { cleanParams, getRequest, patchRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

function useInvalidateSupport() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.support.all }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.attention() }),
      qc.invalidateQueries({ queryKey: queryKeys.activity.all }),
    ]);
}

export const useSupportSummaryQuery = () =>
  useQuery({
    queryKey: queryKeys.support.summary(),
    queryFn: () => getRequest<SupportSummary>('/v1/platform/support/summary'),
  });

export function useIssuesQuery(params: MaybeRefOrGetter<IssueQuery>) {
  return useQuery({
    queryKey: computed(() => queryKeys.support.list(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<Paginated<SupportIssue>>('/v1/platform/support/issues', {
        params: cleanParams(toValue(params)),
      }),
    placeholderData: keepPreviousData,
  });
}

export const useIssueQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.support.detail(toValue(id))),
    queryFn: () => getRequest<SupportIssueDetail>(`/v1/platform/support/issues/${toValue(id)}`),
  });

export function useCreateIssueMutation() {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (payload: CreateIssuePayload) =>
      postRequest<SupportIssue>('/v1/platform/support/issues', payload),
    onSuccess: invalidate,
  });
}

export function useUpdateIssueMutation(id: MaybeRefOrGetter<string>) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (payload: UpdateIssuePayload) =>
      patchRequest<SupportIssue>(`/v1/platform/support/issues/${toValue(id)}`, payload),
    onSuccess: invalidate,
  });
}

export function useIssueMessageMutation(id: MaybeRefOrGetter<string>) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (payload: { kind: 'agent' | 'note'; text: string }) =>
      postRequest(`/v1/platform/support/issues/${toValue(id)}/messages`, payload),
    onSuccess: invalidate,
  });
}

export function useIssueTransitionMutation(id: MaybeRefOrGetter<string>) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (payload: IssueTransitionPayload) =>
      postRequest<SupportIssue>(`/v1/platform/support/issues/${toValue(id)}/transitions`, payload),
    onSuccess: invalidate,
  });
}
