import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  BoardingDashboard,
  PropertyChecklistItem,
  Exeat,
  ExeatList,
  ExeatPayload,
  ExeatQuery,
  GateView,
  IncidentList,
  IncidentPayload,
  IncidentQuery,
  PickupPayload,
  PickupPerson,
  PropertyPayload,
  RollCallDay,
  RollCallPayload,
  RollCallSheet,
  SickBayList,
  SickBayQuery,
  SickBayVisit,
  SickVisitPayload,
  StudentProperty,
  TermBreakPayload,
  TermBreakResult,
  VisitingDay,
  VisitingDayPayload,
  VisitorPayload,
} from '@/types';

import { cleanParams, deleteRequest, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

/**
 * Boarding house life: exeats, the gate, roll calls, the sick bay, visiting days, incidents and
 * property. Hostels, places and boarders are in boarding.ts.
 */
const B = '/v1/boarding';

/** A house change: optionally seeds a cache with the result, then refreshes the boarding area. */
function useHouseMutation<V, R>(fn: (vars: V) => Promise<R>, seed?: (result: R, vars: V) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      seed?.(result, vars);
      return qc.invalidateQueries({ queryKey: queryKeys.boarding.all });
    },
  });
}

/* ---------------- Dashboard ---------------- */

export const useBoardingDashboardQuery = () =>
  useQuery({
    queryKey: queryKeys.boarding.dashboard,
    queryFn: () => getRequest<BoardingDashboard>(`${B}/dashboard`),
    refetchInterval: 60_000,
  });

/* ---------------- Exeats ---------------- */

export const useExeatsQuery = (
  params: MaybeRefOrGetter<ExeatQuery>,
  enabled: MaybeRefOrGetter<boolean> = true,
) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.exeats(cleanParams(toValue(params)))),
    queryFn: () => getRequest<ExeatList>(`${B}/exeats`, { params: cleanParams(toValue(params)) }),
    enabled: computed(() => toValue(enabled)),
    placeholderData: keepPreviousData,
  });

