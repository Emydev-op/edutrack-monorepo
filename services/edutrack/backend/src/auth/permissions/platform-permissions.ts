/**
 * Platform back office permissions: area → actions, identical to the back office role editor
 * (`platform-backoffice/src/types/roles.ts`). `PlatformRole.permissions` stores this JSON shape.
 */
export const PLATFORM_PERMISSION_AREAS = [
  'Schools',
  'Subscriptions',
  'Users',
  'Support',
  'Audit',
  'Reports',
  'Settings',
] as const;
export const PLATFORM_PERMISSION_ACTIONS = [
  'View',
  'Create',
  'Edit',
  'Delete',
  'Suspend',
  'Manage',
] as const;

export type PlatformArea = (typeof PLATFORM_PERMISSION_AREAS)[number];
export type PlatformAction = (typeof PLATFORM_PERMISSION_ACTIONS)[number];
/** `'Schools.View'`, `'Support.Manage'`… what `@PlatformOnly()` takes. */
export type PlatformPermission = `${PlatformArea}.${PlatformAction}`;

const full = Object.fromEntries(
  PLATFORM_PERMISSION_AREAS.map((area) => [area, [...PLATFORM_PERMISSION_ACTIONS]]),
);

export const PREDEFINED_PLATFORM_ROLES = [
  {
    key: 'admin',
    name: 'Platform Administrator',
    description: 'Full access to every area, including settings and roles.',
    permissions: full,
  },
  {
    key: 'ops',
    name: 'Platform Operations',
    description: 'Provision and manage schools and subscriptions.',
    permissions: {
      Schools: ['View', 'Create', 'Edit', 'Suspend'],
      Subscriptions: ['View', 'Create', 'Edit', 'Suspend'],
      Users: ['View'],
      Support: ['View', 'Create'],
      Audit: ['View'],
      Reports: ['View'],
      Settings: [],
    },
  },
  {
    key: 'support',
    name: 'Platform Support',
    description: 'Lead support: assign, resolve and approve support sessions.',
    permissions: {
      Schools: ['View'],
      Subscriptions: ['View'],
      Users: ['View'],
      Support: ['View', 'Create', 'Edit', 'Manage'],
      Audit: ['View'],
      Reports: ['View'],
      Settings: [],
    },
  },
  {
    key: 'agent',
    name: 'Support Agent',
    description: 'Work on assigned issues. No access to billing or settings.',
    permissions: {
      Schools: ['View'],
      Subscriptions: [],
      Users: [],
      Support: ['View', 'Create', 'Edit'],
      Audit: [],
      Reports: [],
      Settings: [],
    },
  },
  {
    key: 'finance',
    name: 'Finance',
    description: 'Plans, platform billing and revenue reports.',
    permissions: {
      Schools: ['View'],
      Subscriptions: ['View', 'Edit', 'Manage'],
      Users: [],
      Support: ['View'],
      Audit: ['View'],
      Reports: ['View', 'Manage'],
      Settings: [],
    },
  },
] as const;
