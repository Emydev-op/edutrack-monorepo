import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  Exeat,
  ExeatRequestPayload,
  ParentBoarding,
  PickupPayload,
  PickupPerson,
} from '@/types';

import { deleteRequest, getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

type Id = MaybeRefOrGetter<string | null | undefined>;
const B = '/v1/parent/boarding';
const enc = (id: Id) => encodeURIComponent(toValue(id) ?? '');

/** A boarder's exeats, pickup list, sick bay visits, visiting days, notes and property. */
export const useBoardingQuery = (id: Id) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding(toValue(id) ?? '')),
    queryFn: () => getRequest<ParentBoarding>(`${B}/${enc(id)}`),
    enabled: computed(() => !!toValue(id)),
  });

function useRefresh(id: Id) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.boarding(toValue(id) ?? '') });
}

export function useRequestExeatMutation(id: Id) {
  const refresh = useRefresh(id);
  return useMutation({
    mutationFn: (body: ExeatRequestPayload) => postRequest<Exeat>(`${B}/${enc(id)}/exeats`, body),
    onSuccess: refresh,
  });
}

export function useCancelExeatMutation(id: Id) {
  const refresh = useRefresh(id);
  return useMutation({
    mutationFn: (exeatId: string) =>
      postRequest<Exeat>(`${B}/exeats/${encodeURIComponent(exeatId)}/cancel`),
    onSuccess: refresh,
  });
}

export function useAddPickupMutation(id: Id) {
  const refresh = useRefresh(id);
  return useMutation({
    mutationFn: (body: PickupPayload) =>
      postRequest<PickupPerson[]>(`${B}/${enc(id)}/pickups`, body),
    onSuccess: refresh,
  });
}

export function useRemovePickupMutation(id: Id) {
  const refresh = useRefresh(id);
  return useMutation({
    mutationFn: (pickupId: string) =>
      deleteRequest<PickupPerson[]>(`${B}/${enc(id)}/pickups/${encodeURIComponent(pickupId)}`),
    onSuccess: refresh,
  });
}
