import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  StaffDetail,
  StaffDocumentRow,
  StaffFormOptions,
  StaffImportBatch,
  StaffList,
  StaffListRow,
  StaffPayload,
  StaffQuery,
  TeacherRow,
} from '@/types';

import { cleanParams, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

/**
 * Staff changes reach Users & Roles (invitations), Academics (teachers, assignments, class
 * teachers), the organogram, branches and the Setup Center, so a mutation refreshes all of them.
 */
function useStaffMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        [
          queryKeys.staff.all,
          queryKeys.staffOptions,
          queryKeys.users.all,
          queryKeys.academics.all,
          queryKeys.organogram,
          queryKeys.branches.all,
          queryKeys.setup.all,
          queryKeys.navCounts,
          queryKeys.comms.all,
          queryKeys.notifications,
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      ),
  });
}

export const useStaffListQuery = (params: MaybeRefOrGetter<StaffQuery>) =>
  useQuery({
    queryKey: computed(() => queryKeys.staff.list(cleanParams(toValue(params)))),
    queryFn: () => getRequest<StaffList>('/v1/staff', { params: cleanParams(toValue(params)) }),
  });

export const useStaffMemberQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.staff.detail(toValue(id))),
    queryFn: () => getRequest<StaffDetail>(`/v1/staff/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });

export const useStaffFormOptionsQuery = () =>
  useQuery({
    queryKey: queryKeys.staff.formOptions,
    queryFn: () => getRequest<StaffFormOptions>('/v1/staff/form-options'),
  });

export const useTeachersQuery = () =>
  useQuery({
    queryKey: queryKeys.staff.teachers,
    queryFn: () => getRequest<TeacherRow[]>('/v1/staff/teachers'),
  });

type Cleared = { cleared: { removed: number; classes: number } };

export const useSaveStaffMutation = () =>
  useStaffMutation(({ id, ...p }: StaffPayload & { id?: string }) =>
    id
      ? putRequest<StaffListRow & Cleared>(`/v1/staff/${id}`, p)
      : postRequest<StaffListRow>('/v1/staff', p),
  );

export const useDeactivateStaffMutation = () =>
  useStaffMutation(({ id, coverArranged }: { id: string; coverArranged: boolean }) =>
    postRequest<StaffListRow & Cleared>(`/v1/staff/${id}/deactivate`, { coverArranged }),
  );

export const useReactivateStaffMutation = () =>
  useStaffMutation((id: string) => postRequest<StaffListRow>(`/v1/staff/${id}/reactivate`));

export const useInviteStaffMutation = () =>
  useStaffMutation((ids: string[]) =>
    postRequest<{ invited: number; skipped: string[] }>('/v1/staff/invite', { ids }),
  );

export const useUploadStaffDocumentMutation = (id: MaybeRefOrGetter<string>) =>
  useStaffMutation((p: { kind: string; name: string }) =>
    postRequest<StaffDocumentRow[]>(`/v1/staff/${toValue(id)}/documents`, p),
  );

export const useVerifyStaffDocumentMutation = (id: MaybeRefOrGetter<string>) =>
  useStaffMutation((docId: string) =>
    postRequest<StaffDocumentRow[]>(`/v1/staff/${toValue(id)}/documents/${docId}/verify`),
  );

export const previewStaffImport = (p: { fileName: string; text: string }) =>
  postRequest<StaffImportBatch>('/v1/staff/import', p);

export const useCommitStaffImportMutation = () =>
  useStaffMutation((id: string) =>
    postRequest<{ imported: number; invites: number; skipped: number }>(
      `/v1/staff/import/${id}/commit`,
    ),
  );
