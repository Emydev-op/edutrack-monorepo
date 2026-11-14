import type { RoleScope } from '../../generated/prisma/enums.js';

/**
 * School role permissions: module → actions. Identical to the School Admin role editor
 * (`school-admin/src/config/permissions.ts`); `SchoolRole.permissions` stores this JSON shape.
 */
export const SCHOOL_PERMISSION_MODULES = {
  students: ['view', 'create', 'edit', 'archive', 'promote'],
  academics: ['view', 'configure', 'timetable'],
  results: ['view', 'enter', 'review', 'approve', 'publish', 'correct'],
  finance: ['view', 'invoice', 'payment', 'refund', 'expenses', 'payroll'],
  inventory: ['view', 'request', 'issue', 'adjust'],
  comms: ['view', 'class', 'school'],
  settings: ['profile', 'branches', 'users', 'roles'],
} as const;

type Modules = typeof SCHOOL_PERMISSION_MODULES;
/** `'students.view'`, `'results.publish'`… what `@RequirePermission()` takes. */
export type SchoolPermission = {
  [M in keyof Modules]: `${M & string}.${Modules[M][number]}`;
}[keyof Modules];

export type PermissionMap = Partial<Record<string, string[]>>;

export const ALL_SCHOOL_PERMISSIONS: PermissionMap = Object.fromEntries(
  Object.entries(SCHOOL_PERMISSION_MODULES).map(([module, actions]) => [module, [...actions]]),
);

/** Merges the permission maps of several roles into a sorted set of `module.action` strings. */
export function flattenPermissions(maps: unknown[]): string[] {
  const out = new Set<string>();
  for (const map of maps) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    for (const [module, actions] of Object.entries(map as Record<string, unknown>)) {
      if (!Array.isArray(actions)) continue;
      for (const action of actions) if (typeof action === 'string') out.add(`${module}.${action}`);
    }
  }
  return [...out].sort();
}

export interface PredefinedRole {
  /** Stable key the app checks (`SchoolRole.key`). */
  key: string;
  name: string;
  scope: RoleScope;
  description: string;
  permissions: PermissionMap;
}

/**
 * Roles copied into every school at provisioning (and by the seed). Names, scopes and permissions
 * match the School Admin role editor's predefined roles.
 */
export const PREDEFINED_SCHOOL_ROLES: readonly PredefinedRole[] = [
  {
    key: 'owner',
    name: 'Owner',
    scope: 'SCHOOL',
    description: 'Full access including subscription and payroll approval',
    permissions: ALL_SCHOOL_PERMISSIONS,
  },
  {
    key: 'school_admin',
    name: 'School Admin',
    scope: 'SCHOOL',
    description: 'Configure the school, users and academic structure',
    permissions: {
      students: ['view', 'create', 'edit', 'archive', 'promote'],
      academics: ['view', 'configure', 'timetable'],
      results: ['view', 'publish'],
      finance: ['view'],
      inventory: ['view'],
      comms: ['view', 'class', 'school'],
      settings: ['profile', 'branches', 'users', 'roles'],
    },
  },
  {
    key: 'principal',
    name: 'Principal',
    scope: 'BRANCH',
    description: 'Publish results, confirm promotion, approve refunds',
    permissions: {
      students: ['view', 'edit', 'promote'],
      academics: ['view'],
      results: ['view', 'approve', 'publish', 'correct'],
      finance: ['view', 'refund'],
      comms: ['view', 'class', 'school'],
    },
  },
  {
    key: 'academic_head',
    name: 'Academic Head',
    scope: 'SECTION',
    description: 'Approve results, manage curriculum and timetable',
    permissions: {
      students: ['view', 'edit', 'promote'],
      academics: ['view', 'configure', 'timetable'],
      results: ['view', 'review', 'approve'],
      comms: ['view', 'class'],
    },
  },
  {
    key: 'hod',
    name: 'HOD',
    scope: 'DEPARTMENT',
    description: 'Review results for their subjects',
    permissions: {
      students: ['view'],
      academics: ['view'],
      results: ['view', 'enter', 'review'],
      comms: ['view', 'class'],
    },
  },
  {
    key: 'teacher',
    name: 'Teacher',
    scope: 'ASSIGNED_CLASSES',
    description: 'Enter scores, assignments, materials',
    permissions: {
      students: ['view'],
      academics: ['view'],
      results: ['view', 'enter'],
      comms: ['view', 'class'],
    },
  },
  {
    key: 'bursar',
    name: 'Bursar',
    scope: 'SCHOOL',
    description: 'Fees, payments, expenses, payroll review',
    permissions: {
      students: ['view'],
      finance: ['view', 'invoice', 'payment', 'refund', 'expenses', 'payroll'],
      inventory: ['view'],
    },
  },
  {
    key: 'accountant',
    name: 'Accountant',
    scope: 'BRANCH',
    description: 'Record and verify payments',
    permissions: { students: ['view'], finance: ['view', 'payment'] },
  },
  {
    key: 'inventory_officer',
    name: 'Inventory Officer',
    scope: 'STORE',
    description: 'Stock movements and counts',
    permissions: { inventory: ['view', 'request', 'issue', 'adjust'] },
  },
  {
    key: 'branch_admin',
    name: 'Branch Admin',
    scope: 'BRANCH',
    description: 'Run one campus',
    permissions: {
      students: ['view', 'create', 'edit'],
      academics: ['view', 'timetable'],
      results: ['view'],
      finance: ['view'],
      inventory: ['view', 'request'],
      comms: ['view', 'class', 'school'],
    },
  },
];

/** Roles that open the Teacher Workspace. */
export const TEACHER_PORTAL_ROLE_KEYS: ReadonlySet<string> = new Set([
  'teacher',
  'hod',
  'academic_head',
]);

/**
 * Roles that alone do NOT open School Admin: a classroom teacher or HOD works in the Teacher
 * Workspace. Any other role (predefined or custom) opens School Admin.
 */
export const TEACHING_ONLY_ROLE_KEYS: ReadonlySet<string> = new Set(['teacher', 'hod']);

/** Order used to pick the role name shown under the user's name (most senior first). */
export const ROLE_DISPLAY_ORDER = [
  'owner',
  'school_admin',
  'principal',
  'academic_head',
  'branch_admin',
  'bursar',
  'accountant',
  'inventory_officer',
  'hod',
  'teacher',
];
