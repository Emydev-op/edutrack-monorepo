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
