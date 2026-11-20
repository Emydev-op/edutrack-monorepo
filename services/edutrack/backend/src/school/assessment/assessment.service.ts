import { HttpStatus, Injectable } from '@nestjs/common';
import { AcademicCatalogService } from '../academics/academic-catalog.service.js';
import { fail, plural } from '../academics/academic-format.js';
import { componentKey } from '../curriculum/curriculum-defaults.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SetupStateService } from '../shared/setup-state.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';

export const ASSESSMENT_STEP = 'assessment-grading';

export interface ComponentInput {
  name: string;
  max: number;
  weight: number;
  when?: string;
}
export interface BandInput {
  grade: string;
  min: number;
  max: number;
  remark: string;
  points: number;
  pass: boolean;
}
export interface SchemeInput {
  mode: 'scores' | 'descriptive';
  components: ComponentInput[];
  scale: BandInput[];
  ratings: { name: string; description?: string }[];
  /** Report cards in this section show class and subject position. */
  showPosition?: boolean;
}
/** A section's promotion rule (always per section, even with one scheme for every section). */
export interface PromotionRuleInput {
  /** Minimum annual average, 0–100; null for none. */
  minAverage: number | null;
  /** Subject ids the student must pass (cumulative at or above the pass mark). */
  mustPass: string[];
}
export interface AssessmentInput {
  /** One scheme for every section, under the key "*". */
  same: boolean;
  schemes: Record<string, SchemeInput | null>;
  rounding: 'Whole number' | '1 decimal place';
  passMark: number;
  /** Section name → promotion rule. Sections left out keep their rule. */
  promotion?: Record<string, PromotionRuleInput | null>;
}

const num = (d: unknown) => Number(d);

/** What's wrong with a scheme, in the School Admin mock's words (`schemeErrors`). */
export function schemeErrors(label: string, s: SchemeInput): string[] {
  const e: string[] = [];
  if (s.mode === 'scores') {
    if (!s.components?.length) e.push(`${label}: add at least one component.`);
    const names = new Set<string>();
    const keys = new Set<string>();
    for (const c of s.components ?? []) {
      const n = (c.name ?? '').trim().toLowerCase();
      if (!n) e.push(`${label}: name every component.`);
      else if (names.has(n) || keys.has(componentKey(c.name)))
        e.push(`${label}: two components are called ${c.name}.`);
      names.add(n);
      keys.add(componentKey(c.name ?? ''));
      if (!(c.max >= 1))
        e.push(`${label}: ${c.name || 'a component'} needs a maximum of at least 1.`);
      if (!(c.weight > 0)) e.push(`${label}: ${c.name || 'a component'} needs a weight.`);
    }
    const total = (s.components ?? []).reduce((n, c) => n + (Number(c.weight) || 0), 0);
    if (Math.abs(total - 100) > 0.01)
      e.push(`${label}: weights add up to ${total}%. They must total 100%.`);
    const grades = new Set<string>();
    for (const g of s.scale ?? []) {
      if (!(g.grade ?? '').trim()) e.push(`${label}: every band needs a grade.`);
      else if (grades.has(g.grade.trim().toUpperCase()))
        e.push(`${label}: grade ${g.grade} appears twice.`);
      grades.add((g.grade ?? '').trim().toUpperCase());
      if (!(g.min >= 0 && g.max <= 100 && g.min <= g.max))
        e.push(`${label}: ${g.grade || 'a band'} has an invalid range.`);
    }
    const sorted = [...(s.scale ?? [])].sort((a, b) => b.max - a.max);
    if (!sorted.length) e.push(`${label}: add grades.`);
    else if (sorted[0]!.max !== 100) e.push(`${label}: the top grade must end at 100.`);
    else if (sorted[sorted.length - 1]!.min !== 0)
      e.push(`${label}: the lowest grade must start at 0.`);
    else
      sorted.forEach((g, i) => {
        const next = sorted[i + 1];
        if (next && next.max !== g.min - 1)
          e.push(
            next.max >= g.min
              ? `${label}: ${g.grade} and ${next.grade} overlap.`
              : `${label}: there is a gap between ${next.grade} and ${g.grade}.`,
          );
      });
  } else if (s.mode === 'descriptive') {
    const names = (s.ratings ?? []).map((x) => (x.name ?? '').trim()).filter(Boolean);
    if (names.length < 2) e.push(`${label}: add at least 2 ratings.`);
    if (new Set(names.map((x) => x.toLowerCase())).size !== names.length)
      e.push(`${label}: ratings must be different.`);
  } else e.push(`${label}: choose scores or descriptive ratings.`);
  return e;
}

