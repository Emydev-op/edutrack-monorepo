/**
 * Demo identity and school-structure data: the accounts the portals' mock APIs use, so the same
 * demo sign-ins work against the real API. No academics or finance data.
 *
 * Every password is DEMO_PASSWORD. Invitation tokens are fixed, known values, which is why the
 * seed refuses to run in production.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  MembershipStatus,
  PlatformStaffStatus,
  StaffGroup,
  StaffKind,
} from '../../src/generated/prisma/enums.js';
import { hashPassword } from '../../src/auth/password.js';
import { PREDEFINED_PLATFORM_ROLES } from '../../src/auth/permissions/platform-permissions.js';
import { PREDEFINED_SCHOOL_ROLES } from '../../src/auth/permissions/school-permissions.js';
import { sha256 } from '../../src/auth/tokens.js';
import { demoUuid, PLAN_SEEDS, seedPlans, seedPlatformData } from './platform-data.js';

export const DEMO_PASSWORD = 'Edutrack2026!';
const DAY = 86_400_000;

/** Fixed invitation tokens matching the portals' demo links. */
export const DEMO_INVITATIONS = {
  /** Teacher Workspace: Mr. Chukwudi Nnamdi, pending. */
  teacherPending: 'GFA-INV-7Q2K',
  teacherExpired: 'expired',
  teacherUsed: 'used',
  /** School Admin: Mrs. Kemi Lawal, pending. */
  schoolAdminPending: 'GFA-INV-LAWAL',
  /** Back office: Dayo Ola, pending; Chika Obi, expired. */
  platformPending: 'PLT-INV-DAYO',
  platformExpired: 'PLT-INV-CHIKA',
} as const;

interface PersonSeed {
  email: string;
  title?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  /** Has a password (invited people who never accepted have none). */
  hasPassword?: boolean;
  /** Days since the password was set (expiry demos). */
  passwordAgeDays?: number;
}

interface StaffSeed extends PersonSeed {
  school: 'greenfield' | 'crestview';
  staffNumber: string;
  position: string;
  kind: StaffKind;
  group: StaffGroup;
  department?: string;
  roles: string[];
  status: MembershipStatus;
  statusReason?: string;
}

interface PlatformSeed extends PersonSeed {
  role: string;
  status: PlatformStaffStatus;
}

const PLATFORM_STAFF: PlatformSeed[] = [
  {
    email: 'tolu@edutrack.ng',
    firstName: 'Tolu',
    lastName: 'Bamidele',
    phone: '+2348034127781',
    role: 'admin',
    status: 'ACTIVE',
  },
  {
    email: 'ngozi@edutrack.ng',
    firstName: 'Ngozi',
    lastName: 'Okafor',
    phone: '+2348055550122',
    role: 'support',
    status: 'ACTIVE',
  },
  {
    email: 'kemi@edutrack.ng',
    firstName: 'Kemi',
    lastName: 'Adewale',
    role: 'ops',
    status: 'SUSPENDED',
  },
  {
    email: 'bayo@edutrack.ng',
    firstName: 'Bayo',
    lastName: 'Ojo',
    role: 'finance',
    status: 'DEACTIVATED',
  },
  {
    email: 'dayo@edutrack.ng',
    firstName: 'Dayo',
    lastName: 'Ola',
    role: 'agent',
    status: 'INVITED',
    hasPassword: false,
  },
  {
    email: 'chika@edutrack.ng',
    firstName: 'Chika',
    lastName: 'Obi',
    role: 'agent',
    status: 'INVITED',
    hasPassword: false,
  },
];

const admin = { kind: 'NON_TEACHING', group: 'ADMINISTRATIVE' } as const;
const teaching = { kind: 'TEACHING', group: 'TEACHING' } as const;

