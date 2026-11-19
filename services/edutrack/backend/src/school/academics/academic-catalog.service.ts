import { Injectable } from '@nestjs/common';
import type { Offering } from '../../generated/prisma/enums.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel } from './academic-format.js';
import { AcademicStructureService } from './academic-structure.service.js';

/** An arm with what the Academics screens print about it. */
export interface ArmInfo {
  id: string;
  /** "JSS 2B". */
  label: string;
  /** "B". */
  name: string;
  levelId: string;
  level: string;
  sectionId: string;
  section: string;
  branchId: string;
  branch: string;
  room: string | null;
}

/** A subject a level offers in a session (active subjects only). */
export interface OfferedSubject {
  subjectId: string;
  code: string;
  name: string;
  offering: Offering;
  /** Lessons per week at the level (its own, else the subject's default). */
  periods: number;
  /** When only some arms take it: those arms and their lessons per week (null: the level's). */
  onlyArms: { armId: string; periods: number | null }[];
}

/** What one arm offers: subjects only some arms take are left out of the others. */
export const offeredInArm = (list: OfferedSubject[] | undefined, armId: string) =>
  (list ?? [])
    .filter((s) => !s.onlyArms.length || s.onlyArms.some((a) => a.armId === armId))
    .map((s) => ({
      ...s,
      periods: s.onlyArms.find((a) => a.armId === armId)?.periods ?? s.periods,
    }));

/**
 * The academic catalogue the Phase 3 screens share: the current session and term, the arms (in
 * section, level and branch order) and what each level offers. Reads through the tenant client,
 * so everything is the signed-in school's.
 */
@Injectable()
export class AcademicCatalogService {
  constructor(
    private readonly tenant: TenantPrismaService,
    readonly structure: AcademicStructureService,
  ) {}

  get db() {
    return this.tenant.db;
  }

  currentSession() {
    return this.structure.currentSession();
  }

  currentTerm() {
    return this.structure.currentTerm();
  }

  /**
   * A term of the current session by id, or the current term. Screens pass the header's working
   * term as `?term=`; an unknown id falls back to the current one.
   */
  async termFrom(termId?: string | null) {
    const session = await this.currentSession();
    if (!session) return null;
    const term = termId ? session.terms.find((t) => t.id === termId) : undefined;
    return {
      session,
      term: term ?? session.terms.find((t) => t.status === 'ACTIVE') ?? session.terms[0] ?? null,
    };
  }

  /** The term before this one: the previous term of its session, else the last of the last session. */
  async previousTerm(termId: string) {
    const term = await this.db.term.findFirst({ where: { id: termId } });
    if (!term) return null;
    return this.db.term.findFirst({
      where: { startsOn: { lt: term.startsOn } },
      orderBy: { startsOn: 'desc' },
    });
  }

  /** An active branch by name (the header's working branch), or null for all. */
  async branchIdByName(name?: string | null) {
    if (!name) return null;
    const branches = await this.structure.activeBranches();
    return branches.find((b) => b.name === name)?.id ?? null;
  }

  /**
   * Live arms at active branches, by section order, level order, branch and arm name.
   * `branchId` narrows to one branch.
   */
  async arms(branchId?: string | null): Promise<ArmInfo[]> {
    const rows = await this.db.classArm.findMany({
      where: {
        archivedAt: null,
        branch: { status: 'ACTIVE' },
        ...(branchId && { branchId }),
      },
      include: {
        branch: { select: { name: true, isOriginal: true, createdAt: true } },
        level: {
          select: {
            name: true,
            sortOrder: true,
            sectionId: true,
            section: { select: { name: true, sortOrder: true } },
          },
        },
      },
    });
    return rows
      .sort(
        (a, b) =>
          a.level.section.sortOrder - b.level.section.sortOrder ||
          a.level.sortOrder - b.level.sortOrder ||
          a.level.name.localeCompare(b.level.name) ||
          Number(b.branch.isOriginal) - Number(a.branch.isOriginal) ||
          a.branch.createdAt.getTime() - b.branch.createdAt.getTime() ||
          a.name.localeCompare(b.name),
      )
      .map((a) => ({
        id: a.id,
        label: armLabel(a.level.name, a.name),
        name: a.name,
        levelId: a.levelId,
        level: a.level.name,
        sectionId: a.level.sectionId,
        section: a.level.section.name,
        branchId: a.branchId,
        branch: a.branch.name,
        room: a.room,
      }));
  }

  async arm(armId: string): Promise<ArmInfo | null> {
    const all = await this.arms();
    return all.find((a) => a.id === armId) ?? null;
  }

  /** levelId → active subjects it offers in the session, by subject name. */
  async offeredByLevel(sessionId: string): Promise<Map<string, OfferedSubject[]>> {
    const rows = await this.db.curriculumEntry.findMany({
      where: { sessionId, subject: { status: 'ACTIVE' } },
      include: {
        subject: { select: { code: true, name: true, periodsPerWeek: true } },
        arms: { select: { armId: true, periodsPerWeek: true } },
      },
    });
    const out = new Map<string, OfferedSubject[]>();
    for (const r of rows.sort((a, b) => a.subject.name.localeCompare(b.subject.name)))
      out.set(r.levelId, [
        ...(out.get(r.levelId) ?? []),
        {
          subjectId: r.subjectId,
          code: r.subject.code,
          name: r.subject.name,
          offering: r.offering,
          periods: r.periodsPerWeek ?? r.subject.periodsPerWeek,
          onlyArms: r.arms.map((a) => ({ armId: a.armId, periods: a.periodsPerWeek })),
        },
      ]);
    return out;
  }
}
