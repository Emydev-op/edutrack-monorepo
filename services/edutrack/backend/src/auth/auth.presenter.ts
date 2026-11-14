import type { User } from '../generated/prisma/client.js';
import { initialsOf } from './identifiers.js';
import { flattenPermissions, ROLE_DISPLAY_ORDER } from './permissions/school-permissions.js';
import type {
  MembershipWithSchool,
  PlatformStaffWithRole,
  PortalAccess,
} from './portal-access.service.js';

/* Response shapes match the portals' `types/auth.ts`; extra fields are additive. */

const PERIOD: Record<string, string> = { ANNUAL: 'Annual', TERM: 'Termly', MONTH: 'Monthly' };
const DEFAULT_BRAND = '#1F6FEB';

export function schoolSummary(m: MembershipWithSchool) {
  const { school } = m;
  const sub = school.subscription;
  return {
    id: school.id,
    slug: school.slug,
    name: school.name,
    initials: initialsOf(school.name),
    plan: sub ? `${sub.plan.name} · ${PERIOD[sub.billingPeriod] ?? sub.billingPeriod}` : '',
    brandColor: school.brandColor ?? DEFAULT_BRAND,
    // Logos are served from storage with signed URLs once the files module exists.
    logoUrl: null as string | null,
    subscriptionStatus: (sub && ['RESTRICTED', 'EXPIRED', 'CANCELLED'].includes(sub.status)
      ? 'Restricted'
      : 'Active') as 'Active' | 'Restricted',
  };
}

export const schoolChoices = (access: Extract<PortalAccess, { membership: unknown }>) =>
  access.choices.map((m) => ({
    id: m.school.id,
    slug: m.school.slug,
    name: m.school.name,
    initials: initialsOf(m.school.name),
    current: m.schoolId === access.membership.schoolId,
  }));

function sortedRoles(m: MembershipWithSchool) {
  const rank = (key: string | null) => {
    const i = key ? ROLE_DISPLAY_ORDER.indexOf(key) : -1;
    return i < 0 ? ROLE_DISPLAY_ORDER.length : i;
  };
  return m.roles
    .filter((r) => !r.role.archivedAt)
    .map((r) => r.role)
    .sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name));
}

export function schoolAdminUser(user: User, m: MembershipWithSchool) {
  const roles = sortedRoles(m);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? '',
    phone: user.phone,
    position: m.staff?.positionTitle ?? roles[0]?.name ?? '',
    roleName: roles[0]?.name ?? '',
    roles: roles.map((r) => r.name),
    avatarUrl: null as string | null,
  };
}

export function teacherUser(user: User, m: MembershipWithSchool) {
  const title = m.staff?.title ?? user.title ?? '';
  return {
    id: user.id,
    title,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: [title, user.firstName, user.lastName].filter(Boolean).join(' '),
    email: user.email ?? '',
    position: m.staff?.positionTitle ?? 'Teacher',
  };
}

export function platformUser(user: User, staff: PlatformStaffWithRole) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? '',
    roleId: staff.role.key ?? staff.role.id,
    roleName: staff.role.name,
    avatarUrl: null as string | null,
  };
}

/** The body of login, refresh, expired-password and switch-school answers, per portal. */
export function signedInBody(
  user: User,
  access: PortalAccess,
  token: { accessToken: string; expiresIn: number },
) {
  if (access.portal === 'PLATFORM') return { ...token, user: platformUser(user, access.staff) };
  if (access.portal === 'TEACHER') {
    const school = schoolSummary(access.membership);
    return {
      ...token,
      user: teacherUser(user, access.membership),
      school: { id: school.id, slug: school.slug, name: school.name, initials: school.initials },
    };
  }
  return {
    ...token,
    user: schoolAdminUser(user, access.membership),
    school: schoolSummary(access.membership),
    schools: schoolChoices(access),
  };
}

export function membershipView(m: MembershipWithSchool) {
  const roles = sortedRoles(m);
  return {
    id: m.id,
    kind: m.kind,
    scope: m.scope,
    branchIds: m.branches.map((b) => b.branchId),
    roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name })),
    permissions: flattenPermissions(roles.map((r) => r.permissions)),
  };
}

export function platformPermissions(staff: PlatformStaffWithRole): string[] {
  return flattenPermissions([staff.role.permissions]);
}
