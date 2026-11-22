import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { deleteRequest, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export type GroupRole = 'Group owner' | 'Group finance' | 'Group academic';
export const GROUP_ROLES: GroupRole[] = ['Group owner', 'Group finance', 'Group academic'];

export interface GroupRow {
  id: string;
  name: string;
  schools: number;
  staff: number;
}

export interface GroupDetail {
  id: string;
  name: string;
  schools: { id: string; name: string; slug: string; status: string; plan: string | null }[];
  staff: {
    id: string;
    userId: string;
    name: string;
    email: string | null;
    role: GroupRole;
    status: 'Active' | 'Invited';
  }[];
}

const keys = {
  all: ['groups'] as const,
  detail: (id: string) => ['groups', id] as const,
};

export const useGroupsQuery = () =>
  useQuery({ queryKey: keys.all, queryFn: () => getRequest<GroupRow[]>('/v1/platform/groups') });

export const useGroupQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => keys.detail(toValue(id))),
    queryFn: () => getRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}`),
  });

function useGroupMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.all }),
        qc.invalidateQueries({ queryKey: queryKeys.schools.all }),
      ]),
  });
}

export const useCreateGroupMutation = () =>
  useGroupMutation((name: string) => postRequest<GroupDetail>('/v1/platform/groups', { name }));

export const useGroupSchoolMutation = (id: MaybeRefOrGetter<string>) =>
  useGroupMutation(({ schoolId, remove }: { schoolId: string; remove?: boolean }) =>
    remove
      ? deleteRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/schools/${schoolId}`)
      : postRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/schools`, { schoolId }),
  );

export const useAddGroupStaffMutation = (id: MaybeRefOrGetter<string>) =>
  useGroupMutation((p: { name: string; email: string; role: GroupRole }) =>
    postRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/staff`, p),
  );

export const useGroupStaffMutation = (id: MaybeRefOrGetter<string>) =>
  useGroupMutation(({ staffId, role }: { staffId: string; role?: GroupRole }) =>
    role
      ? putRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/staff/${staffId}`, { role })
      : deleteRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/staff/${staffId}`),
  );
