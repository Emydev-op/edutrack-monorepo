/**
 * The routes the real backend serves. School Admin moves to the real API one section at a time:
 * with `VITE_USE_MOCKS=false`, requests matching a rule here go to the backend and everything else
 * is still answered by the in-browser mock, until its phase is built. When every section is on the
 * real API this file and the mock go away.
 *
 * A rule is `'METHOD /path'` (`*` for any method); `:name` matches one path segment and a trailing
 * `/**` matches anything below.
 */
export const REAL_ROUTES: readonly string[] = [
  // Sign-in, invitations, passwords, sessions.
  '* /v1/auth/**',
  // School › Organogram, Settings › Users & Roles, and the staff picker.
  '* /v1/organogram/**',
  '* /v1/users/**',
  '* /v1/roles/**',
  'GET /v1/staff/options',
  // School profile and branches.
  '* /v1/school/profile',
  '* /v1/branches/**',
  // Staff. `GET /v1/staff/:id` also matches /v1/staff/options (no way to exclude it here).
  '* /v1/staff',
  '* /v1/staff/:id',
  '* /v1/staff/:id/**',
  // Academics, Phase 1: sections, sessions and terms (not closing), classes and arms.
  'GET /v1/academics/sections',
  'PUT /v1/academics/sections',
  'GET /v1/academics/sessions',
  'POST /v1/academics/sessions',
  'PUT /v1/academics/sessions/:id/terms',
  'POST /v1/academics/sessions/:id/start',
  'GET /v1/academics/classes',
  'POST /v1/academics/classes/defaults',
  'POST /v1/academics/classes/levels',
  'PUT /v1/academics/classes/levels/:id',
  'POST /v1/academics/classes/levels/:id/move',
  'DELETE /v1/academics/classes/levels/:id',
  'POST /v1/academics/classes/levels/:id/arms',
  'PUT /v1/academics/classes/arms/:id',
  'DELETE /v1/academics/classes/arms/:id',
  'GET /v1/academics/classes/:id',
  // Students, Phase 2: records, transfers and withdrawals, arms and enrollment.
  'GET /v1/students',
  'POST /v1/students/assign-arm',
  'GET /v1/students/:id',
  'POST /v1/students/:id/transfer',
  'GET /v1/enrollment/options',
  'POST /v1/enrollments',
  // Setup Center and the header's working context.
  'GET /v1/setup',
  'POST /v1/setup/steps/:id/complete',
  'POST /v1/setup/finish',
  'GET /v1/context-options',
];

type Rule = { method: string; pattern: RegExp };

const compile = (rule: string): Rule => {
  const [method, path] = rule.split(' ') as [string, string];
  const source = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*$/, '(?:/.*)?')
    .replace(/:[a-zA-Z]+/g, '[^/]+');
  return { method: method.toUpperCase(), pattern: new RegExp(`^${source}$`) };
};

const RULES = REAL_ROUTES.map(compile);

/** Whether the real backend serves this request (path without the `/api` base or query). */
export function isRealRoute(method: string | undefined, path: string): boolean {
  const verb = (method ?? 'get').toUpperCase();
  return RULES.some((r) => (r.method === '*' || r.method === verb) && r.pattern.test(path));
}
