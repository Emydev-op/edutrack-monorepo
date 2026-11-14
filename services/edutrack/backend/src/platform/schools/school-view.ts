import type { Prisma } from '../../generated/prisma/client.js';
import type { StudentStatus } from '../../generated/prisma/enums.js';
import {
  displayPhone,
  formatDay,
  OWNERSHIP_LABEL,
  schoolStatusLabel,
  type SchoolStatusLabel,
} from '../shared/format.js';

/** Students who count towards a plan's limit and the dashboard totals. */
export const ENROLLED: StudentStatus[] = ['ACTIVE', 'INCOMPLETE_PROFILE'];

/** Roles that make someone a school administrator in the back office's eyes. */
export const ADMIN_ROLE_KEYS = ['owner', 'school_admin'] as const;

/** School Admin's setup checklist, in order (SetupStepState.stepKey → label). */
export const SETUP_STEPS: [key: string, label: string][] = [
  ['school-profile', 'School Profile'],
  ['branches', 'Branches'],
  ['academic-sections', 'Academic Sections'],
  ['session', 'Academic Session'],
  ['terms', 'Terms'],
  ['classes', 'Classes & Arms'],
  ['subjects', 'Subjects & Curriculum'],
  ['assessment', 'Assessment & Grading'],
  ['organogram-roles', 'Organogram & Roles'],
  ['staff', 'Staff'],
  ['assignments', 'Teacher Assignments'],
  ['students', 'Students'],
  ['guardians', 'Parents/Guardians'],
  ['fees', 'Fees'],
  ['timetable', 'Timetable'],
  ['notifications', 'Notifications'],
];

export const adminMembershipsWhere = {
  kind: 'STAFF',
  status: { in: ['ACTIVE', 'INVITED'] },
  roles: { some: { role: { key: { in: [...ADMIN_ROLE_KEYS] } } } },
} satisfies Prisma.SchoolMembershipWhereInput;

export const schoolInclude = {
  subscription: { include: { plan: true } },
  setupStepStates: { where: { confirmedAt: { not: null } }, select: { stepKey: true } },
  schoolMemberships: {
    where: adminMembershipsWhere,
    include: {
      user: { select: { firstName: true, lastName: true, title: true } },
      roles: { include: { role: { select: { key: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  },
  _count: {
    select: {
      students: { where: { status: { in: ENROLLED } } },
      branches: { where: { status: 'ACTIVE' } },
    },
  },
} satisfies Prisma.SchoolInclude;

export type SchoolWithView = Prisma.SchoolGetPayload<{ include: typeof schoolInclude }>;

export interface SchoolView {
  id: string;
  name: string;
  legalName: string;
  type: string;
  state: string;
  plan: string;
  status: SchoolStatusLabel;
  students: number;
  branches: number;
  renews: string;
  setupProgress: number;
  currentStep: string;
  admin: string;
  contactEmail: string;
  phone: string;
  subdomain: string;
  createdAt: string;
  brandColor: string | null;
}

/** Setup progress as the back office shows it: share of the checklist done, and what's next. */
export function setupOf(school: SchoolWithView): { progress: number; step: string } {
  if (school.setupFinishedAt) return { progress: 100, step: 'Complete' };
  const done = new Set(school.setupStepStates.map((s) => s.stepKey));
  const progress = Math.round(
    (SETUP_STEPS.filter(([key]) => done.has(key)).length / SETUP_STEPS.length) * 100,
  );
  if (!school.schoolMemberships.some((m) => m.status === 'ACTIVE'))
    return { progress, step: 'Accept invitation' };
  const next = SETUP_STEPS.find(([key]) => !done.has(key));
  return { progress, step: next ? next[1] : 'Complete' };
}

/** Owners first, then the earliest administrator: `Adaeze Okonkwo`, `Peter Okon (invited) +1`. */
function adminLabel(school: SchoolWithView): string {
  const admins = [...school.schoolMemberships].sort((a, b) => {
    const owner = (m: (typeof admins)[number]) =>
      m.roles.some((r) => r.role.key === 'owner') ? 0 : 1;
    const active = (m: (typeof admins)[number]) => (m.status === 'ACTIVE' ? 0 : 1);
    return active(a) - active(b) || owner(a) - owner(b);
  });
  const first = admins[0];
  if (!first) return '—';
  const name = `${first.user.firstName} ${first.user.lastName}`;
  return `${name}${first.status === 'INVITED' ? ' (invited)' : ''}${admins.length > 1 ? ` +${admins.length - 1}` : ''}`;
}

export function toSchoolView(school: SchoolWithView, baseDomain: string): SchoolView {
  const setup = setupOf(school);
  const sub = school.subscription;
  return {
    id: school.id,
    name: school.name,
    legalName: school.legalName,
    type: `${OWNERSHIP_LABEL[school.ownership]} · ${school.schoolType ?? '—'}`,
    state: school.state ?? '',
    plan: sub?.plan.name ?? '—',
    status: schoolStatusLabel(school.status, sub?.status),
    students: school._count.students,
    branches: school._count.branches,
    renews: sub ? formatDay(sub.renewsOn, { calendar: true }) : '—',
    setupProgress: setup.progress,
    currentStep: setup.step,
    admin: adminLabel(school),
    contactEmail: school.email ?? '',
    phone: displayPhone(school.phone),
    subdomain: `${school.slug}.${baseDomain}`,
    createdAt: formatDay(school.provisionedAt ?? school.createdAt),
    brandColor: school.brandColor,
  };
}

/** Prisma filter for a back-office status label. */
export function statusWhere(label: string): Prisma.SchoolWhereInput {
  switch (label) {
    case 'Onboarding':
      return { status: 'ONBOARDING' };
    case 'Suspended':
      return { status: 'SUSPENDED' };
    case 'Active':
      return {
        status: 'ACTIVE',
        OR: [{ subscription: null }, { subscription: { status: 'ACTIVE' } }],
      };
    case 'Expiring':
      return { status: 'ACTIVE', subscription: { status: 'EXPIRING' } };
    case 'Grace period':
      return { status: 'ACTIVE', subscription: { status: 'GRACE_PERIOD' } };
    case 'Restricted':
      return { status: 'ACTIVE', subscription: { status: 'RESTRICTED' } };
    case 'Expired':
      return { status: 'ACTIVE', subscription: { status: 'EXPIRED' } };
    case 'Cancelled':
      return { status: 'ACTIVE', subscription: { status: 'CANCELLED' } };
    default:
      return {};
  }
}
