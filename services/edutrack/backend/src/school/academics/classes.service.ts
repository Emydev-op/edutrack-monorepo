import { effectivePeriods } from '../assignments/assignments.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { isUuid } from '../../platform/shared/params.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import {
  armLabel,
  DEFAULT_LEVELS,
  fail,
  fromIso,
  isoDate,
  plural,
  staffName,
} from './academic-format.js';
import {
  ACADEMIC_STEP,
  AcademicStructureService,
  type AcademicSectionView,
} from './academic-structure.service.js';
import type { ArmInputDto, LevelInputDto, UpdateArmDto } from './dto/academics.dto.js';

export const LEVEL_NOT_FOUND = 'Class level not found';
export const CLASS_NOT_FOUND = 'Class not found';

export interface ClassArmView {
  id: string;
  /** The level's id at this branch (see `levelKey`). */
  levelId: string;
  branchId: string;
  branch: string;
  section: string;
  level: string;
  arm: string;
  /** "JSS 2B" */
  name: string;
  capacity: number;
  students: number;
  classTeacherId: string | null;
  classTeacher: string | null;
  room: string;
}

export interface ClassLevelView {
  id: string;
  branchId: string;
  section: string;
  name: string;
  next: string | null;
  arms: ClassArmView[];
}

export interface ClassesView {
  branches: { id: string; name: string; sections: string[] }[];
  sections: AcademicSectionView[];
  levels: ClassLevelView[];
  confirmed: boolean;
  defaults: Record<string, string[]>;
}

export interface ClassDetailView {
  arm: ClassArmView;
  students: {
    id: string;
    name: string;
    admissionNo: string;
    gender: string;
    guardian: string;
    balance: number;
  }[];
  subjects: unknown[];
  timetable: unknown;
  results: unknown[];
}

/**
 * Class levels are school-wide (`ClassLevel`, unique by name) and run at branches (`BranchLevel`),
 * where they have arms. School Admin lists a level once per branch, so a level's id in the API is
 * the pair: `<levelId>~<branchId>`.
 */
export const levelKey = (levelId: string, branchId: string) => `${levelId}~${branchId}`;
export function parseLevelKey(key: string) {
  const [levelId, branchId, extra] = key.split('~');
  if (extra !== undefined || !levelId || !branchId || !isUuid(levelId) || !isUuid(branchId))
    throw AppException.notFound(LEVEL_NOT_FOUND, 'LEVEL_NOT_FOUND');
  return { levelId: levelId.toLowerCase(), branchId: branchId.toLowerCase() };
}

const GENDER: Record<string, string> = { MALE: 'Male', FEMALE: 'Female' };

type Tx = TenantTx;