const SCHOOL_STAFF: StaffSeed[] = [
  // School Admin demo accounts (school-admin/src/config/demo.ts).
  {
    school: 'greenfield',
    email: 'adaeze.okonkwo@greenfield.edu.ng',
    title: 'Mrs.',
    firstName: 'Adaeze',
    lastName: 'Okonkwo',
    phone: '+2348091204455',
    staffNumber: 'GFA-ST-0001',
    position: 'Principal',
    ...admin,
    roles: ['school_admin', 'principal'],
    status: 'ACTIVE',
  },
  {
    school: 'greenfield',
    email: 'chidi.okoro@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Chidi',
    lastName: 'Okoro',
    phone: '+2348035550188',
    staffNumber: 'GFA-ST-0012',
    position: 'ICT Administrator',
    ...admin,
    roles: ['school_admin'],
    status: 'SUSPENDED',
  },
  {
    school: 'greenfield',
    email: 'tunde.ojo@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Tunde',
    lastName: 'Ojo',
    phone: '+2348035550179',
    staffNumber: 'GFA-ST-0019',
    position: 'Chemistry Teacher',
    ...teaching,
    department: 'Sciences',
    roles: ['school_admin'],
    status: 'DEACTIVATED',
  },
  // Pending with a password, so the "not activated yet" notice shows after a correct password.
  {
    school: 'greenfield',
    email: 'kemi.lawal@greenfield.edu.ng',
    title: 'Mrs.',
    firstName: 'Kemi',
    lastName: 'Lawal',
    phone: '+2348075550151',
    staffNumber: 'GFA-ST-0140',
    position: 'Accounts Officer',
    kind: 'NON_TEACHING',
    group: 'FINANCE',
    roles: ['school_admin'],
    status: 'INVITED',
  },
  {
    school: 'greenfield',
    email: 'kunle.bakare@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Kunle',
    lastName: 'Bakare',
    phone: '+2348035550133',
    staffNumber: 'GFA-ST-0024',
    position: 'Bursar',
    kind: 'NON_TEACHING',
    group: 'FINANCE',
    roles: ['school_admin', 'bursar'],
    status: 'ACTIVE',
    passwordAgeDays: 120,
  },
  {
    school: 'crestview',
    email: 'e.udo@crestviewcollege.ng',
    title: 'Mr.',
    firstName: 'Emem',
    lastName: 'Udo',
    phone: '+2348095550177',
    staffNumber: 'CCV-ST-0001',
    position: 'Principal',
    ...admin,
    roles: ['school_admin', 'principal'],
    status: 'ACTIVE',
  },
  // Teacher Workspace demo accounts (teacher-portal/src/api/mock/accounts-db.ts).
  {
    school: 'greenfield',
    email: 'c.eze@greenfield.edu.ng',
    title: 'Mrs.',
    firstName: 'Chioma',
    lastName: 'Eze',
    phone: '+2348067782290',
    staffNumber: 'GFA-ST-0042',
    position: 'VP Academics',
    ...teaching,
    department: 'Languages',
    roles: ['teacher', 'academic_head'],
    status: 'ACTIVE',
  },
  {
    school: 'greenfield',
    email: 'i.bello@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Ibrahim',
    lastName: 'Bello',
    phone: '+2348025561144',
    staffNumber: 'GFA-ST-0061',
    position: 'HOD Sciences · Physics',
    ...teaching,
    department: 'Sciences',
    roles: ['teacher', 'hod'],
    status: 'ACTIVE',
  },
  {
    school: 'greenfield',
    email: 's.ade@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Samuel',
    lastName: 'Ade',
    staffNumber: 'GFA-ST-0117',
    position: 'Mathematics Teacher',
    ...teaching,
    department: 'Sciences',
    roles: ['teacher'],
    status: 'ACTIVE',
  },
  {
    school: 'greenfield',
    email: 'g.okafor@greenfield.edu.ng',
    title: 'Mrs.',
    firstName: 'Grace',
    lastName: 'Okafor',
    phone: '+2348052219087',
    staffNumber: 'GFA-ST-0098',
    position: 'English Teacher',
    ...teaching,
    department: 'Languages',
    roles: ['teacher'],
    status: 'ACTIVE',
  },
  {
    school: 'greenfield',
    email: 't.salami@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Babatunde',
    lastName: 'Salami',
    staffNumber: 'GFA-ST-0131',
    position: 'Teacher',
    ...teaching,
    department: 'Vocational',
    roles: ['teacher'],
    status: 'ACTIVE',
  },
  {
    school: 'greenfield',
    email: 'y.oladipo@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Yinka',
    lastName: 'Oladipo',
    staffNumber: 'GFA-ST-0066',
    position: 'Biology Teacher',
    ...teaching,
    department: 'Sciences',
    roles: ['teacher'],
    status: 'SUSPENDED',
    statusReason:
      'Suspended by the school administrator on 2 Dec 2026 while a staff review is completed.',
  },
  {
    school: 'greenfield',
    email: 'f.adebayo@greenfield.edu.ng',
    title: 'Mrs.',
    firstName: 'Funke',
    lastName: 'Adebayo',
    staffNumber: 'GFA-ST-0058',
    position: 'English Teacher',
    ...teaching,
    department: 'Languages',
    roles: ['teacher'],
    status: 'DEACTIVATED',
    statusReason: 'Deactivated on 31 Jul 2026 when this staff member left Greenfield Academy.',
  },
  {
    school: 'greenfield',
    email: 'r.adeleke@greenfield.edu.ng',
    title: 'Mrs.',
    firstName: 'Ronke',
    lastName: 'Adeleke',
    staffNumber: 'GFA-ST-0081',
    position: 'Technology Teacher',
    ...teaching,
    department: 'Vocational',
    roles: ['teacher'],
    status: 'ACTIVE',
    passwordAgeDays: 120,
  },
  {
    school: 'greenfield',
    email: 'c.nnamdi@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Chukwudi',
    lastName: 'Nnamdi',
    staffNumber: 'GFA-ST-0133',
    position: 'Teacher',
    ...teaching,
    department: 'Sciences',
    roles: ['teacher'],
    status: 'INVITED',
    hasPassword: false,
  },
];

