import { recallBrandColor, rememberBrandColor } from '@edutrack/app-kit/lib/brand-memory';
import { applyBrandTheme } from '@edutrack/app-kit/lib/brand-theme';
import type { ApiSuccess, PublicSchool } from '@edutrack/shared';
import { readonly, reactive } from 'vue';

import { env } from '@/config/env';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** The school shown on the sign-in pages. Starts from VITE_SCHOOL_NAME until the API answers. */
const brand = reactive({
  name: env.schoolName,
  initials: initialsOf(env.schoolName),
  logoUrl: null as string | null,
});

let started = false;

/**
 * Brands the portal for the school at this address (`GET /v1/public/school`): its name and logo
 * on the sign-in pages and its colour across the portal. The colour remembered from the last visit
 * (by this portal or the school's entry page) is applied first, so the default colour doesn't
 * flash.
 */
export function installSchoolBrand() {
  if (started) return;
  started = true;
  applyBrandTheme(recallBrandColor());
  void fetch(`${env.apiUrl}/v1/public/school`, { headers: { Accept: 'application/json' } })
    .then(async (response) =>
      response.ok ? ((await response.json()) as ApiSuccess<PublicSchool>) : null,
    )
    .then((body) => {
      if (!body?.success) return;
      const school = body.data;
      Object.assign(brand, {
        name: school.name,
        initials: school.initials,
        logoUrl: school.logoUrl,
      });
      applyBrandTheme(school.brandColor);
      rememberBrandColor(school.brandColor);
    })
    // Unbranded is fine: the sign-in pages keep the fallback name and Edutrack's colours.
    .catch(() => undefined);
}

/** The school's name, initials and logo for the sign-in pages. */
export const useSchoolBrand = () => readonly(brand);
