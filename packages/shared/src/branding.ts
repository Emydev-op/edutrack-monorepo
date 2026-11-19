/** EduTrack's own brand colour (Brick). Used wherever a school hasn't chosen one. */
export const DEFAULT_BRAND_COLOR = '#9B403C';

/** The portals that live under a school's address: `greenfield.edutrack.ng/teacher`, … */
export const SCHOOL_PORTALS = ['teacher', 'parent', 'student'] as const;
export type SchoolPortal = (typeof SCHOOL_PORTALS)[number];

/**
 * What anyone can see about the school at an address, before signing in: enough to brand the
 * entry page and the sign-in pages. `GET /api/v1/public/school`.
 */
export interface PublicSchool {
  slug: string;
  name: string;
  /** Two letters for the badge when there is no logo. */
  initials: string;
  motto: string | null;
  /** Hex colour the portals are themed with. */
  brandColor: string;
  /** Short-lived link to the logo; null when the school hasn't uploaded one. */
  logoUrl: string | null;
  /** False while the school is suspended: the entry page explains instead of offering sign-in. */
  available: boolean;
}

export const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
}

/** WCAG contrast ratio of white text on the colour (0 for an invalid hex). */
export const contrastWithWhite = (hex: string) =>
  isHexColor(hex) ? 1.05 / (luminance(hex) + 0.05) : 0;

/**
 * Why a brand colour can't be used, or null. Portals put white text on it (buttons, the sign-in
 * panel), so it must reach 4.5:1 against white. The same wording as the colour pickers.
 */
export function brandColorProblem(hex: string): string | null {
  if (!isHexColor(hex)) return 'Enter a 6-digit hex color, like #24497A.';
  const ratio = contrastWithWhite(hex);
  return ratio >= 4.5
    ? null
    : `This color is too light for white text (${ratio.toFixed(1)}:1). Pick a darker shade so buttons stay readable.`;
}
