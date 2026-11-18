import { DEFAULT_BRAND_COLOR } from '@edutrack/shared';
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

/**
 * A stable address for a school's logo, or null: it redirects to a fresh signed link (signed links
 * expire in an hour, and portals keep this one in their session). `v` changes with the logo.
 */
export const schoolLogoAddress = (s: { slug: string; logoFileId: string | null }) =>
  s.logoFileId ? `/api/v1/public/schools/${s.slug}/logo?v=${s.logoFileId.slice(-8)}` : null;

export function schoolSummary(m: MembershipWithSchool) {
  const { school } = m;
  const sub = school.subscription;
  return {
    id: school.id,
    slug: school.slug,
    name: school.name,
    initials: initialsOf(school.name),
    plan: sub ? `${sub.plan.name} · ${PERIOD[sub.billingPeriod] ?? sub.billingPeriod}` : '',
    brandColor: school.brandColor ?? DEFAULT_BRAND_COLOR,
    // A stable address that redirects to a fresh signed link (signed links expire in an hour,
    // and this one is kept in the portal's session). `v` changes when the logo does.
    logoUrl: schoolLogoAddress(school),
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

/** Parent Portal: the parent as the school knows them (their guardian record's name and title). */
export function parentUser(user: User, m: MembershipWithSchool) {
  const title = m.guardian?.title ?? user.title ?? '';
  return {
    id: user.id,
    title,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName:
      m.guardian?.fullName ?? [title, user.firstName, user.lastName].filter(Boolean).join(' '),
    email: user.email ?? '',
    phone: user.phone,
  };
}

/** Student Portal: the pupil with their admission number. */
export function studentUser(user: User, m: MembershipWithSchool) {
  const s = m.student;
  return {
    id: user.id,
    firstName: s?.firstName ?? user.firstName,
    lastName: s?.surname ?? user.lastName,
    displayName: s ? `${s.firstName} ${s.surname}` : `${user.firstName} ${user.lastName}`,
    admissionNo: s?.admissionNo ?? '',
  };
}

/** The signed-in user for any school portal. */
export function schoolPortalUser(user: User, portal: string, m: MembershipWithSchool) {
  if (portal === 'TEACHER') return teacherUser(user, m);
  if (portal === 'PARENT') return parentUser(user, m);
  if (portal === 'STUDENT') return studentUser(user, m);
  return schoolAdminUser(user, m);
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
    /** `Schools.View`, `Users.Edit`…: the back office hides and locks what the role can't do. */
    permissions: platformPermissions(staff),
  };
}

/** The body of login, refresh, expired-password and switch-school answers, per portal. */
export function signedInBody(
  user: User,
  access: PortalAccess,
  token: { accessToken: string; expiresIn: number },
) {
  if (access.portal === 'PLATFORM') return { ...token, user: platformUser(user, access.staff) };
  if (access.portal !== 'SCHOOL_ADMIN') {
    // Teacher, Parent and Student Portals live on the school's address: only that school.
    const school = schoolSummary(access.membership);
    return {
      ...token,
      user: schoolPortalUser(user, access.portal, access.membership),
      school: {
        id: school.id,
        slug: school.slug,
        name: school.name,
        initials: school.initials,
        brandColor: school.brandColor,
        logoUrl: school.logoUrl,
      },
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
