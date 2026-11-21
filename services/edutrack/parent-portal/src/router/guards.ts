import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';

import { routesPath } from './routes-path';

/** Sign-in checks, run before every navigation. Pure, so it can be unit-tested. */
export function accessRule(
  to: Pick<RouteLocationNormalized, 'name' | 'fullPath' | 'matched'>,
  signedIn: boolean,
): true | RouteLocationRaw {
  if (to.matched.some((r) => r.meta.requiresAuth) && !signedIn)
    return {
      name: routesPath.auth.login.name,
      query: to.fullPath === '/' || to.fullPath === '/home' ? {} : { redirect: to.fullPath },
    };
  // Invitations and reset links can be opened while signed in (a shared phone); only the sign-in
  // page sends a signed-in parent back home.
  if (to.name === routesPath.auth.login.name && signedIn) return { name: routesPath.home.name };
  return true;
}

/** Only redirects within this portal: a path starting with one slash. */
export const safeRedirect = (value: unknown): string | null =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null;
