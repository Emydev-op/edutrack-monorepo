import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AllocationPayload,
  AutoAllocateResult,
  BoarderList,
  BoarderQuery,
  BoardingSettings,
  BoardingSettingsPayload,
  GenerateRoomsPayload,
  Hostel,
  HostelList,
  HostelOccupancy,
  HostelPayload,
  HostelStaffEntry,
  MarkBoardingResult,
  RoomImportBatch,
  RoomImportResult,
  RoomPayload,
  StudentBoarding,
  StudentBoardingPayload,
} from '@/types';

import { cleanParams, deleteRequest, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const B = '/v1/boarding';

/**
 * A boarding mutation. A change that returns a hostel puts it straight into that hostel's cache;
 * every change then refreshes the boarding area (settings, list, details).
 */
function useBoardingMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      const h = result as Partial<Hostel> | undefined;
      if (h && typeof h === 'object' && typeof h.id === 'string' && Array.isArray(h.rooms))
        qc.setQueryData(queryKeys.boarding.hostel(h.id), h);
      return qc.invalidateQueries({ queryKey: queryKeys.boarding.all });
    },
  });
}

/* ---------------- Settings ---------------- */

export const useBoardingSettingsQuery = () =>
  useQuery({
    queryKey: queryKeys.boarding.settings,
    queryFn: () => getRequest<BoardingSettings>(`${B}/settings`),
    staleTime: 60_000,
  });

export const useSaveBoardingSettingsMutation = () =>
  useBoardingMutation((p: BoardingSettingsPayload) =>
    putRequest<BoardingSettings>(`${B}/settings`, p),
  );

/* ---------------- Hostels ---------------- */

export const useHostelsQuery = () =>
  useQuery({
    queryKey: queryKeys.boarding.hostels,
    queryFn: () => getRequest<HostelList>(`${B}/hostels`),
  });

