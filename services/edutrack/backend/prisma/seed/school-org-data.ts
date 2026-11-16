/**
 * Organogram, Users & Roles demo data, matching School Admin's mock (`school-admin/src/api/mock/
 * school-db.ts`): Greenfield's remaining staff accounts (Proprietor/Owner, Head of Campus Lekki,
 * Nursery Coordinator, Store Keeper, a driver without an account), its two custom roles and its
 * twelve-post organogram; Crestview's single Principal post. The staff and accounts already in
 * `demo-data.ts` are reused by email, not duplicated. Idempotent: positions and custom roles come
 * back to exactly this state (anything a test added is removed).
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  AccessScope,
  RoleScope,
  StaffGroup,
  StaffKind,
} from '../../src/generated/prisma/enums.js';
import { demoUuid } from './platform-data.js';

interface Context {
  now: Date;
  passwordHash: string;
  schoolIds: Record<string, string>;
}

interface ExtraStaff {
  email: string | null;
  title: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  staffNumber: string;
  position: string;
  kind: StaffKind;
  group: StaffGroup;
  /** Role keys; empty for someone without an account. */
  roles: string[];
  scope: AccessScope;
  /** Branch codes when scope is BRANCH. */
  branches: string[];
  startedOn: string;
}

/** Greenfield people in the mock who aren't in demo-data.ts yet. */
const GREENFIELD_STAFF: ExtraStaff[] = [
  {
    email: 'f.ogunbiyi@greenfield.edu.ng',
    title: 'Dr.',
    firstName: 'Folasade',
    lastName: 'Ogunbiyi',
    phone: '+2348025550120',
    staffNumber: 'GFA-ST-0002',
    position: 'Proprietor',
    kind: 'NON_TEACHING',
    group: 'ADMINISTRATIVE',
    roles: ['owner'],
    scope: 'SCHOOL',
    branches: [],
    startedOn: '2009-09-01',
  },
  {
    email: 'femi.adebayo@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Femi',
    lastName: 'Adebayo',
    phone: '+2348085550162',
    staffNumber: 'GFA-ST-0062',
    position: 'Head of Campus, Lekki',
    kind: 'NON_TEACHING',
    group: 'ADMINISTRATIVE',
    roles: ['branch_admin'],
    scope: 'BRANCH',
    branches: ['GFA-LK'],
    startedOn: '2018-09-01',
  },
  {
    email: 'i.nwachukwu@greenfield.edu.ng',
    title: 'Mrs.',
    firstName: 'Ifeoma',
    lastName: 'Nwachukwu',
    phone: '+2348065550171',
    staffNumber: 'GFA-ST-0071',
    position: 'Nursery Coordinator',
    kind: 'TEACHING',
    group: 'TEACHING',
    roles: ['academic_head', 'teacher'],
    scope: 'BRANCH',
    branches: ['GFA-MC'],
    startedOn: '2019-01-07',
  },
  {
    email: 'm.yakubu@greenfield.edu.ng',
    title: 'Mr.',
    firstName: 'Musa',
    lastName: 'Yakubu',
    phone: '+2348035550203',
    staffNumber: 'GFA-ST-0103',
    position: 'Store Keeper',
    kind: 'NON_TEACHING',
    group: 'OPERATIONS',
    roles: ['inventory_officer'],
    scope: 'BRANCH',
    branches: ['GFA-MC'],
    startedOn: '2019-02-04',
  },
  {
    email: null,
    title: 'Mr.',
    firstName: 'Peter',
    lastName: 'Adamu',
    phone: '+2348045550126',
    staffNumber: 'GFA-ST-0126',
    position: 'Driver',
    kind: 'NON_TEACHING',
    group: 'OPERATIONS',
    roles: [],
    scope: 'SCHOOL',
    branches: [],
    startedOn: '2021-05-03',
  },
];

interface CustomRoleSeed {
  name: string;
  scope: RoleScope;
  description: string;
  permissions: Record<string, string[]>;
}

const CUSTOM_ROLES: Record<string, CustomRoleSeed[]> = {
  greenfield: [
    {
      name: 'Admissions Officer',
      scope: 'BRANCH',
      description: 'Process applications and admissions only',
      permissions: { students: ['view', 'create'], comms: ['view'] },
    },
    {
      name: 'Exams Officer',
      scope: 'SECTION',
      description: 'Assessment setup and result completion tracking',
      permissions: { academics: ['view', 'configure'], results: ['view', 'review'] },
    },
  ],
  crestview: [],
};

interface PositionSeed {
  key: string;
  title: string;
  parent: string | null;
  /** Holders by staff email (or staff number for people without one). */
  holders: string[];
  /** Suggested role keys. */
  roles: string[];
  responsibilities: string;
  approvals: string[];
}

