/**
 * Every TanStack Query key in the app, one namespace per area. Keys are hierarchical, so a
 * mutation can invalidate a whole area (`queryKeys.results.all`) or one record
 * (`queryKeys.results.key('sheet', sheetId)`).
 *
 * Term-scoped data puts the term id in the key (`queryKeys.results.key('list', termId)`) so
 * switching term fetches that term's figures.
 */
const area = <const N extends string>(name: N) => ({
  all: [name] as const,
  key: (...parts: unknown[]) => [name, ...parts] as const,
});

export const queryKeys = {
  invitation: area('invitation'),
  /** `GET /v1/me`, and `key('scope', termId)` for `GET /v1/my-scope`. */
  me: area('me'),
  context: area('context'),
  navCounts: area('nav-counts'),
  search: area('search'),
  notifications: area('notifications'),
  announcements: area('announcements'),
  /** Profile and account security (devices). */
  profile: area('profile'),
  // Feature areas: each builder owns its namespace.
  dashboard: area('dashboard'),
  teaching: area('teaching'),
  assignments: area('assignments'),
  materials: area('materials'),
  assessments: area('assessments'),
  results: area('results'),
  reviews: area('reviews'),
  lessonNotes: area('lesson-notes'),
  classTeacher: area('class-teacher'),
};
