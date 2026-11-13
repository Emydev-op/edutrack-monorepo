import type { WorkingContext } from '@/types';

/**
 * Every TanStack Query key in the app. Keys are hierarchical so a mutation can invalidate a whole
 * area (`queryKeys.setup.all`). Keys for school data include the working context, so switching
 * branch, session or term fetches that context's figures.
 */
export const queryKeys = {
  invitation: (token: string) => ['invitation', token] as const,
  contextOptions: ['context-options'] as const,
  navCounts: ['nav-counts'] as const,
  notifications: ['notifications'] as const,
  search: (q: string) => ['search', q] as const,
  dashboard: {
    all: ['dashboard'] as const,
    summary: (ctx: WorkingContext) => [...queryKeys.dashboard.all, 'summary', ctx] as const,
    finance: (ctx: WorkingContext) => [...queryKeys.dashboard.all, 'finance', ctx] as const,
  },
  setup: { all: ['setup'] as const },
  profile: ['school-profile'] as const,
  staffOptions: ['staff-options'] as const,
  branches: {
    all: ['branches'] as const,
    detail: (id: string) => ['branches', id] as const,
  },
  users: {
    all: ['users'] as const,
    detail: (id: string) => ['users', id] as const,
  },
  roles: {
    all: ['roles'] as const,
    detail: (id: string) => ['roles', id] as const,
  },
  organogram: ['organogram'] as const,
  students: {
    all: ['students'] as const,
    list: (params: object) => ['students', 'list', params] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
  },
  admissions: {
    all: ['admissions'] as const,
    options: ['admissions', 'options'] as const,
    matches: (first: string, surname: string) => ['admissions', 'matches', first, surname] as const,
  },
  enrollment: ['enrollment'] as const,
  staff: {
    all: ['staff'] as const,
    list: (params: object) => ['staff', 'list', params] as const,
    detail: (id: string) => ['staff', 'detail', id] as const,
    formOptions: ['staff', 'form-options'] as const,
    teachers: ['staff', 'teachers'] as const,
  },
  academics: {
    all: ['academics'] as const,
    sections: ['academics', 'sections'] as const,
    sessions: ['academics', 'sessions'] as const,
    sessionClose: (id: string) => ['academics', 'session-close', id] as const,
    calendar: ['academics', 'calendar'] as const,
    classes: ['academics', 'classes'] as const,
    classDetail: (id: string) => ['academics', 'class', id] as const,
    curriculum: ['academics', 'curriculum'] as const,
    assignments: (branch: string) => ['academics', 'assignments', branch] as const,
    timetableArms: (term: string, branch: string) =>
      ['academics', 'timetable-arms', term, branch] as const,
    timetable: (arm: string, term: string) => ['academics', 'timetable', arm, term] as const,
    assessment: ['academics', 'assessment'] as const,
    results: (params: object) => ['academics', 'results', params] as const,
    sheet: (arm: string, subject: string) => ['academics', 'sheet', arm, subject] as const,
    reportCard: (id: string) => ['academics', 'report-card', id] as const,
    corrections: ['academics', 'corrections'] as const,
    attendance: (params: object) => ['academics', 'attendance', params] as const,
    attendanceArm: (arm: string, params: object) =>
      ['academics', 'attendance-arm', arm, params] as const,
    promotion: (id: string) => ['academics', 'promotion', id] as const,
  },
  guardians: {
    all: ['guardians'] as const,
    list: (params: object) => ['guardians', 'list', params] as const,
    detail: (id: string) => ['guardians', 'detail', id] as const,
  },
  finance: {
    all: ['finance'] as const,
    options: ['finance', 'options'] as const,
    overview: (params: object) => ['finance', 'overview', params] as const,
    report: (id: string, params: object) => ['finance', 'report', id, params] as const,
    fees: (params: object) => ['finance', 'fees', params] as const,
    structure: (params: object) => ['finance', 'structure', params] as const,
    discounts: ['finance', 'discounts'] as const,
    plans: ['finance', 'plans'] as const,
    settings: ['finance', 'settings'] as const,
    invoices: (params: object) => ['finance', 'invoices', params] as const,
    invoice: (id: string) => ['finance', 'invoice', id] as const,
    students: (params: object) => ['finance', 'students', params] as const,
    account: (key: string) => ['finance', 'student-account', key] as const,
    payments: (params: object) => ['finance', 'payments', params] as const,
    payment: (id: string) => ['finance', 'payment', id] as const,
    refunds: (params: object) => ['finance', 'refunds', params] as const,
    refund: (id: string) => ['finance', 'refund', id] as const,
    accounts: ['finance', 'accounts'] as const,
    bankAccount: (id: string, params: object) => ['finance', 'bank-account', id, params] as const,
    statement: (id: string) => ['finance', 'statement', id] as const,
    expenses: (params: object) => ['finance', 'expenses', params] as const,
    expense: (id: string) => ['finance', 'expense', id] as const,
    vendors: (params: object) => ['finance', 'vendors', params] as const,
    vendor: (id: string) => ['finance', 'vendor', id] as const,
  },
  /** Communication: announcements, delivery logs, templates, events, inbox. Owned by communication.ts. */
  comms: {
    all: ['comms'] as const,
    key: (...parts: unknown[]) => ['comms', ...parts] as const,
  },
  /** Reports. Owned by reports.ts. */
  reports: {
    all: ['reports'] as const,
    key: (...parts: unknown[]) => ['reports', ...parts] as const,
  },
  /** Settings. Owned by settings.ts. */
  settings: {
    all: ['settings'] as const,
    key: (...parts: unknown[]) => ['settings', ...parts] as const,
  },
  /** Support tickets. Owned by support.ts. */
  support: {
    all: ['support'] as const,
    key: (...parts: unknown[]) => ['support', ...parts] as const,
  },
};
