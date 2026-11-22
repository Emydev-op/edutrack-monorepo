import { watch } from 'vue';

import { applyBrandTheme } from '@edutrack/app-kit/lib/brand-theme';

import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';

/**
 * Themes the portal in the signed-in school's brand colour (set in the platform back office), and
 * returns to Edutrack's default when nobody is signed in, so the sign-in pages keep the design's
 * colours. Call once at startup, after Pinia is installed; it applies before the first paint.
 */
export function installSchoolTheme() {
  const auth = useAuthStore();
  const context = useContextStore();
  // The working branch's own colour, when it has one, else the school's.
  const branchColour = () =>
    context.options?.branches.find((b) => b.name === context.current.branch)?.brandColor ?? null;
  return watch(
    () => (auth.isAuthenticated ? (branchColour() ?? auth.school?.brandColor) : null),
    (colour) => applyBrandTheme(colour),
    { immediate: true },
  );
}
