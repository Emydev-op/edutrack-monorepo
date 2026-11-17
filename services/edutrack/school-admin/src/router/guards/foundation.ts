import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';

import type { SetupProgress } from '@/types';

import { routesPath } from '../routes-path';

/**
 * Screens a school can use before its foundation is in place: the Setup Center and the screens
 * its foundation steps link to (school profile, sections, sessions and terms, classes). Auth pages
 * don't need a session, so the guard never sees them.
 */
export const FOUNDATION_ROUTES: ReadonlySet<string> = new Set([
  routesPath.setup.name,
  routesPath.school.profile.name,
  routesPath.school.profileEdit.name,
  routesPath.academics.sections.name,
  routesPath.academics.sessions.name,
  routesPath.academics.sessionNew.name,
  routesPath.academics.terms.name,
  routesPath.academics.classes.name,
]);

/**
 * First sign-in: until the school's foundation is done (profile confirmed, the current session
 * with its terms started, class levels and arms set), its admins finish it in the Setup Center
 * before reaching the dashboard or anything else. Returns where to go instead, or nothing.
 */
export async function foundationRedirect(
  to: Pick<RouteLocationNormalized, 'name' | 'matched'>,
  loadSetup: () => Promise<Pick<SetupProgress, 'foundationComplete'>>,
): Promise<RouteLocationRaw | undefined> {
  if (!to.matched.some((r) => r.meta.requiresAuth)) return undefined;
  if (typeof to.name === 'string' && FOUNDATION_ROUTES.has(to.name)) return undefined;
  try {
    if ((await loadSetup()).foundationComplete !== false) return undefined;
  } catch {
    // Setup couldn't be checked (offline, server error): don't lock anyone out; the screens
    // show their own errors.
    return undefined;
  }
  return { name: routesPath.setup.name };
}