const SCHOOLS = {
  greenfield: {
    slug: 'greenfield',
    name: 'Greenfield Academy',
    legalName: 'Greenfield Academy Limited',
    schoolType: 'Nursery, Primary & Secondary',
    status: 'ACTIVE',
    brandColor: '#9B403C',
    motto: 'Knowledge, Character, Service',
    email: 'info@greenfield.edu.ng',
    phone: '+2348091204400',
    city: 'Ikeja',
    state: 'Lagos',
    plan: 'Growth',
    branches: [
      { code: 'GFA-MC', name: 'Main Campus', city: 'Ikeja', isOriginal: true },
      { code: 'GFA-LK', name: 'Lekki Campus', city: 'Lekki', isOriginal: false },
    ],
    departments: ['Sciences', 'Languages', 'Humanities', 'Vocational'],
  },
  crestview: {
    slug: 'crestview',
    name: 'Crestview College',
    legalName: 'Crestview College Limited',
    schoolType: 'Secondary',
    status: 'ONBOARDING',
    brandColor: '#24497A',
    motto: null,
    email: 'hello@crestviewcollege.ng',
    phone: '+2348095550100',
    city: 'Uyo',
    state: 'Akwa Ibom',
    plan: 'Starter',
    branches: [{ code: 'CCV-MC', name: 'Main Campus', city: 'Uyo', isOriginal: true }],
    departments: [] as string[],
  },
} as const;

export interface SeedSummary {
  schools: Record<string, string>;
  users: number;
}

