import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AppNotification,
  MyProfile,
  NotificationChannel,
  NotificationPreference,
  SearchResult,
  SecuritySettings,
  UpdateProfilePayload,
} from '@/types';

import { getRequest, patchRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export const useMyProfileQuery = () =>
  useQuery({
    queryKey: queryKeys.settings.profile,
    queryFn: () => getRequest<MyProfile>('/v1/me/profile'),
  });

export function useUpdateProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) =>
      patchRequest<MyProfile>('/v1/me/profile', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.profile }),
  });
}

export function useUpdateAvatarMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (avatarUrl: string | null) => putRequest<MyProfile>('/v1/me/avatar', { avatarUrl }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.profile }),
  });
}

export const useNotificationPreferencesQuery = () =>
  useQuery({
    queryKey: queryKeys.settings.notifications,
    queryFn: () => getRequest<NotificationPreference[]>('/v1/settings/notifications'),
  });

export function useUpdateNotificationPreferenceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { event: string; channel: NotificationChannel; enabled: boolean }) =>
      putRequest<NotificationPreference[]>('/v1/settings/notifications', payload),
    onSuccess: (data) => qc.setQueryData(queryKeys.settings.notifications, data),
  });
}

export const useSecuritySettingsQuery = () =>
  useQuery({
    queryKey: queryKeys.settings.security,
    queryFn: () => getRequest<SecuritySettings>('/v1/settings/security'),
  });

export function useUpdateSecuritySettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<SecuritySettings>) =>
      putRequest<SecuritySettings>('/v1/settings/security', payload),
    onSuccess: (data) => qc.setQueryData(queryKeys.settings.security, data),
  });
}

export function useSearchQuery(q: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.search(toValue(q))),
    queryFn: () => getRequest<SearchResult[]>('/v1/search', { params: { q: toValue(q) } }),
    staleTime: 60_000,
  });
}

export const useNotificationsQuery = () =>
  useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => getRequest<AppNotification[]>('/v1/notifications'),
  });

export function useMarkNotificationsReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postRequest<AppNotification[]>('/v1/notifications/read-all'),
    onSuccess: (data) => qc.setQueryData(queryKeys.notifications, data),
  });
}
