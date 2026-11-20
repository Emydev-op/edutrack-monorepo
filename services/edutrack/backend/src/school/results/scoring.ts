/**
 * Score maths for result sheets, the same rules as the portals (`teacher-portal/src/components/
 * results/scoring.ts`, School Admin's `academics-results.ts`):
 *
 * - A blank score is **missing**, never zero: a row with a missing score has no total.
 * - **ABS** (absent): the row has no total and is flagged for a make-up.
 * - **EXM** (exempt): with the school's "re-spread weights" setting the component drops out and
 *   the other weights re-spread to 100%; without it the component counts as 0.
 * - Totals use the scheme's rounding (whole number or one decimal place); grade bands include
 *   the decimals above their max (69.5 is still a B).
 */

export type ScoreValue = number | 'ABS' | 'EXM' | null;

export interface SchemeComponent {
  id: string;
  key: string;
  name: string;
  max: number;
  weight: number;
  when: string;
}

export interface SchemeBand {
  grade: string;
  min: number;
  max: number;
  remark: string;
  points: number;
  pass: boolean;
}

export interface Scheme {
  id: string;
  sessionId: string;
  sectionId: string;
  mode: 'SCORES' | 'DESCRIPTIVE';
  components: SchemeComponent[];
  scale: SchemeBand[];
  scaleName: string;
  passMark: number;
  rounding: 'WHOLE_NUMBER' | 'ONE_DECIMAL';
  showPosition: boolean;
  lockedAt: Date | null;
  /** SchoolSettings.reweightExempt. */
  reweightExempt: boolean;
}

/** A stored value the API accepts: null, ABS, EXM, or a number 0–max with ≤ 1 decimal. */
export function isValidScore(v: unknown, max: number): v is ScoreValue {
  if (v === null || v === 'ABS' || v === 'EXM') return true;
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= 0 &&
    v <= max &&
    Math.abs(v * 10 - Math.round(v * 10)) < 1e-9
  );
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export const roundFor = (scheme: Pick<Scheme, 'rounding'>, n: number) =>
  scheme.rounding === 'WHOLE_NUMBER' ? Math.round(n) : round1(n);

/** The weighted total out of 100, or null while any component is missing or absent. */
export function totalOf(scheme: Scheme, values: ScoreValue[]): number | null {
  let total = 0;
  let counted = 0;
  for (const [i, c] of scheme.components.entries()) {
    const v = values[i];
    if (v === 'EXM') {
      if (!scheme.reweightExempt) counted += c.weight;
      continue;
    }
    if (v === null || v === undefined || v === 'ABS') return null;
    total += (v / c.max) * c.weight;
    counted += c.weight;
  }
  return counted ? roundFor(scheme, (total / counted) * 100) : null;
}

export const gradeOf = (scale: SchemeBand[], total: number) =>
  scale.find((g) => total >= g.min && total <= g.max + 0.999) ?? null;

/** The row's flag: absent first, then exempt, then missing. */
export function flagOf(components: SchemeComponent[], values: ScoreValue[]): string {
  const absentAt = values.findIndex((v) => v === 'ABS');
  if (absentAt >= 0) return `Absent (${components[absentAt]!.name}) · make-up needed`;
  const exemptAt = values.findIndex((v) => v === 'EXM');
  if (exemptAt >= 0) return `Exempt from ${components[exemptAt]!.name}`;
  if (components.some((_, i) => values[i] === null || values[i] === undefined))
    return 'Missing score';
  return '';
}

/** Names of the components still blank for a row, e.g. ["CA 2"]. */
export const missingOf = (components: SchemeComponent[], values: ScoreValue[]) =>
  components.filter((_, i) => values[i] === null || values[i] === undefined).map((c) => c.name);

export function scoreRow(scheme: Scheme, scores: ScoreValue[]) {
  const total = totalOf(scheme, scores);
  const band = total === null ? null : gradeOf(scheme.scale, total);
  return {
    scores,
    total,
    grade: band?.grade ?? null,
    remark: band?.remark ?? '',
    flag: flagOf(scheme.components, scores),
  };
}

const isMissing = (v: ScoreValue | undefined) => v === null || v === undefined;

/** Class figures for a set of rows (average, spread, passes, completion and grade counts). */
export function statsOf(scheme: Scheme, rows: { scores: ScoreValue[] }[]) {
  const scored = rows.map((r) => scoreRow(scheme, r.scores));
  const totals = scored.map((r) => r.total).filter((x): x is number => x !== null);
  const missing = rows.filter((r) =>
    scheme.components.some((_, i) => isMissing(r.scores[i])),
  ).length;
  return {
    average: totals.length
      ? roundFor(scheme, totals.reduce((a, b) => a + b, 0) / totals.length)
      : null,
    highest: totals.length ? Math.max(...totals) : null,
    lowest: totals.length ? Math.min(...totals) : null,
    passed: totals.filter((t) => t >= scheme.passMark).length,
    count: rows.length,
    complete: rows.length - missing,
    absent: rows.filter((r) => r.scores.includes('ABS')).length,
    exempt: rows.filter((r) => r.scores.includes('EXM')).length,
    missing,
    distribution: scheme.scale.map((b) => ({
      grade: b.grade,
      remark: b.remark,
      count: scored.filter((r) => r.grade === b.grade).length,
    })),
  };
}

/** Cells entered (a number, ABS or EXM) out of every cell, for completion meters. */
export function completionOf(componentsCount: number, rows: { scores: ScoreValue[] }[]) {
  let scored = 0;
  let missing = 0;
  for (const r of rows) {
    let blank = false;
    for (let i = 0; i < componentsCount; i++)
      if (isMissing(r.scores[i])) blank = true;
      else scored++;
    if (blank) missing++;
  }
  return { scored, total: rows.length * componentsCount, missing };
}

/**
 * Competition ranking ("1224"): equal values share a position and the next is skipped (1st, 2nd,
 * 2nd, 4th). Ids with no value get no position.
 */
export function rankPositions(items: { id: string; value: number | null }[]) {
  const ranked = items
    .filter((x): x is { id: string; value: number } => x.value !== null)
    .sort((a, b) => b.value - a.value);
  const out = new Map<string, number>();
  ranked.forEach((x, i) => {
    const prev = ranked[i - 1];
    out.set(x.id, prev && Math.abs(prev.value - x.value) < 1e-9 ? out.get(prev.id)! : i + 1);
  });
  return out;
}

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** The mean of the values given, or null for none. */
export const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
