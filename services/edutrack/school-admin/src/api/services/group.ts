import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

import { useAuthStore } from '@/stores/auth';
import type { LoginResponse } from '@/types';

import { getRequest, postRequest } from '../helpers';

export interface GroupOverview {
  group: { id: string; name: string };
  role: string;
  schools: {
    id: string;
    name: string;
    slug: string;
    brandColor: string | null;
    status: string;
    plan: string | null;
    subscription: string | null;
    term: string | null;
    students: number;
    staff: number;
    branches: number;
    fees: { billed: number; collected: number; outstanding: number } | null;
  }[];
  totals: {
    schools: number;
    students: number;
    staff: number;
    branches: number;
    fees: { billed: number; collected: number; outstanding: number } | null;
  };
}

/** The group overview, for a school group's own staff (others get 403, so it's not retried). */
export const useGroupOverviewQuery = () =>
  useQuery({
    queryKey: ['group-overview'],
    queryFn: () => getRequest<GroupOverview>('/v1/group/overview'),
    retry: false,
    staleTime: 60_000,
  });

/** Moves the session to another of the person's schools (group staff move between them). */
export const useSwitchSchoolMutation = () => {
  const auth = useAuthStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (schoolId: string) =>
      postRequest<LoginResponse>('/v1/auth/switch-school', { schoolId }),
    onSuccess: (session) => {
      auth.refreshed(session);
      qc.clear();
    },
  });
};

export interface GroupTemplate {
  key: 'grading' | 'fees' | 'roles' | 'messages';
  label: string;
  description: string;
  canEdit: boolean;
  saved: { at: string; from: string | null } | null;
  schools: { schoolId: string; school: string; status: 'Matches' | 'Differs' | 'Not set' | null }[];
}
export interface GroupTemplatesView {
  group: string;
  templates: GroupTemplate[];
}
type ApplyResult = GroupTemplatesView & {
  label: string;
  results: { school: string; applied: boolean; notes: string[] }[];
};

/** The group's shared setup and whether each school matches it. */
export const useGroupTemplatesQuery = () =>
  useQuery({
    queryKey: ['group-templates'],
    queryFn: () => getRequest<GroupTemplatesView>('/v1/group/templates'),
    retry: false,
  });

export const useSaveGroupTemplateMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, schoolId }: { key: string; schoolId: string }) =>
      postRequest<GroupTemplatesView>(`/v1/group/templates/${key}/save`, { schoolId }),
    onSuccess: (data) => qc.setQueryData(['group-templates'], data),
  });
};

export const useApplyGroupTemplateMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, schoolIds }: { key: string; schoolIds: string[] }) =>
      postRequest<ApplyResult>(`/v1/group/templates/${key}/apply`, { schoolIds }),
    onSuccess: (data) => qc.setQueryData(['group-templates'], data),
  });
};
