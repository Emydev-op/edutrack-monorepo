import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  BoardingDashboard,
  ChecklistItem,
  Exeat,
  ExeatFilters,
  ExeatList,
  ExeatPayload,
  GateView,
  IncidentFilters,
  IncidentList,
  IncidentPayload,
  MyHostel,
  PickupPerson,
  PropertyPayload,
  PropertyRecord,
  RollCallDay,
  RollCallPayload,
  RollCallSheet,
  SickBayView,
  SickBayVisit,
  VisitorPayload,
  VisitPayload,
} from '@/types';

import { cleanParams, getRequest, postRequest, putRequest } from '../helpers';
import { queryClient } from '../query-client';
import { queryKeys } from '../query-keys';

const k = queryKeys.boarding;
/** The staff workspace's boarding routes (same shapes as School Admin's `/v1/boarding`). */
const B = '/v1/staff-boarding';
const enc = encodeURIComponent;

/** After any boarding change: refresh every boarding screen (they share counts). */
function useRefresh() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: k.all });
}

/** The hostels I look after as house staff (empty for other staff); also gates the sidebar item. */
export const useMyHostelQuery = () =>
  useQuery({
    queryKey: k.key('my-hostel'),
    queryFn: () => getRequest<MyHostel>('/v1/my-hostel'),
    staleTime: 5 * 60_000,
    retry: false,
  });

/* ---------- Overview ---------- */

export const useBoardingDashboardQuery = () =>
  useQuery({
    queryKey: k.key('dashboard'),
    queryFn: () => getRequest<BoardingDashboard>(`${B}/dashboard`),
    refetchInterval: 60_000,
    retry: false,
  });

/* ---------- Roll calls ---------- */

/** Today's (or `date`'s) roll call slots for the hostels I may take. */
export const useRollCallsQuery = (date: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.key('roll-calls', toValue(date))),
    queryFn: () =>
      getRequest<RollCallDay>(`${B}/roll-calls`, { params: cleanParams({ date: toValue(date) }) }),
    placeholderData: keepPreviousData,
    retry: false,
  });

export const useRollCallSheetQuery = (
  hostelId: MaybeRefOrGetter<string>,
  date: MaybeRefOrGetter<string>,
  slot: MaybeRefOrGetter<string>,
) =>
  useQuery({
    queryKey: computed(() => k.key('roll-call', toValue(hostelId), toValue(date), toValue(slot))),
    queryFn: () =>
      getRequest<RollCallSheet>(`${B}/roll-calls/${enc(toValue(hostelId))}`, {
        params: cleanParams({ date: toValue(date), slot: toValue(slot) }),
      }),
    enabled: computed(() => Boolean(toValue(hostelId))),
    retry: false,
  });

export function useSaveRollCallMutation() {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hostelId, ...body }: RollCallPayload & { hostelId: string }) =>
      putRequest<RollCallSheet>(`${B}/roll-calls/${enc(hostelId)}`, body),
    onSuccess: (sheet) => {
      qc.setQueryData(k.key('roll-call', sheet.hostel.id, sheet.date, sheet.slot), sheet);
      refresh();
    },
  });
}

/* ---------- Exeats ---------- */

export const useExeatsQuery = (filters: MaybeRefOrGetter<ExeatFilters>) =>
  useQuery({
    queryKey: computed(() => k.key('exeats', cleanParams(toValue(filters)))),
    queryFn: () => getRequest<ExeatList>(`${B}/exeats`, { params: cleanParams(toValue(filters)) }),
    placeholderData: keepPreviousData,
    retry: false,
  });

export const useExeatQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.key('exeat', toValue(id))),
    queryFn: () => getRequest<Exeat>(`${B}/exeats/${enc(toValue(id))}`),
    enabled: computed(() => Boolean(toValue(id))),
    retry: false,
  });

/** Every exeat action returns the exeat: cache it and refresh the lists and the gate. */
function useExeatAction<V>(request: (vars: V) => Promise<Exeat>) {
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (exeat) => {
      qc.setQueryData(k.key('exeat', exeat.id), exeat);
      refresh();
    },
  });
}

/** Give an exeat (approved straight away). 409 EXEAT_OVERLAP. */
export const useCreateExeatMutation = () =>
  useExeatAction((body: ExeatPayload) => postRequest<Exeat>(`${B}/exeats`, body));

/** Approve or decline a requested exeat (a note is required to decline). */
export const useDecideExeatMutation = () =>
  useExeatAction(({ id, approve, note }: { id: string; approve: boolean; note?: string }) =>
    postRequest<Exeat>(`${B}/exeats/${enc(id)}/decide`, { approve, note: note || undefined }),
  );

export const useCancelExeatMutation = () =>
  useExeatAction((id: string) => postRequest<Exeat>(`${B}/exeats/${enc(id)}/cancel`));

/** At the gate: `collector` is a key from `exeat.collectors` (or `pickup:<id>` for a term break). */
export const useSignOutMutation = () =>
  useExeatAction(({ id, collector }: { id: string; collector: string }) =>
    postRequest<Exeat>(`${B}/exeats/${enc(id)}/sign-out`, { collector }),
  );