export const useExeatQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.exeat(toValue(id))),
    queryFn: () => getRequest<Exeat>(`${B}/exeats/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });

/** Gives a boarder an exeat; approved straight away. 409 EXEAT_OVERLAP. */
export const useGiveExeatMutation = () =>
  useHouseMutation((p: ExeatPayload) => postRequest<Exeat>(`${B}/exeats`, p));

/** Exeats for every boarder at a campus (or one hostel) for the term break. */
export const useTermBreakMutation = () =>
  useHouseMutation((p: TermBreakPayload) =>
    postRequest<TermBreakResult>(`${B}/exeats/term-break`, p),
  );

/** Approves or declines a requested exeat (a note is required to decline). */
export const useDecideExeatMutation = () =>
  useHouseMutation(({ id, ...p }: { id: string; approve: boolean; note?: string }) =>
    postRequest<Exeat>(`${B}/exeats/${id}/decide`, p),
  );

export const useCancelExeatMutation = () =>
  useHouseMutation((id: string) => postRequest<Exeat>(`${B}/exeats/${id}/cancel`));

/** The gate hands the boarder to `collector` (a key from the exeat's collectors). */
export const useSignOutMutation = () =>
  useHouseMutation(({ id, collector }: { id: string; collector: string }) =>
    postRequest<Exeat>(`${B}/exeats/${id}/sign-out`, { collector }),
  );

export const useSignInMutation = () =>
  useHouseMutation((id: string) => postRequest<Exeat>(`${B}/exeats/${id}/sign-in`));

/* ---------------- Gate ---------------- */

/** Who is leaving, who is out and the visitors on site. Refreshes every 30 seconds. */
export const useGateQuery = (branchId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.gate(toValue(branchId))),
    queryFn: () =>
      getRequest<GateView>(`${B}/gate`, {
        params: cleanParams({ branchId: toValue(branchId) }),
      }),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

export const useLogVisitorMutation = () => {
  const qc = useQueryClient();
  return useHouseMutation(
    (p: VisitorPayload) => postRequest<GateView>(`${B}/gate/visitors`, p),
    (view, p) => qc.setQueryData(queryKeys.boarding.gate(p.branchId), view),
  );
};

export const useVisitorOutMutation = () => {
  const qc = useQueryClient();
  return useHouseMutation(
    ({ id }: { id: string; branchId: string }) =>
      postRequest<GateView>(`${B}/gate/visitors/${id}/out`),
    (view, { branchId }) => qc.setQueryData(queryKeys.boarding.gate(branchId), view),
  );
};

/* ---------------- Pickup people ---------------- */

export const usePickupsQuery = (studentId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.pickups(toValue(studentId))),
    queryFn: () => getRequest<PickupPerson[]>(`${B}/students/${toValue(studentId)}/pickups`),
    enabled: computed(() => !!toValue(studentId)),
  });

export const useAddPickupMutation = () => {
  const qc = useQueryClient();
  return useHouseMutation(
    ({ studentId, ...p }: PickupPayload & { studentId: string }) =>
      postRequest<PickupPerson[]>(`${B}/students/${studentId}/pickups`, p),
    (list, { studentId }) => qc.setQueryData(queryKeys.boarding.pickups(studentId), list),
  );
};

export const useRemovePickupMutation = () => {
  const qc = useQueryClient();
  return useHouseMutation(
    ({ studentId, id }: { studentId: string; id: string }) =>
      deleteRequest<PickupPerson[]>(`${B}/students/${studentId}/pickups/${id}`),
    (list, { studentId }) => qc.setQueryData(queryKeys.boarding.pickups(studentId), list),
  );
};

/* ---------------- Roll calls ---------------- */

export const useRollCallsQuery = (date: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.rollCalls(toValue(date))),
    queryFn: () =>
      getRequest<RollCallDay>(`${B}/roll-calls`, {
        params: cleanParams({ date: toValue(date) }),
      }),
    placeholderData: keepPreviousData,
  });

export const useRollCallSheetQuery = (
  hostelId: MaybeRefOrGetter<string>,
  params: MaybeRefOrGetter<{ date?: string; slot?: string }>,
) =>
  useQuery({
    queryKey: computed(() =>
      queryKeys.boarding.rollCallSheet(toValue(hostelId), cleanParams(toValue(params))),
    ),
    queryFn: () =>
      getRequest<RollCallSheet>(`${B}/roll-calls/${toValue(hostelId)}`, {
        params: cleanParams(toValue(params)),
      }),
    enabled: computed(() => !!toValue(hostelId)),
  });

/** Saves a roll call. 422 `marks` when someone isn't marked; 409 ROLL_CALL_LOCKED. */
export const useSaveRollCallMutation = () =>
  useHouseMutation(({ hostelId, ...p }: RollCallPayload & { hostelId: string }) =>
    putRequest<RollCallSheet>(`${B}/roll-calls/${hostelId}`, p),
  );

export const useSaveRollCallSlotsMutation = () =>
  useHouseMutation(({ hostelId, slots }: { hostelId: string; slots: string[] }) =>
    putRequest<{ hostelId: string; slots: string[] }>(`${B}/roll-calls/${hostelId}/slots`, {
      slots,
    }),
  );

/* ---------------- Sick bay ---------------- */

export const useSickBayQuery = (
  params: MaybeRefOrGetter<SickBayQuery>,
  enabled: MaybeRefOrGetter<boolean> = true,
) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.sickBay(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<SickBayList>(`${B}/sick-bay`, { params: cleanParams(toValue(params)) }),
    enabled: computed(() => toValue(enabled)),
    placeholderData: keepPreviousData,
  });

/** Records a sick bay visit. 409 ALREADY_ADMITTED. */
export const useRecordSickVisitMutation = () =>
  useHouseMutation((p: SickVisitPayload) => postRequest<SickBayVisit>(`${B}/sick-bay`, p));

export const useDischargeMutation = () =>
  useHouseMutation(({ id, note }: { id: string; note?: string }) =>
    postRequest<SickBayVisit>(`${B}/sick-bay/${id}/discharge`, cleanParams({ note })),
  );

/* ---------------- Visiting days ---------------- */

export const useVisitingDaysQuery = () =>
  useQuery({
    queryKey: queryKeys.boarding.visitingDays,
    queryFn: () => getRequest<VisitingDay[]>(`${B}/visiting-days`),
  });

export const useAddVisitingDayMutation = () => {
  const qc = useQueryClient();
  return useHouseMutation(
    (p: VisitingDayPayload) => postRequest<VisitingDay[]>(`${B}/visiting-days`, p),
    (list) => qc.setQueryData(queryKeys.boarding.visitingDays, list),
  );
};

export const useRemoveVisitingDayMutation = () => {
  const qc = useQueryClient();
  return useHouseMutation(
    (id: string) => deleteRequest<VisitingDay[]>(`${B}/visiting-days/${id}`),
    (list) => qc.setQueryData(queryKeys.boarding.visitingDays, list),
  );
};

/* ---------------- Incidents ---------------- */

export const useIncidentsQuery = (
  params: MaybeRefOrGetter<IncidentQuery>,
  enabled: MaybeRefOrGetter<boolean> = true,
) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.incidents(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<IncidentList>(`${B}/incidents`, { params: cleanParams(toValue(params)) }),
    enabled: computed(() => toValue(enabled)),
    placeholderData: keepPreviousData,
  });

export const useRecordIncidentMutation = () =>
  useHouseMutation((p: IncidentPayload) => postRequest<IncidentList>(`${B}/incidents`, p));

export const useCloseIncidentMutation = () =>
  useHouseMutation(({ id, action }: { id: string; action?: string }) =>
    postRequest<unknown>(`${B}/incidents/${id}/close`, cleanParams({ action })),
  );

/* ---------------- Property ---------------- */

export const useChecklistQuery = () =>
  useQuery({
    queryKey: queryKeys.boarding.checklist,
    queryFn: () => getRequest<PropertyChecklistItem[]>(`${B}/checklist`),
    staleTime: 60_000,
  });

export const useSaveChecklistMutation = () => {
  const qc = useQueryClient();
  return useHouseMutation(
    (items: string[]) => putRequest<PropertyChecklistItem[]>(`${B}/checklist`, { items }),
    (list) => qc.setQueryData(queryKeys.boarding.checklist, list),
  );
};

export const usePropertyQuery = (studentId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.property(toValue(studentId))),
    queryFn: () => getRequest<StudentProperty>(`${B}/students/${toValue(studentId)}/property`),
    enabled: computed(() => !!toValue(studentId)),
  });

export const useSavePropertyMutation = () => {
  const qc = useQueryClient();
  return useHouseMutation(
    ({ studentId, ...p }: PropertyPayload & { studentId: string }) =>
      putRequest<StudentProperty>(`${B}/students/${studentId}/property`, p),
    (result, { studentId }) => qc.setQueryData(queryKeys.boarding.property(studentId), result),
  );
};
