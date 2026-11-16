import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { Prisma } from '../../generated/prisma/client.js';
import { displayPhone, formatMonth, lagosToday } from '../../platform/shared/format.js';
import {
  TenantPrismaService,
  type TenantPrismaClient,
} from '../../tenancy/tenant-prisma.service.js';
import type { StaffPayloadDto } from './dto/staff.dto.js';
import {
  accountLabel,
  armLabel,
  branchLabel,
  displayName,
  EMAIL,
  formatNumber,
  GROUP_LABEL,
  isAcademicDepartment,
  isPhone,
  KIND_LABEL,
  numberOf,
  toE164,
  unprocessable,
  type AccountLabel,
  type EmploymentLabel,
  type GroupLabel,
  type KindLabel,
  EMPLOYMENT_LABEL,
} from './staff-view.js';

/** The tenant client inside `$transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];
/** Either the tenant client or a transaction on it. */
export type Db = TenantPrismaClient | Tx;

export const STAFF_NOT_FOUND = 'This staff member doesn’t exist';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

/** What every staff row needs, read with the staff record. */
export const staffInclude = {
  department: { select: { name: true } },
  branches: { select: { branchId: true } },
  membership: { select: { id: true, status: true, userId: true } },
} satisfies Prisma.StaffInclude;

export type StaffWithLinks = Prisma.StaffGetPayload<{ include: typeof staffInclude }>;

export interface StaffListRowView {
  id: string;
  name: string;
  staffNumber: string;
  position: string;
  department: string;
  group: GroupLabel;
  kind: KindLabel;
  branch: string;
  branchIds: string[];
  employment: EmploymentLabel;
  email: string;
  phone: string;
  account: AccountLabel;
  status: 'Active' | 'Deactivated';
  leftOn: string | null;
  load: { periods: number; max: number; subjects: number; classes: number } | null;
  classTeacherOf: string[];
  isYou: boolean;
}

export interface Cleared {
  removed: number;
  classes: number;
}

/** The school-wide facts rows are built from: branches, this term's teaching, who is asking. */
export interface DirectoryContext {
  branches: { id: string; name: string; active: boolean }[];
  sessionId: string | null;
  term: { id: string; name: string } | null;
  /** Current-term teaching per staff id. */
  teaching: Map<string, { periods: number; subjects: number; arms: Set<string> }>;
  /** Current class-teacher posts per staff id. */
  classTeacher: Map<string, { id: string; name: string }[]>;
  myStaffId: string | null;
}

/** Validated, normalised form values. */
export interface CleanPayload {
  title: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  branchIds: string[];
  allBranches: boolean;
  startedOn: Date | null;
  subjectIds: string[];
  roleId: string | null;
  roleName: string | null;
}

/**
 * Reads and rules shared by the staff services: the directory context, a staff row as School
 * Admin shows it, the payload checks (in the form's order), staff numbers and departments.
 */
