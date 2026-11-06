import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AccessPayload,
  Branch,
  BranchDetail,
  BranchList,
  BranchPayload,
  InvitePayload,
  Organogram,
  Position,
  PositionPayload,
  Role,
  RolePayload,
  SchoolProfile,
  SchoolProfilePayload,
  SchoolUserDetail,
  SchoolUserRow,
  StaffOption,
} from '@/types';

import { deleteRequest, getRequest, patchRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

/**
 * A mutation that refreshes the given areas when it succeeds, plus the nav counts and the Setup
 * Center, whose School steps describe this data.
 */
function useSchoolMutation<V, R>(fn: (vars: V) => Promise<R>, refresh: QueryKey[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        [...refresh, queryKeys.navCounts, queryKeys.setup.all].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

/* ---------------- Profile ---------------- */

export const useSchoolProfileQuery = () =>
  useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => getRequest<SchoolProfile>('/v1/school/profile'),
  });

export const useUpdateSchoolProfileMutation = () =>
  useSchoolMutation(
    (p: SchoolProfilePayload) => putRequest<SchoolProfile>('/v1/school/profile', p),
    [queryKeys.profile],
  );

export const useStaffOptionsQuery = () =>
  useQuery({
    queryKey: queryKeys.staffOptions,
    queryFn: () => getRequest<StaffOption[]>('/v1/staff/options'),
  });

/* ---------------- Branches ---------------- */

export const useBranchesQuery = () =>
  useQuery({
    queryKey: queryKeys.branches.all,
    queryFn: () => getRequest<BranchList>('/v1/branches'),
  });

export const useBranchQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.branches.detail(toValue(id))),
    queryFn: () => getRequest<BranchDetail>(`/v1/branches/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });

const BRANCH_AREAS = [
  queryKeys.branches.all,
  queryKeys.users.all,
  queryKeys.profile,
  queryKeys.contextOptions,
];

export const useCreateBranchMutation = () =>
  useSchoolMutation((p: BranchPayload) => postRequest<Branch>('/v1/branches', p), BRANCH_AREAS);

export const useUpdateBranchMutation = (id: MaybeRefOrGetter<string>) =>
  useSchoolMutation(
    (p: BranchPayload) => patchRequest<Branch>(`/v1/branches/${toValue(id)}`, p),
    BRANCH_AREAS,
  );

export const useBranchStatusMutation = (id: MaybeRefOrGetter<string>) =>
  useSchoolMutation(
    ({ action, reason }: { action: 'deactivate' | 'reactivate'; reason?: string }) =>
      postRequest<Branch>(`/v1/branches/${toValue(id)}/${action}`, { reason }),
    BRANCH_AREAS,
  );

export const useDeleteBranchMutation = (id: MaybeRefOrGetter<string>) =>
  useSchoolMutation(() => deleteRequest(`/v1/branches/${toValue(id)}`), BRANCH_AREAS);

/* ---------------- Users ---------------- */

export const useUsersQuery = () =>
  useQuery({
    queryKey: queryKeys.users.all,
    queryFn: () => getRequest<SchoolUserRow[]>('/v1/users'),
  });

export const useUserQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.users.detail(toValue(id))),
    queryFn: () => getRequest<SchoolUserDetail>(`/v1/users/${toValue(id)}`),
  });

const USER_AREAS = [
  queryKeys.users.all,
  queryKeys.roles.all,
  queryKeys.staffOptions,
  queryKeys.branches.all,
];

export const useInviteUserMutation = () =>
  useSchoolMutation(
    (p: InvitePayload) => postRequest<SchoolUserRow>('/v1/users/invitations', p),
    USER_AREAS,
  );

export const useUserAccessMutation = (id: MaybeRefOrGetter<string>) =>
  useSchoolMutation(
    (p: AccessPayload) => patchRequest<SchoolUserRow>(`/v1/users/${toValue(id)}/access`, p),
    USER_AREAS,
  );

export type UserAction =
  'suspend' | 'reactivate' | 'deactivate' | 'password-reset' | 'resend' | 'revoke';

export const useUserActionMutation = (id: MaybeRefOrGetter<string>) =>
  useSchoolMutation(
    ({ action, reason }: { action: UserAction; reason?: string }) =>
      postRequest<SchoolUserRow>(`/v1/users/${toValue(id)}/${action}`, { reason }),
    USER_AREAS,
  );

/* ---------------- Roles ---------------- */

export const useRolesQuery = () =>
  useQuery({ queryKey: queryKeys.roles.all, queryFn: () => getRequest<Role[]>('/v1/roles') });

export const useRoleQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.roles.detail(toValue(id))),
    queryFn: () => getRequest<Role>(`/v1/roles/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
  });

const ROLE_AREAS = [queryKeys.roles.all, queryKeys.users.all];

export const useCreateRoleMutation = () =>
  useSchoolMutation((p: RolePayload) => postRequest<Role>('/v1/roles', p), ROLE_AREAS);

export const useUpdateRoleMutation = (id: MaybeRefOrGetter<string>) =>
  useSchoolMutation(
    (p: RolePayload) => patchRequest<Role>(`/v1/roles/${toValue(id)}`, p),
    ROLE_AREAS,
  );

export const useDeleteRoleMutation = (id: MaybeRefOrGetter<string>) =>
  useSchoolMutation(() => deleteRequest(`/v1/roles/${toValue(id)}`), ROLE_AREAS);

/* ---------------- Organogram ---------------- */

export const useOrganogramQuery = () =>
  useQuery({
    queryKey: queryKeys.organogram,
    queryFn: () => getRequest<Organogram>('/v1/organogram'),
  });

export const useSavePositionMutation = () =>
  useSchoolMutation(
    ({ id, ...p }: PositionPayload & { id?: string }) =>
      id
        ? patchRequest<Position>(`/v1/organogram/positions/${id}`, p)
        : postRequest<Position>('/v1/organogram/positions', p),
    [queryKeys.organogram],
  );

export const useDeletePositionMutation = () =>
  useSchoolMutation(
    (id: string) => deleteRequest(`/v1/organogram/positions/${id}`),
    [queryKeys.organogram],
  );
