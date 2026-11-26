import { useQuery } from '@tanstack/vue-query';

import type { MyHostel } from '@/types';

import { getRequest } from '../helpers';
import { queryKeys } from '../query-keys';

const k = queryKeys.boarding;

/** The hostels I look after as house staff (empty for other staff); also gates the sidebar item. */
export const useMyHostelQuery = () =>
  useQuery({
    queryKey: k.key('my-hostel'),
    queryFn: () => getRequest<MyHostel>('/v1/my-hostel'),
    staleTime: 5 * 60_000,
    retry: false,
  });
