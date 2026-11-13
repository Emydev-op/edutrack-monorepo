/**
 * Every route name and path in the Teacher Workspace. Navigate by name so paths can change
 * without breaking links: `router.push({ name: routesPath.results.sheet.name, params: { sheetId } })`.
 *
 * Tabs inside a page (e.g. the class page's Overview / Students / … tabs, the sheet's Scores /
 * Review tabs) use a `?tab=` query, not extra routes.
 */
export const routesPath = {
  auth: {
    login: { name: 'login', path: '/login' },
    forgot: { name: 'forgot-password', path: '/forgot-password' },
    forgotSent: { name: 'forgot-password-sent', path: '/forgot-password/sent' },
    reset: { name: 'reset-password', path: '/reset-password' },
    resetDone: { name: 'reset-password-done', path: '/reset-password/done' },
    passwordExpired: { name: 'password-expired', path: '/password-expired' },
    acceptInvitation: { name: 'accept-invitation', path: '/accept-invitation/:token' },
  },
  dashboard: { name: 'dashboard', path: '/dashboard' },
  forbidden: { name: 'forbidden', path: '/forbidden' },
  teaching: {
    classes: { name: 'classes', path: '/classes' },
    /** `:subject` is the subject code, e.g. /classes/mc-jss2b/MTH */
    class: { name: 'class', path: '/classes/:armId/:subject' },
    subjects: { name: 'subjects', path: '/subjects' },
    subject: { name: 'subject', path: '/subjects/:subject' },
    students: { name: 'students', path: '/students' },
    student: { name: 'student', path: '/students/:studentId' },
    timetable: { name: 'timetable', path: '/timetable' },
    lesson: { name: 'lesson', path: '/timetable/lessons/:lessonId' },
  },
  assignments: {
    list: { name: 'assignments', path: '/assignments' },
    new: { name: 'assignment-new', path: '/assignments/new' },
    detail: { name: 'assignment', path: '/assignments/:assignmentId' },
    edit: { name: 'assignment-edit', path: '/assignments/:assignmentId/edit' },
    submissions: { name: 'submissions', path: '/assignments/:assignmentId/submissions' },
    submission: {
      name: 'submission',
      path: '/assignments/:assignmentId/submissions/:submissionId',
    },
  },
  assessments: {
    list: { name: 'assessments', path: '/assessments' },
    schedule: { name: 'assessment-schedule', path: '/assessments/schedule' },
    detail: { name: 'assessment', path: '/assessments/:assessmentId' },
  },
  results: {
    list: { name: 'results', path: '/results' },
    sheet: { name: 'result-sheet', path: '/results/:sheetId' },
    correctionNew: { name: 'correction-new', path: '/results/:sheetId/corrections/new' },
  },
  materials: {
    list: { name: 'materials', path: '/materials' },
    upload: { name: 'material-upload', path: '/materials/upload' },
    detail: { name: 'material', path: '/materials/:materialId' },
  },
  lessonNotes: {
    list: { name: 'lesson-notes', path: '/lesson-notes' },
    new: { name: 'lesson-note-new', path: '/lesson-notes/new' },
    detail: { name: 'lesson-note', path: '/lesson-notes/:noteId' },
  },
  classTeacher: {
    register: { name: 'register', path: '/my-class/register' },
    registerHistory: { name: 'register-history', path: '/my-class/register/history' },
    progress: { name: 'class-progress', path: '/my-class/progress' },
    reportCards: { name: 'report-cards', path: '/my-class/report-cards' },
    reportCard: { name: 'report-card', path: '/my-class/report-cards/:studentId' },
  },
  reviews: {
    results: { name: 'review-sheets', path: '/reviews/result-sheets' },
    sheet: { name: 'review-sheet', path: '/reviews/result-sheets/:sheetId' },
    lessonNotes: { name: 'review-notes', path: '/reviews/lesson-notes' },
    note: { name: 'review-note', path: '/reviews/lesson-notes/:noteId' },
  },
  announcements: {
    list: { name: 'announcements', path: '/announcements' },
    detail: { name: 'announcement', path: '/announcements/:id' },
  },
  notifications: {
    list: { name: 'notifications', path: '/notifications' },
    settings: { name: 'notification-settings', path: '/notifications/settings' },
  },
  profile: {
    view: { name: 'profile', path: '/profile' },
    edit: { name: 'profile-edit', path: '/profile/edit' },
    password: { name: 'change-password', path: '/profile/password' },
    devices: { name: 'devices', path: '/profile/devices' },
  },
} as const;
