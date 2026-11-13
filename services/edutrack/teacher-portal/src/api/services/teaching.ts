/**
 * Teaching queries: my classes, subjects, students, timetable and lessons. Every one is scoped to
 * the selected term, which is part of its query key.
 */
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type {
  TeachingClassDetail,
  TeachingClassList,
  TeachingLessonDetail,
  TeachingStudentDetail,
  TeachingStudentList,
  TeachingStudentsQuery,
  TeachingSubjectDetail,
  TeachingSubjectList,
  TeachingTimetable,
} from '@/types';

import { cleanParams, getRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.teaching;
const enc = encodeURIComponent;

/** 403 / 404 are answers, not blips: don't retry them. */
const retry = (count: number, error: unknown) => {
  const status = (error as { response?: { status?: number } }).response?.status;
  return status !== 403 && status !== 404 && count < 2;
};

function termScoped<T>(key: () => unknown[], url: () => string, params: () => object = () => ({})) {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => k.key(...key(), termId.value, params())),
    queryFn: () => getRequest<T>(url(), { params: { ...params(), term: termId.value } }),
    enabled: computed(() => Boolean(termId.value)),
    retry,
  });
}

export const useTeachingClassesQuery = () =>
  termScoped<TeachingClassList>(
    () => ['classes'],
    () => '/v1/teaching/classes',
  );

export const useTeachingClassQuery = (
  armId: MaybeRefOrGetter<string>,
  subject: MaybeRefOrGetter<string>,
) =>
  termScoped<TeachingClassDetail>(
    () => ['class', toValue(armId), toValue(subject)],
    () => `/v1/teaching/classes/${enc(toValue(armId))}/${enc(toValue(subject))}`,
  );

export const useTeachingSubjectsQuery = () =>
  termScoped<TeachingSubjectList>(
    () => ['subjects'],
    () => '/v1/teaching/subjects',
  );

export const useTeachingSubjectQuery = (code: MaybeRefOrGetter<string>) =>
  termScoped<TeachingSubjectDetail>(
    () => ['subject', toValue(code)],
    () => `/v1/teaching/subjects/${enc(toValue(code))}`,
  );

export function useTeachingStudentsQuery(query: MaybeRefOrGetter<TeachingStudentsQuery>) {
  const { termId } = useTermContext();
  const params = computed(() => cleanParams(toValue(query)));
  return useQuery({
    queryKey: computed(() => k.key('students', termId.value, params.value)),
    queryFn: () =>
      getRequest<TeachingStudentList>('/v1/teaching/students', {
        params: { ...params.value, term: termId.value },
      }),
    enabled: computed(() => Boolean(termId.value)),
    placeholderData: keepPreviousData,
    retry,
  });
}

export const useTeachingStudentQuery = (studentId: MaybeRefOrGetter<string>) =>
  termScoped<TeachingStudentDetail>(
    () => ['student', toValue(studentId)],
    () => `/v1/teaching/students/${enc(toValue(studentId))}`,
  );

/** My week and today's lessons (Done / Now / Next / Later from the API's clock). */
export const useTeachingTimetableQuery = () =>
  termScoped<TeachingTimetable>(
    () => ['timetable'],
    () => '/v1/teaching/timetable',
  );

export const useTeachingLessonQuery = (lessonId: MaybeRefOrGetter<string>) =>
  termScoped<TeachingLessonDetail>(
    () => ['lesson', toValue(lessonId)],
    () => `/v1/teaching/lessons/${enc(toValue(lessonId))}`,
  );
