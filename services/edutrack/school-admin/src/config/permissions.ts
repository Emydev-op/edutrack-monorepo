import type { RoleScope } from '@/types';

/** What a role can be allowed to do, grouped by area. Keys are what the API stores. */
export const PERMISSION_MODULES = [
  {
    key: 'students',
    label: 'Students',
    description: 'Student records, enrollment and promotion',
    actions: ['view', 'create', 'edit', 'archive', 'promote'],
  },
  {
    key: 'academics',
    label: 'Academics',
    description: 'Sessions, classes, subjects, timetable',
    actions: ['view', 'configure', 'timetable'],
  },
  {
    key: 'results',
    label: 'Results',
    description: 'Score entry through publication',
    actions: ['view', 'enter', 'review', 'approve', 'publish', 'correct'],
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Fees, payments, expenses, payroll',
    actions: ['view', 'invoice', 'payment', 'refund', 'expenses', 'payroll'],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Stock and stores',
    actions: ['view', 'request', 'issue', 'adjust'],
  },
  {
    key: 'comms',
    label: 'Communication',
    description: 'Announcements and messages',
    actions: ['view', 'class', 'school'],
  },
  {
    key: 'settings',
    label: 'School settings',
    description: 'Profile, branches, users and roles',
    actions: ['profile', 'branches', 'users', 'roles'],
  },
  {
    key: 'boarding',
    label: 'Boarding',
    description: 'Hostels, exeats, the gate, roll calls and the sick bay',
    actions: ['view', 'manage', 'exeats', 'gate', 'health', 'rollcall'],
  },
] as const;

export const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  archive: 'Archive',
  promote: 'Promote',
  configure: 'Configure',
  timetable: 'Timetable',
  enter: 'Enter scores',
  review: 'Review',
  approve: 'Approve',
  publish: 'Publish',
  correct: 'Correct published',
  invoice: 'Create invoices',
  payment: 'Record payments',
  refund: 'Refunds',
  expenses: 'Expenses',
  payroll: 'Payroll',
  request: 'Request',
  issue: 'Issue',
  adjust: 'Adjust stock',
  class: 'Announce to classes',
  school: 'Announce to school',
  profile: 'School profile',
  branches: 'Branches',
  users: 'Users',
  roles: 'Roles',
};

/** Labels that read differently in one module (Boarding's "View" is "View boarding"). */
export const MODULE_ACTION_LABELS: Record<string, Record<string, string>> = {
  boarding: {
    view: 'View boarding',
    manage: 'Manage hostels and places',
    exeats: 'Approve exeats',
    gate: 'Gate sign-out/in',
    health: 'Sick bay',
    rollcall: 'Roll calls',
  },
};

/** What a permission is called in the role editor: "Enter scores", "Approve exeats". */
export const actionLabel = (module: string, action: string) =>
  MODULE_ACTION_LABELS[module]?.[action] ?? ACTION_LABELS[action] ?? action;

export const ROLE_SCOPES: RoleScope[] = [
  'School',
  'Branch',
  'Section',
  'Department',
  'Assigned classes',
  'Store',
];

/** Approvals a position can hold in the organogram. */
export const APPROVALS = [
  'Results: enter and submit',
  'Results: review',
  'Results: approve',
  'Results: publish',
  'Result corrections',
  'Promotion: decide',
  'Promotion: confirm',
  'Refunds up to ₦500,000',
  'Refunds above ₦500,000',
  'Expenses up to ₦250,000',
  'Payroll: calculate',
  'Payroll: review',
  'Payroll: final approval',
  'Stock issue',
  'Stock requests: approve',
  'Admissions',
  'User invitations',
  'Session and term closure',
];

/** Who signs off what, as the organogram's approval chains. */
export const APPROVAL_CHAINS: [string, string[]][] = [
  ['Results', ['Enter · Teacher', 'Review · HOD', 'Approve · VP Academics', 'Publish · Principal']],
  ['Promotion', ['Propose · Class teacher', 'Decide · VP Academics', 'Confirm · Principal']],
  ['Payroll', ['Calculate · Accounts Officer', 'Review · Bursar', 'Approve · Proprietor']],
  ['Refund', ['Request · Bursar', 'Approve · Principal (≤ ₦500k)', 'Pay · Bursar']],
  ['Stock request', ['Request · Any staff', 'Approve · VP Administration', 'Issue · Store Keeper']],
];
