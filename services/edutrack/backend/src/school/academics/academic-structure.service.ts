import { RequestContext } from '../../common/context/request-context.js';
import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';

/** Setup Center steps the Academics screens complete or report. */
export const ACADEMIC_STEP = {
  sections: 'academic-sections',
  session: 'academic-session',
  terms: 'terms',
  classes: 'classes-arms',
} as const;

export interface AcademicSectionView {
  id: string;
  name: string;
  code: string;
  description: string;
  /** Class levels across branches; a section with classes can't be removed. */
  levels: number;
  /** Active branches that run it. */
  branches: string[];
  /** Its students may sign in to the Student Portal. */
  studentLogins: boolean;
}

/**
 * Reads the school's academic structure: sections, active branches with the sections they run,
 * and the current session. Shared by the Academics services, their Setup Center steps and the
 * header's context options.
 */
@Injectable()
export class AcademicStructureService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly setupState: SetupStateService,
  ) {}

  get db() {
    return this.tenant.db;
  }

  sections() {
    return this.db.section.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  /** Active branches (the original first), each with the section names it runs, in order. */
  async activeBranches() {
    const rows = await this.db.branch.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ isOriginal: 'desc' }, { createdAt: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        branchSections: {
          select: { section: { select: { id: true, name: true, sortOrder: true } } },
        },
      },
    });
    return rows.map((b) => {
      const sections = b.branchSections
        .map((x) => x.section)
        .sort((a, c) => a.sortOrder - c.sortOrder || a.name.localeCompare(c.name));
      return {
        id: b.id,
        name: b.name,
        sections: sections.map((s) => s.name),
        sectionIds: sections.map((s) => s.id),
      };
    });
  }

  async sectionViews(): Promise<AcademicSectionView[]> {
    const [sections, branches, levels] = await Promise.all([
      this.sections(),
      this.activeBranches(),
      this.db.branchLevel.findMany({ select: { level: { select: { sectionId: true } } } }),
    ]);
    return sections.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      description: s.description,
      levels: levels.filter((l) => l.level.sectionId === s.id).length,
      branches: branches.filter((b) => b.sectionIds.includes(s.id)).map((b) => b.name),
      studentLogins: s.studentLogins,
    }));
  }

  private static readonly SESSION_INCLUDE = {
    terms: {
      orderBy: { sequence: 'asc' as const },
      include: {
        events: { orderBy: [{ startsOn: 'asc' as const }, { createdAt: 'asc' as const }] },
      },
    },
  };

  /** The Active session, else the earliest Upcoming one (a new school), with terms and events. */
  async activeSession() {
    const include = AcademicStructureService.SESSION_INCLUDE;
    return (
      (await this.db.academicSession.findFirst({ where: { status: 'ACTIVE' }, include })) ??
      (await this.db.academicSession.findFirst({
        where: { status: 'UPCOMING' },
        orderBy: { startsOn: 'asc' },
        include,
      }))
    );
  }

  /**
   * The session a School Admin screen is looking at: the header's working session on a read
   * (a past or upcoming session), else the active one. Writes always get the active session.
   */
  async currentSession() {
    const name = RequestContext.working().session;
    if (name) {
      const viewed = await this.db.academicSession.findFirst({
        where: { name },
        include: AcademicStructureService.SESSION_INCLUDE,
      });
      if (viewed) return viewed;
    }
    return this.activeSession();
  }

  /** The current term: the header's working term, else the Active one, else the session's first. */
  async currentTerm() {
    const session = await this.currentSession();
    return session ? AcademicStructureService.termOf(session.terms) : null;
  }

  /** In a session's terms: the working term (by name), else the Active one, else the first. */
  static termOf<T extends { name: string; status: string }>(terms: T[]): T | null {
    const name = RequestContext.working().term;
    return (
      (name ? terms.find((t) => t.name === name) : undefined) ??
      terms.find((t) => t.status === 'ACTIVE') ??
      terms[0] ??
      null
    );
  }

  confirmedKeys() {
    return this.setupState.confirmedKeys();
  }
}
