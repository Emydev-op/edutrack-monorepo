import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AcceptInvitationPayload,
  ChangePasswordPayload,
  DeviceSession,
  Invitation,
  LoginPayload,
  LoginResponse,
} from '@/types';

import { deleteRequest, getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export const useLoginMutation = () =>
  useMutation({
    mutationFn: (payload: LoginPayload) => postRequest<LoginResponse>('/v1/auth/login', payload),
  });

/** Sets a new password when the old one expired, and signs in. */
export const useExpiredPasswordMutation = () =>
  useMutation({
    mutationFn: (payload: { email: string; current: string; next: string }) =>
      postRequest<LoginResponse>('/v1/auth/password/expired', payload),
  });

export const useLogoutMutation = () =>
  useMutation({ mutationFn: () => postRequest('/v1/auth/logout') });

export const useForgotPasswordMutation = () =>
  useMutation({
    mutationFn: (email: string) => postRequest('/v1/auth/password/forgot', { email }),
  });

export const useResetPasswordMutation = () =>
  useMutation({
    mutationFn: (payload: { token: string; password: string }) =>
      postRequest('/v1/auth/password/reset', payload),
  });

export function useInvitationQuery(token: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.invitation.key(toValue(token))),
    queryFn: () =>
      getRequest<Invitation>(`/v1/auth/invitations/${encodeURIComponent(toValue(token))}`),
    retry: false,
  });
}

export const useAcceptInvitationMutation = () =>
  useMutation({
    mutationFn: ({ token, ...payload }: AcceptInvitationPayload & { token: string }) =>
      postRequest<{ email: string; name: string }>(
        `/v1/auth/invitations/${encodeURIComponent(token)}/accept`,
        payload,
      ),
  });

/* ---------- Signed in: password and devices ---------- */

const DEVICES = queryKeys.profile.key('devices');

export function useChangePasswordMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) =>
      postRequest<{ signedOut: number }>('/v1/auth/password/change', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEVICES }),
  });
}

export const useDevicesQuery = () =>
  useQuery({
    queryKey: DEVICES,
    queryFn: () => getRequest<DeviceSession[]>('/v1/auth/sessions'),
  });

export function useEndDeviceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRequest(`/v1/auth/sessions/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEVICES }),
  });
}

export function useSignOutOthersMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postRequest<{ signedOut: number }>('/v1/auth/sessions/sign-out-others'),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEVICES }),
  });
}