/**
 * Academics › Assessment & Grading: each section's scheme for the current session (score
 * components and weights, grade bands, or descriptive ratings for early years), whether its
 * report cards show position, the pass mark and rounding. A scheme freezes once results on it
 * are published. Shapes follow the School Admin mock (`/v1/academics/assessment`).
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly catalog: AcademicCatalogService,
    private readonly audit: SchoolAuditService,
    private readonly setup: SetupStateService,
  ) {}

  private get db() {
    return this.catalog.db;
  }

  private schemesFor(sessionId: string) {
    return this.db.assessmentScheme.findMany({
      where: { sessionId },
      include: {
        components: { orderBy: { sortOrder: 'asc' } },
        gradeBands: { orderBy: { sortOrder: 'asc' } },
        ratings: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  private static toView(s: Awaited<ReturnType<AssessmentService['schemesFor']>>[number]) {
    return {
      mode: s.mode === 'DESCRIPTIVE' ? ('descriptive' as const) : ('scores' as const),
      components: s.components.map((c) => ({
        name: c.name,
        max: num(c.maxScore),
        weight: num(c.weight),
        when: c.typicalWhen,
      })),
      scale: s.gradeBands.map((g) => ({
        grade: g.grade,
        min: num(g.minScore),
        max: num(g.maxScore),
        remark: g.remark,
        points: num(g.points),
        pass: g.isPass,
      })),
      ratings: s.ratings.map((r) => ({ name: r.name, description: r.description })),
      showPosition: s.showPosition,
    };
  }

  /**
   * Subjects each section's levels offer in the session (by name), the choices for its
   * must-pass subjects. Subjects already chosen stay listed.
   */
  private async promotionSubjects(
    sessionId: string | null,
    sections: { id: string; name: string }[],
    rows: { sectionId: string; promotionSubjectIds: string[] }[],
  ) {
    const entries = sessionId
      ? await this.db.curriculumEntry.findMany({
          where: { sessionId },
          select: {
            level: { select: { sectionId: true } },
            subject: { select: { id: true, name: true } },
          },
        })
      : [];
    const chosen = rows.flatMap((r) => r.promotionSubjectIds);
    const extra = chosen.length
      ? await this.db.subject.findMany({
          where: { id: { in: chosen } },
          select: { id: true, name: true },
        })
      : [];
    return Object.fromEntries(
      sections.map((sec) => {
        const list = new Map<string, string>();
        for (const e of entries)
          if (e.level.sectionId === sec.id) list.set(e.subject.id, e.subject.name);
        const ids = rows.find((r) => r.sectionId === sec.id)?.promotionSubjectIds ?? [];
        for (const x of extra) if (ids.includes(x.id)) list.set(x.id, x.name);
        return [
          sec.name,
          [...list]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ];
      }),
    ) as Record<string, { id: string; name: string }[]>;
  }

  async view() {
    const [session, sections, settings, confirmed] = await Promise.all([
      this.catalog.currentSession(),
      this.catalog.structure.sections(),
      this.db.schoolSettings.findFirst(),
      this.setup.isConfirmed(ASSESSMENT_STEP),
    ]);
    const rows = session ? await this.schemesFor(session.id) : [];
    const same = settings?.sameSchemeForAllSections ?? false;
    const bySection = new Map(rows.map((r) => [r.sectionId, AssessmentService.toView(r)]));
    const first = rows[0];
    const schemes: Record<string, ReturnType<typeof AssessmentService.toView> | null> = same
      ? { '*': first ? AssessmentService.toView(first) : null }
      : Object.fromEntries(sections.map((s) => [s.name, bySection.get(s.id) ?? null]));
    return {
      same,
      schemes,
      rounding:
        first?.rounding === 'ONE_DECIMAL'
          ? ('1 decimal place' as const)
          : ('Whole number' as const),
      passMark: first ? num(first.passMark) : 40,
      sections: sections.map((s) => ({ name: s.name, code: s.code })),
      confirmed,
      missing: same
        ? first || !sections.length
          ? []
          : ['All sections']
        : sections.filter((s) => !bySection.has(s.id)).map((s) => s.name),
      hasPublished: rows.some((r) => r.lockedAt),
      /** Section name → promotion rule (minimum annual average and must-pass subject ids). */
      promotion: Object.fromEntries(
        sections.map((s) => {
          const r = rows.find((x) => x.sectionId === s.id);
          return [
            s.name,
            {
              minAverage:
                r?.promotionMinAverage === null || r?.promotionMinAverage === undefined
                  ? null
                  : num(r.promotionMinAverage),
              mustPass: r?.promotionSubjectIds ?? [],
            },
          ];
        }),
      ) as Record<string, PromotionRuleInput>,
      promotionSubjects: await this.promotionSubjects(session?.id ?? null, sections, rows),
    };
  }

  async save(schoolId: string, p: AssessmentInput) {
    const session = await this.catalog.currentSession();
    if (!session)
      throw fail('Create the academic session first.', 'NO_SESSION', HttpStatus.CONFLICT);
    const sections = await this.catalog.structure.sections();
    if (!sections.length)
      throw fail('Add your academic sections first.', 'NO_SECTIONS', HttpStatus.CONFLICT);
    const keys = p.same ? ['*'] : sections.map((s) => s.name);
    const errors = keys.flatMap((k) => {
      const s = p.schemes?.[k];
      return s ? schemeErrors(k === '*' ? 'All sections' : k, s) : [];
    });
    if (errors.length) throw fail(errors[0]!, 'SCHEME_INVALID');
    if (!(p.passMark >= 0 && p.passMark <= 100))
      throw fail('The pass mark is between 0 and 100.', 'VALIDATION');
    const rounding = p.rounding === '1 decimal place' ? 'ONE_DECIMAL' : 'WHOLE_NUMBER';
    const existing = await this.schemesFor(session.id);
    const rules = await this.checkRules(p, session.id, sections, existing);
    let saved = 0;
    await this.db.$transaction(async (tx) => {
      for (const section of sections) {
        const input = p.same ? p.schemes?.['*'] : p.schemes?.[section.name];
        const current = existing.find((e) => e.sectionId === section.id);
        if (!input) continue;
        saved++;
        await this.writeScheme(tx, schoolId, session.id, section, current, input, {
          rounding,
          passMark: p.passMark,
        });
      }
      for (const r of rules) {
        const scheme = await tx.assessmentScheme.findFirst({
          where: { sessionId: session.id, sectionId: r.sectionId },
        });
        if (!scheme) continue;
        await tx.assessmentScheme.update({
          where: { id: scheme.id },
          data: { promotionMinAverage: r.minAverage, promotionSubjectIds: r.mustPass },
        });
      }
      await tx.schoolSettings.upsert({
        where: { schoolId },
        create: { schoolId, sameSchemeForAllSections: p.same },
        update: { sameSchemeForAllSections: p.same },
      });
      await this.audit.record(
        {
          action: 'assessment.save',
          area: 'Academic',
          entity: 'AssessmentScheme',
          summary: 'Assessment & grading saved',
          detail: plural(p.same ? (p.schemes?.['*'] ? 1 : 0) : saved, 'scheme'),
        },
        asTx(tx),
      );
    });
    return this.view();
  }

  /**
   * The promotion rules to write: a minimum average of 0–100 (or none) and must-pass subjects
   * the section offers. A rule needs a score-based scheme (descriptive sections decide by hand).
   */
  private async checkRules(
    p: AssessmentInput,
    sessionId: string,
    sections: { id: string; name: string }[],
    existing: Awaited<ReturnType<AssessmentService['schemesFor']>>,
  ) {
    if (p.promotion === undefined || p.promotion === null) return [];
    if (typeof p.promotion !== 'object' || Array.isArray(p.promotion))
      throw fail('Send the promotion rules by section name.', 'VALIDATION');
    const options = await this.promotionSubjects(sessionId, sections, existing);
    const out: { sectionId: string; minAverage: number | null; mustPass: string[] }[] = [];
    for (const [name, rule] of Object.entries(p.promotion)) {
      const section = sections.find((s) => s.name === name);
      if (!section) throw fail(`There is no section called ${name}.`, 'VALIDATION');
      const minAverage = rule?.minAverage ?? null;
      const mustPass = [...new Set(rule?.mustPass ?? [])];
      if (
        minAverage !== null &&
        (typeof minAverage !== 'number' || !(minAverage >= 0 && minAverage <= 100))
      )
        throw fail(`${name}: the minimum average is between 0 and 100.`, 'PROMOTION_RULE_INVALID');
      if (
        !Array.isArray(rule?.mustPass ?? []) ||
        mustPass.some((id) => typeof id !== 'string' || !options[name]!.some((o) => o.id === id))
      )
        throw fail(
          `${name}: choose must-pass subjects from the subjects ${name} offers.`,
          'PROMOTION_RULE_INVALID',
        );
      const input = p.same ? p.schemes?.['*'] : p.schemes?.[name];
      const mode =
        input?.mode ?? existing.find((e) => e.sectionId === section.id)?.mode.toLowerCase();
      const empty = minAverage === null && !mustPass.length;
      if (!empty && mode === 'descriptive')
        throw fail(
          `${name} uses descriptive ratings, so there is no average to promote on. Staff decide for each student.`,
          'PROMOTION_RULE_INVALID',
        );
      if (!empty && !mode)
        throw fail(`Set up ${name}’s assessment scheme before its promotion rule.`, 'VALIDATION');
      out.push({ sectionId: section.id, minAverage, mustPass });
    }
    return out;
  }

  private async writeScheme(
    tx: TenantTx,
    schoolId: string,
    sessionId: string,
    section: { id: string; name: string },
    current: Awaited<ReturnType<AssessmentService['schemesFor']>>[number] | undefined,
    input: SchemeInput,
    common: { rounding: 'ONE_DECIMAL' | 'WHOLE_NUMBER'; passMark: number },
  ) {
    const mode = input.mode === 'descriptive' ? 'DESCRIPTIVE' : 'SCORES';
    const components = (input.components ?? []).map((c, i) => ({
      key: componentKey(c.name),
      name: c.name.trim(),
      maxScore: c.max,
      weight: c.weight,
      typicalWhen: (c.when ?? '').trim(),
      sortOrder: i + 1,
    }));
    if (current?.lockedAt) {
      // Published results were scored on these weights: only wording may change.
      const same =
        current.mode === mode &&
        current.components.length === components.length &&
        current.components.every(
          (c, i) =>
            c.key === components[i]!.key &&
            num(c.maxScore) === components[i]!.maxScore &&
            num(c.weight) === components[i]!.weight,
        );
      if (!same)
        throw fail(
          `${section.name} has published results, so its components and weights are fixed until the session closes.`,
          'SCHEME_LOCKED',
          HttpStatus.CONFLICT,
        );
    }
    const data = {
      mode: mode as 'SCORES' | 'DESCRIPTIVE',
      rounding: common.rounding,
      passMark: common.passMark,
      showPosition: !!input.showPosition,
      scaleName: '',
    };
    const scheme = current
      ? await tx.assessmentScheme.update({ where: { id: current.id }, data })
      : await tx.assessmentScheme.create({
          data: { schoolId, sessionId, sectionId: section.id, ...data },
        });

    // Components: matched by key; ones with scores, corrections or planned assessments stay.
    const old = current?.components ?? [];
    const removed = old.filter((c) => !components.some((x) => x.key === c.key));
    for (const c of removed) {
      const used =
        (await tx.resultScore.count({ where: { componentId: c.id } })) +
        (await tx.scoreCorrection.count({ where: { componentId: c.id } })) +
        (await tx.assessmentSchedule.count({ where: { componentId: c.id } }));
      if (used)
        throw fail(
          `${section.name}: ${c.name} already has scores or planned assessments, so it can’t be removed.`,
          'COMPONENT_IN_USE',
          HttpStatus.CONFLICT,
        );
    }
    if (removed.length)
      await tx.assessmentComponent.deleteMany({ where: { id: { in: removed.map((c) => c.id) } } });
    // Park sort orders so reordering can't collide on (scheme, sortOrder).
    for (const c of old.filter((c) => !removed.includes(c)))
      await tx.assessmentComponent.update({
        where: { id: c.id },
        data: { sortOrder: -c.sortOrder - 1000 },
      });
    for (const c of components) {
      const was = old.find((o) => o.key === c.key);
      if (was) await tx.assessmentComponent.update({ where: { id: was.id }, data: c });
      else await tx.assessmentComponent.create({ data: { schoolId, schemeId: scheme.id, ...c } });
    }

    await tx.gradeBand.deleteMany({ where: { schemeId: scheme.id } });
    await tx.gradeBand.createMany({
      data: (input.scale ?? []).map((g, i) => ({
        schoolId,
        schemeId: scheme.id,
        grade: g.grade.trim(),
        minScore: g.min,
        maxScore: g.max,
        remark: (g.remark ?? '').trim(),
        points: g.points ?? 0,
        isPass: !!g.pass,
        sortOrder: i + 1,
      })),
    });

    // Ratings: matched by name; ones already given on report cards stay.
    const ratings = (input.ratings ?? [])
      .map((r) => ({ name: (r.name ?? '').trim(), description: (r.description ?? '').trim() }))
      .filter((r) => r.name);
    const oldRatings = current?.ratings ?? [];
    for (const r of oldRatings.filter((o) => !ratings.some((x) => x.name === o.name))) {
      if (await tx.resultEntry.count({ where: { ratingId: r.id } }))
        throw fail(
          `${section.name}: the rating ${r.name} is already on report cards, so it can’t be removed.`,
          'RATING_IN_USE',
          HttpStatus.CONFLICT,
        );
      await tx.descriptiveRating.delete({ where: { id: r.id } });
    }
    for (const r of oldRatings)
      await tx.descriptiveRating.updateMany({
        where: { id: r.id },
        data: { sortOrder: -r.sortOrder - 1000 },
      });
    for (const [i, r] of ratings.entries()) {
      const was = oldRatings.find((o) => o.name === r.name);
      if (was)
        await tx.descriptiveRating.update({
          where: { id: was.id },
          data: { description: r.description, sortOrder: i + 1 },
        });
      else
        await tx.descriptiveRating.create({
          data: { schoolId, schemeId: scheme.id, ...r, sortOrder: i + 1 },
        });
    }
  }

  /** Setup Center: sections still without a scheme. */
  async gaps(): Promise<string[]> {
    return (await this.view()).missing;
  }
}
