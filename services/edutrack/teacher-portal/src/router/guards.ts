import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';
import { toast } from 'vue-sonner';

import { loadMe } from '@/api/services/shell';
import { meets, teaches, type NavRequirement } from '@/config/navigation';
import { useAuthStore } from '@/stores/auth';

import { routesPath } from './routes-path';

/** Spread into a route's `meta`: only class teachers may open it. */
export const classTeacherOnly = { requires: 'classTeacher' } as const;
/** Spread into a route's `meta`: only HODs / the Academic Head may open it. */
export const reviewerOnly = { requires: 'reviewer' } as const;
/** Only reviewers of result sheets (HODs). */
export const sheetReviewerOnly = { requires: 'sheetReviewer' } as const;
/** Only reviewers of lesson notes (HODs, the Academic Head). */
export const noteReviewerOnly = { requires: 'noteReviewer' } as const;
/** Teaching pages: not for boarding-only staff. */
export const teachingOnly = { requires: 'teaches' } as const;

const NEED: Record<NavRequirement, string> = {
  classTeacher: 'My class is for class teachers. You aren’t the class teacher of an arm this term.',
  reviewer: 'Reviews are for HODs and the Academic Head.',
  sheetReviewer: 'Result sheet reviews are for heads of department.',
  noteReviewer: 'Lesson note reviews are for HODs and the Academic Head.',
  teaches: 'Teaching pages are for staff who teach.',
  boarding: 'Boarding is for boarding staff.',
  houseStaff: 'My hostel is for house staff posted to a hostel.',
  rollcall: 'Roll call is for house staff.',
  exeats: 'Exeats are for house staff and the head of boarding.',
  gate: 'The gate is for gate officers.',
  health: 'The sick bay is for the school nurse.',
};

/** Sign-in and role checks, run before every navigation. */
export async function accessGuard(to: RouteLocationNormalized): Promise<true | RouteLocationRaw> {
  const auth = useAuthStore();
  if (to.matched.some((r) => r.meta.requiresAuth) && !auth.isAuthenticated)
    return {
      name: routesPath.auth.login.name,
      query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
    };
  // Invitations and reset links can be opened while signed in (e.g. on a shared machine);
  // only the sign-in page sends signed-in users back to work.
  if (to.name === routesPath.auth.login.name && auth.isAuthenticated)
    return { name: routesPath.dashboard.name };

  // Boarding-only staff (house staff, matrons, nurses, gate officers) start on Boarding.
  if (to.name === routesPath.dashboard.name && auth.isAuthenticated) {
    try {
      const me = await loadMe();
      if (!teaches(me))
        return {
          name: meets(me, 'boarding')
            ? routesPath.boarding.overview.name
            : routesPath.messages.list.name,
        };
    } catch {
      return true;
    }
  }

  const requires = to.meta.requires;
  if (!requires || !auth.isAuthenticated) return true;
  try {
    if (meets(await loadMe(), requires)) return true;
  } catch {
    // The page shows its own error if `me` can't load; don't block navigation on it.
    return true;
  }
  toast.info(NEED[requires]);
  return {
    name: routesPath.forbidden.name,
    query: { what: String(to.meta.title ?? 'this page'), need: requires },
  };
}
