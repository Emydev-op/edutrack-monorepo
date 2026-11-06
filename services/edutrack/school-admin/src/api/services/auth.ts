import { useMutation, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { AcceptInvitationPayload, Invitation, LoginPayload, LoginResponse } from '@/types';

import { getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export const useLoginMutation = () =>
  useMutation({
    mutationFn: (payload: LoginPayload) => postRequest<LoginResponse>('/v1/auth/login', payload),
  });

export const useLogoutMutation = () =>
  useMutation({
    mutationFn: (allDevices: boolean) => postRequest('/v1/auth/logout', { allDevices }),
  });

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
    queryKey: computed(() => queryKeys.invitation(toValue(token))),
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