export const useHostelQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.hostel(toValue(id))),
    queryFn: () => getRequest<Hostel>(`${B}/hostels/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });

export const useCreateHostelMutation = () =>
  useBoardingMutation((p: HostelPayload) => postRequest<Hostel>(`${B}/hostels`, p));

export const useUpdateHostelMutation = () =>
  useBoardingMutation(({ id, ...p }: HostelPayload & { id: string }) =>
    putRequest<Hostel>(`${B}/hostels/${id}`, p),
  );

export const useDeleteHostelMutation = () => {
  const qc = useQueryClient();
  // Drop the removed hostel's cache first, so its open page isn't refetched into a 404.
  return useBoardingMutation(async (id: string) => {
    const result = await deleteRequest<HostelList & { name: string }>(`${B}/hostels/${id}`);
    qc.removeQueries({ queryKey: queryKeys.boarding.hostel(id) });
    return result;
  });
};

export const useCopyHostelMutation = () =>
  useBoardingMutation(({ id, ...p }: { id: string; name: string; gender?: string }) =>
    postRequest<Hostel>(`${B}/hostels/${id}/copy`, p),
  );

/* ---------------- Floors ---------------- */

export const useAddFloorMutation = () =>
  useBoardingMutation(({ hostelId, name }: { hostelId: string; name: string }) =>
    postRequest<Hostel>(`${B}/hostels/${hostelId}/floors`, { name }),
  );

export const useRenameFloorMutation = () =>
  useBoardingMutation(
    ({ hostelId, floorId, name }: { hostelId: string; floorId: string; name: string }) =>
      putRequest<Hostel>(`${B}/hostels/${hostelId}/floors/${floorId}`, { name }),
  );

export const useDeleteFloorMutation = () =>
  useBoardingMutation(({ hostelId, floorId }: { hostelId: string; floorId: string }) =>
    deleteRequest<Hostel>(`${B}/hostels/${hostelId}/floors/${floorId}`),
  );

/* ---------------- Rooms ---------------- */

export const useSaveRoomMutation = () =>
  useBoardingMutation(
    ({ hostelId, roomId, ...p }: RoomPayload & { hostelId: string; roomId?: string }) =>
      roomId
        ? putRequest<Hostel>(`${B}/hostels/${hostelId}/rooms/${roomId}`, p)
        : postRequest<Hostel>(`${B}/hostels/${hostelId}/rooms`, p),
  );

export const useDeleteRoomMutation = () =>
  useBoardingMutation(({ hostelId, roomId }: { hostelId: string; roomId: string }) =>
    deleteRequest<Hostel>(`${B}/hostels/${hostelId}/rooms/${roomId}`),
  );

export const useGenerateRoomsMutation = () =>
  useBoardingMutation(({ hostelId, ...p }: GenerateRoomsPayload & { hostelId: string }) =>
    postRequest<Hostel>(`${B}/hostels/${hostelId}/rooms/generate`, p),
  );

/* ---------------- House staff ---------------- */

export const useSetHostelStaffMutation = () =>
  useBoardingMutation(({ hostelId, entries }: { hostelId: string; entries: HostelStaffEntry[] }) =>
    putRequest<Hostel>(`${B}/hostels/${hostelId}/staff`, { entries }),
  );

/* ---------------- Rooms bulk upload ---------------- */

export const ROOM_TEMPLATE_URL = `${B}/rooms/import/template`;

export const previewRoomImport = (p: { fileName: string; text: string }) =>
  postRequest<RoomImportBatch>(`${B}/rooms/import`, p);

export const useCommitRoomImportMutation = () =>
  useBoardingMutation((id: string) =>
    postRequest<RoomImportResult>(`${B}/rooms/import/${id}/commit`),
  );

/* ---------------- Boarders and beds ---------------- */

/**
 * A change to who boards or where they sleep: refreshes the boarding area and the students
 * (their Boarder badge and record).
 */
function useBoardersMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      const s = result as Partial<StudentBoarding> | undefined;
      if (s && typeof s === 'object' && typeof s.studentId === 'string' && 'eligible' in s)
        qc.setQueryData(queryKeys.boarding.student(s.studentId), s);
      return Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.boarding.all }),
        qc.invalidateQueries({ queryKey: queryKeys.students.all }),
      ]);
    },
  });
}

/** A student's boarding this session; 409 NOT_ENROLLED when they aren't in a class yet. */
export const useStudentBoardingQuery = (studentId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.student(toValue(studentId))),
    queryFn: () => getRequest<StudentBoarding>(`${B}/students/${toValue(studentId)}`),
    enabled: computed(() => !!toValue(studentId)),
    retry: false,
  });

export const useSetStudentBoardingMutation = () =>
  useBoardersMutation(({ studentId, ...p }: StudentBoardingPayload & { studentId: string }) =>
    putRequest<StudentBoarding>(`${B}/students/${studentId}`, p),
  );

export const useMarkBoardingMutation = () =>
  useBoardersMutation((p: { studentIds: string[]; boarding: boolean }) =>
    postRequest<MarkBoardingResult>(`${B}/students/mark`, p),
  );

export const useBoardersQuery = (params: MaybeRefOrGetter<BoarderQuery>) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.boarders(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<BoarderList>(`${B}/boarders`, { params: cleanParams(toValue(params)) }),
    placeholderData: keepPreviousData,
  });

/** A hostel's rooms this session with who sleeps in each. */
export const useHostelOccupancyQuery = (hostelId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.boarding.occupancy(toValue(hostelId))),
    queryFn: () => getRequest<HostelOccupancy>(`${B}/hostels/${toValue(hostelId)}/occupancy`),
    enabled: computed(() => !!toValue(hostelId)),
  });

/** Places a boarder in a room (and bed). 409 ALLOCATION_WARNING asks to resend with `confirm`. */
export const useAllocateMutation = () =>
  useBoardersMutation((p: AllocationPayload) => putRequest<StudentBoarding>(`${B}/allocations`, p));

/** Takes a boarder out of their room; they stay a boarder, waiting for a place. */
export const useUnplaceMutation = () =>
  useBoardersMutation((studentId: string) =>
    deleteRequest<StudentBoarding>(`${B}/allocations/${studentId}`),
  );

export const useAutoAllocateMutation = () => {
  const qc = useQueryClient();
  return useBoardersMutation(
    async ({ hostelId, keepClassmates }: { hostelId: string; keepClassmates: boolean }) => {
      const result = await postRequest<AutoAllocateResult>(
        `${B}/hostels/${hostelId}/auto-allocate`,
        {
          keepClassmates,
        },
      );
      qc.setQueryData(queryKeys.boarding.occupancy(hostelId), result);
      return result;
    },
  );
};
