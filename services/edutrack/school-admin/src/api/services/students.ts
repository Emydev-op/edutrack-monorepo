import type { Paginated } from '@edutrack/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AdmissionApplication,
  AdmissionMatches,
  AdmissionOptions,
  AdmitPayload,
  AdmitResult,
  EnrollmentOptions,
  EnrollPayload,
  GuardianDetail,
  GuardianDuplicate,
  GuardianPayload,
  GuardianRow,
  ImportBatch,
  ImportCommitPayload,
  ImportResult,
  PageQuery,
  StudentDetail,
  StudentQuery,
  StudentRow,
  TransferPayload,
} from '@/types';

import { cleanParams, getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

/** Anything that changes students can change guardians, capacity, applications and the dashboard. */
function useStudentsMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        [
          queryKeys.students.all,
          queryKeys.guardians.all,
          queryKeys.admissions.all,
          queryKeys.enrollment,
          queryKeys.dashboard.all,
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      ),
  });
}

export function useStudentsQuery(params: MaybeRefOrGetter<StudentQuery>) {
  return useQuery({
    queryKey: computed(() => queryKeys.students.list(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<Paginated<StudentRow>>('/v1/students', { params: cleanParams(toValue(params)) }),
    placeholderData: keepPreviousData,
  });
}

export const useStudentQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.students.detail(toValue(id))),
    queryFn: () => getRequest<StudentDetail>(`/v1/students/${toValue(id)}`),
  });

export const useTransferMutation = (id: MaybeRefOrGetter<string>) =>
  useStudentsMutation((p: TransferPayload) =>
    postRequest<StudentRow>(`/v1/students/${toValue(id)}/transfer`, p),
  );

export const useAssignArmMutation = () =>
  useStudentsMutation((p: { studentIds: string[]; arm: string }) =>
    postRequest<{ moved: number }>('/v1/students/assign-arm', p),
  );

/* ---------------- Admissions ---------------- */

export const useApplicationsQuery = () =>
  useQuery({
    queryKey: queryKeys.admissions.all,
    queryFn: () => getRequest<AdmissionApplication[]>('/v1/admissions'),
  });

export const useAdmissionOptionsQuery = () =>
  useQuery({
    queryKey: queryKeys.admissions.options,
    queryFn: () => getRequest<AdmissionOptions>('/v1/admissions/options'),
  });

export const useAdmissionMatchesQuery = (
  first: MaybeRefOrGetter<string>,
  surname: MaybeRefOrGetter<string>,
) =>
  useQuery({
    queryKey: computed(() =>
      queryKeys.admissions.matches(toValue(first).trim(), toValue(surname).trim()),
    ),
    queryFn: () =>
      getRequest<AdmissionMatches>('/v1/admissions/matches', {
        params: { firstName: toValue(first).trim(), surname: toValue(surname).trim() },
      }),
    enabled: computed(() => toValue(surname).trim().length > 1),
  });

export const useAdmitMutation = () =>
  useStudentsMutation((p: AdmitPayload) => postRequest<AdmitResult>('/v1/admissions', p));

/* ---------------- Import & enrollment ---------------- */

export const useValidateImportMutation = () =>
  useMutation({
    mutationFn: (fileName: string) => postRequest<ImportBatch>('/v1/imports', { fileName }),
  });

export const useCommitImportMutation = () =>
  useStudentsMutation(({ id, ...p }: ImportCommitPayload & { id: string }) =>
    postRequest<ImportResult>(`/v1/imports/${id}/commit`, p),
  );

export const useEnrollmentOptionsQuery = () =>
  useQuery({
    queryKey: queryKeys.enrollment,
    queryFn: () => getRequest<EnrollmentOptions>('/v1/enrollment/options'),
  });

export const useEnrollMutation = () =>
  useStudentsMutation((p: EnrollPayload) =>
    postRequest<{ enrolled: number; className: string }>('/v1/enrollments', p),
  );

/* ---------------- Guardians ---------------- */

export type GuardianList = Paginated<GuardianRow> & {
  duplicates: GuardianDuplicate[];
  studentsWithoutGuardian: number;
};

export function useGuardiansQuery(params: MaybeRefOrGetter<PageQuery>) {
  return useQuery({
    queryKey: computed(() => queryKeys.guardians.list(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<GuardianList>('/v1/guardians', { params: cleanParams(toValue(params)) }),
    placeholderData: keepPreviousData,
  });
}

export const useGuardianQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.guardians.detail(toValue(id))),
    queryFn: () => getRequest<GuardianDetail>(`/v1/guardians/${toValue(id)}`),
  });

export const useAddGuardianMutation = () =>
  useStudentsMutation((p: GuardianPayload) => postRequest<GuardianRow>('/v1/guardians', p));

export const useMergeGuardiansMutation = () =>
  useStudentsMutation((p: { keepId: string; mergeId: string }) =>
    postRequest<GuardianRow>('/v1/guardians/merge', p),
  );
