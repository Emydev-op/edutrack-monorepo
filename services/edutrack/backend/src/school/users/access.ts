import type { MembershipStatus, RoleScope, RoleType } from '../../generated/prisma/enums.js';
import type { TenantPrismaClient } from '../../tenancy/tenant-prisma.service.js';
import type { SchoolAuditService } from '../shared/school-audit.service.js';
import {
  ROLE_DISPLAY_ORDER,
  SCHOOL_PERMISSION_MODULES,
} from '../../auth/permissions/school-permissions.js';

/**
 * Labels and rules shared by Users & Roles, the organogram and the staff picker. Labels match the
 * School Admin screens (`school-admin/src/config/permissions.ts`, `src/types/school.ts`).
 */

export const ROLE_SCOPE_LABEL: Record<RoleScope, string> = {
  SCHOOL: 'School',
  BRANCH: 'Branch',
  SECTION: 'Section',
  DEPARTMENT: 'Department',
  ASSIGNED_CLASSES: 'Assigned classes',
  STORE: 'Store',
};
export const ROLE_SCOPE_LABELS = Object.values(ROLE_SCOPE_LABEL);
export const roleScopeOf = (label: string) =>
  (Object.entries(ROLE_SCOPE_LABEL) as [RoleScope, string][]).find(([, l]) => l === label)?.[0];

export const ROLE_TYPE_LABEL: Record<RoleType, 'Predefined' | 'Custom'> = {
  PREDEFINED: 'Predefined',
  CUSTOM: 'Custom',
};

export type UserStatusLabel = 'Active' | 'Invited' | 'Suspended' | 'Deactivated' | 'Revoked';
export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, UserStatusLabel> = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
  REVOKED: 'Revoked',
};

/** Area names on a user's "What they can do" card. */
export const MODULE_LABEL: Record<string, string> = {
  students: 'Students',
  academics: 'Academics',
  results: 'Results',
  finance: 'Finance',
  inventory: 'Inventory',
  comms: 'Communication',
  settings: 'School settings',
};

export const ACTION_LABEL: Record<string, string> = {
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

/** Role keys that run the school: there is always at least one active holder of one of them. */
export const ADMIN_ROLE_KEYS = ['owner', 'school_admin'] as const;
export const OWNER_ROLE_NAME = 'Owner';
export const SCHOOL_ADMIN_ROLE_NAME = 'School Admin';

type PermissionMap = Record<string, string[]>;

/** Keeps known modules and actions only, in the editor's order; drops empty modules. */
export function cleanPermissions(input: unknown): PermissionMap {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const out: PermissionMap = {};
  for (const [module, actions] of Object.entries(SCHOOL_PERMISSION_MODULES)) {
    const given = source[module];
    if (!Array.isArray(given)) continue;
    const kept = (actions as readonly string[]).filter((a) => given.includes(a));
    if (kept.length) out[module] = kept;
  }
  return out;
}

/** `[area, "View, Create, …"]` rows for what a set of roles allows. */
export function describePermissions(maps: unknown[]): [string, string][] {
  const rows: [string, string][] = [];
  for (const [module, actions] of Object.entries(SCHOOL_PERMISSION_MODULES)) {
    const granted = new Set(maps.flatMap((m) => cleanPermissions(m)[module] ?? []));
    const list = (actions as readonly string[]).filter((a) => granted.has(a));
    if (list.length)
      rows.push([MODULE_LABEL[module]!, list.map((a) => ACTION_LABEL[a] ?? a).join(', ')]);
  }
  return rows;
}

/** Whether these permission maps together grant `module.action`. */
export const grants = (maps: unknown[], permission: string) => {
  const [module, action] = permission.split('.') as [string, string];
  return maps.some((m) => cleanPermissions(m)[module]?.includes(action));
};

/** Most senior first (Owner, School Admin, …), then custom roles by name. */
export function sortRoles<T extends { key: string | null; name: string }>(roles: T[]): T[] {
  const rank = (r: T) => {
    const i = r.key ? ROLE_DISPLAY_ORDER.indexOf(r.key) : -1;
    return i === -1 ? ROLE_DISPLAY_ORDER.length : i;
  };
  return [...roles].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** "Mrs. Adaeze Okonkwo". */
export const fullName = (p: { title?: string | null; firstName: string; lastName: string }) =>
  [p.title, p.firstName, p.lastName].filter(Boolean).join(' ');

const TITLE = /^(Mr|Mrs|Miss|Ms|Dr|Prof|Rev|Mme|Engr|Chief|Pastor)\.?$/i;

/** Splits "Mrs. Ada Obi" into title, first and last name. */
export function splitName(name: string) {
  const words = name.trim().split(/\s+/);
  const title = words.length > 2 && TITLE.test(words[0]!) ? words.shift()! : null;
  const [firstName, ...rest] = words;
  return {
    title: title ? `${title.replace(/\.$/, '')}.` : null,
    firstName: firstName!,
    lastName: rest.join(' '),
  };
}

const LAGOS = 'Africa/Lagos';
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: LAGOS,
});
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: LAGOS,
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: LAGOS,
});
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS });

const sameDay = (a: Date, b: Date) => DAY_KEY.format(a) === DAY_KEY.format(b);

/** "Sep 2016", or "Today". */
export const monthYear = (d: Date, now: Date) => (sameDay(d, now) ? 'Today' : MONTH_YEAR.format(d));

/** "4 Dec 2026", or "Today". */
export const dayMonthYear = (d: Date, now: Date) =>
  sameDay(d, now) ? 'Today' : DAY_MONTH_YEAR.format(d);

/** "Just now", "2 hr ago", "Yesterday", "3 Dec" (or "3 Dec 2025" in another year). */
export function ago(d: Date, now: Date): string {
  const ms = now.getTime() - d.getTime();
  if (ms < 60 * 60 * 1000) return 'Just now';
  if (sameDay(d, now)) return `${Math.floor(ms / 3_600_000)} hr ago`;
  if (sameDay(d, new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return MONTH_YEAR.format(d).slice(-4) === MONTH_YEAR.format(now).slice(-4)
    ? DAY_MONTH.format(d)
    : DAY_MONTH_YEAR.format(d);
}

/** Audit history as School Admin timelines show it (`when` is relative, `at` the ISO time). */
export const toTimeline = (
  entries: { id: string; title: string; detail: string; at: string }[],
  now: Date,
) => entries.map((e) => ({ ...e, when: ago(new Date(e.at), now), tone: 'success' as const }));

/** The client inside `tenant.db.$transaction(async (tx) => …)`. */
export type TenantTx = Omit<
  TenantPrismaClient,
  '$on' | '$connect' | '$disconnect' | '$transaction' | '$extends' | '$use'
>;

/** `SchoolAuditService.record` types its client as Prisma's; the tenant transaction is the same. */
export const auditDb = (tx: TenantTx) =>
  tx as unknown as Parameters<SchoolAuditService['record']>[1];
