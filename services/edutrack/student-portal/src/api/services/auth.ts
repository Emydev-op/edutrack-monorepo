import { useMutation } from '@tanstack/vue-query';

import type { LoginPayload, LoginResponse } from '@/types';

import { postRequest } from '../helpers';

export const useLoginMutation = () =>
  useMutation({
    mutationFn: (payload: LoginPayload) => postRequest<LoginResponse>('/v1/auth/login', payload),
  });

/** Sets a new password when the old one expired (or the first sign-in with a slip), and signs in. */
export const useExpiredPasswordMutation = () =>
  useMutation({
    mutationFn: (payload: { email: string; current: string; next: string }) =>
      postRequest<LoginResponse>('/v1/auth/password/expired', payload),
  });

export const useLogoutMutation = () =>
  useMutation({ mutationFn: () => postRequest('/v1/auth/logout') });

/** Changes the password while signed in; the other devices are signed out. */
export const useChangePasswordMutation = () =>
  useMutation({
    mutationFn: (payload: { current: string; next: string }) =>
      postRequest<{ signedOut: number }>('/v1/auth/password/change', payload),
  });