/** Idempotent: re-running brings every demo row back to its seeded state. */
export async function seedDemoData(prisma: PrismaClient, now = new Date()): Promise<SeedSummary> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIds = new Map<string, string>();

  async function upsertUser(p: PersonSeed) {
    const withPassword = p.hasPassword !== false;
    const data = {
      title: p.title ?? null,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone ?? null,
      status: 'ACTIVE' as const,
      passwordHash: withPassword ? passwordHash : null,
      passwordChangedAt: withPassword
        ? new Date(now.getTime() - (p.passwordAgeDays ?? 0) * DAY)
        : null,
      mustChangePassword: false,
      failedSignInCount: 0,
      lockedUntil: null,
      lastFailedSignInAt: null,
      emailVerifiedAt: withPassword ? now : null,
      deletedAt: null,
    };
    const user = await prisma.user.upsert({
      where: { email: p.email },
      create: { email: p.email, ...data },
      update: data,
    });
    userIds.set(p.email, user.id);
    return user;
  }

  /* ---------- Platform ---------- */

  const platformRoles = new Map<string, string>();
  for (const role of PREDEFINED_PLATFORM_ROLES) {
    const row = await prisma.platformRole.upsert({
      where: { key: role.key },
      create: { ...role, predefined: true },
      update: {
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        predefined: true,
      },
    });
    platformRoles.set(role.key, row.id);
  }

  for (const p of PLATFORM_STAFF) {
    const user = await upsertUser(p);
    const data = {
      roleId: platformRoles.get(p.role)!,
      status: p.status,
      invitedAt: now,
      activatedAt: p.status === 'INVITED' ? null : now,
    };
    await prisma.platformStaff.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
  }
  const tolu = userIds.get('tolu@edutrack.ng')!;

  /* ---------- Plans and schools ---------- */

  const planIds = await seedPlans(prisma, { now, passwordHash, tolu });

  const schoolIds: Record<string, string> = {};
  const roleIds = new Map<string, string>(); // `${school}:${key}`
  const departmentIds = new Map<string, string>(); // `${school}:${name}`
  for (const [key, s] of Object.entries(SCHOOLS)) {
    const data = {
      name: s.name,
      legalName: s.legalName,
      schoolType: s.schoolType,
      status: s.status,
      brandColor: s.brandColor,
      motto: s.motto,
      email: s.email,
      phone: s.phone,
      city: s.city,
      state: s.state,
      provisionedAt: now,
      provisionedById: tolu,
      suspendedAt: null,
      suspensionReason: null,
    };
    const school = await prisma.school.upsert({
      where: { slug: s.slug },
      create: { slug: s.slug, ...data },
      update: data,
    });
    schoolIds[key] = school.id;
    await prisma.schoolSettings.upsert({
      where: { schoolId: school.id },
      create: { schoolId: school.id },
      update: { lockoutAttempts: 5, lockoutMinutes: 15, passwordExpiryDays: 90 },
    });
    const plan = PLAN_SEEDS.find((p) => p.name === s.plan)!;
    const subscription = {
      planId: planIds.get(s.plan)!,
      planVersion: 1,
      status: 'ACTIVE' as const,
      billingPeriod: 'ANNUAL' as const,
      priceKobo: plan.annualPriceKobo ?? 0n,
      startedOn: new Date('2026-09-01'),
      renewsOn: new Date('2027-08-31'),
    };
    await prisma.subscription.upsert({
      where: { schoolId: school.id },
      create: { schoolId: school.id, ...subscription },
      update: subscription,
    });
    for (const b of s.branches) {
      await prisma.branch.upsert({
        where: { schoolId_code: { schoolId: school.id, code: b.code } },
        create: {
          schoolId: school.id,
          code: b.code,
          name: b.name,
          city: b.city,
          state: s.state,
          isOriginal: b.isOriginal,
        },
        update: {
          name: b.name,
          city: b.city,
          state: s.state,
          isOriginal: b.isOriginal,
          status: 'ACTIVE',
        },
      });
    }
    for (const name of s.departments) {
      const dept = await prisma.department.upsert({
        where: { schoolId_name: { schoolId: school.id, name } },
        create: { schoolId: school.id, name },
        update: {},
      });
      departmentIds.set(`${key}:${name}`, dept.id);
    }
    for (const role of PREDEFINED_SCHOOL_ROLES) {
      const fields = {
        name: role.name,
        type: 'PREDEFINED' as const,
        scope: role.scope,
        description: role.description,
        permissions: role.permissions,
        archivedAt: null,
      };
      const row = await prisma.schoolRole.upsert({
        where: { schoolId_key: { schoolId: school.id, key: role.key } },
        create: { schoolId: school.id, key: role.key, ...fields },
        update: fields,
      });
      roleIds.set(`${key}:${role.key}`, row.id);
    }
  }

  /* ---------- Staff and memberships ---------- */

  const membershipIds = new Map<string, string>();
  const staffIds = new Map<string, string>();
  for (const p of SCHOOL_STAFF) {
    const schoolId = schoolIds[p.school]!;
    const user = await upsertUser(p);
    const staffData = {
      title: p.title ?? null,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone ?? null,
      positionTitle: p.position,
      kind: p.kind,
      group: p.group,
      departmentId: p.department ? departmentIds.get(`${p.school}:${p.department}`)! : null,
      status: p.status === 'DEACTIVATED' ? ('DEACTIVATED' as const) : ('ACTIVE' as const),
    };
    const staff = await prisma.staff.upsert({
      where: { schoolId_staffNumber: { schoolId, staffNumber: p.staffNumber } },
      create: { schoolId, staffNumber: p.staffNumber, ...staffData },
      update: staffData,
    });
    staffIds.set(p.email, staff.id);
    const membershipData = {
      status: p.status,
      staffId: staff.id,
      statusReason: p.statusReason ?? null,
      invitedAt: now,
      activatedAt: p.status === 'INVITED' ? null : now,
    };
    const membership = await prisma.schoolMembership.upsert({
      where: { schoolId_userId_kind: { schoolId, userId: user.id, kind: 'STAFF' } },
      create: { schoolId, userId: user.id, kind: 'STAFF', ...membershipData },
      update: membershipData,
    });
    membershipIds.set(p.email, membership.id);
    const wanted = p.roles.map((r) => roleIds.get(`${p.school}:${r}`)!);
    await prisma.membershipRole.deleteMany({
      where: { membershipId: membership.id, roleId: { notIn: wanted } },
    });
    for (const roleId of wanted)
      await prisma.membershipRole.upsert({
        where: { membershipId_roleId: { membershipId: membership.id, roleId } },
        create: { schoolId, membershipId: membership.id, roleId },
        update: {},
      });
  }
  await prisma.department.update({
    where: { id: departmentIds.get('greenfield:Sciences')! },
    data: { hodStaffId: staffIds.get('i.bello@greenfield.edu.ng')! },
  });

  /* ---------- Invitations ---------- */

  const adaeze = userIds.get('adaeze.okonkwo@greenfield.edu.ng')!;
  const week = new Date(now.getTime() + 7 * DAY);
  const past = new Date(now.getTime() - 3 * DAY);
  const invitations = [
    {
      token: DEMO_INVITATIONS.teacherPending,
      email: 'c.nnamdi@greenfield.edu.ng',
      school: 'greenfield',
      status: 'PENDING',
      expiresAt: week,
      invitedById: adaeze,
    },
    {
      token: DEMO_INVITATIONS.teacherExpired,
      email: 'c.nnamdi@greenfield.edu.ng',
      school: 'greenfield',
      status: 'EXPIRED',
      expiresAt: past,
      invitedById: adaeze,
    },
    {
      token: DEMO_INVITATIONS.teacherUsed,
      email: 't.salami@greenfield.edu.ng',
      school: 'greenfield',
      status: 'ACCEPTED',
      expiresAt: past,
      invitedById: adaeze,
    },
    {
      token: DEMO_INVITATIONS.schoolAdminPending,
      email: 'kemi.lawal@greenfield.edu.ng',
      school: 'greenfield',
      status: 'PENDING',
      expiresAt: week,
      invitedById: adaeze,
    },
    {
      token: DEMO_INVITATIONS.platformPending,
      email: 'dayo@edutrack.ng',
      school: null,
      status: 'PENDING',
      expiresAt: week,
      invitedById: tolu,
    },
    {
      token: DEMO_INVITATIONS.platformExpired,
      email: 'chika@edutrack.ng',
      school: null,
      status: 'EXPIRED',
      expiresAt: past,
      invitedById: tolu,
    },
  ] as const;
  // Demo invitees get exactly the demo invitations back (re-sent copies are dropped).
  await prisma.invitation.deleteMany({
    where: {
      userId: { in: invitations.map((inv) => userIds.get(inv.email)!) },
      id: { notIn: invitations.map((inv) => demoUuid(`invitation:${inv.token}`)) },
    },
  });
  for (const inv of invitations) {
    const userId = userIds.get(inv.email)!;
    const schoolId = inv.school ? schoolIds[inv.school]! : null;
    const platformStaff = inv.school
      ? null
      : await prisma.platformStaff.findUniqueOrThrow({ where: { userId } });
    const data = {
      kind: inv.school ? ('SCHOOL_STAFF' as const) : ('PLATFORM_STAFF' as const),
      status: inv.status,
      email: inv.email,
      userId,
      schoolId,
      membershipId: inv.school ? membershipIds.get(inv.email)! : null,
      platformStaffId: platformStaff?.id ?? null,
      invitedById: inv.invitedById,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.status === 'ACCEPTED' ? past : null,
      revokedAt: null,
    };
    // A fixed id per demo invitation, so re-seeding also restores one whose token was re-sent.
    const id = demoUuid(`invitation:${inv.token}`);
    const tokenHash = sha256(inv.token);
    await prisma.invitation.deleteMany({ where: { tokenHash, id: { not: id } } });
    await prisma.invitation.upsert({
      where: { id },
      create: { id, tokenHash, ...data },
      update: { tokenHash, sendCount: 1, ...data },
    });
  }

  /* ---------- Back office ---------- */

  await seedPlatformData(prisma, { now, passwordHash, tolu }, planIds, {
    greenfield: schoolIds.greenfield!,
    crestview: schoolIds.crestview!,
  });

  return { schools: schoolIds, users: userIds.size };
}
