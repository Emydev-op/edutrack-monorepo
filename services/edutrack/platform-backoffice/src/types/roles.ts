export const PERMISSION_AREAS = [
  'Schools',
  'Subscriptions',
  'Users',
  'Support',
  'Audit',
  'Reports',
  'Settings',
] as const;
export const PERMISSIONS = ['View', 'Create', 'Edit', 'Delete', 'Suspend', 'Manage'] as const;
/** Permissions that can remove access or data. Shown with a warning everywhere. */
export const HIGH_RISK_PERMISSIONS: readonly Permission[] = ['Delete', 'Suspend', 'Manage'];

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type Permission = (typeof PERMISSIONS)[number];
export type PermissionSet = Partial<Record<PermissionArea, Permission[]>>;
export type RoleId = string;

export interface Role {
  id: RoleId;
  name: string;
  description: string;
  permissions: PermissionSet;
  predefined: boolean;
  activeUsers: number;
}

export interface CreateRolePayload {
  name: string;
  description: string;
  permissions: PermissionSet;
}
