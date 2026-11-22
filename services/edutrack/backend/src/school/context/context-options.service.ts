import { branchLogoAddress } from '../../auth/auth.presenter.js';
import { RequestContext } from '../../common/context/request-context.js';
import { Injectable } from '@nestjs/common';
import { SESSION_STATUS } from '../academics/academic-format.js';
import { AcademicStructureService } from '../academics/academic-structure.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

export interface ContextOptionsView {
  branches: {
    name: string;
    status: 'Active' | 'Inactive';
    /** The campus's own colour and logo; null: the school's. */
    brandColor: string | null;
    logoUrl: string | null;
  }[];
  sessions: { name: string; status: string }[];
  terms: string[];
  defaults: { branch: string; session: string; term: string };
}

/** The header's branch, session and term choices, from Branches and Sessions & Terms. */
@Injectable()
export class ContextOptionsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly structure: AcademicStructureService,
  ) {}

  async options(): Promise<ContextOptionsView> {
    const [active, sessions, current, live] = await Promise.all([
      this.structure.activeBranches(),
      this.tenant.db.academicSession.findMany({
        where: { status: { not: 'ARCHIVED' } },
        orderBy: { startsOn: 'desc' },
        select: { name: true, status: true },
      }),
      this.structure.currentSession(),
      this.structure.activeSession(),
    ]);
    // A branch-scoped admin switches between their own branches only (no "All branches").
    const scope = RequestContext.get()?.branchScope;
    const mine = scope ? active.filter((b) => scope.ids.includes(b.id)) : active;
    // Each campus's own colour and logo (null: the school's), for School Admin to show while it's
    // the working branch.
    const [brands, school] = await Promise.all([
      this.tenant.db.branch.findMany({
        where: { id: { in: mine.map((b) => b.id) } },
        select: { id: true, code: true, brandColor: true, logoFileId: true },
      }),
      this.tenant.db.school.findUnique({
        where: { id: RequestContext.schoolId()! },
        select: { slug: true },
      }),
    ]);
    const brandOf = (id: string) => {
      const b = brands.find((x) => x.id === id);
      return {
        brandColor: b?.brandColor ?? null,
        logoUrl: b && school ? branchLogoAddress(school.slug, b) : null,
      };
    };
    const branches = [
      ...mine.map((b) => ({ name: b.name, status: 'Active' as const, ...brandOf(b.id) })),
      ...(!scope && active.length > 1
        ? [{ name: 'All branches', status: 'Active' as const, brandColor: null, logoUrl: null }]
        : []),
    ];
    // Defaults are the active session and term; the term list is the viewed session's.
    const term = live?.terms.find((t) => t.status === 'ACTIVE') ?? live?.terms[0];
    return {
      branches,
      sessions: sessions.map((s) => ({ name: s.name, status: SESSION_STATUS[s.status] })),
      terms: current?.terms.map((t) => t.name) ?? [],
      defaults: {
        branch: branches[0]?.name ?? '',
        session: live?.name ?? '',
        term: term?.name ?? '',
      },
    };
  }
}
