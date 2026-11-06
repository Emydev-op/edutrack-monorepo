/*
 * In-memory data behind the mock API, seeded from the School Admin design (Greenfield Academy)
 * plus Crestview College, a school that was just provisioned and has no data yet. It resets on
 * reload; nothing here ships when VITE_USE_MOCKS is off.
 */
import { routesPath as r } from '@/router/routes-path';
import type {
  AttentionItem,
  ContextOptions,
  DashboardFinance,
  DashboardSummary,
  NotificationItem,
  SchoolSummary,
  SearchResult,
  SetupProgress,
  SetupStep,
} from '@/types';

export interface SchoolUser {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
  roleName: string;
  status: 'Active' | 'Invited' | 'Suspended' | 'Deactivated';
  /** Password older than the school's 90-day rule. */
  passwordExpired?: boolean;
}

export const schools: SchoolSummary[] = [
  {
    id: 'greenfield',
    name: 'Greenfield Academy',
    initials: 'GA',
    plan: 'Growth · Annual',
    brandColor: '#9B403C',
    logoUrl: null,
    subscriptionStatus: 'Active',
  },
  {
    id: 'crestview',
    name: 'Crestview College',
    initials: 'CC',
    plan: 'Starter · Annual',
    brandColor: '#24497A',
    logoUrl: null,
    subscriptionStatus: 'Active',
  },
];

export const users: SchoolUser[] = [
  {
    id: 'okonkwo',
    schoolId: 'greenfield',
    firstName: 'Adaeze',
    lastName: 'Okonkwo',
    email: 'adaeze.okonkwo@greenfield.edu.ng',
    phone: '+234 809 120 4455',
    position: 'Principal',
    roleName: 'School Admin',
    status: 'Active',
  },
  {
    id: 'okoro',
    schoolId: 'greenfield',
    firstName: 'Chidi',
    lastName: 'Okoro',
    email: 'chidi.okoro@greenfield.edu.ng',
    phone: '+234 803 555 0188',
    position: 'ICT Administrator',
    roleName: 'School Admin',
    status: 'Suspended',
  },
  {
    id: 'ojo',
    schoolId: 'greenfield',
    firstName: 'Tunde',
    lastName: 'Ojo',
    email: 'tunde.ojo@greenfield.edu.ng',
    phone: '+234 803 555 0179',
    position: 'Chemistry Teacher',
    roleName: 'School Admin',
    status: 'Deactivated',
  },
  {
    id: 'lawal',
    schoolId: 'greenfield',
    firstName: 'Kemi',
    lastName: 'Lawal',
    email: 'kemi.lawal@greenfield.edu.ng',
    phone: '+234 807 555 0151',
    position: 'Accounts Officer',
    roleName: 'School Admin',
    status: 'Invited',
  },
  {
    id: 'bakare',
    schoolId: 'greenfield',
    firstName: 'Kunle',
    lastName: 'Bakare',
    email: 'kunle.bakare@greenfield.edu.ng',
    phone: '+234 803 555 0133',
    position: 'Bursar',
    roleName: 'School Admin',
    status: 'Active',
    passwordExpired: true,
  },
  {
    id: 'udo',
    schoolId: 'crestview',
    firstName: 'Emem',
    lastName: 'Udo',
    email: 'e.udo@crestviewcollege.ng',
    phone: '+234 809 555 0177',
    position: 'Principal',
    roleName: 'School Admin',
    status: 'Active',
  },
];

/** Every demo account uses the same password. */
export const passwords = new Map(users.map((u) => [u.email, 'Edutrack2026!']));
/** Failed sign-ins per email; five in a row pauses sign-in. */
export const failedAttempts = new Map<string, number>();

/* ---------------- Working context ---------------- */

