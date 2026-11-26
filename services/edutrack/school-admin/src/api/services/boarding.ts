import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  BoardingSettings,
  BoardingSettingsPayload,
  GenerateRoomsPayload,
  Hostel,
  HostelList,
  HostelPayload,
  HostelStaffEntry,
  RoomImportBatch,
  RoomImportResult,
  RoomPayload,
} from '@/types';

import { deleteRequest, getRequest, postRequest, putRequest } from '../helpers';
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
