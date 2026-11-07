import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AnnouncementDetail,
  AnnouncementList,
  AnnouncementPayload,
  AnnouncementQuery,
  AudiencePreview,
  CommsOptions,
  CommsSettings,
  DeliveryDetail,
  DeliveryDetailQuery,
  DeliveryList,
  DeliveryQuery,
  EventSettingsPayload,
  InboxList,
  TemplateDetail,
  TemplatePayload,
  TemplateRow,
} from '@/types';

import { cleanParams, deleteRequest, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.comms;
const q = <T>(params: MaybeRefOrGetter<object>) =>
  cleanParams(toValue(params) as Record<string, unknown>) as T;

/**
 * Messages change SMS credit (Settings → Subscription), the inbox and sidebar counts, so every
 * communication change refreshes those too.
 */
function useCommsMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        [k.all, queryKeys.notifications, queryKeys.navCounts, queryKeys.settings.all].map(
          (queryKey) => qc.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

/* ---------------- Shared ---------------- */

export const useCommsOptionsQuery = () =>
  useQuery({
    queryKey: k.key('options'),
    queryFn: () => getRequest<CommsOptions>('/v1/comms/options'),
  });

/* ---------------- Announcements ---------------- */

export const useAnnouncementsQuery = (params: MaybeRefOrGetter<AnnouncementQuery>) =>
  useQuery({
    queryKey: computed(() => k.key('announcements', q(params))),
    queryFn: () => getRequest<AnnouncementList>('/v1/comms/announcements', { params: q(params) }),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

export const useAnnouncementQuery = (id: MaybeRefOrGetter<string | null>) =>
  useQuery({
    queryKey: computed(() => k.key('announcement', toValue(id))),
    queryFn: () => getRequest<AnnouncementDetail>(`/v1/comms/announcements/${toValue(id)}`),
    enabled: computed(() => !!toValue(id)),
    staleTime: 0,
  });

export type PreviewInput = Pick<AnnouncementPayload, 'audience' | 'channels' | 'smsText'>;

export const useAudiencePreviewQuery = (input: MaybeRefOrGetter<PreviewInput | null>) =>
  useQuery({
    queryKey: computed(() => k.key('preview', toValue(input))),
    queryFn: () => postRequest<AudiencePreview>('/v1/comms/announcements/preview', toValue(input)),
    enabled: computed(() => !!toValue(input)),
    placeholderData: keepPreviousData,
    retry: false,
  });

export const useSaveAnnouncementMutation = () =>
  useCommsMutation(({ id, ...payload }: AnnouncementPayload & { id?: string }) =>
    id
      ? putRequest<AnnouncementDetail>(`/v1/comms/announcements/${id}`, payload)
      : postRequest<AnnouncementDetail>('/v1/comms/announcements', payload),
  );

export const useAnnouncementActionMutation = () =>
  useCommsMutation(
    ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: 'cancel' | 'withdraw' | 'duplicate';
      reason?: string;
    }) => postRequest<AnnouncementDetail>(`/v1/comms/announcements/${id}/${action}`, { reason }),
  );

export const useDeleteAnnouncementMutation = () =>
  useCommsMutation((id: string) => deleteRequest(`/v1/comms/announcements/${id}`));

/* ---------------- Delivery logs ---------------- */

export const useDeliveriesQuery = (params: MaybeRefOrGetter<DeliveryQuery>) =>
  useQuery({
    queryKey: computed(() => k.key('deliveries', q(params))),
    queryFn: () => getRequest<DeliveryList>('/v1/comms/deliveries', { params: q(params) }),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

export const useDeliveryQuery = (
  id: MaybeRefOrGetter<string>,
  params: MaybeRefOrGetter<DeliveryDetailQuery>,
) =>
  useQuery({
    queryKey: computed(() => k.key('delivery', toValue(id), q(params))),
    queryFn: () =>
      getRequest<DeliveryDetail>(`/v1/comms/deliveries/${toValue(id)}`, { params: q(params) }),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

type RetryResult = { retried: number; stillFailed: number; credit: number };

export const useRetryDeliveryMutation = () =>
  useCommsMutation((id: string) => postRequest<RetryResult>(`/v1/comms/deliveries/${id}/retry`));

export const useRetryAllFailedMutation = () =>
  useCommsMutation(() => postRequest<RetryResult>('/v1/comms/deliveries/retry-failed'));

/* ---------------- Templates ---------------- */

export const useTemplatesQuery = () =>
  useQuery({
    queryKey: k.key('templates'),
    queryFn: () => getRequest<TemplateRow[]>('/v1/comms/templates'),
  });

export const useTemplateQuery = (event: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => k.key('template', toValue(event))),
    queryFn: () => getRequest<TemplateDetail>(`/v1/comms/templates/${toValue(event)}`),
    staleTime: 0,
  });

export const useSaveTemplateMutation = () =>
  useCommsMutation(({ event, templates }: { event: string; templates: TemplatePayload }) =>
    putRequest<TemplateDetail>(`/v1/comms/templates/${event}`, templates),
  );

export const useResetTemplateMutation = () =>
  useCommsMutation((event: string) =>
    postRequest<TemplateDetail>(`/v1/comms/templates/${event}/reset`),
  );

/* ---------------- Settings ---------------- */

export const useCommsSettingsQuery = () =>
  useQuery({
    queryKey: k.key('settings'),
    queryFn: () => getRequest<CommsSettings>('/v1/comms/settings'),
    staleTime: 0,
  });

export const useSaveEventSettingsMutation = () =>
  useCommsMutation((events: EventSettingsPayload) =>
    putRequest<CommsSettings>('/v1/comms/settings/events', events),
  );

export const useSaveQuietHoursMutation = () =>
  useCommsMutation((p: { enabled: boolean; start: string; end: string }) =>
    putRequest<CommsSettings>('/v1/comms/settings/quiet-hours', p),
  );

export const useRequestSenderIdMutation = () =>
  useCommsMutation((name: string) =>
    postRequest<CommsSettings>('/v1/comms/settings/sender-id', { name }),
  );

/* ---------------- Inbox ---------------- */

export const useInboxQuery = (
  params: MaybeRefOrGetter<{ filter?: string; page?: number; pageSize?: number }>,
) =>
  useQuery({
    queryKey: computed(() => k.key('inbox', q(params))),
    queryFn: () => getRequest<InboxList>('/v1/comms/inbox', { params: q(params) }),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

export function useMarkReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postRequest(`/v1/notifications/${id}/read`),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.notifications }),
        qc.invalidateQueries({ queryKey: k.key('inbox') }),
      ]),
  });
}

export function useMarkAllReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postRequest('/v1/notifications/read-all'),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.notifications }),
        qc.invalidateQueries({ queryKey: k.key('inbox') }),
      ]),
  });
}