export const contextOptions: Record<string, ContextOptions> = {
  greenfield: {
    branches: [
      { name: 'Main Campus', status: 'Active' },
      { name: 'Lekki Campus', status: 'Active' },
      { name: 'All branches', status: 'Active' },
    ],
    sessions: [
      { name: '2026/2027', status: 'Active' },
      { name: '2025/2026', status: 'Closing' },
    ],
    terms: ['First Term', 'Second Term', 'Third Term'],
    defaults: { branch: 'Main Campus', session: '2026/2027', term: 'First Term' },
  },
  crestview: {
    branches: [{ name: 'Main Campus', status: 'Active' }],
    sessions: [{ name: '2026/2027', status: 'Active' }],
    terms: ['First Term', 'Second Term', 'Third Term'],
    defaults: { branch: 'Main Campus', session: '2026/2027', term: 'First Term' },
  },
};

/* ---------------- Dashboard ---------------- */

type BranchFigures = [
  students: number,
  teachers: number,
  classes: number,
  collected: string,
  collectedHint: string,
  outstanding: string,
  outstandingHint: string,
];
export const branchFigures: Record<string, BranchFigures> = {
  'Main Campus': [
    842,
    58,
    31,
    '₦96.4M',
    '68% of ₦142.6M billed',
    '₦46.2M',
    '318 students · ₦6.4M overdue',
  ],
  'Lekki Campus': [
    406,
    24,
    17,
    '₦44.1M',
    '71% of ₦62.1M billed',
    '₦18.0M',
    '141 students · ₦2.2M overdue',
  ],
  'All branches': [
    1248,
    82,
    48,
    '₦140.5M',
    '69% of ₦204.7M billed',
    '₦64.2M',
    '459 students · ₦8.6M overdue',
  ],
};

const attention: AttentionItem[] = [
  {
    id: 'results-due',
    badge: { label: 'Due soon', tone: 'warning' },
    text: '6 result sheets not yet submitted · entry closes Fri 11 Dec',
    area: 'Academics · Results · First Term',
    action: 'View',
    to: { name: r.academics.results.name },
  },
  {
    id: 'overdue-invoices',
    badge: { label: 'Overdue', tone: 'error' },
    text: '27 invoices are overdue · ₦6.4M',
    area: 'Finance · Invoices',
    action: 'View invoices',
    to: { name: r.finance.invoices.name },
  },
  {
    id: 'verify-transfers',
    badge: { label: 'Verify', tone: 'warning' },
    text: '2 bank transfers awaiting verification',
    area: 'Finance · Payments',
    action: 'Verify',
    to: { name: r.finance.payments.name },
  },
  {
    id: 'incomplete-profiles',
    badge: { label: 'Incomplete', tone: 'warning' },
    text: '14 students have incomplete profiles',
    area: 'Students · e.g. Aisha Lawal has no guardian linked',
    action: 'View',
    to: { name: r.students.list.name },
  },
  {
    id: 'admissions',
    badge: { label: 'Pending', tone: 'warning' },
    text: '5 admission applications awaiting a decision',
    area: 'Students · Admissions',
    action: 'Review',
    to: { name: r.students.admissions.name },
  },
  {
    id: 'promotion',
    badge: { label: 'Blocking', tone: 'error' },
    text: '4 students from 2025/2026 still need a promotion decision',
    area: 'Academics · Promotion · blocks closing 2025/2026',
    action: 'Decide',
    to: { name: r.academics.promotion.name },
  },
  {
    id: 'low-stock',
    badge: { label: 'Low stock', tone: 'warning' },
    text: 'Exercise books (40 leaves): 280 left, reorder level is 400',
    area: 'Inventory · Main Store',
    action: 'View item',
    to: { name: r.inventory.items.name },
  },
];

