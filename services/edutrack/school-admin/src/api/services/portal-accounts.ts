import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  GuardianInviteResult,
  GuardianRow,
  InviteGuardiansPayload,
  StudentLoginsPayload,
  StudentLoginsResult,
  StudentLoginsView,
} from '@/types';

import { cleanParams, deleteRequest, getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

/*
 * Parent and Student Portal accounts: guardian invitations (manual, one at a time or in bulk) and
 * student logins with their one-time-password slips.
 */

function useAccountsMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        [queryKeys.guardians.all, queryKeys.students.all, ['student-logins']].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

/** Invites one guardian to the Parent Portal, or resends a pending invitation. */
export const useInviteGuardianMutation = () =>
  useAccountsMutation((id: string) => postRequest<GuardianRow>(`/v1/guardians/${id}/invite`));

export const useWithdrawGuardianInviteMutation = () =>
  useAccountsMutation((id: string) => deleteRequest<GuardianRow>(`/v1/guardians/${id}/invite`));

/** The chosen guardians, or everyone without an account (optionally in one class or branch). */
export const useInviteGuardiansMutation = () =>
  useAccountsMutation((p: InviteGuardiansPayload) =>
    postRequest<GuardianInviteResult>('/v1/guardians/invite', p),
  );

export const useStudentLoginsQuery = (className: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => ['student-logins', toValue(className)] as const),
    queryFn: () =>
      getRequest<StudentLoginsView>('/v1/students/logins', {
        params: cleanParams({ className: toValue(className) }),
      }),
  });

/** Creates logins and answers the slips (the passwords are in this answer only). */
export const useCreateStudentLoginsMutation = () =>
  useAccountsMutation((p: StudentLoginsPayload) =>
    postRequest<StudentLoginsResult>('/v1/students/logins', p),
  );
