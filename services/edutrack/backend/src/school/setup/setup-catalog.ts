import type { SchoolPermission } from '../../auth/permissions/school-permissions.js';
import type { StepTarget } from './setup-step-source.js';

export type SetupGroup = 'Foundation' | 'Academic structure' | 'People' | 'Operations';

export interface SetupStepDefinition {
  id: string;
  group: SetupGroup;
  name: string;
  required: boolean;
  prerequisite: string | null;
  /** Where the step is done, for steps without a live source. */
  to: StepTarget;
  /** Shown while no module describes the step from the school's data. */
  description: string;
  /** Needed to mark the step complete. */
  permission: SchoolPermission;
}

const step = (
  group: SetupGroup,
  id: string,
  name: string,
  route: string,
  description: string,
  permission: SchoolPermission,
  required = true,
  prerequisite: string | null = null,
): SetupStepDefinition => ({
  id,
  group,
  name,
  required,
  prerequisite,
  to: { name: route },
  description,
  permission,
});

/**
 * The Setup Center's steps in order, as School Admin's mock lists them (`STEP_SEEDS` in
 * `school-admin/src/api/mock/db.ts`; ids are the slugged names).
 */
export const SETUP_STEPS: readonly SetupStepDefinition[] = [
  step(
    'Foundation',
    'school-profile',
    'School Profile',
    'school-profile',
    'Add your logo, contact details and registration numbers',
    'settings.profile',
  ),
  step(
    'Foundation',
    'branches',
    'Branches',
    'branches',
    'Main Campus was created when your school was provisioned',
    'settings.branches',
  ),
  step(
    'Foundation',
    'academic-sections',
    'Academic Sections',
    'academic-sections',
    'Choose the sections you run, e.g. Junior and Senior Secondary',
    'academics.configure',
  ),
  step(
    'Academic structure',
    'academic-session',
    'Academic Session',
    'sessions',
    'Create your first session and its dates',
    'academics.configure',
  ),
  step(
    'Academic structure',
    'terms',
    'Terms',
    'sessions',
    'Add term dates and breaks',
    'academics.configure',
  ),
  step(
    'Academic structure',
    'classes-arms',
    'Classes & Arms',
    'classes',
    'Add class levels and their arms',
    'academics.configure',
  ),
  step(
    'Academic structure',
    'subjects-curriculum',
    'Subjects & Curriculum',
    'subjects',
    'Choose compulsory and elective subjects',
    'academics.configure',
  ),
  step(
    'Academic structure',
    'assessment-grading',
    'Assessment & Grading',
    'assessments',
    'Set CA and exam weights and your grading scale',
    'academics.configure',
    true,
    'Needs: Academic Sections',
  ),
  step(
    'People',
    'organogram-roles',
    'Organogram & Roles',
    'organogram',
    'Positions and what each role can do',
    'settings.roles',
  ),
  step('People', 'staff', 'Staff', 'staff', 'Add teachers and office staff', 'settings.users'),
  step(
    'People',
    'teacher-assignments',
    'Teacher Assignments',
    'teacher-assignments',
    'Who teaches which subject in which class',
    'academics.configure',
    true,
    'Needs: Staff, Subjects',
  ),
  step(
    'People',
    'students',
    'Students',
    'students',
    'Admit students or import them from a spreadsheet',
    'settings.profile',
  ),
  step(
    'People',
    'parents-guardians',
    'Parents / Guardians',
    'parents',
    'Link guardians so they can use the Parent Portal',
    'settings.profile',
    false,
  ),
  step(
    'Operations',
    'fees',
    'Fees',
    'fees',
    'Fee items by class and term',
    'settings.profile',
    true,
    'Needs: Classes & Arms',
  ),
  step(
    'Operations',
    'timetable',
    'Timetable',
    'timetable',
    'Periods and lessons for each class',
    'academics.configure',
    false,
    'Needs: Teacher Assignments',
  ),
  step(
    'Operations',
    'notifications',
    'Notifications',
    'settings',
    'SMS sender ID and which events notify parents',
    'settings.profile',
    false,
  ),
];

/**
 * The first-sign-in foundation: until these are done (and a session with terms is running), a
 * school's admins are kept in the Setup Center. Product decision: school profile confirmed; the
 * current session created with its terms and started; class levels and arms set.
 */
export const FOUNDATION_STEPS = ['school-profile', 'academic-session', 'classes-arms'] as const;

/** Steps that belong to a plan module: left out of the Setup Center when the plan lacks it. */
export const STEP_MODULE: Record<string, string> = {
  'subjects-curriculum': 'subjects',
  'assessment-grading': 'assess',
  'teacher-assignments': 'assign',
  fees: 'fees',
  timetable: 'timetable',
  notifications: 'announce',
};
