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