export const dashboards: Record<string, Omit<DashboardSummary, 'metrics'>> = {
  greenfield: {
    hasData: true,
    attention,
    upcoming: [
      { date: 'Wed 9 Dec', title: 'Staff meeting · result moderation', type: 'Meeting' },
      { date: 'Fri 11 Dec', title: 'Result entry deadline', type: 'Results' },
      { date: 'Mon 14 Dec', title: 'Results publication', type: 'Results' },
      { date: 'Wed 16 Dec', title: 'PTA meeting & open day', type: 'PTA' },
      { date: 'Thu 17 Dec', title: 'Carol service & prize-giving', type: 'Event' },
      { date: 'Fri 18 Dec', title: 'First Term ends', type: 'Term' },
    ],
    enrollment: [
      { label: '2022/23', value: 980 },
      { label: '2023/24', value: 1064 },
      { label: '2024/25', value: 1131 },
      { label: '2025/26', value: 1212 },
      { label: '2026/27', value: 1248 },
    ],
    performance: [
      { label: 'Computer Studies', percent: 74.2 },
      { label: 'English Language', percent: 68.9 },
      { label: 'Basic Science', percent: 66.4 },
      { label: 'Mathematics', percent: 61.8 },
      { label: 'French', percent: 58.3 },
      { label: 'Basic Technology', percent: 57.1 },
    ],
    activity: [
      {
        id: 'a1',
        title: 'Kunle Bakare recorded ₦250,000 from Mrs. Bisi Bankole',
        detail: 'Tolulope Bankole · Bank transfer · confirmed',
        when: '9:24 AM',
      },
      {
        id: 'a2',
        title: 'Mrs. Chioma Eze approved Primary 5 results',
        detail: '9 subjects · 2 arms',
        when: 'Yesterday',
      },
      {
        id: 'a3',
        title: 'Mr. Chidi Okoro invited Ms. Kemi Lawal',
        detail: 'Accounts Officer · Accountant role',
        when: '4 Dec',
      },
      {
        id: 'a4',
        title: 'Grace Akpan transferred to Loyola Jesuit College',
        detail: 'SSS 1A · effective 14 Nov · documents attached',
        when: '14 Nov',
      },
    ],
  },
  crestview: {
    hasData: false,
    attention: [],
    upcoming: [],
    enrollment: [],
    performance: [],
    activity: [],
  },
};

export const finance: Record<string, DashboardFinance> = {
  greenfield: {
    weekly: [
      ['19 Oct', 4.1],
      ['26 Oct', 3.2],
      ['2 Nov', 6.8],
      ['9 Nov', 5.1],
      ['16 Nov', 7.4],
      ['23 Nov', 9.6],
      ['30 Nov', 12.3],
      ['7 Dec', 4.2],
    ].map(([label, millions]) => ({
      label: label as string,
      value: Math.round((millions as number) * 1_000_000),
    })),
    sections: [
      { label: 'Nursery', percent: 82 },
      { label: 'Primary', percent: 71 },
      { label: 'Junior Secondary', percent: 64 },
      { label: 'Senior Secondary', percent: 59 },
    ],
  },
  crestview: { weekly: [], sections: [] },
};

/* ---------------- Setup Center ---------------- */

