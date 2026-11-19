import { HttpStatus, Injectable } from '@nestjs/common';
import { isNigerianState } from '@edutrack/shared';
import { normalizePhone } from '../../auth/identifiers.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import { Prisma } from '../../generated/prisma/client.js';
import { displayPhone, lagosToday } from '../../platform/shared/format.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import type { BranchDto } from './dto/branches.dto.js';
import type {
  BranchDetailResponse,
  BranchListResponse,
  BranchResponse,
} from './dto/branches.responses.js';
import {
  ACCOUNT_LABEL,
  codePrefix,
  EMAIL,
  ON_ROLL,
  personName,
  STATUS_LABEL,
  timeline,
  UNLIMITED_BRANCHES,
  plainTx,
  type TenantTx,
} from './view.js';

export const BRANCH_NOT_FOUND = 'This branch doesn’t exist';
/** School prefix (1–5 letters or digits, e.g. "C-" for a one-word name, "GFA-"), a dash, 2–4 more. */
const CODE = /^[A-Z0-9]{1,5}-[A-Z0-9]{2,4}$/;
const CANT_DELETE =
  'Branches with records, or created when your school was set up, can’t be deleted. Deactivate it instead.';

/** The Setup Center's Branches step, as `GET /setup` describes it and `complete` checks it. */
export interface BranchesStepState {
  /** Every branch, active or not (they all count toward the plan). */
  total: number;
  active: number;
  /**
   * One line per active branch missing what parents need to find the campus, e.g.
   * `Ajah Annex (address incomplete, no sections)`. Empty when the step can be completed.
   */
  issues: string[];
  /** The admin confirmed the step (`SetupStepState` `branches` has `confirmedAt`). */
  confirmed: boolean;
}

/** Same rule as the mock's `branchIssues` (school-admin/src/api/mock/handlers/setup.ts). */
export const branchIssues = (b: {
  street: string | null;
  city: string | null;
  sections: number;
}) => [
  ...(!b.street?.trim() || !b.city?.trim() ? ['Address incomplete'] : []),
  ...(!b.sections ? ['No sections'] : []),
];

const branchInclude = {
  headStaff: { select: { title: true, firstName: true, lastName: true } },
  branchSections: {
    select: { section: { select: { name: true, sortOrder: true } } },
  },
} satisfies Prisma.BranchInclude;
type BranchRow = Prisma.BranchGetPayload<{ include: typeof branchInclude }>;
/** A branch as answered (a plain object with the response class's fields). */
type BranchView = { [K in keyof BranchResponse]: BranchResponse[K] };

/**
 * Campuses (Settings › Branches). Each branch offers some of the school's sections, may have a
 * head of campus and a store, and counts toward the plan's branch limit even when inactive.
 */
