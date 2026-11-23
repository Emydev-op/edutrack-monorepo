import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue';

import { recallBrandColor } from '../lib/brand-memory';
import { applyBrandTheme } from '../lib/brand-theme';

/** A campus's own colour and logo in the family and staff portals (null keeps the school's). */
export interface CampusBrand {
  name: string;
  brandColor: string | null;
  logoUrl: string | null;
}

/**
 * Themes a signed-in portal in the person's campus colour, falling back to the school's. Call it
 * from the signed-in layout: when the layout goes away (sign-out), the school colour this address
 * remembers comes back, so the sign-in pages keep the school's brand.
 */
export function useCampusTheme(
  campus: MaybeRefOrGetter<CampusBrand | null | undefined>,
  schoolColour: MaybeRefOrGetter<string | null | undefined>,
) {
  watch(
    () => toValue(campus)?.brandColor ?? toValue(schoolColour) ?? recallBrandColor(),
    (colour) => applyBrandTheme(colour),
    { immediate: true },
  );
  onScopeDispose(() => applyBrandTheme(recallBrandColor()));
}