type StepSeed = [
  group: SetupStep['group'],
  name: string,
  description: string,
  to: { name: string },
  done: boolean,
  required: boolean,
  prerequisite?: string,
];
const STEP_SEEDS: StepSeed[] = [
  [
    'Foundation',
    'School Profile',
    'Name, logo, contact and registration',
    r.school.profile,
    true,
    true,
  ],
  ['Foundation', 'Branches', '2 active branches, 1 inactive', r.school.branches, true, true],
  [
    'Foundation',
    'Academic Sections',
    'Nursery, Primary, Junior and Senior Secondary',
    r.academics.sections,
    true,
    true,
  ],
  [
    'Academic structure',
    'Academic Session',
    '2026/2027 is active',
    r.academics.sessions,
    true,
    true,
  ],
  [
    'Academic structure',
    'Terms',
    '3 terms configured for 2026/2027',
    r.academics.sessions,
    true,
    true,
  ],
  [
    'Academic structure',
    'Classes & Arms',
    '48 arms across 17 class levels',
    r.academics.classes,
    true,
    true,
  ],
  [
    'Academic structure',
    'Subjects & Curriculum',
    '20 subjects · elective and religious groups set',
    r.academics.subjects,
    true,
    true,
  ],
  [
    'Academic structure',
    'Assessment & Grading',
    'Secondary and Primary done · Nursery descriptors missing',
    r.academics.assessments,
    false,
    true,
    'Needs: Academic Sections',
  ],
  ['People', 'Organogram & Roles', '16 positions · 12 roles', r.school.organogram, true, true],
  ['People', 'Staff', '112 staff · 94 with system accounts', r.staff.directory, true, true],
  [
    'People',
    'Teacher Assignments',
    'Chemistry and Music have no teacher for 2026/2027',
    r.academics.assignments,
    false,
    true,
    'Needs: Staff, Subjects',
  ],
  ['People', 'Students', '1,248 enrolled for 2026/2027', r.students.list, true, true],
  [
    'People',
    'Parents / Guardians',
    '1,231 of 1,248 students linked to a guardian',
    r.students.parents,
    false,
    false,
  ],
  [
    'Operations',
    'Fees',
    'First Term done · Second Term structures not created',
    r.finance.fees,
    false,
    true,
    'Needs: Classes & Arms',
  ],
  [
    'Operations',
    'Timetable',
    'Second Term draft in progress',
    r.academics.timetable,
    false,
    false,
    'Needs: Teacher Assignments',
  ],
  [
    'Operations',
    'Notifications',
    'SMS sender ID "GREENFIELD" awaiting approval',
    r.settings,
    false,
    false,
  ],
];

const NEW_SCHOOL_DESCRIPTIONS: Record<string, string> = {
  'School Profile': 'Add your logo, contact details and registration numbers',
  Branches: 'Main Campus was created when your school was provisioned',
  'Academic Sections': 'Choose the sections you run, e.g. Junior and Senior Secondary',
  'Academic Session': 'Create 2026/2027 and its dates',
  Terms: 'Add term dates and breaks',
  'Classes & Arms': 'Add class levels and their arms',
  'Subjects & Curriculum': 'Choose compulsory and elective subjects',
  'Assessment & Grading': 'Set CA and exam weights and your grading scale',
  'Organogram & Roles': 'Positions and what each role can do',
  Staff: 'Add teachers and office staff',
  'Teacher Assignments': 'Who teaches which subject in which class',
  Students: 'Admit students or import them from a spreadsheet',
  'Parents / Guardians': 'Link guardians so they can use the Parent Portal',
  Fees: 'Fee items by class and term',
  Timetable: 'Periods and lessons for each class',
  Notifications: 'SMS sender ID and which events notify parents',
};

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-');

/** Setup steps that complete from their own screens: whether each has been confirmed. */
export type AutoStep = 'school-profile' | 'branches' | 'organogram-roles';
export const setupConfirmed: Record<string, Record<AutoStep, boolean>> = {
  greenfield: { 'school-profile': true, branches: true, 'organogram-roles': true },
  crestview: { 'school-profile': false, branches: false, 'organogram-roles': false },
};

export const setup: Record<string, SetupProgress> = {
  greenfield: {
    onboarding: false,
    intro:
      'Steps adapt to your offering. Greenfield runs Nursery, Primary and Secondary, so nursery grading descriptors are included.',
    finished: false,
    steps: STEP_SEEDS.map(([group, name, description, to, done, required, prerequisite]) => ({
      id: slug(name),
      auto: false,
      group,
      name,
      description,
      to: { name: to.name },
      done,
      required,
      prerequisite: prerequisite ?? null,
    })),
  },
  crestview: {
    onboarding: true,
    intro:
      'Steps adapt to your offering. Choose your sections first; the classes, subjects and grading steps follow from them.',
    finished: false,
    steps: STEP_SEEDS.map(([group, name, , to, , required, prerequisite]) => ({
      id: slug(name),
      auto: false,
      group,
      name,
      description: NEW_SCHOOL_DESCRIPTIONS[name] ?? '',
      to: { name: to.name },
      done: name === 'Branches',
      required,
      prerequisite: prerequisite ?? null,
    })),
  },
};

