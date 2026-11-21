import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  Announcement,
  Attendance,
  ChildDetail,
  ChildSummary,
  FeeClaimPayload,
  FeeClaimResult,
  Fees,
  FileRef,
  Home,
  Homework,
  NotificationPage,
  NotificationPreference,
  Overview,
  ParentNotification,
  Profile,
  Results,
  Timetable,
} from '@/types';

import { cleanParams, getRequest, patchRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

type Id = MaybeRefOrGetter<string | null | undefined>;
const P = '/v1/parent';
const child = (id: Id) => encodeURIComponent(toValue(id) ?? '');

/** The frame: the parent, the school's contact details, the term and the children. */
export const useOverviewQuery = () =>
  useQuery({ queryKey: queryKeys.overview, queryFn: () => getRequest<Overview>(`${P}/overview`) });

export const loadOverview = (qc: ReturnType<typeof useQueryClient>) =>
  qc.fetchQuery({
    queryKey: queryKeys.overview,
    queryFn: () => getRequest<Overview>(`${P}/overview`),
    staleTime: 30_000,
  });

export const useChildrenQuery = () =>
  useQuery({
    queryKey: [...queryKeys.overview, 'children'],
    queryFn: () => getRequest<ChildSummary[]>(`${P}/children`),
  });

export const useChildQuery = (id: Id) =>
  useQuery({
    queryKey: computed(() => queryKeys.child(toValue(id) ?? '')),
    queryFn: () => getRequest<ChildDetail>(`${P}/children/${child(id)}`),
    enabled: computed(() => !!toValue(id)),
  });

export const useHomeQuery = (id: Id) =>
  useQuery({
    queryKey: computed(() => queryKeys.home(toValue(id) ?? '')),
    queryFn: () => getRequest<Home>(`${P}/children/${child(id)}/home`),
    enabled: computed(() => !!toValue(id)),
  });

export const useFeesQuery = (id: Id) =>
  useQuery({
    queryKey: computed(() => queryKeys.fees(toValue(id) ?? '')),
    queryFn: () => getRequest<Fees>(`${P}/children/${child(id)}/fees`),
    enabled: computed(() => !!toValue(id)),
  });

export function useUploadMutation() {
  return useMutation({
    mutationFn: (file: { name: string; dataUrl: string }) =>
      postRequest<FileRef>('/v1/uploads', file),
  });
}

export function useFeeClaimMutation(id: Id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: FeeClaimPayload) =>
      postRequest<FeeClaimResult>(`${P}/children/${child(id)}/fees/claims`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.child(toValue(id) ?? '') });
      void qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export const useResultsQuery = (id: Id, term: MaybeRefOrGetter<string | undefined>) =>
  useQuery({
    queryKey: computed(() => queryKeys.results(toValue(id) ?? '', toValue(term))),
    queryFn: () =>
      getRequest<Results>(`${P}/children/${child(id)}/results`, {
        params: cleanParams({ term: toValue(term) }),
      }),
    enabled: computed(() => !!toValue(id)),
    placeholderData: keepPreviousData,
  });

export const useHomeworkQuery = (id: Id) =>
  useQuery({
    queryKey: computed(() => queryKeys.homework(toValue(id) ?? '')),
    queryFn: () => getRequest<Homework>(`${P}/children/${child(id)}/homework`),
    enabled: computed(() => !!toValue(id)),
  });

export function useHandInMutation(id: Id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { assignmentId: string; files: { id: string }[]; note?: string }) =>
      postRequest(
        `${P}/children/${child(id)}/assignments/${encodeURIComponent(p.assignmentId)}/submission`,
        { files: p.files, note: p.note },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.child(toValue(id) ?? '') }),
  });
}

export const useMaterialsQuery = (id: Id) =>
  useQuery({
    queryKey: computed(() => queryKeys.materials(toValue(id) ?? '')),
    queryFn: () => getRequest<Pick<Homework, 'materials'>>(`${P}/children/${child(id)}/materials`),
    enabled: computed(() => !!toValue(id)),
  });

export const useTimetableQuery = (id: Id) =>
  useQuery({
    queryKey: computed(() => queryKeys.timetable(toValue(id) ?? '')),
    queryFn: () => getRequest<Timetable>(`${P}/children/${child(id)}/timetable`),
    enabled: computed(() => !!toValue(id)),
  });

export const useAttendanceQuery = (id: Id, term: MaybeRefOrGetter<string | undefined>) =>
  useQuery({
    queryKey: computed(() => queryKeys.attendance(toValue(id) ?? '', toValue(term))),
    queryFn: () =>
      getRequest<Attendance>(`${P}/children/${child(id)}/attendance`, {
        params: cleanParams({ term: toValue(term) }),
      }),
    enabled: computed(() => !!toValue(id)),
    placeholderData: keepPreviousData,
  });

export const useAnnouncementsQuery = () =>
  useQuery({
    queryKey: queryKeys.announcements,
    queryFn: () => getRequest<Announcement[]>(`${P}/announcements`),
  });

/* ---------------- Account ---------------- */

export const useProfileQuery = () =>
  useQuery({ queryKey: queryKeys.profile, queryFn: () => getRequest<Profile>(`${P}/profile`) });

export function useUpdateProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone?: string; address?: string }) =>
      patchRequest<Profile>(`${P}/profile`, body),
    onSuccess: (profile) => qc.setQueryData(queryKeys.profile, profile),
  });
}

export const usePreferencesQuery = () =>
  useQuery({
    queryKey: queryKeys.preferences,
    queryFn: () => getRequest<NotificationPreference[]>(`${P}/notification-preferences`),
  });

export function useSavePreferencesMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: Omit<NotificationPreference, 'label' | 'description'>[]) =>
      putRequest<NotificationPreference[]>(`${P}/notification-preferences`, { items }),
    onSuccess: (prefs) => qc.setQueryData(queryKeys.preferences, prefs),
  });
}

/* ---------------- Notifications ---------------- */

export const useNotificationsQuery = (filter: MaybeRefOrGetter<'all' | 'unread'> = 'all') =>
  useQuery({
    queryKey: computed(() => queryKeys.notifications(toValue(filter))),
    queryFn: () =>
      getRequest<NotificationPage>('/v1/notifications', {
        params: { filter: toValue(filter), pageSize: 50 },
      }),
    refetchInterval: 60_000,
  });

export function useReadNotificationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      postRequest<ParentNotification>(`/v1/notifications/${encodeURIComponent(id)}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notificationsAll }),
  });
}

export function useReadAllNotificationsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postRequest<{ marked: number }>('/v1/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notificationsAll }),
  });
}
