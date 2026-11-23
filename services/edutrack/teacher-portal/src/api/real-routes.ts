import { createRouteMatcher } from '@edutrack/web-core/http';

/**
 * The routes the real backend serves. With `VITE_USE_MOCKS=false`, requests matching a rule here
 * go to the backend; every Teacher Workspace screen is now on the API (the in-browser mock still
 * answers everything when mocks are on).
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
  // Results (Phase 3b): my sheets, corrections, HOD reviews of result sheets, and My class ›
  // Progress and Report cards.
  'GET /v1/results',
  'GET /v1/results/:sheetId',
  'PUT /v1/results/:sheetId/scores',
  'POST /v1/results/:sheetId/submit',
  'POST /v1/results/:sheetId/recall',
  'GET /v1/corrections',
  'POST /v1/corrections',
  'GET /v1/corrections/:id',
  'GET /v1/reviews/sheets',
  'GET /v1/reviews/sheets/:sheetId',
  'POST /v1/reviews/sheets/:sheetId/forward',
  'POST /v1/reviews/sheets/:sheetId/return',
  // Lesson notes, and their reviews by HODs and the Academic Head.
  'GET /v1/lesson-notes',
  'POST /v1/lesson-notes',
  'GET /v1/lesson-notes/:noteId',
  'PUT /v1/lesson-notes/:noteId',
  'GET /v1/reviews/notes',
  'GET /v1/reviews/notes/:noteId',
  'POST /v1/reviews/notes/:noteId/approve',
  'POST /v1/reviews/notes/:noteId/return',
  // Assessments: the scheme and when my classes take its components.
  'GET /v1/assessments',
  'GET /v1/assessments/options',
  'POST /v1/assessments',
  'GET /v1/assessments/:assessmentId',
  'PATCH /v1/assessments/:assessmentId',
  'GET /v1/class-teacher/progress',
  'POST /v1/class-teacher/progress/:sheetId/remind',
  'GET /v1/class-teacher/report-cards',
  'GET /v1/class-teacher/report-cards/:studentId',
  'PUT /v1/class-teacher/report-cards/:studentId',
  // Homework: assignments, submissions and grading, materials, and file uploads.
  'POST /v1/uploads',
  'GET /v1/assignments',
  'POST /v1/assignments',
  'GET /v1/assignments/student/:studentId',
  'GET /v1/assignments/:assignmentId',
  'PATCH /v1/assignments/:assignmentId',
  'DELETE /v1/assignments/:assignmentId',
  'POST /v1/assignments/:assignmentId/close',
  'POST /v1/assignments/:assignmentId/reopen',
  'GET /v1/assignments/:assignmentId/submissions',
  'POST /v1/assignments/:assignmentId/submissions/return',
  'GET /v1/assignments/:assignmentId/submissions/:submissionId',
  'PUT /v1/assignments/:assignmentId/submissions/:submissionId/grade',
  'POST /v1/assignments/:assignmentId/submissions/:submissionId/return',
  '* /v1/assignments/:assignmentId/submissions/:submissionId/excuse',
  'GET /v1/materials',
  'POST /v1/materials',
  'GET /v1/materials/:materialId',
  'POST /v1/materials/:materialId/archive',
  'POST /v1/materials/:materialId/restore',
  // Messages with parents: conversations, contacts, threads and replies.
  '* /v1/messages',
  '* /v1/messages/**',
  // Announcements for staff.
  'GET /v1/announcements',
  'GET /v1/announcements/:id',
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