const POSITIONS: Record<string, PositionSeed[]> = {
  greenfield: [
    {
      key: 'prop',
      title: 'Proprietor',
      parent: null,
      holders: ['f.ogunbiyi@greenfield.edu.ng'],
      roles: ['owner'],
      responsibilities: 'Sets school policy and fees. Chairs the Board of Governors.',
      approvals: ['Payroll: final approval', 'Refunds above ₦500,000'],
    },
    {
      key: 'principal',
      title: 'Principal',
      parent: 'prop',
      holders: ['adaeze.okonkwo@greenfield.edu.ng'],
      roles: ['school_admin', 'principal'],
      responsibilities: 'Leads academics and operations. Signs report cards.',
      approvals: [
        'Results: publish',
        'Promotion: confirm',
        'Refunds up to ₦500,000',
        'Session and term closure',
      ],
    },
    {
      key: 'vpa',
      title: 'Vice Principal (Academics)',
      parent: 'principal',
      holders: ['c.eze@greenfield.edu.ng'],
      roles: ['academic_head', 'teacher'],
      responsibilities: 'Curriculum, timetable and assessments.',
      approvals: ['Results: approve', 'Promotion: decide', 'Result corrections'],
    },
    {
      key: 'bursar',
      title: 'Bursar',
      parent: 'principal',
      holders: ['kunle.bakare@greenfield.edu.ng'],
      roles: ['bursar'],
      responsibilities: 'Fees, payments, expenses and payroll.',
      approvals: ['Payroll: review', 'Expenses up to ₦250,000'],
    },
    {
      key: 'lekki',
      title: 'Head of Campus, Lekki',
      parent: 'principal',
      holders: ['femi.adebayo@greenfield.edu.ng'],
      roles: ['branch_admin'],
      responsibilities: 'Runs Lekki Campus day to day.',
      approvals: ['Admissions', 'Stock requests: approve'],
    },
    {
      key: 'ict',
      title: 'ICT Administrator',
      parent: 'principal',
      holders: ['chidi.okoro@greenfield.edu.ng'],
      roles: ['school_admin', 'teacher'],
      responsibilities: 'User accounts, devices and Computer Studies.',
      approvals: ['User invitations'],
    },
    {
      key: 'hods',
      title: 'HOD Sciences',
      parent: 'vpa',
      holders: ['i.bello@greenfield.edu.ng'],
      roles: ['hod', 'teacher'],
      responsibilities: 'Sciences department, 14 teachers.',
      approvals: ['Results: review'],
    },
    {
      key: 'hodl',
      title: 'HOD Languages',
      parent: 'vpa',
      holders: [],
      roles: ['hod', 'teacher'],
      responsibilities: 'Languages department, 11 teachers.',
      approvals: ['Results: review'],
    },
    {
      key: 'nur',
      title: 'Nursery Coordinator',
      parent: 'vpa',
      holders: ['i.nwachukwu@greenfield.edu.ng'],
      roles: ['academic_head', 'teacher'],
      responsibilities: 'Nursery section, both campuses.',
      approvals: ['Results: review'],
    },
    {
      key: 'math',
      title: 'Mathematics Teacher',
      parent: 'hods',
      holders: ['s.ade@greenfield.edu.ng'],
      roles: ['teacher'],
      responsibilities: 'Teaches Mathematics across JSS and SSS.',
      approvals: ['Results: enter and submit'],
    },
    {
      key: 'acct',
      title: 'Accounts Officer',
      parent: 'bursar',
      holders: ['kemi.lawal@greenfield.edu.ng'],
      roles: ['accountant'],
      responsibilities: 'Receipts and reconciliation.',
      approvals: ['Payroll: calculate'],
    },
    {
      key: 'store',
      title: 'Store Keeper',
      parent: 'ict',
      holders: ['m.yakubu@greenfield.edu.ng'],
      roles: ['inventory_officer'],
      responsibilities: 'Main Store.',
      approvals: ['Stock issue'],
    },
  ],
  crestview: [
    {
      key: 'principal',
      title: 'Principal',
      parent: null,
      holders: ['e.udo@crestviewcollege.ng'],
      roles: ['school_admin', 'principal'],
      responsibilities: 'Leads academics and operations.',
      approvals: ['Results: publish', 'Promotion: confirm', 'Session and term closure'],
    },
  ],
};

