import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { SchoolSms, SmsTopUpPayload } from '@/types';

import { getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const smsKey = (id: string) => queryKeys.schools.section(id, 'sms');

/** A school's SMS units, ledger and sender ID requests. */
export const useSchoolSmsQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => smsKey(toValue(id))),
    queryFn: () => getRequest<SchoolSms>(`/v1/platform/schools/${toValue(id)}/sms`),
  });

/** Top-ups and sender ID decisions also show in the school's activity and audit log. */
function useSmsMutation<V>(id: MaybeRefOrGetter<string>, fn: (vars: V) => Promise<SchoolSms>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      qc.setQueryData(smsKey(toValue(id)), data);
      return Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.senderIds.all }),
        qc.invalidateQueries({ queryKey: queryKeys.schools.section(toValue(id), 'activity') }),
        qc.invalidateQueries({ queryKey: queryKeys.schools.section(toValue(id), 'audit') }),
      ]);
    },
  });
}

export const useSmsTopUpMutation = (id: MaybeRefOrGetter<string>) =>
  useSmsMutation(id, (payload: SmsTopUpPayload) =>
    postRequest<SchoolSms>(`/v1/platform/schools/${toValue(id)}/sms/top-ups`, payload),
  );

export const useSenderIdDecisionMutation = (id: MaybeRefOrGetter<string>) =>
  useSmsMutation(id, ({ approve, note }: { approve: boolean; note: string }) =>
    postRequest<SchoolSms>(
      `/v1/platform/schools/${toValue(id)}/sender-id/${approve ? 'approve' : 'reject'}`,
      { note },
    ),
  );