export const useSignInMutation = () =>
  useExeatAction((id: string) => postRequest<Exeat>(`${B}/exeats/${enc(id)}/sign-in`));

/* ---------- Pickup people ---------- */

const pickupsKey = (studentId: string) => k.key('pickups', studentId);
const fetchPickups = (studentId: string) =>
  getRequest<PickupPerson[]>(`${B}/students/${enc(studentId)}/pickups`);

/** A boarder's approved pickup people (besides their parents). */
export const usePickupsQuery = (studentId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => pickupsKey(toValue(studentId))),
    queryFn: () => fetchPickups(toValue(studentId)),
    enabled: computed(() => Boolean(toValue(studentId))),
    retry: false,
  });

/** For one-off use outside a component's setup (e.g. while opening the sign-out dialog). */
export const loadPickups = (studentId: string) =>
  queryClient.fetchQuery({
    queryKey: pickupsKey(studentId),
    queryFn: () => fetchPickups(studentId),
    staleTime: 60_000,
  });

/* ---------- Gate ---------- */

/** Leaving, out now and visitors on site; refreshes every 30 s. */
export const useGateQuery = (branchId?: MaybeRefOrGetter<string | undefined>) =>
  useQuery({
    queryKey: computed(() => k.key('gate', toValue(branchId) ?? '')),
    queryFn: () =>
      getRequest<GateView>(`${B}/gate`, { params: cleanParams({ branchId: toValue(branchId) }) }),
    refetchInterval: 30_000,
    retry: false,
  });

export function useLogVisitorMutation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: VisitorPayload) => postRequest<GateView>(`${B}/gate/visitors`, body),
    onSuccess: refresh,
  });
}

export function useVisitorOutMutation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => postRequest<GateView>(`${B}/gate/visitors/${enc(id)}/out`),
    onSuccess: refresh,
  });
}

/* ---------- Sick bay ---------- */

export const useSickBayQuery = (days: MaybeRefOrGetter<number> = 14) =>
  useQuery({
    queryKey: computed(() => k.key('sick-bay', toValue(days))),
    queryFn: () => getRequest<SickBayView>(`${B}/sick-bay`, { params: { days: toValue(days) } }),
    refetchInterval: 60_000,
    retry: false,
  });

/** 409 ALREADY_ADMITTED when the student is already in the sick bay. */
export function useRecordVisitMutation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: VisitPayload) => postRequest<SickBayVisit>(`${B}/sick-bay`, body),
    onSuccess: refresh,
  });
}

export function useDischargeMutation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      postRequest<SickBayVisit>(`${B}/sick-bay/${enc(id)}/discharge`, {
        note: note || undefined,
      }),
    onSuccess: refresh,
  });
}

/* ---------- Incidents ---------- */

export const useIncidentsQuery = (filters: MaybeRefOrGetter<IncidentFilters> = {}) =>
  useQuery({
    queryKey: computed(() => k.key('incidents', cleanParams(toValue(filters)))),
    queryFn: () =>
      getRequest<IncidentList>(`${B}/incidents`, { params: cleanParams(toValue(filters)) }),
    placeholderData: keepPreviousData,
    retry: false,
  });

export function useRecordIncidentMutation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: IncidentPayload) => postRequest<IncidentList>(`${B}/incidents`, body),
    onSuccess: refresh,
  });
}

export function useCloseIncidentMutation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action?: string }) =>
      postRequest<unknown>(`${B}/incidents/${enc(id)}/close`, { action: action || undefined }),
    onSuccess: refresh,
  });
}

/* ---------- Property ---------- */

export const useChecklistQuery = () =>
  useQuery({
    queryKey: k.key('checklist'),
    queryFn: () => getRequest<ChecklistItem[]>(`${B}/checklist`),
    staleTime: 10 * 60_000,
    retry: false,
  });

export const usePropertyQuery = (studentId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.key('property', toValue(studentId))),
    queryFn: () => getRequest<PropertyRecord>(`${B}/students/${enc(toValue(studentId))}/property`),
    enabled: computed(() => Boolean(toValue(studentId))),
    retry: false,
  });

export function useSavePropertyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, ...body }: PropertyPayload & { studentId: string }) =>
      putRequest<PropertyRecord>(`${B}/students/${enc(studentId)}/property`, body),
    onSuccess: (record, { studentId }) => qc.setQueryData(k.key('property', studentId), record),
  });
}

/** A student to pick in boarding screens (from `GET /v1/staff-boarding/students`). */
export interface BoardingStudent {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  boarder: boolean;
  place: string;
  medicalNotes: string;
}

/**
 * Students the signed-in staff member may pick: boarders in their hostels, or (the nurse, the Head
 * of boarding) anyone on the roll. `boarders` limits it to boarders; `q` searches (2+ letters).
 */
export const useBoardingStudentsQuery = (
  q: MaybeRefOrGetter<string>,
  opts: { boarders?: boolean } = {},
) =>
  useQuery({
    queryKey: computed(() => k.key('students', toValue(q).trim(), !!opts.boarders)),
    queryFn: () =>
      getRequest<BoardingStudent[]>('/v1/staff-boarding/students', {
        params: cleanParams({ q: toValue(q).trim(), boarders: opts.boarders ? 'true' : undefined }),
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