@Injectable()
export class BranchesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /** Students, staff and class arms per branch. */
  private async counts(branchIds: string[]) {
    const [students, staff, arms] = await Promise.all([
      this.db.student.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, status: { in: ON_ROLL }, deletedAt: null },
        _count: { _all: true },
      }),
      this.db.staffBranch.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, staff: { status: 'ACTIVE' } },
        _count: { _all: true },
      }),
      this.db.classArm.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, archivedAt: null },
        _count: { _all: true },
      }),
    ]);
    const map = (rows: { branchId: string; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.branchId, r._count._all]));
    return { students: map(students), staff: map(staff), arms: map(arms) };
  }

  private async toViews(rows: BranchRow[], total: number): Promise<BranchView[]> {
    const c = await this.counts(rows.map((b) => b.id));
    return rows.map((b) => {
      const students = c.students.get(b.id) ?? 0;
      const staff = c.staff.get(b.id) ?? 0;
      const classArms = c.arms.get(b.id) ?? 0;
      return {
        id: b.id,
        name: b.name,
        code: b.code,
        street: b.street ?? '',
        city: b.city ?? '',
        lga: b.lga ?? '',
        state: b.state ?? '',
        phone: displayPhone(b.phone),
        email: b.email ?? '',
        headId: b.headStaffId,
        headName: b.headStaff ? personName(b.headStaff) : null,
        sections: [...b.branchSections]
          .sort((x, y) => x.section.sortOrder - y.section.sortOrder)
          .map((s) => s.section.name),
        hasStore: b.hasStore,
        status: STATUS_LABEL[b.status],
        students,
        staff,
        classArms,
        canDelete: !b.isOriginal && !students && !staff && !classArms && total > 1,
      };
    });
  }

  private async view(id: string): Promise<BranchView> {
    const [row, total] = await Promise.all([this.find(id), this.db.branch.count()]);
    return (await this.toViews([row], total))[0]!;
  }

  private async find(id: string) {
    const row = await this.db.branch.findUnique({ where: { id }, include: branchInclude });
    if (!row) throw AppException.notFound(BRANCH_NOT_FOUND, 'BRANCH_NOT_FOUND');
    return row;
  }

  private async plan(schoolId: string) {
    const school = await this.db.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: {
        name: true,
        subscription: { select: { plan: { select: { name: true, branchLimit: true } } } },
        sections: { select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }] },
      },
    });
    const plan = school.subscription?.plan;
    return {
      schoolName: school.name,
      planName: plan?.name ?? 'No plan',
      branchLimit: plan ? (plan.branchLimit ?? UNLIMITED_BRANCHES) : 1,
      sections: school.sections,
    };
  }

  async list(schoolId: string): Promise<BranchListResponse> {
    const [rows, p] = await Promise.all([
      this.db.branch.findMany({ include: branchInclude, orderBy: { createdAt: 'asc' } }),
      this.plan(schoolId),
    ]);
    return {
      branches: await this.toViews(rows, rows.length),
      planName: p.planName,
      branchLimit: p.branchLimit,
      offering: p.sections.map((s) => s.name),
      codePrefix: codePrefix(p.schoolName),
    };
  }

  async detail(id: string): Promise<BranchDetailResponse> {
    const [branch, scoped, levels, staff, history] = await Promise.all([
      this.view(id),
      this.db.schoolMembership.findMany({
        where: {
          kind: 'STAFF',
          scope: 'BRANCH',
          status: { in: ['ACTIVE', 'INVITED'] },
          branches: { some: { branchId: id }, every: { branchId: id } },
        },
        include: {
          user: { select: { title: true, firstName: true, lastName: true } },
          roles: { select: { role: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.branchLevel.findMany({
        where: { branchId: id },
        include: {
          level: { select: { name: true, sortOrder: true, section: true } },
          arms: { where: { archivedAt: null }, select: { name: true }, orderBy: { name: 'asc' } },
        },
      }),
      this.db.staffBranch.findMany({
        where: { branchId: id, staff: { status: 'ACTIVE' } },
        include: {
          staff: {
            include: {
              branches: { select: { branch: { select: { name: true } } } },
              membership: { select: { status: true } },
            },
          },
        },
      }),
      this.audit.history('Branch', id),
    ]);
    const enrolled = await this.db.enrollment.groupBy({
      by: ['levelId'],
      where: { branchId: id, status: 'ACTIVE', student: { status: { in: ON_ROLL } } },
      _count: { _all: true },
    });
    const totalBranches = await this.db.branch.count();
    const perLevel = new Map(enrolled.map((e) => [e.levelId, e._count._all]));
    return {
      ...branch,
      scopedUsers: scoped.map((m) => ({
        name: personName(m.user),
        roles: m.roles.map((r) => r.role.name),
      })),
      classes: levels
        .sort(
          (a, b) =>
            a.level.section.sortOrder - b.level.section.sortOrder ||
            a.level.sortOrder - b.level.sortOrder,
        )
        .map((l) => ({
          section: l.level.section.name,
          level: l.level.name,
          arms: l.arms.map((a) => a.name).join(', '),
          students: perLevel.get(l.levelId) ?? 0,
        })),
      staffList: staff
        .map(({ staff: s }) => ({
          id: s.id,
          name: personName(s),
          position: s.positionTitle ?? '',
          scope:
            s.branches.length >= totalBranches
              ? 'All branches'
              : s.branches.map((b) => b.branch.name).join(' + '),
          account: s.membership ? ACCOUNT_LABEL[s.membership.status] : 'No account',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      finance: null,
      history: timeline(history),
    };
  }

  /** Validates the form against the school's other branches; returns the cleaned values. */
  private async validate(schoolId: string, dto: BranchDto, current?: BranchRow) {
    const p = await this.plan(schoolId);
    const others = await this.db.branch.findMany({
      where: current ? { id: { not: current.id } } : {},
      select: { name: true, code: true },
    });
    const fail = (field: string, message: string, code = 'VALIDATION') =>
      new AppException(HttpStatus.UNPROCESSABLE_ENTITY, message, code, { [field]: message });
    if (others.some((b) => b.name.toLowerCase() === dto.name.toLowerCase()))
      throw fail('name', 'A branch with this name already exists.', 'BRANCH_NAME_TAKEN');
    if (!CODE.test(dto.code))
      throw fail('code', `Use a short code like ${codePrefix(p.schoolName)}IK.`);
    const sameCode = others.find((b) => b.code === dto.code);
    if (sameCode)
      throw fail('code', `This code is already used by ${sameCode.name}.`, 'BRANCH_CODE_TAKEN');
    let phone: string | null = null;
    if (dto.phone) {
      phone = normalizePhone(dto.phone);
      if (!phone) throw fail('phone', 'Enter a Nigerian phone number.');
    }
    if (dto.email && !EMAIL.test(dto.email)) throw fail('email', 'Enter a valid email.');
    if (dto.state && !isNigerianState(dto.state)) throw fail('state', 'Choose a Nigerian state.');
    if (!dto.sections.length) throw fail('sections', 'Choose at least one section.');
    const byName = new Map(p.sections.map((s) => [s.name, s.id]));
    if (dto.sections.some((s) => !byName.has(s)))
      throw fail('sections', 'Only sections your school offers can be chosen.');
    const sectionIds = [...new Set(dto.sections)].map((s) => byName.get(s)!);
    if (current) {
      const kept = new Set(sectionIds);
      const withClasses = await this.db.branchLevel.findMany({
        where: { branchId: current.id, level: { sectionId: { notIn: [...kept] } } },
        select: { level: { select: { section: { select: { name: true } } } } },
      });
      const lost = [...new Set(withClasses.map((l) => l.level.section.name))];
      if (lost.length)
        throw AppException.conflict(
          `${lost.join(', ')} has classes at ${current.name}. Remove those class levels in Classes & Arms before removing the section.`,
          'SECTION_HAS_CLASSES',
        );
    }
    let headStaffId: string | null = null;
    if (dto.headId) {
      const head = isUuid(dto.headId)
        ? await this.db.staff.findFirst({
            where: { id: dto.headId, status: 'ACTIVE' },
            select: { id: true },
          })
        : null;
      if (!head) throw fail('headId', 'Choose a current member of staff as head of campus.');
      headStaffId = head.id;
    }
    return {
      plan: p,
      sectionIds,
      data: {
        name: dto.name,
        code: dto.code,
        street: dto.street,
        city: dto.city,
        lga: dto.lga || null,
        state: dto.state || null,
        phone,
        email: dto.email ? dto.email.toLowerCase() : null,
        headStaffId,
        hasStore: !!dto.hasStore,
      },
    };
  }

  /**
   * Gives the head of campus Branch Admin access for the branch when asked and they lack it
   * (not for school-wide users, School Admins or existing Branch Admins).
   */
  private async grantHeadAccess(
    tx: TenantTx,
    schoolId: string,
    dto: BranchDto,
    branch: { id: string; name: string },
    headStaffId: string | null,
  ) {
    if (!dto.grantBranchAdmin || !headStaffId) return;
    const membership = await tx.schoolMembership.findFirst({
      where: { staffId: headStaffId, kind: 'STAFF', status: { in: ['ACTIVE', 'INVITED'] } },
      include: { roles: { select: { role: { select: { key: true } } } } },
    });
    if (!membership || membership.scope === 'SCHOOL') return;
    const keys = membership.roles.map((r) => r.role.key);
    if (keys.includes('school_admin') || keys.includes('branch_admin')) return;
    const role = await tx.schoolRole.findFirst({
      where: { key: 'branch_admin', archivedAt: null },
      select: { id: true },
    });
    if (!role) return;
    await tx.membershipRole.create({
      data: { schoolId, membershipId: membership.id, roleId: role.id },
    });
    await tx.membershipBranch.upsert({
      where: { membershipId_branchId: { membershipId: membership.id, branchId: branch.id } },
      create: { schoolId, membershipId: membership.id, branchId: branch.id },
      update: {},
    });
    await this.audit.record(
      {
        action: 'user.access',
        area: 'Users',
        entity: 'User',
        entityId: membership.id,
        summary: 'Access changed',
        detail: `+Branch Admin · ${branch.name}`,
      },
      plainTx(tx),
    );
  }

  async create(schoolId: string, dto: BranchDto): Promise<BranchResponse> {
    const { plan, sectionIds, data } = await this.validate(schoolId, dto);
    const total = await this.db.branch.count();
    if (total >= plan.branchLimit)
      throw AppException.conflict(
        `Your ${plan.planName} plan allows ${plan.branchLimit} branches, including inactive ones.`,
        'BRANCH_LIMIT',
      );
    const id = await this.db.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          schoolId,
          ...data,
          branchSections: { create: sectionIds.map((sectionId) => ({ sectionId })) },
        },
      });
      await this.audit.record(
        {
          action: 'branch.create',
          area: 'Branches',
          entity: 'Branch',
          entityId: branch.id,
          summary: 'Created branch',
          detail: `${branch.code} · ${dto.sections.join(', ')}${branch.hasStore ? ' · store created' : ''}`,
          after: { ...data, sections: dto.sections },
        },
        plainTx(tx),
      );
      await this.grantHeadAccess(tx, schoolId, dto, branch, data.headStaffId);
      return branch.id;
    });
    return this.view(id);
  }

  async update(schoolId: string, id: string, dto: BranchDto): Promise<BranchResponse> {
    const current = await this.find(id);
    const { sectionIds, data } = await this.validate(schoolId, dto, current);
    const currentSections = current.branchSections.map((s) => s.section.name).sort();
    const before = {
      name: current.name,
      code: current.code,
      street: current.street,
      city: current.city,
      lga: current.lga,
      state: current.state,
      phone: current.phone,
      email: current.email,
      headId: current.headStaffId,
      sections: currentSections,
      hasStore: current.hasStore,
    };
    const after = {
      ...data,
      headId: data.headStaffId,
      sections: [...dto.sections].sort(),
    };
    const changed = (Object.keys(before) as (keyof typeof before)[]).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
    );
    await this.db.$transaction(async (tx) => {
      await tx.branch.update({ where: { id }, data });
      await tx.branchSection.deleteMany({
        where: { branchId: id, sectionId: { notIn: sectionIds } },
      });
      for (const sectionId of sectionIds)
        await tx.branchSection.upsert({
          where: { branchId_sectionId: { branchId: id, sectionId } },
          create: { schoolId, branchId: id, sectionId },
          update: {},
        });
      await this.audit.record(
        {
          action: 'branch.update',
          area: 'Branches',
          entity: 'Branch',
          entityId: id,
          summary: 'Updated branch details',
          detail: changed.join(', ') || 'no changes',
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: Object.fromEntries(changed.map((k) => [k, after[k]])),
        },
        plainTx(tx),
      );
      await this.grantHeadAccess(tx, schoolId, dto, { id, name: data.name }, data.headStaffId);
    });
    return this.view(id);
  }

  async deactivate(id: string, reason: string | undefined): Promise<BranchResponse> {
    const branch = await this.view(id);
    if (branch.status !== 'Active')
      throw AppException.conflict(`${branch.name} is already inactive.`, 'BRANCH_INACTIVE');
    if ((await this.db.branch.count({ where: { status: 'ACTIVE' } })) === 1)
      throw AppException.conflict(
        'A school needs at least one active branch. Add or reactivate another branch first.',
        'LAST_ACTIVE_BRANCH',
      );
    if (branch.students)
      throw AppException.conflict(
        `${branch.students} students are enrolled at ${branch.name}. Transfer them or end their enrollments first.`,
        'BRANCH_HAS_STUDENTS',
      );
    if (!reason?.trim())
      throw AppException.validation({ reason: 'Give a reason for deactivating.' });
    await this.db.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id },
        data: { status: 'INACTIVE', deactivatedAt: this.clock.now() },
      });
      // A closed campus has no lessons: its classes keep their history (registers, results), but
      // nobody teaches or runs them from now on. Teachers stop seeing them in the Teacher
      // Workspace, and reactivating the branch means assigning teachers again.
      const open = { status: { in: ['ACTIVE' as const, 'UPCOMING' as const] } };
      const gone = await tx.teachingAssignment.findMany({
        where: { arm: { branchId: id }, term: open },
        select: { id: true },
      });
      const ids = gone.map((a) => a.id);
      if (ids.length) {
        await tx.resultSheet.updateMany({
          where: { teachingAssignmentId: { in: ids } },
          data: { teachingAssignmentId: null },
        });
        await tx.assessmentSchedule.updateMany({
          where: { teachingAssignmentId: { in: ids } },
          data: { teachingAssignmentId: null },
        });
        await tx.teachingAssignment.deleteMany({ where: { id: { in: ids } } });
      }
      await tx.timetableSlot.updateMany({
        where: { term: open, timetable: { arm: { branchId: id } }, staffId: { not: null } },
        data: { staffId: null },
      });
      const posts = await tx.classTeacherAssignment.updateMany({
        where: { arm: { branchId: id }, endsOn: null, session: open },
        data: { endsOn: lagosToday(this.clock.now()) },
      });
      await this.audit.record(
        {
          action: 'branch.deactivate',
          area: 'Branches',
          entity: 'Branch',
          entityId: id,
          summary: 'Deactivated branch',
          detail: [
            reason.trim(),
            (ids.length || posts.count) &&
              `${ids.length} teaching assignment${ids.length === 1 ? '' : 's'} and ${posts.count} class-teacher role${posts.count === 1 ? '' : 's'} ended`,
          ]
            .filter(Boolean)
            .join(' · '),
        },
        plainTx(tx),
      );
    });
    return this.view(id);
  }

  async reactivate(id: string): Promise<BranchResponse> {
    const branch = await this.find(id);
    if (branch.status !== 'ACTIVE')
      await this.db.$transaction(async (tx) => {
        await tx.branch.update({ where: { id }, data: { status: 'ACTIVE', deactivatedAt: null } });
        await this.audit.record(
          {
            action: 'branch.reactivate',
            area: 'Branches',
            entity: 'Branch',
            entityId: id,
            summary: 'Reactivated branch',
          },
          plainTx(tx),
        );
      });
    return this.view(id);
  }

  async remove(schoolId: string, id: string): Promise<{ ok: true; name: string }> {
    const branch = await this.view(id);
    if (!branch.canDelete) throw AppException.conflict(CANT_DELETE, 'BRANCH_NOT_DELETABLE');
    try {
      await this.db.$transaction(async (tx) => {
        await tx.membershipBranch.deleteMany({ where: { branchId: id } });
        await tx.branch.delete({ where: { id } });
        await this.audit.record(
          {
            action: 'branch.delete',
            area: 'Branches',
            entity: 'School',
            entityId: schoolId,
            summary: `Deleted branch ${branch.name}`,
            detail: branch.code,
          },
          plainTx(tx),
        );
      });
    } catch (error) {
      // Records elsewhere (invoices, enrollments, staff…) still point at it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
        throw AppException.conflict(CANT_DELETE, 'BRANCH_NOT_DELETABLE');
      throw error;
    }
    return { ok: true, name: branch.name };
  }

  /**
   * The Setup Center's Branches step (for the Setup module): branch counts, the active branches
   * still missing an address or sections, and whether the admin confirmed the step. The step can
   * be completed when `active > 0` and `issues` is empty; the mock answers 422 otherwise with
   * `Complete these first: ${issues.join('; ')}.` (or `Add at least one active branch first.`).
   * Runs in the signed-in school.
   */
  async branchesStepState(): Promise<BranchesStepState> {
    const [rows, step] = await Promise.all([
      this.db.branch.findMany({
        select: {
          name: true,
          status: true,
          street: true,
          city: true,
          _count: { select: { branchSections: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.setupStepState.findFirst({ where: { stepKey: 'branches' } }),
    ]);
    const active = rows.filter((b) => b.status === 'ACTIVE');
    return {
      total: rows.length,
      active: active.length,
      issues: active.flatMap((b) => {
        const found = branchIssues({ ...b, sections: b._count.branchSections });
        return found.length ? [`${b.name} (${found.join(', ').toLowerCase()})`] : [];
      }),
      confirmed: !!step?.confirmedAt,
    };
  }
}
