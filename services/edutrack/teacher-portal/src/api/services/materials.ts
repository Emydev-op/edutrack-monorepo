import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type { MaterialDetail, MaterialList, MaterialListQuery, MaterialPayload } from '@/types';

import { cleanParams, getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const M = queryKeys.materials;
const enc = encodeURIComponent;

/** My materials for the selected term (filters: class, subject, type, status, search, page). */
export function useMaterialsQuery(params: MaybeRefOrGetter<MaterialListQuery>) {
  const { termId } = useTermContext();
  const query = computed(() => cleanParams({ term: termId.value, ...toValue(params) }));
  return useQuery({
    queryKey: computed(() => M.key('list', query.value)),
    queryFn: () => getRequest<MaterialList>('/v1/materials', { params: query.value }),
    enabled: computed(() => Boolean(termId.value)),
    placeholderData: keepPreviousData,
  });
}

export const useMaterialQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => M.key('detail', toValue(id))),
    queryFn: () => getRequest<MaterialDetail>(`/v1/materials/${enc(toValue(id))}`),
    enabled: computed(() => Boolean(toValue(id))),
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: M.all }),
      // Assignments show linked materials as unavailable; class and lesson pages list materials.
      qc.invalidateQueries({ queryKey: queryKeys.assignments.all }),
      qc.invalidateQueries({ queryKey: queryKeys.teaching.all }),
    ]);
}

export function useUploadMaterialMutation() {
  const { termId } = useTermContext();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: MaterialPayload) =>
      postRequest<MaterialDetail>('/v1/materials', payload, { params: { term: termId.value } }),
    onSuccess: invalidate,
  });
}

export function useMaterialActionMutation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'archive' | 'restore' }) =>
      postRequest<MaterialDetail>(`/v1/materials/${enc(id)}/${action}`),
    onSuccess: invalidate,
  });
}
