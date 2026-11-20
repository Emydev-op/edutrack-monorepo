import { Injectable } from '@nestjs/common';
import { fmtDate } from '../academics/academic-format.js';
import { ParentScopeService, type ChildScope, type ParentTerm } from './parent-scope.service.js';

/** Report cards held automatically at publishing for unpaid fees carry this reason. */
export const FEES_HOLD_PREFIX = 'Unpaid fees';

type Snapshot = Record<string, unknown> & {
  subjects?: unknown[];
  average?: string;
  position?: string | null;
};

/** A term's result at a glance (Home, a child's page). */
export interface ResultSummary {
  termId: string;
  term: string;
  status: 'published' | 'not-published' | 'held';
  average: string | null;
  position: string | null;
  plannedOn: string | null;
  held: { message: string } | null;
  /** The last published card when this term's isn't out yet. */
  previous: ResultSummary | null;
}

/** What parents see of a held card's reason: the school's own words, never the fees amount. */
export function heldMessage(reason: string | null | undefined) {
  const r = (reason ?? '').trim();
  if (!r || r.startsWith(FEES_HOLD_PREFIX))
    return 'The school is holding this report card. Please contact the school.';
  return `The school is holding this report card: ${r} Please contact the school.`;
}

/** The parts of a published report card a parent sees (no classmates, no hold details). */
export function parentCard(snapshot: Snapshot) {
  const pick = <K extends string>(...keys: K[]) =>
    Object.fromEntries(keys.map((k) => [k, snapshot[k] ?? null])) as Record<K, unknown>;
  return pick(
    'school',
    'title',
    'student',
    'classTeacher',
    'components',
    'subjects',
    'average',
    'grade',
    'position',
    'version',
    'nextTerm',
    'classTeacherRemark',
    'conduct',
    'attendance',
    'cumulative',
    'publishedAt',
  );
}

/**
 * Parent Portal › Results: a child's report card per term, once the school publishes it. Before
 * that the screen says when results are planned (no CA scores are shown early). A card the school
 * holds says so: the school's reason, unless it is the automatic fees hold.
 */
@Injectable()
export class ParentResultsService {
  constructor(private readonly scope: ParentScopeService) {}

  private async state(studentId: string, term: ParentTerm) {
    const card = await this.scope.db.reportCard.findFirst({
      where: { termId: term.id, studentId },
    });
    if (card?.publishedAt && card.heldAt)
      return { status: 'held' as const, held: { message: heldMessage(card.heldReason) }, card };
    if (card?.publishedAt && card.snapshot)
      return { status: 'published' as const, held: null, card };
    return { status: 'not-published' as const, held: null, card: null };
  }

  /** `GET /v1/parent/children/:id/results?term=`. */
  async results(scope: ChildScope, termId?: string) {
    const id = scope.student.id;
    const { term, terms } = await this.scope.termFor(id, termId);
    const list = await this.scope.childTerms(id, terms);
    const s = await this.state(id, term);
    const place = await this.scope.place(id, term.sessionId);
    const snapshot = s.status === 'published' ? (s.card!.snapshot as Snapshot) : null;
    return {
      termId: term.id,
      term: term.label,
      className: place?.className ?? null,
      terms: list.map((t) => ({ id: t.id, label: t.label, current: t.status === 'ACTIVE' })),
      status: s.status,
      plannedOn: s.status === 'not-published' && term.resultsOn ? fmtDate(term.resultsOn) : null,
      held: s.held,
      publishedOn:
        s.card?.publishedAt && s.status === 'published' ? fmtDate(s.card.publishedAt) : null,
      card: snapshot ? parentCard(snapshot) : null,
    };
  }

  /** The newest term with a published card (or the current term's state), for Home. */
  async latest(scope: ChildScope): Promise<ResultSummary> {
    const id = scope.student.id;
    const { term, terms } = await this.scope.termFor(id);
    const current = await this.state(id, term);
    if (current.status !== 'not-published') return this.summary(term, current);
    const published = await this.scope.db.reportCard.findFirst({
      where: { studentId: id, publishedAt: { not: null }, heldAt: null },
      orderBy: { publishedAt: 'desc' },
    });
    const last = published && terms.find((t) => t.id === published.termId);
    return {
      ...this.summary(term, current),
      previous: last
        ? this.summary(last, { status: 'published', held: null, card: published })
        : null,
    };
  }

  private summary(
    term: ParentTerm,
    s: Awaited<ReturnType<ParentResultsService['state']>>,
  ): ResultSummary {
    const snap = (s.card?.snapshot ?? null) as Snapshot | null;
    return {
      termId: term.id,
      term: term.label,
      status: s.status,
      average: s.status === 'published' ? (snap?.average ?? null) : null,
      position: s.status === 'published' ? (snap?.position ?? null) : null,
      plannedOn: s.status === 'not-published' && term.resultsOn ? fmtDate(term.resultsOn) : null,
      held: s.held,
      previous: null,
    };
  }
}
