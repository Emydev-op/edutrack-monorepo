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
  // Group overview, shared templates and group reports, for a school group's own staff.
  '* /v1/group/**',
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
  // Academics: sections, sessions and terms (with closing), the calendar, classes and arms.
  'GET /v1/academics/sections',
  'PUT /v1/academics/sections',
  'GET /v1/academics/sessions',
  'POST /v1/academics/sessions',
  'PUT /v1/academics/sessions/:id/terms',
  'POST /v1/academics/sessions/:id/start',
  'GET /v1/academics/sessions/:id/close',
  'POST /v1/academics/sessions/:id/close',
  'POST /v1/academics/terms/:id/close',
  'GET /v1/academics/calendar',
  '* /v1/academics/calendar/events',
  '* /v1/academics/calendar/events/:id',
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
  // Classes & arms bulk upload.
  'GET /v1/academics/classes/import/template',
  'POST /v1/academics/classes/import',
  'POST /v1/academics/classes/import/:id/commit',
  // Academics, Phase 3a: subjects and curriculum, teacher assignments, timetable, assessment and
  // grading, and the attendance view.
  'GET /v1/academics/curriculum',
  'PUT /v1/academics/curriculum',
  'POST /v1/academics/subjects/defaults',
  'GET /v1/academics/subjects/template',
  'POST /v1/academics/subjects/import',
  'POST /v1/academics/subjects/import/commit',
  'POST /v1/academics/subjects',
  'PUT /v1/academics/subjects/:code',
  'DELETE /v1/academics/subjects/:code',
  'GET /v1/academics/assignments',
  'POST /v1/academics/assignments',
  'POST /v1/academics/assignments/check',
  'POST /v1/academics/assignments/copy-previous',
  'DELETE /v1/academics/assignments/:id',
  'GET /v1/academics/timetable',
  'GET /v1/academics/timetable/arms',
  'PUT /v1/academics/timetable',
  'POST /v1/academics/timetable/:action',
  'GET /v1/academics/assessment',
  'PUT /v1/academics/assessment',
  'GET /v1/academics/attendance',
  'GET /v1/academics/attendance/:armId',
  // Academics, Phase 3b: results (the matrix, sheets with approve / return / reopen entry,
  // publishing per arm, report cards with hold / release, corrections) and end-of-session
  // promotion.
  'GET /v1/academics/results',
  'GET /v1/academics/results/sheets/:armId/:subject',
  'POST /v1/academics/results/sheets/:armId/:subject/:action',
  'GET /v1/academics/results/publish/:armId',
  'POST /v1/academics/results/publish/:armId',
  'GET /v1/academics/results/report-card/:studentId',
  'POST /v1/academics/results/report-card/:studentId/:action',
  'GET /v1/academics/results/corrections',
  'POST /v1/academics/results/corrections/:id/:action',
  'GET /v1/academics/promotion',
  'PUT /v1/academics/promotion/:classId',
  'POST /v1/academics/promotion/:classId/apply',
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
  // Students, Phase 2: admissions and the student import.
  'GET /v1/admissions',
  'GET /v1/admissions/options',
  'GET /v1/admissions/matches',
  'POST /v1/admissions',
  'GET /v1/imports/template',
  'POST /v1/imports',
  'POST /v1/imports/:id/commit',
  // Students, Phase 2: guardians, Parent Portal invitations and Student Portal logins.
  'GET /v1/guardians',
  'POST /v1/guardians',
  'POST /v1/guardians/invite',
  'POST /v1/guardians/merge',
  'GET /v1/guardians/:id',
  'POST /v1/guardians/:id/invite',
  'DELETE /v1/guardians/:id/invite',
  'GET /v1/students/logins',
  'POST /v1/students/logins',
  // Support: tickets with EduTrack, the header bell, the inbox and the sidebar counts.
  '* /v1/support/**',
  'GET /v1/notifications',
  'POST /v1/notifications/read-all',
  'POST /v1/notifications/:id/read',
  'GET /v1/comms/inbox',
  'GET /v1/nav-counts',
  // Communication: announcements, delivery logs, templates and notification settings (SMS units,
  // sender ID, quiet hours).
  'GET /v1/comms/options',
  '* /v1/comms/announcements/**',
  '* /v1/comms/deliveries/**',
  '* /v1/comms/templates/**',
  'GET /v1/comms/events',
  '* /v1/comms/settings/**',
  // Settings: school, academic, finance, subscription, modules, security and change history.
  '* /v1/settings/**',
  // Finance: fees, invoices and student accounts, payments and refunds, bank and cash accounts,
  // statements, expenses and vendors, the overview, reports and options.
  '* /v1/finance/**',
  // Dashboard (fee figures and the fee card from Finance), the header's search, and Reports
  // (Communication's report waits for that module).
  'GET /v1/dashboard',
  'GET /v1/dashboard/finance',
  'GET /v1/search',
  'GET /v1/reports',
  'GET /v1/reports/:id',
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
