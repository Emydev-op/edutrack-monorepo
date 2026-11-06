import { watch } from 'vue';

import { applyBrandTheme } from '@edutrack/app-kit/lib/brand-theme';

import { useAuthStore } from '@/stores/auth';

/**
 * Themes the portal in the signed-in school's brand colour (set in the platform back office), and
 * returns to Edutrack's default when nobody is signed in, so the sign-in pages keep the design's
 * colours. Call once at startup, after Pinia is installed; it applies before the first paint.
 */
export function installSchoolTheme() {
  const auth = useAuthStore();
  return watch(
    () => (auth.isAuthenticated ? auth.school?.brandColor : null),
    (colour) => applyBrandTheme(colour),
    { immediate: true },
  );
}
