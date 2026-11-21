import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  Announcement,
  Assignment,
  Attendance,
  FileRef,
  Home,
  Homework,
  NotificationPage,
  Overview,
  Profile,
  Results,
  StudentNotification,
  Timetable,
} from '@/types';

import { cleanParams, getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const S = '/v1/student';

/** The frame: the student, the school's contact details and the term. */
export const useOverviewQuery = () =>
  useQuery({ queryKey: queryKeys.overview, queryFn: () => getRequest<Overview>(`${S}/overview`) });

export const useHomeQuery = () =>
  useQuery({ queryKey: queryKeys.home, queryFn: () => getRequest<Home>(`${S}/home`) });

export const useResultsQuery = (term: MaybeRefOrGetter<string | undefined>) =>
  useQuery({
    queryKey: computed(() => queryKeys.results(toValue(term))),
    queryFn: () =>
      getRequest<Results>(`${S}/results`, { params: cleanParams({ term: toValue(term) }) }),
    placeholderData: keepPreviousData,
  });

export const useHomeworkQuery = () =>
  useQuery({ queryKey: queryKeys.homework, queryFn: () => getRequest<Homework>(`${S}/homework`) });

export function useUploadMutation() {
  return useMutation({
    mutationFn: (file: { name: string; dataUrl: string }) =>
      postRequest<FileRef>('/v1/uploads', file),
  });
}

/** Hands in (or replaces) the student's own work. */
export function useHandInMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { assignmentId: string; files: { id: string }[]; note?: string }) =>
      postRequest<Assignment>(`${S}/assignments/${encodeURIComponent(p.assignmentId)}/submission`, {
        files: p.files,
        note: p.note,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.homework });
      void qc.invalidateQueries({ queryKey: queryKeys.home });
    },
  });
}

export const useMaterialsQuery = () =>
  useQuery({
    queryKey: queryKeys.materials,
    queryFn: () => getRequest<Pick<Homework, 'materials'>>(`${S}/materials`),
  });

export const useTimetableQuery = () =>
  useQuery({
    queryKey: queryKeys.timetable,
    queryFn: () => getRequest<Timetable>(`${S}/timetable`),
  });

export const useAttendanceQuery = (term: MaybeRefOrGetter<string | undefined>) =>
  useQuery({
    queryKey: computed(() => queryKeys.attendance(toValue(term))),
    queryFn: () =>
      getRequest<Attendance>(`${S}/attendance`, { params: cleanParams({ term: toValue(term) }) }),
    placeholderData: keepPreviousData,
  });

export const useAnnouncementsQuery = () =>
  useQuery({
    queryKey: queryKeys.announcements,
    queryFn: () => getRequest<Announcement[]>(`${S}/announcements`),
  });

export const useProfileQuery = () =>
  useQuery({ queryKey: queryKeys.profile, queryFn: () => getRequest<Profile>(`${S}/profile`) });

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
      postRequest<StudentNotification>(`/v1/notifications/${encodeURIComponent(id)}/read`),
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
