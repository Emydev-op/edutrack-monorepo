import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  ConversationList,
  ConversationThread,
  MessageContacts,
  NewMessagePayload,
} from '@/types';

import { getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.messages;
const threadKey = (id: string) => k.key('thread', id);
const threadUrl = (id: string) => `/v1/messages/${encodeURIComponent(id)}`;

/** My conversations with parents, newest first, and the total unread (the sidebar badge). */
export const useConversationsQuery = () =>
  useQuery({
    queryKey: k.key('list'),
    queryFn: () => getRequest<ConversationList>('/v1/messages'),
    refetchInterval: 30_000,
  });

/** One conversation, refreshed every 15 s. Opening it marks it read for me. */
export function useConversationQuery(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: computed(() => threadKey(toValue(id))),
    queryFn: async () => {
      const thread = await getRequest<ConversationThread>(threadUrl(toValue(id)));
      const list = qc.getQueryData<ConversationList>(k.key('list'));
      const summary = list?.conversations.find((c) => c.id === thread.id);
      // Unread here (or not in the list yet): refresh the list and the sidebar badge.
      if (!summary || summary.unread) void qc.invalidateQueries({ queryKey: k.key('list') });
      return thread;
    },
    enabled: computed(() => Boolean(toValue(id))),
    refetchInterval: 15_000,
    retry: false,
  });
}

/** The students I teach this term and their parents, for a new message. */
export const useMessageContactsQuery = () =>
  useQuery({
    queryKey: k.key('contacts'),
    queryFn: () => getRequest<MessageContacts>('/v1/messages/contacts'),
    staleTime: 5 * 60_000,
  });

export function useStartConversationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NewMessagePayload) =>
      postRequest<ConversationThread>('/v1/messages', payload),
    onSuccess: (thread) => {
      qc.setQueryData(threadKey(thread.id), thread);
      void qc.invalidateQueries({ queryKey: k.key('list') });
    },
  });
}

export function useReplyMutation(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => postRequest<ConversationThread>(threadUrl(toValue(id)), { body }),
    onSuccess: (thread) => {
      qc.setQueryData(threadKey(thread.id), thread);
      void qc.invalidateQueries({ queryKey: k.key('list') });
    },
  });
}