/** Academics › Classes & Arms. */
@Injectable()
export class ClassesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly structure: AcademicStructureService,
    private readonly audit: SchoolAuditService,
    private readonly clock: Clock,
    private readonly modules: ModuleRef,
    private readonly sectionAccess: SectionAccessService,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  private today() {
    return isoDate(this.clock.now());
  }

  /* ---------------- Views ---------------- */

  /** Arms with their students (current session) and class teachers, keyed by arm id. */
  private async armFacts(armIds?: string[]) {
    const session = await this.structure.currentSession();
    const where = armIds ? { armId: { in: armIds } } : {};
    const [counts, teachers] = session
      ? await Promise.all([
          this.db.enrollment.groupBy({
            by: ['armId'],
            where: { sessionId: session.id, status: 'ACTIVE', ...where },
            _count: { _all: true },
          }),
          this.db.classTeacherAssignment.findMany({
            where: { sessionId: session.id, endsOn: null, ...where },
            include: { staff: { select: { title: true, firstName: true, lastName: true } } },
          }),
        ])
      : [[], []];
    return {
      session,
      students: new Map(counts.map((c) => [c.armId!, c._count._all])),
      teachers: new Map(
        teachers.map((t) => [t.armId, { id: t.staffId, name: staffName(t.staff) }]),
      ),
    };
  }

  private armView(
    arm: {
      id: string;
      name: string;
      capacity: number;
      room: string | null;
      branchId: string;
      levelId: string;
    },
    level: { name: string; section: string },
    branch: string,
    facts: Awaited<ReturnType<ClassesService['armFacts']>>,
  ): ClassArmView {
    const teacher = facts.teachers.get(arm.id) ?? null;
    return {
      id: arm.id,
      levelId: levelKey(arm.levelId, arm.branchId),
      branchId: arm.branchId,
      branch,
      section: level.section,
      level: level.name,
      arm: arm.name,
      name: armLabel(level.name, arm.name),
      capacity: arm.capacity,
      students: facts.students.get(arm.id) ?? 0,
      classTeacherId: teacher?.id ?? null,
      classTeacher: teacher?.name ?? null,
      room: arm.room ?? '',
    };
  }

  async view(): Promise<ClassesView> {
    const [branches, sections, branchLevels, arms, facts, confirmed] = await Promise.all([
      this.structure.activeBranches(),
      this.structure.sectionViews(),
      this.db.branchLevel.findMany({
        include: { level: { include: { section: { select: { name: true, sortOrder: true } } } } },
      }),
      this.db.classArm.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } }),
      this.armFacts(),
      this.structure.confirmedKeys(),
    ]);
    const levels = branches.flatMap((b) => {
      const list = branchLevels
        .filter((bl) => bl.branchId === b.id)
        .map((bl) => bl.level)
        .sort(
          (x, y) =>
            x.section.sortOrder - y.section.sortOrder ||
            x.sortOrder - y.sortOrder ||
            x.name.localeCompare(y.name),
        );
      return list.map((l, i) => {
        const level = { name: l.name, section: l.section.name };
        return {
          id: levelKey(l.id, b.id),
          branchId: b.id,
          section: l.section.name,
          name: l.name,
          next: list[i + 1]?.name ?? null,
          arms: arms
            .filter((a) => a.levelId === l.id && a.branchId === b.id)
            .map((a) => this.armView(a, level, b.name, facts)),
        };
      });
    });
    return {
      branches: branches.map((b) => ({ id: b.id, name: b.name, sections: b.sections })),
      sections,
      levels,
      confirmed: confirmed.has(ACADEMIC_STEP.classes),
      defaults: DEFAULT_LEVELS,
    };
  }

  /**
   * One arm with its students, the subjects it takes this session (and who teaches them this
   * term), its timetable, and each subject's result sheet this term (status and class average).
   */
  async detail(id: string): Promise<ClassDetailView> {
    const { arm, level, branch } = await this.findArm(id);
    const facts = await this.armFacts([arm.id]);
    const enrollments = facts.session
      ? await this.db.enrollment.findMany({
          where: { sessionId: facts.session.id, armId: arm.id, status: 'ACTIVE' },
          include: {
            student: {
              include: {
                guardians: {
                  orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                  take: 1,
                  include: { guardian: true },
                },
              },
            },
          },
        })
      : [];
    const planned = await this.subjectsAndTimetable(arm.id, level.id, facts.session?.id);
    return {
      arm: this.armView(arm, level, branch.name, facts),
      students: enrollments
        .map(({ student: s }) => {
          const g = s.guardians[0]?.guardian;
          return {
            id: s.id,
            name: `${s.firstName} ${s.surname}`.trim(),
            admissionNo: s.admissionNo,
            gender: GENDER[s.gender] ?? s.gender,
            guardian: g ? [g.title, g.fullName].filter(Boolean).join(' ') : '',
            balance: 0,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      ...planned,
      results: await this.results(arm.id, planned.subjects),
    };
  }

  /** Each subject's sheet this term: its status and the class average of complete totals. */
  private async results(
    armId: string,
    subjects: { code: string; name: string; teacher: string | null }[],
  ) {
    const term = await this.structure.currentTerm();
    if (!term || !subjects.length) return [];
    const sheets = await this.db.resultSheet.findMany({
      where: { termId: term.id, armId },
      include: {
        subject: { select: { code: true } },
        entries: { where: { total: { not: null } }, select: { total: true } },
      },
    });
    const LABEL: Record<string, string> = {
      NOT_STARTED: 'Not started',
      DRAFT: 'Draft',
      SUBMITTED: 'Submitted',
      UNDER_REVIEW: 'Under review',
      RETURNED: 'Returned',
      APPROVED: 'Approved',
      PUBLISHED: 'Published',
    };
    return subjects.map((s) => {
      const sheet = sheets.find((x) => x.subject.code === s.code);
      const totals = (sheet?.entries ?? []).map((e) => Number(e.total));
      return {
        code: s.code,
        subject: s.name,
        teacher: s.teacher,
        average: totals.length
          ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10
          : null,
        status: LABEL[sheet?.status ?? 'NOT_STARTED'],
      };
    });
  }

  private async subjectsAndTimetable(armId: string, levelId: string, sessionId?: string) {
    const term = sessionId ? await this.structure.currentTerm() : null;
    if (!sessionId || !term) return { subjects: [], timetable: null };
    const [offered, assignments, tt] = await Promise.all([
      this.db.curriculumEntry.findMany({
        // Subjects only some arms take show on those arms only.
        where: {
          sessionId,
          levelId,
          subject: { status: 'ACTIVE' },
          OR: [{ arms: { none: {} } }, { arms: { some: { armId } } }],
        },
        include: { subject: true, arms: true },
        orderBy: { subject: { name: 'asc' } },
      }),
      this.db.teachingAssignment.findMany({
        where: { termId: term.id, armId, lead: true },
        include: { staff: { select: { title: true, firstName: true, lastName: true } } },
      }),
      this.db.timetable.findFirst({ where: { termId: term.id, armId } }),
    ]);
    // The timetable service lives in the Phase 3a module, which imports this one.
    const { TimetableService } = await import('../timetable/timetable.service.js');
    return {
      subjects: offered.map((e) => {
        const a = assignments.find((x) => x.subjectId === e.subjectId);
        return {
          code: e.subject.code,
          name: e.subject.name,
          type: e.offering === 'COMPULSORY' ? 'Compulsory' : 'Elective',
          teacherId: a?.staffId ?? null,
          teacher: a ? staffName(a.staff) : null,
          periods: a?.periodsPerWeek ?? effectivePeriods(e, armId, e.subject.periodsPerWeek),
        };
      }),
      timetable: tt
        ? await this.modules.get(TimetableService, { strict: false }).view(armId, term.id)
        : null,
    };
  }

  /* ---------------- Lookups ---------------- */

  private async findBranchLevel(key: string) {
    const { levelId, branchId } = parseLevelKey(key);
    const row = await this.db.branchLevel.findFirst({
      where: { levelId, branchId },
      include: {
        level: { include: { section: true } },
        branch: { select: { id: true, name: true, status: true } },
      },
    });
    if (!row) throw AppException.notFound(LEVEL_NOT_FOUND, 'LEVEL_NOT_FOUND');
    return row;
  }

  private async findArm(id: string) {
    if (!isUuid(id)) throw AppException.notFound(CLASS_NOT_FOUND, 'CLASS_NOT_FOUND');
    const arm = await this.db.classArm.findFirst({
      where: { id, archivedAt: null },
      include: {
        level: { include: { section: { select: { name: true } } } },
        branch: { select: { id: true, name: true } },
      },
    });
    if (!arm) throw AppException.notFound(CLASS_NOT_FOUND, 'CLASS_NOT_FOUND');
    return {
      arm,
      level: { id: arm.level.id, name: arm.level.name, section: arm.level.section.name },
      branch: arm.branch,
    };
  }

  /** Students still placed in these arms (any session). */
  private async studentsIn(armIds: string[]) {
    const rows = await this.db.enrollment.groupBy({
      by: ['armId'],
      where: { armId: { in: armIds }, status: 'ACTIVE' },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.armId!, r._count._all]));
  }

  private checkArms(arms: string[]) {
    if (!arms.length) throw fail('Add at least one arm, e.g. A.', 'VALIDATION');
    if (arms.length > 12) throw fail('Use 12 arms or fewer.', 'VALIDATION');
    if (arms.some((a) => !/^[A-Za-z0-9][A-Za-z0-9 ]{0,11}$/.test(a)))
      throw fail('Arm names are short, e.g. A, B or Gold.', 'VALIDATION');
    if (new Set(arms.map((a) => a.toLowerCase())).size !== arms.length)
      throw fail('Arm names must be different.', 'ARM_NAME_TAKEN');
  }

  /** A teacher on the staff list who works at the branch. */
  private async checkClassTeacher(
    id: string | null | undefined,
    branch: { id: string; name: string },
    armId?: string,
  ) {
    if (!id) return;
    const staff = isUuid(id)
      ? await this.db.staff.findFirst({
          where: { id, kind: 'TEACHING', status: 'ACTIVE', leftOn: null },
          include: { branches: { select: { branchId: true } } },
        })
      : null;
    if (!staff) throw fail('Choose a teacher on your staff list.', 'TEACHER_NOT_FOUND');
    if (!staff.allBranches && !staff.branches.some((b) => b.branchId === branch.id))
      throw fail(`${staffName(staff)} doesn’t work at ${branch.name}.`, 'TEACHER_OTHER_BRANCH');
    // One class per class teacher: the Teacher Workspace's register is for their one class.
    const session = await this.structure.currentSession();
    const other = session
      ? await this.db.classTeacherAssignment.findFirst({
          where: {
            staffId: staff.id,
            sessionId: session.id,
            endsOn: null,
            ...(armId && { armId: { not: armId } }),
          },
          include: { arm: { include: { level: { select: { name: true } } } } },
        })
      : null;
    if (other)
      throw fail(
        `${staffName(staff)} is already the class teacher of ${armLabel(other.arm.level.name, other.arm.name)}. Choose someone else, or change that class first.`,
        'TEACHER_HAS_CLASS',
      );
  }

  /** Makes `staffId` the arm's class teacher for the current session (ending the previous one). */
  private async setClassTeacher(tx: Tx, schoolId: string, armId: string, staffId: string | null) {
    const session = await this.structure.currentSession();
    if (!session) {
      if (staffId)
        throw fail('Create the academic session before choosing class teachers.', 'NO_SESSION');
      return;
    }
    const current = await tx.classTeacherAssignment.findFirst({
      where: { sessionId: session.id, armId, endsOn: null },
    });
    if ((current?.staffId ?? null) === staffId) return;
    const today = this.today();
    if (current) {
      if (isoDate(current.startsOn) >= today)
        await tx.classTeacherAssignment.delete({ where: { id: current.id } });
      else
        await tx.classTeacherAssignment.update({
          where: { id: current.id },
          data: { endsOn: fromIso(today) },
        });
    }
    if (staffId)
      await tx.classTeacherAssignment.create({
        data: { schoolId, sessionId: session.id, armId, staffId, startsOn: fromIso(today) },
      });
  }

  /** Orders a section's levels: `ids` in their new order get sortOrder 0, 1, 2… */
  private async renumber(tx: Tx, ids: string[]) {
    for (const [i, id] of ids.entries())
      await tx.classLevel.update({ where: { id }, data: { sortOrder: i } });
  }

  private sectionLevels(sectionId: string, db: Tx = this.db) {
    return db.classLevel.findMany({
      where: { sectionId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
  }

  /* ---------------- Levels ---------------- */

  /** Adds the standard Nigerian levels for every section each active branch runs, with arm A. */
  async applyDefaults(schoolId: string): Promise<ClassesView> {
    await this.sectionAccess.require(null, 'the default classes');
    const confirmed = await this.structure.confirmedKeys();
    if (!confirmed.has(ACADEMIC_STEP.sections))
      throw fail('Finish Academic Sections first.', 'SECTIONS_NOT_CONFIRMED', HttpStatus.CONFLICT);
    const [branches, sections, branchLevels] = await Promise.all([
      this.structure.activeBranches(),
      this.structure.sections(),
      this.db.branchLevel.findMany({ include: { level: { select: { name: true } } } }),
    ]);
    let added = 0;
    await this.db.$transaction(async (tx) => {
      for (const b of branches)
        for (const sectionId of b.sectionIds) {
          const section = sections.find((s) => s.id === sectionId)!;
          for (const [i, name] of (DEFAULT_LEVELS[section.code] ?? []).entries()) {
            if (
              branchLevels.some(
                (bl) => bl.branchId === b.id && bl.level.name.toLowerCase() === name.toLowerCase(),
              )
            )
              continue;
            const level =
              (await tx.classLevel.findFirst({
                where: { name: { equals: name, mode: 'insensitive' } },
              })) ??
              (await tx.classLevel.create({
                data: { schoolId, sectionId: section.id, name, sortOrder: i },
              }));
            if (level.sectionId !== section.id) continue;
            await tx.branchLevel.create({ data: { schoolId, branchId: b.id, levelId: level.id } });
            await tx.classArm.create({
              data: {
                schoolId,
                branchId: b.id,
                levelId: level.id,
                name: 'A',
                capacity: section.code === 'NUR' ? 25 : 35,
              },
            });
            added++;
          }
        }
      if (!added)
        throw fail(
          'Your sections have no standard levels to add, or they are already there. Add levels one by one.',
          'NO_DEFAULT_LEVELS',
        );
      await this.audit.record(
        {
          action: 'levels.defaults',
          area: 'Academic',
          entity: 'ClassLevel',
          summary: 'Nigerian default class levels added',
          detail: plural(added, 'level'),
        },
        asTx(tx),
      );
    });
    return this.view();
  }

  async addLevel(schoolId: string, p: LevelInputDto): Promise<ClassesView> {
    const branches = await this.structure.activeBranches();
    const branch = branches.find((b) => b.id === p.branchId);
    if (!branch) throw fail('Choose an active branch.', 'BRANCH_NOT_ACTIVE');
    const sectionIndex = branch.sections.indexOf(p.section);
    if (sectionIndex < 0)
      throw fail(
        `${branch.name} doesn’t run ${p.section}. Add the section to the branch first.`,
        'SECTION_NOT_AT_BRANCH',
      );
    const sectionId = branch.sectionIds[sectionIndex]!;
    await this.sectionAccess.require(sectionId, 'class levels');
    const name = (p.name ?? '').trim();
    if (!name) throw fail('Name the class level, e.g. JSS 1.', 'VALIDATION');
    const atBranch = await this.db.branchLevel.findMany({
      where: { branchId: branch.id },
      include: { level: { select: { name: true } } },
    });
    if (atBranch.some((bl) => bl.level.name.toLowerCase() === name.toLowerCase()))
      throw fail(`${branch.name} already has ${name}.`, 'LEVEL_NAME_TAKEN');
    const arms = (p.arms ?? []).map((a) => a.trim()).filter(Boolean);
    this.checkArms(arms);
    const existing = await this.db.classLevel.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      include: { section: { select: { name: true } } },
    });
    if (existing && existing.sectionId !== sectionId)
      throw fail(
        `${existing.name} is a ${existing.section.name} class level at your other branches. Choose ${existing.section.name}, or another name.`,
        'LEVEL_NAME_TAKEN',
      );
    const after = p.after ? parseLevelKey(p.after).levelId : p.after;

    await this.db.$transaction(async (tx) => {
      let level = existing;
      if (!level) {
        const created = await tx.classLevel.create({ data: { schoolId, sectionId, name } });
        // Insert after the chosen level so promotion order follows the list.
        const order = (await this.sectionLevels(sectionId, tx))
          .map((l) => l.id)
          .filter((id) => id !== created.id);
        const at = after
          ? order.indexOf(after) + 1 || order.length
          : after === null
            ? 0
            : order.length;
        order.splice(at, 0, created.id);
        await this.renumber(tx, order);
        level = { ...created, section: { name: p.section } };
      }
      await tx.branchLevel.create({ data: { schoolId, branchId: branch.id, levelId: level.id } });
      await tx.classArm.createMany({
        data: arms.map((a) => ({
          schoolId,
          branchId: branch.id,
          levelId: level.id,
          name: a,
          capacity: p.capacity,
        })),
      });
      await this.audit.record(
        {
          action: 'level.create',
          area: 'Academic',
          entity: 'ClassLevel',
          entityId: level.id,
          summary: `Class level ${name} added`,
          detail: `${branch.name} · ${plural(arms.length, 'arm')}`,
        },
        asTx(tx),
      );
    });
    return this.view();
  }

  /** Renames the level. Levels are shared by name, so every branch running it sees the new name. */
  async renameLevel(key: string, rawName: string): Promise<ClassesView> {
    const bl = await this.findBranchLevel(key);
    await this.sectionAccess.requireLevel(bl.levelId, 'class levels');
    const name = (rawName ?? '').trim();
    if (!name) throw fail('Name the class level.', 'VALIDATION');
    const old = bl.level.name;
    if (old === name) return this.view();
    const taken = await this.db.classLevel.findFirst({
      where: { id: { not: bl.levelId }, name: { equals: name, mode: 'insensitive' } },
      include: { branchLevels: { include: { branch: { select: { id: true, name: true } } } } },
    });
    if (taken) {
      const here = taken.branchLevels.some((x) => x.branchId === bl.branchId);
      throw fail(
        here
          ? `${bl.branch.name} already has ${name}.`
          : `${taken.name} is already a class level at ${taken.branchLevels.map((x) => x.branch.name).join(', ') || 'another branch'}.`,
        'LEVEL_NAME_TAKEN',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.classLevel.update({ where: { id: bl.levelId }, data: { name } });
      await this.audit.record(
        {
          action: 'level.rename',
          area: 'Academic',
          entity: 'ClassLevel',
          entityId: bl.levelId,
          summary: `Class level renamed: ${old} → ${name}`,
          detail: bl.branch.name,
        },
        asTx(tx),
      );
    });
    return this.view();
  }

  /** Moves the level up or down its section (the order is the school's promotion path). */
  async moveLevel(key: string, direction: 'up' | 'down'): Promise<ClassesView> {
    const bl = await this.findBranchLevel(key);
    await this.sectionAccess.requireLevel(bl.levelId, 'class levels');
    const atBranch = new Set(
      (
        await this.db.branchLevel.findMany({
          where: { branchId: bl.branchId, level: { sectionId: bl.level.sectionId } },
          select: { levelId: true },
        })
      ).map((x) => x.levelId),
    );
    const order = (await this.sectionLevels(bl.level.sectionId)).map((l) => l.id);
    const siblings = order.filter((id) => atBranch.has(id));
    const i = siblings.indexOf(bl.levelId);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= siblings.length) throw fail('It can’t move further.', 'LEVEL_AT_END');
    const a = order.indexOf(siblings[i]!);
    const b = order.indexOf(siblings[j]!);
    [order[a], order[b]] = [order[b]!, order[a]!];
    await this.db.$transaction(async (tx) => {
      await this.renumber(tx, order);
      await this.audit.record(
        {
          action: 'level.move',
          area: 'Academic',
          entity: 'ClassLevel',
          entityId: bl.levelId,
          summary: `Class level ${bl.level.name} moved ${direction}`,
          detail: bl.branch.name,
        },
        asTx(tx),
      );
    });
    return this.view();
  }

  /** Removes the level from the branch with its arms. Refused while an arm has students. */
  async deleteLevel(key: string): Promise<ClassesView & { removed: string }> {
    const bl = await this.findBranchLevel(key);
    await this.sectionAccess.requireLevel(bl.levelId, 'class levels');
    const arms = await this.db.classArm.findMany({
      where: { levelId: bl.levelId, branchId: bl.branchId },
    });
    const counts = await this.studentsIn(arms.map((a) => a.id));
    const used = arms.filter((a) => counts.get(a.id));
    if (used.length)
      throw fail(
        `${used.map((a) => armLabel(bl.level.name, a.name)).join(', ')} ${used.length > 1 ? 'have' : 'has'} students. Move them to another class first.`,
        'LEVEL_HAS_STUDENTS',
        HttpStatus.CONFLICT,
      );
    const armIds = arms.map((a) => a.id);
    await this.db.$transaction(async (tx) => {
      await tx.classTeacherAssignment.deleteMany({ where: { armId: { in: armIds } } });
      await tx.classArm.deleteMany({ where: { id: { in: armIds } } });
      await tx.branchLevel.deleteMany({ where: { levelId: bl.levelId, branchId: bl.branchId } });
      await this.audit.record(
        {
          action: 'level.delete',
          area: 'Academic',
          entity: 'ClassLevel',
          entityId: bl.levelId,
          summary: `Class level ${bl.level.name} removed`,
          detail: bl.branch.name,
        },
        asTx(tx),
      );
    });
    // The level itself goes once no branch runs it, unless other records (curriculum, students'
    // history) still name it.
    const elsewhere = await this.db.branchLevel.count({ where: { levelId: bl.levelId } });
    if (!elsewhere)
      await this.db.classLevel.delete({ where: { id: bl.levelId } }).catch(() => undefined);
    return { ...(await this.view()), removed: bl.level.name };
  }

  /* ---------------- Arms ---------------- */

  async addArm(
    schoolId: string,
    key: string,
    p: ArmInputDto,
  ): Promise<ClassesView & { added: string }> {
    const bl = await this.findBranchLevel(key);
    await this.sectionAccess.requireLevel(bl.levelId, 'class arms');
    const existing = await this.db.classArm.findMany({
      where: { levelId: bl.levelId, branchId: bl.branchId },
      select: { name: true },
    });
    const letter =
      (p.arm ?? '').trim() ||
      'ABCDEFGHIJKL'.split('').find((c) => !existing.some((a) => a.name === c)) ||
      '';
    this.checkArms([...existing.map((a) => a.name), letter]);
    await this.checkClassTeacher(p.classTeacherId, bl.branch);
    const label = armLabel(bl.level.name, letter);
    await this.db.$transaction(async (tx) => {
      const arm = await tx.classArm.create({
        data: {
          schoolId,
          branchId: bl.branchId,
          levelId: bl.levelId,
          name: letter,
          capacity: p.capacity,
          room: (p.room ?? '').trim() || null,
        },
      });
      if (p.classTeacherId) await this.setClassTeacher(tx, schoolId, arm.id, p.classTeacherId);
      await this.audit.record(
        {
          action: 'arm.create',
          area: 'Academic',
          entity: 'ClassArm',
          entityId: arm.id,
          summary: `Arm ${label} added`,
          detail: bl.branch.name,
        },
        asTx(tx),
      );
    });
    return { ...(await this.view()), added: label };
  }

  async updateArm(schoolId: string, id: string, p: UpdateArmDto): Promise<ClassArmView> {
    const { arm, level, branch } = await this.findArm(id);
    await this.sectionAccess.requireArm(arm.id, 'class arms');
    const label = armLabel(level.name, arm.name);
    const data: Prisma.ClassArmUpdateInput = {};
    if (p.arm !== undefined && p.arm.trim() !== arm.name) {
      const next = p.arm.trim();
      const others = await this.db.classArm.findMany({
        where: { levelId: arm.levelId, branchId: arm.branchId, id: { not: arm.id } },
        select: { name: true },
      });
      this.checkArms([...others.map((a) => a.name), next]);
      data.name = next;
    }
    if (p.capacity !== undefined) {
      const used = (await this.studentsIn([arm.id])).get(arm.id) ?? 0;
      if (p.capacity < used)
        throw fail(
          `${label} already has ${used} students. Capacity can’t go below that.`,
          'CAPACITY_BELOW_STUDENTS',
        );
      data.capacity = p.capacity;
    }
    if (p.classTeacherId !== undefined)
      await this.checkClassTeacher(p.classTeacherId, branch, arm.id);
    if (p.room !== undefined) data.room = p.room.trim() || null;

    await this.db.$transaction(async (tx) => {
      const saved = await tx.classArm.update({ where: { id: arm.id }, data });
      if (p.classTeacherId !== undefined)
        await this.setClassTeacher(tx, schoolId, arm.id, p.classTeacherId);
      const teacher =
        p.classTeacherId === undefined
          ? null
          : p.classTeacherId
            ? await tx.staff.findFirst({ where: { id: p.classTeacherId } })
            : null;
      await this.audit.record(
        {
          action: 'arm.update',
          area: 'Academic',
          entity: 'ClassArm',
          entityId: arm.id,
          summary: `${armLabel(level.name, saved.name)} updated`,
          detail:
            p.classTeacherId !== undefined
              ? `Class teacher: ${teacher ? staffName(teacher) : 'none'}`
              : null,
        },
        asTx(tx),
      );
    });
    const fresh = await this.findArm(arm.id);
    return this.armView(fresh.arm, fresh.level, fresh.branch.name, await this.armFacts([arm.id]));
  }

  async deleteArm(id: string): Promise<ClassesView & { removed: string }> {
    const { arm, level, branch } = await this.findArm(id);
    await this.sectionAccess.requireArm(arm.id, 'class arms');
    const label = armLabel(level.name, arm.name);
    const n = (await this.studentsIn([arm.id])).get(arm.id) ?? 0;
    if (n)
      throw fail(
        `${label} has ${plural(n, 'student')}. Move them to another arm first.`,
        'ARM_HAS_STUDENTS',
        HttpStatus.CONFLICT,
      );
    const siblings = await this.db.classArm.count({
      where: { levelId: arm.levelId, branchId: arm.branchId },
    });
    if (siblings === 1)
      throw fail(
        `${label} is the only arm of ${level.name}. Remove the class level instead.`,
        'ONLY_ARM',
        HttpStatus.CONFLICT,
      );
    await this.db.$transaction(async (tx) => {
      await tx.classTeacherAssignment.deleteMany({ where: { armId: arm.id } });
      await tx.classArm.delete({ where: { id: arm.id } });
      await this.audit.record(
        {
          action: 'arm.delete',
          area: 'Academic',
          entity: 'ClassArm',
          entityId: arm.id,
          summary: `Arm ${label} removed`,
          detail: branch.name,
        },
        asTx(tx),
      );
    });
    return { ...(await this.view()), removed: label };
  }
}