/* ---------------- Notifications & search ---------------- */

export const notifications: Record<string, NotificationItem[]> = {
  greenfield: [
    {
      id: 'n1',
      title: '3 bank transfers awaiting verification',
      detail: 'Finance · Payments',
      when: '9:12 AM',
      unread: true,
      to: { name: r.finance.payments.name },
    },
    {
      id: 'n2',
      title: 'Stock request SR-0213 needs approval',
      detail: 'Inventory · 200 exercise books for Primary 3A',
      when: '8:40 AM',
      unread: true,
      to: { name: r.inventory.requests.name },
    },
    {
      id: 'n3',
      title: 'Mrs. Chioma Eze approved Primary 5 results',
      detail: 'Results · 9 subjects',
      when: 'Yesterday',
      unread: false,
      to: { name: r.academics.results.name },
    },
    {
      id: 'n4',
      title: 'Subscription renews 31 Aug 2027',
      detail: 'Growth · Annual · 1,248 of 1,500 students',
      when: '2 Dec',
      unread: false,
      to: { name: r.settings.name },
    },
  ],
  crestview: [
    {
      id: 'n1',
      title: 'Welcome to Edutrack',
      detail: 'Start with the Setup Center',
      when: 'Today',
      unread: true,
      to: { name: r.setup.name },
    },
  ],
};

const result = (
  id: string,
  title: string,
  type: SearchResult['type'],
  meta: string,
  to: { name: string },
): SearchResult => ({ id, title, type, meta, to: { name: to.name } });

export const searchIndex: Record<string, SearchResult[]> = {
  greenfield: [
    result(
      'emmanuel',
      'Emmanuel Adeyemi',
      'Student',
      'JSS 2B · STU-2025-0042 · Main Campus',
      r.students.list,
    ),
    result('michael', 'Michael Adeyemi', 'Student', 'Primary 5B · STU-2023-0311', r.students.list),
    result(
      'funke',
      'Mrs. Funke Adeyemi',
      'Parent',
      'Guardian of Emmanuel (JSS 2B) & Michael (Primary 5B)',
      r.students.parents,
    ),
    result('favour', 'Favour Okeke', 'Student', 'JSS 2B · STU-2025-0047', r.students.list),
    result(
      'daniel',
      'Daniel Musa',
      'Student',
      'JSS 2B · Exam absent · ₦185,000 overdue',
      r.students.list,
    ),
    result(
      'ade',
      'Mr. Samuel Ade',
      'Teacher',
      'Mathematics · Main + Lekki Campus',
      r.staff.teachers,
    ),
    result(
      'okafor',
      'Mrs. Grace Okafor',
      'Teacher',
      'English · Class teacher JSS 2B',
      r.staff.teachers,
    ),
    result(
      'jss2b',
      'JSS 2B',
      'Class',
      '14 students · Class teacher Mrs. Grace Okafor',
      r.academics.classes,
    ),
    result('mth', 'Mathematics', 'Subject', 'MTH · Core · Primary – SSS', r.academics.subjects),
    result(
      'inv-0418',
      'INV-2026-0418',
      'Invoice',
      'Emmanuel Adeyemi · ₦185,000 · Partially paid',
      r.finance.invoices,
    ),
    result(
      'rcp-0291',
      'RCP-2026-0291',
      'Payment',
      '₦105,000 · Bank transfer · 8 Sep 2026',
      r.finance.payments,
    ),
    result(
      'lekki-stationers',
      'Lekki Stationers Ltd',
      'Vendor',
      'Stationery · ₦340,000 outstanding',
      r.finance.vendors,
    ),
    result(
      'exb40',
      'Exercise books (40 leaves)',
      'Inventory',
      'Main Store · 280 in stock · reorder at 400',
      r.inventory.items,
    ),
  ],
  crestview: [],
};
