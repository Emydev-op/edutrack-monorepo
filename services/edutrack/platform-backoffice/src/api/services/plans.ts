import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { CreatePlanPayload, Plan, PlanDefinition, PlanSchoolUsage } from '@/types';

import { deleteRequest, getRequest, patchRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export const usePlansQuery = () =>
  useQuery({
    queryKey: queryKeys.plans.list(),
    queryFn: () => getRequest<Plan[]>('/v1/platform/plans'),
  });

export function usePlanQuery(id: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    queryKey: computed(() => queryKeys.plans.detail(toValue(id) ?? '')),
    queryFn: () => getRequest<Plan>(`/v1/platform/plans/${toValue(id)}`),
    enabled: () => !!toValue(id),
  });
}

/** Schools on a plan with their usage, to check lowered limits against. */
export function usePlanSchoolsQuery(id: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    queryKey: computed(() => queryKeys.plans.schools(toValue(id) ?? '')),
    queryFn: () => getRequest<PlanSchoolUsage[]>(`/v1/platform/plans/${toValue(id)}/schools`),
    enabled: () => !!toValue(id),
  });
}

function usePlanMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.plans.all }),
        qc.invalidateQueries({ queryKey: queryKeys.activity.all }),
      ]),
  });
}

export const useCreatePlanMutation = () =>
  usePlanMutation((payload: CreatePlanPayload) => postRequest<Plan>('/v1/platform/plans', payload));

export const useUpdatePlanMutation = () =>
  usePlanMutation(({ id, plan }: { id: string; plan: PlanDefinition }) =>
    patchRequest<Plan>(`/v1/platform/plans/${id}`, plan),
  );

export const usePlanStatusMutation = () =>
  usePlanMutation(({ id, status }: { id: string; status: 'Active' | 'Archived' }) =>
    postRequest<Plan>(`/v1/platform/plans/${id}/status`, { status }),
  );

export const useDeletePlanMutation = () =>
  usePlanMutation((id: string) => deleteRequest<{ ok: true }>(`/v1/platform/plans/${id}`));
