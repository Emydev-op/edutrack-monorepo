import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { ConversationList, MessageContacts, NewMessagePayload, Thread } from '@/types';

import { getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const M = '/v1/parent/messages';
const path = (id: string) => `${M}/${encodeURIComponent(id)}`;

/** Conversations with teachers and the school, newest first, with the unread total. */
export const useMessagesQuery = () =>
  useQuery({
    queryKey: queryKeys.messages,
    queryFn: () => getRequest<ConversationList>(M),
    refetchInterval: 30_000,
  });

/** Who the parent can write to: the school, and each child's teachers this term. */
export const useMessageContactsQuery = () =>
  useQuery({
    queryKey: queryKeys.messageContacts,
    queryFn: () => getRequest<MessageContacts>(`${M}/contacts`),
  });

/** One conversation. Opening it marks it read, so the list (and the badge) refreshes too. */
export function useThreadQuery(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: computed(() => queryKeys.thread(toValue(id))),
    queryFn: async () => {
      const key = toValue(id);
      const thread = await getRequest<Thread>(path(key));
      const list = qc.getQueryData<ConversationList>(queryKeys.messages);
      if (!list || list.conversations.some((c) => c.id === key && c.unread > 0))
        void qc.invalidateQueries({ queryKey: queryKeys.messages, exact: true });
      return thread;
    },
    enabled: computed(() => !!toValue(id)),
    refetchInterval: 15_000,
  });
}

export function useSendMessageMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NewMessagePayload) => postRequest<Thread>(M, payload),
    onSuccess: (thread) => {
      qc.setQueryData(queryKeys.thread(thread.id), thread);
      void qc.invalidateQueries({ queryKey: queryKeys.messages, exact: true });
    },
  });
}

export function useReplyMutation(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => postRequest<Thread>(path(toValue(id)), { body }),
    onSuccess: (thread) => {
      qc.setQueryData(queryKeys.thread(thread.id), thread);
      void qc.invalidateQueries({ queryKey: queryKeys.messages, exact: true });
    },
  });
}
