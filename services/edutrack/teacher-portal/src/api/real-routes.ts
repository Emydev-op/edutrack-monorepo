import { createRouteMatcher } from '@edutrack/web-core/http';

/**
 * The routes the real backend serves. The Teacher Workspace moves to the real API one section at
 * a time: with `VITE_USE_MOCKS=false`, requests matching a rule here go to the backend and the
 * rest are still answered by the in-browser mock until their phase is built (results, reviews,
 * lesson notes, assignments, materials and assessments come with Phase 3b).
 *
 * A rule is `'METHOD /path'` (`*` for any method); `:name` matches one path segment and a trailing
 * `/**` matches anything below.
 */
export const REAL_ROUTES: readonly string[] = [
  // Sign-in, invitations, passwords, sessions.
  '* /v1/auth/**',
  // The frame: who I am, terms and the clock, my scope, search.
  'GET /v1/me',
  'GET /v1/context',
  'GET /v1/my-scope',
  'GET /v1/search',
  // Teaching: my classes, subjects, students, timetable and lessons.
  'GET /v1/teaching/**',
  // My class › Register.
  'GET /v1/class-teacher/register',
  'GET /v1/class-teacher/register/history',
  'PUT /v1/class-teacher/register/:date',
  // Dashboard, sidebar counts, notifications and email preferences, my profile.
  'GET /v1/dashboard',
  'GET /v1/nav-counts',
  'GET /v1/notifications',
  'POST /v1/notifications/read-all',
  'POST /v1/notifications/:id/read',
  '* /v1/notifications/preferences',
  '* /v1/profile',
];

/** Whether the real backend serves this request (path without the `/api` base or query). */
export const isRealRoute = createRouteMatcher(REAL_ROUTES);
