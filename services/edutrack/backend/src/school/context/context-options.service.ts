import { RequestContext } from '../../common/context/request-context.js';
import { Injectable } from '@nestjs/common';
import { SESSION_STATUS } from '../academics/academic-format.js';
import { AcademicStructureService } from '../academics/academic-structure.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

export interface ContextOptionsView {
  branches: { name: string; status: 'Active' | 'Inactive' }[];
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
    const branches = [
      ...mine.map((b) => ({ name: b.name, status: 'Active' as const })),
      ...(!scope && active.length > 1 ? [{ name: 'All branches', status: 'Active' as const }] : []),
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