@Injectable()
export class StaffRecordsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly clock: Clock,
  ) {}

  get db() {
    return this.tenant.db;
  }

  schoolId(): string {
    const id = RequestContext.schoolId();
    if (!id) throw AppException.forbidden('This needs a school session.', 'NO_TENANT');
    return id;
  }

  today(): Date {
    return lagosToday(this.clock.now());
  }

  async find(id: string, db: Db = this.db): Promise<StaffWithLinks> {
    const staff = isUuid(id)
      ? await db.staff.findUnique({ where: { id }, include: staffInclude })
      : null;
    if (!staff) throw AppException.notFound(STAFF_NOT_FOUND, 'STAFF_NOT_FOUND');
    return staff;
  }

  /** The signed-in member's own staff record (they can't deactivate themself). */
  async myStaffId(db: Db = this.db): Promise<string | null> {
    const membershipId = RequestContext.get()?.membershipId;
    if (!membershipId) return null;
    const m = await db.schoolMembership.findUnique({
      where: { id: membershipId },
      select: { staffId: true },
    });
    return m?.staffId ?? null;
  }

  /** The active session and its active term (null before Academics is set up). */
  async currentTerm(db: Db = this.db) {
    const session = await db.academicSession.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { startsOn: 'desc' },
      select: { id: true },
    });
    if (!session) return { sessionId: null, term: null };
    const term = await db.term.findFirst({
      where: { sessionId: session.id, status: 'ACTIVE' },
      orderBy: { sequence: 'asc' },
      select: { id: true, name: true },
    });
    return { sessionId: session.id, term };
  }

  async context(db: Db = this.db): Promise<DirectoryContext> {
    const [branches, current, myStaffId] = await Promise.all([
      db.branch.findMany({
        select: { id: true, name: true, status: true },
        orderBy: [{ isOriginal: 'desc' }, { name: 'asc' }],
      }),
      this.currentTerm(db),
      this.myStaffId(db),
    ]);
    const teaching = new Map<string, { periods: number; subjects: number; arms: Set<string> }>();
    if (current.term) {
      const rows = await db.teachingAssignment.findMany({
        where: { termId: current.term.id },
        select: { staffId: true, armId: true, periodsPerWeek: true },
      });
      for (const r of rows) {
        const t = teaching.get(r.staffId) ?? { periods: 0, subjects: 0, arms: new Set<string>() };
        t.periods += r.periodsPerWeek;
        t.subjects += 1;
        t.arms.add(r.armId);
        teaching.set(r.staffId, t);
      }
    }
    const classTeacher = new Map<string, { id: string; name: string }[]>();
    if (current.sessionId) {
      const posts = await db.classTeacherAssignment.findMany({
        where: { sessionId: current.sessionId, endsOn: null },
        select: { staffId: true, arm: { select: { id: true, name: true, level: true } } },
      });
      for (const p of posts)
        classTeacher.set(p.staffId, [
          ...(classTeacher.get(p.staffId) ?? []),
          { id: p.arm.id, name: armLabel(p.arm.level.name, p.arm.name) },
        ]);
    }
    return {
      branches: branches.map((b) => ({ id: b.id, name: b.name, active: b.status === 'ACTIVE' })),
      sessionId: current.sessionId,
      term: current.term,
      teaching,
      classTeacher,
      myStaffId,
    };
  }

  branchIdsOf(s: Pick<StaffWithLinks, 'allBranches' | 'branches'>, ctx: DirectoryContext) {
    return s.allBranches
      ? ctx.branches.filter((b) => b.active).map((b) => b.id)
      : s.branches.map((b) => b.branchId);
  }

  toRow(s: StaffWithLinks, ctx: DirectoryContext): StaffListRowView {
    const kind = KIND_LABEL[s.kind];
    const group = GROUP_LABEL[s.group];
    const branchIds = this.branchIdsOf(s, ctx);
    const t = ctx.teaching.get(s.id);
    return {
      id: s.id,
      name: displayName(s.title, s.firstName, s.lastName),
      staffNumber: s.staffNumber,
      position: s.positionTitle ?? '',
      department: s.department?.name ?? (kind === 'Teaching' ? 'Academics' : group),
      group,
      kind,
      branch:
        s.allBranches && ctx.branches.filter((b) => b.active).length > 1
          ? 'All branches'
          : branchLabel(branchIds, ctx.branches),
      branchIds,
      employment: EMPLOYMENT_LABEL[s.employment],
      email: s.email ?? '',
      phone: displayPhone(s.phone),
      account: accountLabel(s.membership?.status),
      status: s.status === 'ACTIVE' ? 'Active' : 'Deactivated',
      leftOn: s.status === 'DEACTIVATED' && s.leftOn ? formatMonth(s.leftOn) : null,
      load:
        kind === 'Teaching'
          ? {
              periods: t?.periods ?? 0,
              max: s.maxPeriodsPerWeek,
              subjects: t?.subjects ?? 0,
              classes: t?.arms.size ?? 0,
            }
          : null,
      classTeacherOf: (ctx.classTeacher.get(s.id) ?? []).map((a) => a.name),
      isYou: s.id === ctx.myStaffId,
    };
  }

  /**
   * The form's checks, in its order (the first problem is the one shown). `current` is the record
   * being edited; `needsRole` when an invitation will be created.
   */
  async validate(
    p: StaffPayloadDto,
    { current, needsRole }: { current?: string; needsRole: boolean },
    db: Db = this.db,
  ): Promise<CleanPayload> {
    const others = await db.staff.findMany({
      where: { status: 'ACTIVE', ...(current && { id: { not: current } }) },
      select: { title: true, firstName: true, lastName: true, phone: true, email: true },
    });
    const nameOf = (s: (typeof others)[number]) => displayName(s.title, s.firstName, s.lastName);

    const phoneText = (p.phone ?? '').replace(/[\s-]/g, '');
    if (phoneText && !isPhone(phoneText))
      throw unprocessable(
        'Use a Nigerian mobile number, e.g. 0803 555 0161.',
        'VALIDATION',
        'phone',
      );
    const phone = phoneText ? toE164(phoneText) : null;
    const samePhone = phone && others.find((s) => s.phone && toE164(s.phone) === phone);
    if (samePhone)
      throw unprocessable(
        `This phone number is already used by ${nameOf(samePhone)}.`,
        'PHONE_TAKEN',
        'phone',
      );

    const email = (p.email ?? '').trim().toLowerCase();
    if (p.access && !email)
      throw unprocessable('An email is needed to send the invitation.', 'VALIDATION', 'email');
    if (email && !EMAIL.test(email))
      throw unprocessable('Enter a valid email, e.g. name@school.ng.', 'VALIDATION', 'email');
    const sameEmail = email && others.find((s) => s.email?.toLowerCase() === email);
    if (sameEmail)
      throw unprocessable(
        `This email is already used by ${nameOf(sameEmail)}.`,
        'EMAIL_TAKEN',
        'email',
      );

    if (!p.position?.trim()) throw unprocessable('Choose a position.', 'VALIDATION', 'position');

    const branches = await db.branch.findMany({ select: { id: true, status: true } });
    const active = branches.filter((b) => b.status === 'ACTIVE').map((b) => b.id);
    if (!p.branchIds?.length)
      throw unprocessable('Choose at least one branch.', 'VALIDATION', 'branchIds');
    const branchIds = [...new Set(p.branchIds.map((id) => id.toLowerCase()))];
    if (branchIds.some((id) => !active.includes(id)))
      throw unprocessable('Choose active branches only.', 'VALIDATION', 'branchIds');

    let startedOn: Date | null = null;
    if (p.since) {
      const ok = /^\d{4}-\d{2}-\d{2}$/.test(p.since) && !Number.isNaN(Date.parse(p.since));
      if (!ok) throw unprocessable('Enter the start date as a date.', 'VALIDATION', 'since');
      startedOn = new Date(`${p.since}T00:00:00.000Z`);
      if (startedOn.getTime() > this.today().getTime() + 365 * 86_400_000)
        throw unprocessable(
          'The start date is more than a year away. Check the date.',
          'VALIDATION',
          'since',
        );
    }

    if (p.kind === 'Teaching' && !(p.maxPeriods >= 1 && p.maxPeriods <= 40))
      throw unprocessable(
        'Maximum periods per week is between 1 and 40.',
        'VALIDATION',
        'maxPeriods',
      );

    let roleId: string | null = null;
    let roleName: string | null = null;
    if (p.access && needsRole) {
      const role = p.role
        ? await db.schoolRole.findFirst({
            where: {
              name: { equals: p.role, mode: 'insensitive' },
              archivedAt: null,
              NOT: { key: 'owner' },
            },
            select: { id: true, name: true },
          })
        : null;
      if (!role) throw unprocessable('Choose what they can do in Edutrack.', 'VALIDATION', 'role');
      roleId = role.id;
      roleName = role.name;
    }

    let subjectIds: string[] = [];
    const codes = p.kind === 'Teaching' ? [...new Set(p.qualified ?? [])] : [];
    if (codes.length) {
      const subjects = await db.subject.findMany({
        where: { code: { in: codes } },
        select: { id: true },
      });
      if (subjects.length !== codes.length)
        throw unprocessable('Choose subjects from the list.', 'VALIDATION', 'qualified');
      subjectIds = subjects.map((s) => s.id);
    }

    return {
      title: p.title?.trim() || null,
      firstName: p.firstName.trim(),
      lastName: p.lastName.trim(),
      phone,
      email: email || null,
      branchIds,
      // "All branches" when they cover every active branch (more than one), as the mock labels it.
      allBranches: active.length > 1 && active.every((id) => branchIds.includes(id)),
      startedOn,
      subjectIds,
      roleId,
      roleName,
    };
  }

  /** The department by name, created on first use (the form offers a fixed list). */
  async departmentId(name: string, tx: Db): Promise<string | null> {
    const clean = name.trim();
    if (!clean) return null;
    const found = await tx.department.findFirst({
      where: { name: { equals: clean, mode: 'insensitive' } },
      select: { id: true },
    });
    if (found) return found.id;
    const created = await tx.department.create({
      data: { schoolId: this.schoolId(), name: clean, isAcademic: isAcademicDepartment(clean) },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * The next staff ID in the school's format (`SchoolSettings.staffNumberPattern`), from the
   * school's STAFF counter, never below the highest number already used. Run inside the
   * creating transaction.
   */
  async nextStaffNumber(tx: Tx): Promise<string> {
    const schoolId = this.schoolId();
    const settings = await tx.schoolSettings.findUnique({
      where: { schoolId },
      select: { staffNumberPattern: true },
    });
    const pattern = settings?.staffNumberPattern ?? 'STF-[####]';
    const year = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric' }).format(
        this.clock.now(),
      ),
    );
    const scope = /\[YY(YY)?\]/.test(pattern) ? String(year) : '';
    const numbers = await tx.staff.findMany({ select: { staffNumber: true } });
    const used = new Set(numbers.map((n) => n.staffNumber));
    const floor = Math.max(0, ...numbers.map((n) => numberOf(n.staffNumber))) + 1;
    await tx.numberSequence.upsert({
      where: { schoolId_kind_scope: { schoolId, kind: 'STAFF', scope } },
      create: { schoolId, kind: 'STAFF', scope, nextValue: floor },
      update: {},
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      // Raw SQL is never tenant-scoped: school_id is filtered here.
      const [row] = await tx.$queryRaw<{ value: number }[]>(Prisma.sql`
        UPDATE number_sequences
           SET next_value = GREATEST(next_value, ${floor}) + 1, updated_at = now()
         WHERE school_id = ${schoolId}::uuid AND kind = 'STAFF' AND scope = ${scope}
     RETURNING next_value - 1 AS value`);
      const value = formatNumber(pattern, Number(row!.value), year);
      if (!used.has(value)) return value;
    }
    throw AppException.conflict('Staff numbers ran out for this format.', 'NUMBERS_EXHAUSTED');
  }
}
