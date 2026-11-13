import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { useTermContext } from '@/composables/useTermContext';
import type {
  AssignmentDetail,
  AssignmentList,
  AssignmentListQuery,
  AssignmentPayload,
  BulkReturnResult,
  GradePayload,
  StudentAssignmentRow,
  SubmissionDetail,
  SubmissionList,
} from '@/types';

import {
  cleanParams,
  deleteRequest,
  getRequest,
  patchRequest,
  postRequest,
  putRequest,
} from '../helpers';
import { queryKeys } from '../query-keys';

const A = queryKeys.assignments;
const enc = encodeURIComponent;

/** My assignments for the selected term (filters: class, subject, status, search, page). */
export function useAssignmentsQuery(params: MaybeRefOrGetter<AssignmentListQuery>) {
  const { termId } = useTermContext();
  const query = computed(() => cleanParams({ term: termId.value, ...toValue(params) }));
  return useQuery({
    queryKey: computed(() => A.key('list', query.value)),
    queryFn: () => getRequest<AssignmentList>('/v1/assignments', { params: query.value }),
    enabled: computed(() => Boolean(termId.value)),
    placeholderData: keepPreviousData,
  });
}

export const useAssignmentQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => A.key('detail', toValue(id))),
    queryFn: () => getRequest<AssignmentDetail>(`/v1/assignments/${enc(toValue(id))}`),
    enabled: computed(() => Boolean(toValue(id))),
  });

export const useSubmissionsQuery = (
  id: MaybeRefOrGetter<string>,
  params: MaybeRefOrGetter<{ status?: string; search?: string; page?: number; pageSize?: number }>,
) =>
  useQuery({
    queryKey: computed(() => A.key('submissions', toValue(id), cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<SubmissionList>(`/v1/assignments/${enc(toValue(id))}/submissions`, {
        params: cleanParams(toValue(params)),
      }),
    placeholderData: keepPreviousData,
  });

export const useSubmissionQuery = (
  assignmentId: MaybeRefOrGetter<string>,
  submissionId: MaybeRefOrGetter<string>,
) =>
  useQuery({
    queryKey: computed(() => A.key('submission', toValue(assignmentId), toValue(submissionId))),
    queryFn: () =>
      getRequest<SubmissionDetail>(
        `/v1/assignments/${enc(toValue(assignmentId))}/submissions/${enc(toValue(submissionId))}`,
      ),
  });

/** One student's assignments from me this term, for the student page. */
export function useStudentAssignmentsQuery(studentId: MaybeRefOrGetter<string>) {
  const { termId } = useTermContext();
  return useQuery({
    queryKey: computed(() => A.key('student', toValue(studentId), termId.value)),
    queryFn: () =>
      getRequest<StudentAssignmentRow[]>(`/v1/assignments/student/${enc(toValue(studentId))}`, {
        params: { term: termId.value },
      }),
    enabled: computed(() => Boolean(termId.value && toValue(studentId))),
  });
}

/** Every change refreshes the area and the sidebar's "to grade" badge. */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: A.all }),
      qc.invalidateQueries({ queryKey: queryKeys.navCounts.all }),
      // The class page and dashboard show assignment figures too.
      qc.invalidateQueries({ queryKey: queryKeys.teaching.all }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ]);
}

/** Creates (no id) or updates an assignment. */
export function useSaveAssignmentMutation() {
  const { termId } = useTermContext();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: AssignmentPayload }) =>
      id
        ? patchRequest<AssignmentDetail>(`/v1/assignments/${enc(id)}`, payload)
        : postRequest<AssignmentDetail>('/v1/assignments', payload, {
            params: { term: termId.value },
          }),
    onSuccess: invalidate,
  });
}

export function useAssignmentActionMutation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'close' | 'reopen' | 'delete';
    }): Promise<AssignmentDetail | { deleted: string }> =>
      action === 'delete'
        ? deleteRequest<{ deleted: string }>(`/v1/assignments/${enc(id)}`)
        : postRequest<AssignmentDetail>(`/v1/assignments/${enc(id)}/${action}`),
    onSuccess: invalidate,
  });
}

type SubmissionAction =
  | { kind: 'grade'; payload: GradePayload }
  | { kind: 'return'; payload: Partial<GradePayload> }
  | { kind: 'excuse'; reason: string }
  | { kind: 'unexcuse' };

export function useSubmissionMutation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      assignmentId,
      submissionId,
      action,
    }: {
      assignmentId: string;
      submissionId: string;
      action: SubmissionAction;
    }) => {
      const url = `/v1/assignments/${enc(assignmentId)}/submissions/${enc(submissionId)}`;
      switch (action.kind) {
        case 'grade':
          return putRequest<SubmissionDetail>(`${url}/grade`, action.payload);
        case 'return':
          return postRequest<SubmissionDetail>(`${url}/return`, action.payload);
        case 'excuse':
          return postRequest<SubmissionDetail>(`${url}/excuse`, { reason: action.reason });
        case 'unexcuse':
          return deleteRequest<SubmissionDetail>(`${url}/excuse`);
      }
    },
    onSuccess: invalidate,
  });
}

export function useBulkReturnMutation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ assignmentId, ids }: { assignmentId: string; ids: string[] }) =>
      postRequest<BulkReturnResult>(`/v1/assignments/${enc(assignmentId)}/submissions/return`, {
        ids,
      }),
    onSuccess: invalidate,
  });
}
