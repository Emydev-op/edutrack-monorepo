import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  NewTicketPayload,
  TicketDetail,
  TicketList,
  TicketQuery,
  TicketReplyPayload,
} from '@/types';

import { cleanParams, getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.support;

/** Any ticket change refreshes the list, the ticket and the sidebar counts. */
function useSupportMutation<V>(fn: (vars: V) => Promise<TicketDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (ticket) => {
      qc.setQueryData(k.key('ticket', ticket.id), ticket);
      return Promise.all([
        qc.invalidateQueries({ queryKey: k.all }),
        qc.invalidateQueries({ queryKey: queryKeys.navCounts }),
      ]);
    },
  });
}

export const useTicketsQuery = (params: MaybeRefOrGetter<TicketQuery>) =>
  useQuery({
    queryKey: computed(() => k.key('tickets', cleanParams({ ...toValue(params) }))),
    queryFn: () =>
      getRequest<TicketList>('/v1/support/tickets', {
        params: cleanParams({ ...toValue(params) }),
      }),
    placeholderData: keepPreviousData,
  });

export const useTicketQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.key('ticket', toValue(id))),
    queryFn: () => getRequest<TicketDetail>(`/v1/support/tickets/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
    retry: false,
  });

export const useCreateTicketMutation = () =>
  useSupportMutation((body: NewTicketPayload) =>
    postRequest<TicketDetail>('/v1/support/tickets', body),
  );

export const useReplyTicketMutation = () =>
  useSupportMutation(({ id, ...body }: TicketReplyPayload & { id: string }) =>
    postRequest<TicketDetail>(`/v1/support/tickets/${id}/replies`, body),
  );

export const useConfirmTicketMutation = () =>
  useSupportMutation(({ id, rating }: { id: string; rating: number | null }) =>
    postRequest<TicketDetail>(`/v1/support/tickets/${id}/confirm`, { rating }),
  );

export const useReopenTicketMutation = () =>
  useSupportMutation(({ id, reason }: { id: string; reason: string }) =>
    postRequest<TicketDetail>(`/v1/support/tickets/${id}/reopen`, { reason }),
  );

export const useCloseTicketMutation = () =>
  useSupportMutation(({ id, reason }: { id: string; reason: string }) =>
    postRequest<TicketDetail>(`/v1/support/tickets/${id}/close`, { reason }),
  );
