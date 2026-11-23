import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import { deleteRequest, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export type GroupRole = 'Group owner' | 'Group finance' | 'Group academic';
export const GROUP_ROLES: GroupRole[] = ['Group owner', 'Group finance', 'Group academic'];

export interface GroupRow {
  id: string;
  name: string;
  schools: number;
  staff: number;
}

export interface GroupDetail {
  id: string;
  name: string;
  schools: { id: string; name: string; slug: string; status: string; plan: string | null }[];
  staff: {
    id: string;
    userId: string;
    name: string;
    email: string | null;
    role: GroupRole;
    status: 'Active' | 'Invited';
  }[];
}

const keys = {
  all: ['groups'] as const,
  detail: (id: string) => ['groups', id] as const,
};

export const useGroupsQuery = () =>
  useQuery({ queryKey: keys.all, queryFn: () => getRequest<GroupRow[]>('/v1/platform/groups') });

export const useGroupQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => keys.detail(toValue(id))),
    queryFn: () => getRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}`),
  });

function useGroupMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.all }),
        qc.invalidateQueries({ queryKey: queryKeys.schools.all }),
      ]),
  });
}

export const useCreateGroupMutation = () =>
  useGroupMutation((name: string) => postRequest<GroupDetail>('/v1/platform/groups', { name }));

export const useGroupSchoolMutation = (id: MaybeRefOrGetter<string>) =>
  useGroupMutation(({ schoolId, remove }: { schoolId: string; remove?: boolean }) =>
    remove
      ? deleteRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/schools/${schoolId}`)
      : postRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/schools`, { schoolId }),
  );

export const useAddGroupStaffMutation = (id: MaybeRefOrGetter<string>) =>
  useGroupMutation((p: { name: string; email: string; role: GroupRole }) =>
    postRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/staff`, p),
  );

export const useGroupStaffMutation = (id: MaybeRefOrGetter<string>) =>
  useGroupMutation(({ staffId, role }: { staffId: string; role?: GroupRole }) =>
    role
      ? putRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/staff/${staffId}`, { role })
      : deleteRequest<GroupDetail>(`/v1/platform/groups/${toValue(id)}/staff/${staffId}`),
  );

export type GroupPeriod = 'Annual' | 'Termly' | 'Monthly';
export const GROUP_PERIODS: GroupPeriod[] = ['Annual', 'Termly', 'Monthly'];

export interface GroupBilling {
  plan: string | null;
  period: GroupPeriod | null;
  priceKobo: number | null;
  price: string | null;
  /** What the member schools would pay on their own. */
  separately: string | null;
  startedOn: string | null;
  renewsOn: string | null;
  renewsOnLabel: string | null;
  billingContactEmail: string | null;
  status: 'Not set' | 'Active' | 'Overdue' | 'Lapsed';
  invoices: {
    number: string;
    period: string;
    amount: string;
    dueOn: string;
    status: 'Paid' | 'Due' | 'Overdue';
    reference: string | null;
  }[];
}

const billingKey = (id: string) => ['groups', id, 'billing'] as const;

export const useGroupBillingQuery = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => billingKey(toValue(id))),
    queryFn: () => getRequest<GroupBilling>(`/v1/platform/groups/${toValue(id)}/billing`),
  });

/** Group plan, stop, invoice and payment: they all change the group's schools' subscriptions. */
export const useGroupBillingMutation = (id: MaybeRefOrGetter<string>) => {
  const qc = useQueryClient();
  const base = () => `/v1/platform/groups/${toValue(id)}/billing`;
  return useMutation({
    mutationFn: (
      a:
        | {
            kind: 'plan';
            plan: string;
            period: GroupPeriod;
            priceNaira: number;
            renewsOn?: string;
            billingContactEmail?: string;
          }
        | { kind: 'stop' }
        | { kind: 'invoice' }
        | { kind: 'payment'; number: string; reference: string },
    ) => {
      if (a.kind === 'plan')
        return putRequest<GroupBilling>(base(), {
          plan: a.plan,
          period: a.period,
          priceNaira: a.priceNaira,
          renewsOn: a.renewsOn,
          billingContactEmail: a.billingContactEmail,
        });
      if (a.kind === 'stop') return deleteRequest<GroupBilling>(base());
      if (a.kind === 'invoice') return postRequest<GroupBilling>(`${base()}/invoices`, {});
      return postRequest<GroupBilling>(`${base()}/invoices/${a.number}/payment`, {
        reference: a.reference,
      });
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.all }),
        qc.invalidateQueries({ queryKey: queryKeys.schools.all }),
      ]),
  });
};
