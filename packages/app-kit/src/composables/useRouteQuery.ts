import { computed, type WritableComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * A filter value kept in the URL query, so filtered views can be linked to, refreshed and
 * navigated back to. Setting the default value removes the key from the URL.
 */
export function useRouteQuery<T extends string>(
  key: string,
  defaultValue: T,
): WritableComputedRef<T> {
  const route = useRoute();
  const router = useRouter();
  return computed({
    get: () => {
      const raw = route.query[key];
      return ((Array.isArray(raw) ? raw[0] : raw) ?? defaultValue) as T;
    },
    set: (value) => {
      const query = { ...route.query, [key]: value === defaultValue ? undefined : value };
      if (key !== 'page') delete query.page;
      void router.replace({ query });
    },
  });
}
