import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';

import type { Profile, ProfilePayload } from '@/types';

import { getRequest, putRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const PROFILE = queryKeys.profile.key('detail');

export const useProfileQuery = () =>
  useQuery({ queryKey: PROFILE, queryFn: () => getRequest<Profile>('/v1/profile') });

export function useSaveProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProfilePayload) => putRequest<Profile>('/v1/profile', payload),
    onSuccess: (profile) => {
      qc.setQueryData(PROFILE, profile);
      // "Complete your profile" depends on the phone number.
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      return qc.invalidateQueries({ queryKey: queryKeys.me.all });
    },
  });
}
