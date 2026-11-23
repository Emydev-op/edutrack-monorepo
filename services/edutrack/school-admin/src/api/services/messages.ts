import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { isAxiosError } from 'axios';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type { ConversationList, MessageContacts, MessageThread, NewMessagePayload } from '@/types';

import { getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

/**
 * The school office's conversations with parents (Communication › Messages). Needs school-wide
 * messaging (comms.school); everyone else gets a 403, which the screens explain and the sidebar
 * badge quietly ignores.
 */
const key = (...parts: unknown[]) => queryKeys.comms.key('messages', ...parts);

/** No point polling an inbox the signed-in role can't read. */
const pollUnlessForbidden =
  (ms: number) =>
  (query: { state: { error: unknown } }): number | false =>
    isForbidden(query.state.error) ? false : ms;

export const isForbidden = (error: unknown) =>
  isAxiosError(error) && error.response?.status === 403;

export const useMessagesQuery = () =>
  useQuery({
    queryKey: key('list'),
    queryFn: () => getRequest<ConversationList>('/v1/comms/messages'),
    // Parents reply in the background, so the list keeps itself fresh.
    refetchInterval: pollUnlessForbidden(30_000),
    staleTime: 0,
  });

/** Opening a thread marks it read, so the list (and the sidebar badge) is refreshed after it. */
export function useMessageThreadQuery(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: computed(() => key('thread', toValue(id))),
    queryFn: async () => {
      const thread = await getRequest<MessageThread>(`/v1/comms/messages/${toValue(id)}`);
      void qc.invalidateQueries({ queryKey: key('list') });
      return thread;
    },
    enabled: computed(() => !!toValue(id)),
    refetchInterval: pollUnlessForbidden(15_000),
    staleTime: 0,
  });
}

/** Parents matching a name, with their children; only asked for from two letters. */
export const useMessageContactsQuery = (q: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => key('contacts', toValue(q).trim())),
    queryFn: () =>
      getRequest<MessageContacts>('/v1/comms/messages/contacts', {
        params: { q: toValue(q).trim() },
      }),
    enabled: computed(() => toValue(q).trim().length >= 2),
    placeholderData: keepPreviousData,
  });

/** Sending or replying changes the thread, the list and its unread counts. */
function useMessageMutation<V>(fn: (vars: V) => Promise<MessageThread>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (thread) => {
      qc.setQueryData(key('thread', thread.id), thread);
      return qc.invalidateQueries({ queryKey: key('list') });
    },
  });
}

export const useSendMessageMutation = () =>
  useMessageMutation((payload: NewMessagePayload) =>
    postRequest<MessageThread>('/v1/comms/messages', payload),
  );

export const useReplyMutation = () =>
  useMessageMutation(({ id, body }: { id: string; body: string }) =>
    postRequest<MessageThread>(`/v1/comms/messages/${id}`, { body }),
  );
