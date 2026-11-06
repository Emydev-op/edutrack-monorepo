import type { Paginated } from '@edutrack/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  CreateRolePayload,
  InviteUserPayload,
  PlatformUser,
  Role,
  TimelineEntry,
  UpdateUserPayload,
  UserAction,
  UserQuery,
  UserSecurity,
} from '@/types';

import { cleanParams, deleteRequest, getRequest, patchRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

function useInvalidateUsers() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.users.all }),
      qc.invalidateQueries({ queryKey: queryKeys.roles.all }),
      qc.invalidateQueries({ queryKey: queryKeys.activity.all }),
      qc.invalidateQueries({ queryKey: queryKeys.audit.all }),
    ]);
}

export function useUsersQuery(params: MaybeRefOrGetter<UserQuery>) {
  return useQuery({
    queryKey: computed(() => queryKeys.users.list(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<Paginated<PlatformUser>>('/v1/users', { params: cleanParams(toValue(params)) }),
    placeholderData: keepPreviousData,
  });
}

export const useUserQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.users.detail(toValue(id))),
    queryFn: () => getRequest<PlatformUser>(`/v1/users/${toValue(id)}`),
  });

export const useUserActivityQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.users.section(toValue(id), 'activity')),
    queryFn: () => getRequest<TimelineEntry[]>(`/v1/users/${toValue(id)}/activity`),
  });

export const useUserSecurityQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.users.section(toValue(id), 'security')),
    queryFn: () => getRequest<UserSecurity>(`/v1/users/${toValue(id)}/security`),
  });

export const useUserOpenIssuesQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.users.section(toValue(id), 'open-issues')),
    queryFn: () => getRequest<{ count: number }>(`/v1/users/${toValue(id)}/open-issues`),
  });

export function useInviteUserMutation() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (payload: InviteUserPayload) =>
      postRequest<PlatformUser>('/v1/users/invitations', payload),
    onSuccess: invalidate,
  });
}

export function useUpdateUserMutation(id: MaybeRefOrGetter<string>) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (payload: UpdateUserPayload) =>
      patchRequest<PlatformUser>(`/v1/users/${toValue(id)}`, payload),
    onSuccess: invalidate,
  });
}

export function useUserActionMutation(id: MaybeRefOrGetter<string>) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ action, reason }: { action: UserAction; reason?: string }) =>
      postRequest<PlatformUser>(`/v1/users/${toValue(id)}/${action}`, { reason }),
    onSuccess: invalidate,
  });
}

export const useRolesQuery = () =>
  useQuery({ queryKey: queryKeys.roles.all, queryFn: () => getRequest<Role[]>('/v1/roles') });

export function useCreateRoleMutation() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (payload: CreateRolePayload) => postRequest<Role>('/v1/roles', payload),
    onSuccess: invalidate,
  });
}

export function useDeleteRoleMutation() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (id: string) => deleteRequest(`/v1/roles/${id}`),
    onSuccess: invalidate,
  });
}
