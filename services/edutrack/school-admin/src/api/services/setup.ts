import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

import type { SetupProgress, SetupStep } from '@/types';

import { getRequest, postRequest } from '../helpers';
import { queryKeys } from '../query-keys';

export const useSetupQuery = () =>
  useQuery({
    queryKey: queryKeys.setup.all,
    queryFn: () => getRequest<SetupProgress>('/v1/setup'),
  });

function useInvalidateSetup() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.setup.all }),
      qc.invalidateQueries({ queryKey: queryKeys.navCounts }),
      // Academics screens show whether their step is confirmed (e.g. Classes needs Sections).
      qc.invalidateQueries({ queryKey: queryKeys.academics.all }),
    ]);
}

export function useCompleteSetupStepMutation() {
  const invalidate = useInvalidateSetup();
  return useMutation({
    mutationFn: (id: string) => postRequest<SetupStep>(`/v1/setup/steps/${id}/complete`),
    onSuccess: invalidate,
  });
}

export function useFinishSetupMutation() {
  const invalidate = useInvalidateSetup();
  return useMutation({
    mutationFn: () => postRequest<SetupProgress>('/v1/setup/finish'),
    onSuccess: invalidate,
  });
}
