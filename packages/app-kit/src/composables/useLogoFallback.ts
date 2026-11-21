import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

const RETRIES = 3;
const RETRY_MS = 15_000;

/**
 * Shows a school's logo with its initials as the fallback. A logo that fails to load (the API was
 * briefly down, a signed link expired) is tried again a few times instead of staying on the
 * initials until the page reloads; a new logo address starts over.
 */
export function useLogoFallback(url: MaybeRefOrGetter<string | null | undefined>) {
  const failed = ref(false);
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(
    () => toValue(url),
    () => {
      clearTimeout(timer);
      tries = 0;
      failed.value = false;
    },
  );

  function onError() {
    failed.value = true;
    if (tries >= RETRIES) return;
    tries += 1;
    clearTimeout(timer);
    timer = setTimeout(() => (failed.value = false), RETRY_MS * tries);
  }

  onBeforeUnmount(() => clearTimeout(timer));
  return { failed, onError };
}
