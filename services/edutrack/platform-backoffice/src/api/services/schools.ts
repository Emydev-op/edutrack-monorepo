import type { Paginated } from '@edutrack/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AuditEntry,
  InviteSchoolAdminPayload,
  PlatformInvoice,
  ProvisionSchoolPayload,
  School,
  SchoolAdministrator,
  SchoolQuery,
  SchoolSubscription,
  SchoolUsage,
  SubscriptionAction,
  TimelineEntry,
  UpdateSchoolPayload,
} from '@/types';

import { cleanParams, getRequest, patchRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

/** Anything that changes a school can move dashboard counts, subscriptions and the activity feed. */
function useInvalidateSchools() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.schools.all }),
      qc.invalidateQueries({ queryKey: queryKeys.subscriptions.all }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      qc.invalidateQueries({ queryKey: queryKeys.activity.all }),
      qc.invalidateQueries({ queryKey: queryKeys.audit.all }),
    ]);
}

export function useSchoolsQuery(params: MaybeRefOrGetter<SchoolQuery>) {
  return useQuery({
    queryKey: computed(() => queryKeys.schools.list(cleanParams(toValue(params)))),
    queryFn: () =>
      getRequest<Paginated<School>>('/v1/schools', { params: cleanParams(toValue(params)) }),
    placeholderData: keepPreviousData,
  });
}

export function useSchoolQuery(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.schools.detail(toValue(id))),
    queryFn: () => getRequest<School>(`/v1/schools/${toValue(id)}`),
  });
}

function useSchoolSection<T>(id: MaybeRefOrGetter<string>, section: string) {
  return useQuery({
    queryKey: computed(() => queryKeys.schools.section(toValue(id), section)),
    queryFn: () => getRequest<T>(`/v1/schools/${toValue(id)}/${section}`),
  });
}

export const useSchoolSubscriptionQuery = (id: MaybeRefOrGetter<string>) =>
  useSchoolSection<SchoolSubscription>(id, 'subscription');
export const useSchoolAdministratorsQuery = (id: MaybeRefOrGetter<string>) =>
  useSchoolSection<SchoolAdministrator[]>(id, 'administrators');
export const useSchoolUsageQuery = (id: MaybeRefOrGetter<string>) =>
  useSchoolSection<SchoolUsage>(id, 'usage');
export const useSchoolBillingQuery = (id: MaybeRefOrGetter<string>) =>
  useSchoolSection<PlatformInvoice[]>(id, 'billing');
export const useSchoolActivityQuery = (id: MaybeRefOrGetter<string>) =>
  useSchoolSection<TimelineEntry[]>(id, 'activity');
export const useSchoolAuditQuery = (id: MaybeRefOrGetter<string>) =>
  useSchoolSection<AuditEntry[]>(id, 'audit');

export function useUpdateSchoolMutation(id: MaybeRefOrGetter<string>) {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: (payload: UpdateSchoolPayload) =>
      patchRequest<School>(`/v1/schools/${toValue(id)}`, payload),
    onSuccess: () => invalidate(),
  });
}

export function useSuspendSchoolsMutation() {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
      ids.length === 1
        ? postRequest(`/v1/schools/${ids[0]}/suspend`, { reason })
        : postRequest('/v1/schools/bulk-suspend', { ids, reason }),
    onSuccess: () => invalidate(),
  });
}

export function useReactivateSchoolMutation() {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: (id: string) => postRequest<School>(`/v1/schools/${id}/reactivate`),
    onSuccess: () => invalidate(),
  });
}

export const useSendRenewalRemindersMutation = () =>
  useMutation({
    mutationFn: (ids: string[]) =>
      postRequest<{ queued: number }>('/v1/schools/reminders', { ids }),
  });

export function useStartSupportSessionMutation(id: MaybeRefOrGetter<string>) {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: (reason: string) =>
      postRequest(`/v1/schools/${toValue(id)}/support-sessions`, { reason }),
    onSuccess: () => invalidate(),
  });
}

export function useInviteSchoolAdminMutation(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: InviteSchoolAdminPayload) =>
      postRequest<SchoolAdministrator>(`/v1/schools/${toValue(id)}/administrators`, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.schools.section(toValue(id), 'administrators') }),
  });
}

export function useResendSchoolAdminInviteMutation(id: MaybeRefOrGetter<string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adminId: string) =>
      postRequest(`/v1/schools/${toValue(id)}/administrators/${adminId}/resend`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.schools.section(toValue(id), 'administrators') }),
  });
}

export function useSubscriptionActionMutation(id: MaybeRefOrGetter<string>) {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: (action: SubscriptionAction) =>
      postRequest<School>(`/v1/schools/${toValue(id)}/subscription/actions`, action),
    onSuccess: () => invalidate(),
  });
}

export function useProvisionSchoolMutation() {
  const invalidate = useInvalidateSchools();
  return useMutation({
    mutationFn: (payload: ProvisionSchoolPayload) => postRequest<School>('/v1/schools', payload),
    onSuccess: () => invalidate(),
  });
}
