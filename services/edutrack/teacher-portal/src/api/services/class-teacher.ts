import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type {
  ClassProgress,
  RegisterDay,
  RegisterHistory,
  RegisterMarkInput,
  ReportCardEntry,
  ReportCardPayload,
  ReportCardsList,
  SaveRegisterResult,
} from '@/types';

import { cleanParams, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.classTeacher;

/** After any My class change: refresh this area, sidebar badges and the dashboard. */
function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: k.all });
    void qc.invalidateQueries({ queryKey: queryKeys.navCounts.all });
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    // Student pages show attendance from the register.
    void qc.invalidateQueries({ queryKey: queryKeys.teaching.all });
  };
}

/* ---------- Register ---------- */

/** One day's register for my arm (default today) in the selected term. */
export function useRegisterQuery(date: MaybeRefOrGetter<string>) {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => k.key('register', termId.value, toValue(date))),
    queryFn: () =>
      getRequest<RegisterDay>('/v1/class-teacher/register', {
        params: cleanParams({ term: termId.value, date: toValue(date) }),
      }),
    enabled: computed(() => Boolean(termId.value)),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useSaveRegisterMutation() {
  const { termId } = useTermContext();
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, marks }: { date: string; marks: RegisterMarkInput[] }) =>
      putRequest<SaveRegisterResult>(
        `/v1/class-teacher/register/${encodeURIComponent(date)}`,
        { marks },
        { params: { term: termId.value } },
      ),
    onSuccess: (result) => {
      qc.setQueryData(k.key('register', termId.value, result.register.date), result.register);
      refresh();
    },
  });
}

export function useRegisterHistoryQuery() {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => k.key('register-history', termId.value)),
    queryFn: () =>
      getRequest<RegisterHistory>('/v1/class-teacher/register/history', {
        params: { term: termId.value },
      }),
    enabled: computed(() => Boolean(termId.value)),
    retry: false,
  });
}

/* ---------- Class progress ---------- */

export function useClassProgressQuery() {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => k.key('progress', termId.value)),
    queryFn: () =>
      getRequest<ClassProgress>('/v1/class-teacher/progress', { params: { term: termId.value } }),
    enabled: computed(() => Boolean(termId.value)),
    retry: false,
  });
}

export function useRemindTeacherMutation() {
  const { termId } = useTermContext();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (sheetId: string) =>
      postRequest<{ remindedAt: string; teacherName: string }>(
        `/v1/class-teacher/progress/${encodeURIComponent(sheetId)}/remind`,
        undefined,
        { params: { term: termId.value } },
      ),
    onSettled: refresh,
  });
}

/* ---------- Report cards ---------- */

export function useReportCardsQuery() {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => k.key('report-cards', termId.value)),
    queryFn: () =>
      getRequest<ReportCardsList>('/v1/class-teacher/report-cards', {
        params: { term: termId.value },
      }),
    enabled: computed(() => Boolean(termId.value)),
    retry: false,
  });
}

export function useReportCardQuery(studentId: MaybeRefOrGetter<string>) {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => k.key('report-card', termId.value, toValue(studentId))),
    queryFn: () =>
      getRequest<ReportCardEntry>(
        `/v1/class-teacher/report-cards/${encodeURIComponent(toValue(studentId))}`,
        { params: { term: termId.value } },
      ),
    enabled: computed(() => Boolean(termId.value && toValue(studentId))),
    retry: false,
  });
}

export function useSaveReportCardMutation() {
  const { termId } = useTermContext();
  const refresh = useRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, payload }: { studentId: string; payload: ReportCardPayload }) =>
      putRequest<ReportCardEntry>(
        `/v1/class-teacher/report-cards/${encodeURIComponent(studentId)}`,
        payload,
        { params: { term: termId.value } },
      ),
    onSuccess: (entry) => {
      qc.setQueryData(k.key('report-card', termId.value, entry.student.id), entry);
      refresh();
    },
  });
}
