import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type {
  AssessmentDetail,
  AssessmentsList,
  ReschedulePayload,
  ScheduleOptions,
  SchedulePayload,
} from '@/types';

import { cleanParams, getRequest, patchRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export function useAssessmentsQuery(
  filters: MaybeRefOrGetter<{ class?: string; subject?: string }> = {},
) {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => queryKeys.assessments.key('list', termId.value, toValue(filters))),
    queryFn: () =>
      getRequest<AssessmentsList>('/v1/assessments', {
        params: cleanParams({ term: termId.value, ...toValue(filters) }),
      }),
    enabled: computed(() => Boolean(termId.value)),
    placeholderData: keepPreviousData,
  });
}

export function useScheduleOptionsQuery() {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => queryKeys.assessments.key('options', termId.value)),
    queryFn: () =>
      getRequest<ScheduleOptions>('/v1/assessments/options', { params: { term: termId.value } }),
    enabled: computed(() => Boolean(termId.value)),
  });
}

export const useAssessmentQuery = (
  id: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) =>
  useQuery({
    queryKey: computed(() => queryKeys.assessments.key('detail', toValue(id))),
    queryFn: () =>
      getRequest<AssessmentDetail>(`/v1/assessments/${encodeURIComponent(toValue(id))}`),
    enabled: computed(() => Boolean(toValue(id)) && toValue(enabled)),
    retry: false,
  });

export function useScheduleAssessmentMutation() {
  const qc = useQueryClient();
  const { termId } = useTermContext();
  return useMutation({
    mutationFn: (payload: SchedulePayload) =>
      postRequest<AssessmentDetail>('/v1/assessments', payload, {
        params: { term: termId.value },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assessments.all }),
  });
}

export function useRescheduleAssessmentMutation(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReschedulePayload) =>
      patchRequest<AssessmentDetail>(`/v1/assessments/${encodeURIComponent(toValue(id))}`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assessments.all }),
  });
}