export async function seedSchoolOrgData(prisma: PrismaClient, ctx: Context): Promise<void> {
  const greenfield = ctx.schoolIds.greenfield!;

  /* ---------- Greenfield's other staff and their accounts ---------- */

  const branches = await prisma.branch.findMany({ where: { schoolId: greenfield } });
  const branchId = (code: string) => branches.find((b) => b.code === code)!.id;
  for (const s of GREENFIELD_STAFF) {
    const staffData = {
      title: s.title,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      phone: s.phone,
      positionTitle: s.position,
      kind: s.kind,
      group: s.group,
      startedOn: new Date(s.startedOn),
      allBranches: s.scope === 'SCHOOL',
      status: 'ACTIVE' as const,
    };
    const staff = await prisma.staff.upsert({
      where: { schoolId_staffNumber: { schoolId: greenfield, staffNumber: s.staffNumber } },
      create: { schoolId: greenfield, staffNumber: s.staffNumber, ...staffData },
      update: staffData,
    });
    if (!s.email) {
      // Nobody's account: let go of any a test invited for this record.
      await prisma.schoolMembership.updateMany({
        where: { schoolId: greenfield, staffId: staff.id },
        data: { staffId: null },
      });
      continue;
    }
    const userData = {
      title: s.title,
      firstName: s.firstName,
      lastName: s.lastName,
      phone: s.phone,
      status: 'ACTIVE' as const,
      passwordHash: ctx.passwordHash,
      passwordChangedAt: ctx.now,
      mustChangePassword: false,
      failedSignInCount: 0,
      lockedUntil: null,
      lastFailedSignInAt: null,
      emailVerifiedAt: ctx.now,
      deletedAt: null,
    };
    const user = await prisma.user.upsert({
      where: { email: s.email },
      create: { email: s.email, ...userData },
      update: userData,
    });
    const membershipData = {
      status: 'ACTIVE' as const,
      scope: s.scope,
      staffId: staff.id,
      statusReason: null,
      invitedAt: ctx.now,
      activatedAt: ctx.now,
    };
    const membership = await prisma.schoolMembership.upsert({
      where: {
        schoolId_userId_kind: { schoolId: greenfield, userId: user.id, kind: 'STAFF' },
      },
      create: { schoolId: greenfield, userId: user.id, kind: 'STAFF', ...membershipData },
      update: membershipData,
    });
    const roles = await prisma.schoolRole.findMany({
      where: { schoolId: greenfield, key: { in: s.roles } },
      select: { id: true },
    });
    await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membershipRole.createMany({
      data: roles.map((r) => ({ schoolId: greenfield, membershipId: membership.id, roleId: r.id })),
    });
    await prisma.membershipBranch.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membershipBranch.createMany({
      data: s.branches.map((code) => ({
        schoolId: greenfield,
        membershipId: membership.id,
        branchId: branchId(code),
      })),
    });
  }

  for (const [key, schoolId] of Object.entries(ctx.schoolIds)) {
    /* ---------- Custom roles ---------- */

    const custom = CUSTOM_ROLES[key] ?? [];
    const stale = await prisma.schoolRole.findMany({
      where: { schoolId, type: 'CUSTOM', name: { notIn: custom.map((r) => r.name) } },
      select: { id: true },
    });
    await prisma.membershipRole.deleteMany({ where: { roleId: { in: stale.map((r) => r.id) } } });
    await prisma.schoolRole.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
    for (const r of custom) {
      const fields = {
        type: 'CUSTOM' as const,
        scope: r.scope,
        description: r.description,
        permissions: r.permissions,
        archivedAt: null,
      };
      await prisma.schoolRole.upsert({
        where: { schoolId_name: { schoolId, name: r.name } },
        create: { schoolId, name: r.name, ...fields },
        update: fields,
      });
    }

    /* ---------- Organogram ---------- */

    const seeds = POSITIONS[key] ?? [];
    const idOf = (k: string) => demoUuid(`position:${key}:${k}`);
    const ids = seeds.map((p) => idOf(p.key));
    // Unhook the tree first so positions a test added (or re-parented) can go in any order.
    await prisma.position.updateMany({ where: { schoolId }, data: { parentId: null } });
    await prisma.position.deleteMany({ where: { schoolId, id: { notIn: ids } } });
    const staff = await prisma.staff.findMany({
      where: { schoolId },
      select: { id: true, email: true },
    });
    const roles = await prisma.schoolRole.findMany({
      where: { schoolId },
      select: { id: true, key: true },
    });
    for (const [i, p] of seeds.entries()) {
      const id = idOf(p.key);
      const fields = {
        title: p.title,
        parentId: p.parent ? idOf(p.parent) : null,
        responsibilities: p.responsibilities,
        approvals: p.approvals,
        sortOrder: i,
      };
      await prisma.position.upsert({
        where: { id },
        create: { id, schoolId, ...fields },
        update: fields,
      });
      await prisma.positionHolder.deleteMany({ where: { positionId: id } });
      await prisma.positionHolder.createMany({
        data: p.holders.map((email) => ({
          schoolId,
          positionId: id,
          staffId: staff.find((s) => s.email === email)!.id,
        })),
      });
      await prisma.positionSuggestedRole.deleteMany({ where: { positionId: id } });
      await prisma.positionSuggestedRole.createMany({
        data: p.roles.map((k) => ({
          schoolId,
          positionId: id,
          roleId: roles.find((r) => r.key === k)!.id,
        })),
      });
    }
  }
}
