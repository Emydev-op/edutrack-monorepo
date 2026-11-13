/**
 * Score maths for result sheets, shared by the score sheet (live totals as the teacher types) and
 * the mock API (what the server stores and reports), so both always agree. The rules are School
 * Admin's (`academics-results.ts` `totalOf` / `gradeOf` / `sheetRows`):
 *
 * - A blank score is **missing**, never zero. A row with a missing score has no total.
 * - **ABS** (absent): the row has no total, is left out of the class average and is flagged for a
 *   make-up.
 * - **EXM** (exempt): the component drops out and the other weights re-spread to 100%.
 * - Totals are rounded to one decimal place; grade bands are inclusive of the decimals above
 *   their max (69.5 is still a B).
 */
import type { ScoreValue, SheetComponent, SheetGradeBand, SheetStats } from '@/types';

/* ---------- Parsing what the teacher types ---------- */

export interface ParsedScore {
  value: ScoreValue;
  /** Why the text isn't a score, or null when it is one (or blank). */
  error: string | null;
}

/**
 * Reads one cell: blank → missing (`null`); a number 0–max with at most one decimal place;
 * `ABS`/`A` → absent; `EXM`/`E` → exempt (any case). Anything else is an error.
 */
export function parseScore(raw: string, max: number): ParsedScore {
  const text = raw.trim();
  if (!text) return { value: null, error: null };
  if (/^(abs|a)$/i.test(text)) return { value: 'ABS', error: null };
  if (/^(exm|e)$/i.test(text)) return { value: 'EXM', error: null };
  if (!/^\d+(\.\d+)?$/.test(text) && !/^\.\d+$/.test(text))
    return { value: null, error: `Enter 0–${max}, ABS or EXM` };
  if (/\.\d{2,}$/.test(text)) return { value: null, error: 'Use at most one decimal place' };
  const n = Number(text);
  if (n > max) return { value: null, error: `Max is ${max}` };
  return { value: n, error: null };
}

/** How a stored value shows in a cell. */
export const formatScore = (v: ScoreValue) => (v === null ? '' : String(v));

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

/* ---------- Totals, grades and flags ---------- */

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The weighted total out of 100, or null when any component is missing or absent (or every
 * component is exempt). Exempt components drop out and the rest re-weight.
 */
export function totalOf(components: SheetComponent[], values: ScoreValue[]): number | null {
  let total = 0;
  let counted = 0;
  for (const [i, c] of components.entries()) {
    const v = values[i];
    if (v === 'EXM') continue;
    if (v === null || v === undefined || v === 'ABS') return null;
    total += (v / c.max) * c.weight;
    counted += c.weight;
  }
  return counted ? round1((total / counted) * 100) : null;
}

export const gradeOf = (scale: SheetGradeBand[], total: number) =>
  scale.find((g) => total >= g.min && total <= g.max + 0.999) ?? null;

/** The row's flag, as School Admin words it: absent first, then exempt, then missing. */
export function flagOf(components: SheetComponent[], values: ScoreValue[]): string {
  const absentAt = values.findIndex((v) => v === 'ABS');
  if (absentAt >= 0) return `Absent (${components[absentAt]!.name}) · make-up needed`;
  const exemptAt = values.findIndex((v) => v === 'EXM');
  if (exemptAt >= 0) return `Exempt from ${components[exemptAt]!.name}`;
  if (components.some((_, i) => values[i] === null || values[i] === undefined))
    return 'Missing score';
  return '';
}

/** Names of the components still blank for a row, e.g. ["CA 2"]. */
export const missingOf = (components: SheetComponent[], values: ScoreValue[]) =>
  components.filter((_, i) => values[i] === null || values[i] === undefined).map((c) => c.name);

export interface ScoredRow {
  scores: ScoreValue[];
  total: number | null;
  grade: string | null;
  /** The grade band's remark ("Very good"). */
  remark: string;
  flag: string;
}

export function scoreRow(
  components: SheetComponent[],
  scale: SheetGradeBand[],
  scores: ScoreValue[],
): ScoredRow {
  const total = totalOf(components, scores);
  const band = total === null ? null : gradeOf(scale, total);
  return {
    scores,
    total,
    grade: band?.grade ?? null,
    remark: band?.remark ?? '',
    flag: flagOf(components, scores),
  };
}

/** Class figures for a set of rows (School Admin's `stats`, plus completion and grade counts). */
export function statsOf(
  components: SheetComponent[],
  scale: SheetGradeBand[],
  rows: { scores: ScoreValue[] }[],
  passMark: number,
): SheetStats {
  const scored = rows.map((r) => scoreRow(components, scale, r.scores));
  const totals = scored.map((r) => r.total).filter((x): x is number => x !== null);
  const missing = rows.filter((r) =>
    components.some((_, i) => r.scores[i] === null || r.scores[i] === undefined),
  ).length;
  return {
    average: totals.length ? round1(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
    highest: totals.length ? Math.max(...totals) : null,
    lowest: totals.length ? Math.min(...totals) : null,
    passed: totals.filter((t) => t >= passMark).length,
    count: rows.length,
    complete: rows.length - missing,
    absent: rows.filter((r) => r.scores.includes('ABS')).length,
    exempt: rows.filter((r) => r.scores.includes('EXM')).length,
    missing,
    distribution: scale.map((b) => ({
      grade: b.grade,
      remark: b.remark,
      count: scored.filter((r) => r.grade === b.grade).length,
    })),
  };
}

/** Cells entered (a number, ABS or EXM) out of every cell, for completion meters. */
export function completionOf(componentsCount: number, rows: { scores: ScoreValue[] }[]) {
  const total = rows.length * componentsCount;
  let scored = 0;
  for (const r of rows)
    for (let i = 0; i < componentsCount; i++)
      if (r.scores[i] !== null && r.scores[i] !== undefined) scored++;
  return {
    scored,
    total,
    /** Students with at least one blank score. */
    missing: rows.filter((r) =>
      Array.from({ length: componentsCount }).some(
        (_, i) => r.scores[i] === null || r.scores[i] === undefined,
      ),
    ).length,
  };
}
