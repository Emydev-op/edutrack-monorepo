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
  // School profile and branches.
  '* /v1/school/profile',
  '* /v1/branches/**',
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
