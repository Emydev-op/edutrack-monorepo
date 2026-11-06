import type { HealthResponse } from '@edutrack/shared';
import { useQuery } from '@tanstack/vue-query';

import { http } from '@/lib/http';

/** Example TanStack Query composable: one per API resource, all going through `http`. */
export function useApiHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => (await http.get<HealthResponse>('/health')).data,
    retry: false,
  });
}
