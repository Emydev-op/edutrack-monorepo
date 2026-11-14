/**
 * Every module a plan can include. Core modules come with every plan; "Coming soon" ones are shown
 * but can't be turned on yet. `requires` lists what a module can't work without.
 */
export const MODULE_GROUPS = [
  'Core',
  'Academics',
  'Finance',
  'Operations',
  'Communication',
  'Portals',
  'Insights',
  'Coming soon',
] as const;
export type ModuleGroup = (typeof MODULE_GROUPS)[number];

export interface PlanModule {
  id: string;
  group: ModuleGroup;
  name: string;
  description: string;
  requires: string[];
  core?: boolean;
  comingSoon?: boolean;
}

const m = (
  id: string,
  group: ModuleGroup,
  name: string,
  description: string,
  requires: string[] = [],
  flags: Pick<PlanModule, 'core' | 'comingSoon'> = {},
): PlanModule => ({ id, group, name, description, requires, ...flags });
const core = { core: true };
const soon = { comingSoon: true };

export const PLAN_MODULES: PlanModule[] = [
  m(
    'profile',
    'Core',
    'School profile & branches',
    'Identity, contact, registration and campuses',
    [],
    core,
  ),
  m('users', 'Core', 'Users & roles', 'School staff accounts and permissions', [], core),
  m(
    'sessions',
    'Core',
    'Sessions, terms & calendar',
    'Academic year, terms, breaks and events',
    [],
    core,
  ),
  m('classes', 'Core', 'Classes & arms', 'Sections, class levels and arms', [], core),
  m('students', 'Core', 'Students & guardians', 'Admissions, records and guardian links', [], core),
  m('staff', 'Core', 'Staff directory', 'Staff records and positions', [], core),

  m('subjects', 'Academics', 'Subjects & curriculum', 'Compulsory and elective subjects per class'),
  m('assign', 'Academics', 'Teacher assignments', 'Class and subject teachers', ['subjects']),
  m('timetable', 'Academics', 'Timetable', 'Builder, conflicts and publishing', ['assign']),
  m('assess', 'Academics', 'Assessments & grading', 'Score components, weights and grade scales', [
    'subjects',
  ]),
  m(
    'results',
    'Academics',
    'Results & report cards',
    'Score entry, approval, publishing and corrections',
    ['assess'],
  ),
  m(
    'promotion',
    'Academics',
    'Promotion & session close',
    'End-of-session decisions and rollover',
    ['results'],
  ),
  m(
    'homework',
    'Academics',
    'Assignments & materials',
    'Homework, submissions and learning materials',
    ['assign'],
  ),

  m('fees', 'Finance', 'Fees & invoices', 'Fee structures, invoicing and receipts'),
  m('online', 'Finance', 'Online payments', 'Card, transfer and USSD via payment gateway', [
    'fees',
  ]),
  m(
    'discounts',
    'Finance',
    'Discounts & payment plans',
    'Sibling and staff discounts, instalments',
    ['fees'],
  ),
  m('expenses', 'Finance', 'Expenses & vendors', 'Spend requests, approvals and vendors'),
  m('payroll', 'Finance', 'Payroll', 'Salary runs, deductions and payslips', ['staff']),

  m('inventory', 'Operations', 'Inventory', 'Stock, requests, transfers and purchases'),

  m(
    'announce',
    'Communication',
    'Announcements',
    'Targeted notices to staff, parents and students',
  ),
  m('email', 'Communication', 'Email notifications', 'Invoices, results and reminders by email'),
  m('sms', 'Communication', 'SMS notifications', 'Uses the plan’s SMS credits'),
  m('whatsapp', 'Communication', 'WhatsApp notifications', 'Business messaging for reminders'),

  m('teacher', 'Portals', 'Teacher Workspace', 'Teachers enter scores, homework and materials', [
    'assign',
  ]),
  m('parent', 'Portals', 'Parent Portal', 'Guardians see fees, results and notices'),
  m('student', 'Portals', 'Student Portal', 'Students see timetable, homework and results'),

  m('reports', 'Insights', 'Reports', 'Academic, finance and operational reports'),
  m('export', 'Insights', 'Data export', 'CSV and Excel exports of any list'),

  m('attendance', 'Coming soon', 'Attendance', 'Daily and lesson attendance', [], soon),
  m('transport', 'Coming soon', 'Transport', 'Routes, buses and pick-ups', [], soon),
  m('library', 'Coming soon', 'Library', 'Catalogue and lending', [], soon),
  m('exams', 'Coming soon', 'Online exams', 'CBT and question banks', [], soon),
];

export const MODULE_BY_ID: Record<string, PlanModule> = Object.fromEntries(
  PLAN_MODULES.map((mod) => [mod.id, mod]),
);
export const CORE_MODULES = PLAN_MODULES.filter((mod) => mod.core).map((mod) => mod.id);
/** Modules a plan can switch on or off. */
export const OPTIONAL_MODULES = PLAN_MODULES.filter((mod) => !mod.core && !mod.comingSoon);
export const PORTAL_MODULES = PLAN_MODULES.filter((mod) => mod.group === 'Portals');

export const moduleName = (id: string) => MODULE_BY_ID[id]?.name ?? id;

/** Everything `id` needs, directly or through another module. */
export function requirementsOf(id: string): string[] {
  const out = new Set<string>();
  const walk = (x: string) =>
    MODULE_BY_ID[x]?.requires.forEach((req) => {
      if (!out.has(req)) {
        out.add(req);
        walk(req);
      }
    });
  walk(id);
  return [...out];
}

/** Modules in `enabled` that stop working without `id`, directly or through another module. */
export function dependentsOf(id: string, enabled: readonly string[]): string[] {
  const out = new Set<string>();
  const walk = (x: string) =>
    PLAN_MODULES.filter((mod) => enabled.includes(mod.id) && mod.requires.includes(x)).forEach(
      (mod) => {
        if (!out.has(mod.id)) {
          out.add(mod.id);
          walk(mod.id);
        }
      },
    );
  walk(id);
  return [...out];
}
