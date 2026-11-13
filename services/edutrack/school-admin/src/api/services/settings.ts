import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, toValue, type MaybeRefOrGetter } from 'vue';

import type {
  AcademicPolicy,
  AcademicSettings,
  ChangePasswordPayload,
  FinanceToggles,
  ModuleRow,
  NumberingPayload,
  SchoolSettings,
  SecurityView,
  SettingsArea,
  SettingsChange,
  SignInRules,
  SubscriptionView,
} from '@/types';

import { deleteRequest, getRequest, postRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.settings;

/**
 * Settings reach other modules (results and promotion, finance billing, numbering), so a change
 * refreshes those areas and the change history too.
 */
function useSettingsMutation<V, R>(
  fn: (vars: V) => Promise<R>,
  extra: readonly (readonly unknown[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        [k.all, ...extra].map((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] })),
      ),
  });
}

export const useSchoolSettingsQuery = () =>
  useQuery({
    queryKey: k.key('school'),
    queryFn: () => getRequest<SchoolSettings>('/v1/settings/school'),
  });

export const useSaveNumberingMutation = () =>
  useSettingsMutation((body: Partial<NumberingPayload>) =>
    putRequest<SchoolSettings>('/v1/settings/numbering', body),
  );

export const useAcademicSettingsQuery = () =>
  useQuery({
    queryKey: k.key('academic'),
    queryFn: () => getRequest<AcademicSettings>('/v1/settings/academic'),
  });

export const useSaveAcademicSettingsMutation = () =>
  useSettingsMutation(
    (body: Partial<AcademicPolicy>) => putRequest<AcademicSettings>('/v1/settings/academic', body),
    [queryKeys.academics.all],
  );

export const useFinanceTogglesQuery = () =>
  useQuery({
    queryKey: k.key('finance'),
    queryFn: () => getRequest<FinanceToggles>('/v1/settings/finance'),
  });

export const useSaveFinanceTogglesMutation = () =>
  useSettingsMutation(
    (body: Partial<FinanceToggles>) => putRequest<FinanceToggles>('/v1/settings/finance', body),
    [queryKeys.finance.all],
  );

export const useSubscriptionQuery = () =>
  useQuery({
    queryKey: k.key('subscription'),
    queryFn: () => getRequest<SubscriptionView>('/v1/settings/subscription'),
  });

export const useModulesQuery = () =>
  useQuery({
    queryKey: k.key('modules'),
    queryFn: () => getRequest<ModuleRow[]>('/v1/settings/modules'),
  });

export const useSecurityQuery = () =>
  useQuery({
    queryKey: k.key('security'),
    queryFn: () => getRequest<SecurityView>('/v1/settings/security'),
  });

export const useChangePasswordMutation = () =>
  useSettingsMutation((body: ChangePasswordPayload) =>
    postRequest<{ signedOut: number; view: SecurityView }>('/v1/settings/security/password', body),
  );

export const useEndSessionMutation = () =>
  useSettingsMutation((id: string) =>
    deleteRequest<SecurityView>(`/v1/settings/security/sessions/${id}`),
  );

export const useSignOutOthersMutation = () =>
  useSettingsMutation(() =>
    postRequest<SecurityView>('/v1/settings/security/sessions/sign-out-others'),
  );

export const useSaveSignInRulesMutation = () =>
  useSettingsMutation((body: SignInRules) =>
    putRequest<SecurityView>('/v1/settings/security/rules', body),
  );

export const useSettingsHistoryQuery = (area: MaybeRefOrGetter<SettingsArea | ''>) =>
  useQuery({
    queryKey: computed(() => k.key('history', toValue(area))),
    queryFn: () =>
      getRequest<SettingsChange[]>('/v1/settings/history', {
        params: toValue(area) ? { area: toValue(area) } : {},
      }),
  });
