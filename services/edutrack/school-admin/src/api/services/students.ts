import type { Paginated } from '@edutrack/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AdmissionApplication,
  AdmissionMatches,
  AdmissionOptions,
  AdmitPayload,
  AdmitResult,
  ChangeSubjectsPayload,
  ClassSubjectChoices,
  ClassSubjectChoicesPayload,
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
  StudentSubjects,
  SubjectOptions,
  TransferPayload,
} from '@/types';

import { cleanParams, getRequest, postRequest, putRequest } from '../helpers';
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
          queryKeys.finance.all,
          queryKeys.comms.all,
          queryKeys.notifications,
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

/** Sets (a JPG or PNG data URL) or removes (null) a student's photo. */
export const useStudentPhotoMutation = () =>
  useStudentsMutation((p: { id: string; photo: string | null }) =>
    putRequest<{ photoUrl: string | null }>(`/v1/students/${p.id}/photo`, { photo: p.photo }),
  );

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

/** What a class level at a branch offers this session: compulsory, religious and elective groups. */
export const useSubjectOptionsQuery = (
  branch: MaybeRefOrGetter<string>,
  level: MaybeRefOrGetter<string>,
) =>
  useQuery({
    queryKey: computed(() => queryKeys.admissions.subjectOptions(toValue(branch), toValue(level))),
    queryFn: () =>
      getRequest<SubjectOptions>('/v1/admissions/subject-options', {
        params: { branch: toValue(branch), level: toValue(level) },
      }),
    enabled: computed(() => !!toValue(branch) && !!toValue(level)),
  });

/* ---------------- Subject choices ---------------- */

export const useStudentSubjectsQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.students.subjects(toValue(id))),
    queryFn: () => getRequest<StudentSubjects>(`/v1/students/${toValue(id)}/subjects`),
  });

export const useChangeSubjectsMutation = (id: MaybeRefOrGetter<string>) =>
  useStudentsMutation((p: ChangeSubjectsPayload) =>
    putRequest<StudentSubjects>(`/v1/students/${toValue(id)}/subjects`, p),
  );

export const useClassSubjectChoicesQuery = (
  armId: MaybeRefOrGetter<string>,
  sessionId: MaybeRefOrGetter<string> = '',
) =>
  useQuery({
    queryKey: computed(() => queryKeys.students.choices(toValue(armId), toValue(sessionId))),
    queryFn: () =>
      getRequest<ClassSubjectChoices>(`/v1/subject-choices/${toValue(armId)}`, {
        params: cleanParams({ sessionId: toValue(sessionId) }),
      }),
    enabled: computed(() => !!toValue(armId)),
  });

export const useSaveClassSubjectChoicesMutation = () =>
  useStudentsMutation(({ armId, ...p }: ClassSubjectChoicesPayload & { armId: string }) =>
    putRequest<ClassSubjectChoices>(`/v1/subject-choices/${armId}`, p),
  );

/* ---------------- Import & enrollment ---------------- */

export const useValidateImportMutation = () =>
  useMutation({
    mutationFn: (p: { fileName: string; text: string; branch: string }) =>
      postRequest<ImportBatch>('/v1/imports', p),
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
