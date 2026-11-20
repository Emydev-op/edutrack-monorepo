import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { lagosToday } from '../../platform/shared/format.js';
import { AcademicCatalogService } from '../academics/academic-catalog.service.js';
import { isoDate } from '../academics/academic-format.js';

export const ALL_BRANCHES = 'All branches';

export interface BranchScope {
  /** Null: every active branch. */
  id: string | null;
  /** The branch name, or “All branches”. */
  name: string;
}

type CurrentSession = NonNullable<Awaited<ReturnType<AcademicCatalogService['currentSession']>>>;
export type ScopeTerm = CurrentSession['terms'][number];

/**
 * What the dashboard and reports are worked out for: the header's working branch and a term of
 * the current session. School Admin sends names (the header's context) or, from a report's term
 * filter, a term id.
 */
@Injectable()
export class InsightsScopeService {
  constructor(
    readonly catalog: AcademicCatalogService,
    private readonly clock: Clock,
  ) {}

  get db() {
    return this.catalog.db;
  }

  now() {
    return this.clock.now();
  }

  /** Today in Lagos, "YYYY-MM-DD". */
  today() {
    return isoDate(lagosToday(this.clock.now()));
  }

  /**
   * The working branch: an active branch by name, “All branches” (or nothing, with several
   * branches) for all of them. A school with one branch always gets that branch.
   */
  async branch(name?: string | null): Promise<BranchScope> {
    const branches = await this.catalog.structure.activeBranches();
    const found = branches.find((b) => b.name === name);
    if (found) return { id: found.id, name: found.name };
    if (branches.length === 1) return { id: branches[0]!.id, name: branches[0]!.name };
    return { id: null, name: ALL_BRANCHES };
  }

  /** The current session and one of its terms (by id or name), else its current term. */
  async term(term?: string | null) {
    const session = await this.catalog.currentSession();
    if (!session) return null;
    const chosen =
      (term && session.terms.find((t) => t.id === term || t.name === term)) ||
      session.terms.find((t) => t.status === 'ACTIVE') ||
      session.terms[0] ||
      null;
    return { session, term: chosen };
  }
}
