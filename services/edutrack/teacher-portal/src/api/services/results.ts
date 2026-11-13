import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type {
  Correction,
  CorrectionPayload,
  ResultSheet,
  ResultsList,
  SaveScoresPayload,
} from '@/types';

import { cleanParams, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const sheetKey = (id: string) => queryKeys.results.key('sheet', id);

/** My sheets (and correction requests) for the selected term, optionally for one class. */
export function useResultsQuery(
  filters: MaybeRefOrGetter<{ class?: string; subject?: string }> = {},
) {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => queryKeys.results.key('list', termId.value, toValue(filters))),
    queryFn: () =>
      getRequest<ResultsList>('/v1/results', {
        params: cleanParams({ term: termId.value, ...toValue(filters) }),
      }),
    enabled: computed(() => Boolean(termId.value)),
    placeholderData: keepPreviousData,
  });
}

export const useResultSheetQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => sheetKey(toValue(id))),
    queryFn: () => getRequest<ResultSheet>(`/v1/results/${encodeURIComponent(toValue(id))}`),
    retry: false,
  });

/** After a sheet changes: refresh lists, sidebar badges and the dashboard. */
function useRefreshAfterChange() {
  const qc = useQueryClient();
  return (sheet: ResultSheet) => {
    qc.setQueryData(sheetKey(sheet.id), sheet);
    void qc.invalidateQueries({ queryKey: queryKeys.results.key('list') });
    void qc.invalidateQueries({ queryKey: queryKeys.navCounts.all });
    void qc.invalidateQueries({ queryKey: queryKeys.assessments.all });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    void qc.invalidateQueries({ queryKey: queryKeys.teaching.all });
  };
}

/**
 * Saves a draft and updates the cached sheet (status, savedAt, history). The score grid keeps
 * its own typed text, so this never overwrites what is being typed.
 */
export function useSaveScoresMutation(id: MaybeRefOrGetter<string>) {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (payload: SaveScoresPayload) =>
      putRequest<ResultSheet>(`/v1/results/${encodeURIComponent(toValue(id))}/scores`, payload),
    onSuccess: refresh,
  });
}

export function useSubmitSheetMutation(id: MaybeRefOrGetter<string>) {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: () =>
      postRequest<ResultSheet>(`/v1/results/${encodeURIComponent(toValue(id))}/submit`),
    onSuccess: refresh,
  });
}

export function useRequestCorrectionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CorrectionPayload) => postRequest<Correction>('/v1/corrections', payload),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: sheetKey(c.sheetId) });
      void qc.invalidateQueries({ queryKey: queryKeys.results.key('list') });
      void qc.invalidateQueries({ queryKey: queryKeys.teaching.all });
    },
  });
}
