import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';

import { getRequest } from '@/api/helpers';
import { useAuthStore } from '@/stores/auth';

/** `GET /v1/auth/me` (School Admin): the signed-in member's permissions, e.g. "finance.invoice". */
interface MeResponse {
  membership?: { permissions?: string[] } | null;
}

/**
 * Whether the signed-in user may do something, from their roles' permissions (the same ones the
 * API checks). Buttons for actions they can't perform are hidden rather than failing on click.
 * While permissions are loading, or if they can't be read (the in-browser mock), everything is
 * allowed and the API still has the final say.
 */
export function useCan() {
  const auth = useAuthStore();
  const { data } = useQuery({
    queryKey: computed(() => ['me', 'permissions', auth.user?.id ?? '', auth.school?.id ?? '']),
    queryFn: () => getRequest<MeResponse>('/v1/auth/me'),
    enabled: computed(() => auth.isAuthenticated),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const granted = computed(() => {
    const list = data.value?.membership?.permissions;
    return Array.isArray(list) ? new Set(list) : null;
  });
  /** True when the user has any of these permissions (or they aren't known yet). */
  return (...permissions: string[]) =>
    !granted.value || permissions.some((p) => granted.value!.has(p));
}
