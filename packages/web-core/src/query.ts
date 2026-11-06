import { QueryClient, type VueQueryPluginOptions } from '@tanstack/vue-query';
import { isAxiosError } from 'axios';

/** Query client defaults shared by every portal. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Retrying client errors (401/403/404/422) only delays the inevitable.
        retry: (failureCount, error) => {
          if (isAxiosError(error) && error.response && error.response.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function createVueQueryOptions(queryClient = createQueryClient()): VueQueryPluginOptions {
  return { queryClient };
}
