import type { PromotionOutcome } from '../../generated/prisma/enums.js';
import { cumulativeAverage } from '../results/scoring.js';

/** The portals' words for the outcomes. */
export const DECISION_LABEL: Record<PromotionOutcome, PromotionLabel> = {
  PROMOTE: 'Promote',
  REPEAT: 'Repeat',
  GRADUATE: 'Graduate',
  TRANSFER: 'Transfer',
  WITHDRAW: 'Withdraw',
};
export type PromotionLabel = 'Promote' | 'Repeat' | 'Graduate' | 'Transfer' | 'Withdraw';
export const DECISION_FROM_LABEL = Object.fromEntries(
  Object.entries(DECISION_LABEL).map(([k, v]) => [v, k]),
) as Record<PromotionLabel, PromotionOutcome>;

/** A section's promotion rule for a session (from its assessment scheme). */
export interface PromotionRule {
  /** Null: no minimum annual average. */
  minAverage: number | null;
  mustPass: { id: string; name: string }[];
  /** The section's pass mark: a must-pass subject passes at or above it. */
  passMark: number;
}

export const hasRule = (r: PromotionRule | null | undefined): r is PromotionRule =>
  !!r && (r.minAverage !== null || r.mustPass.length > 0);

/** "English Language", "English and Mathematics", "Basic Science, English and Mathematics". */
export function listText(names: string[]) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** "Annual average of 45% or more and a pass (40%) in English Language and Mathematics". */
export function ruleText(r: PromotionRule | null | undefined): string | null {
  if (!hasRule(r)) return null;
  const parts = [
    r.minAverage !== null && `annual average of ${r.minAverage}% or more`,
    r.mustPass.length && `a pass (${r.passMark}%) in ${listText(r.mustPass.map((s) => s.name))}`,
  ].filter((x): x is string => !!x);
  const text = parts.join(' and ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface TermTotal {
  subjectId: string;
  termId: string;
  total: number | null;
}

/** Each subject's cumulative average (mean of its published term totals) and the annual average. */
export function annualOf(totals: TermTotal[]) {
  const bySubject = new Map<string, (number | null)[]>();
  for (const t of totals)
    bySubject.set(t.subjectId, [...(bySubject.get(t.subjectId) ?? []), t.total]);
  const subjects = new Map<string, number | null>();
  for (const [id, list] of bySubject) subjects.set(id, cumulativeAverage(list));
  return { subjects, average: cumulativeAverage([...subjects.values()]) };
}

export interface Eligibility {
  /** Null: not computed (no rule, no published results, or a must-pass subject has none). */
  eligible: boolean | null;
  /** Why not eligible (or why it couldn't be worked out), for the student's note. */
  note: string;
}

/**
 * Whether the rule promotes a student: the annual average at or above the minimum and every
 * must-pass subject's cumulative at or above the pass mark. Without published results (or with
 * none in a must-pass subject) eligibility is unknown and staff decide.
 */
export function eligibilityOf(
  rule: PromotionRule | null,
  annual: ReturnType<typeof annualOf>,
): Eligibility {
  if (annual.average === null)
    return { eligible: null, note: 'No published results this session · decide manually' };
  if (!hasRule(rule)) return { eligible: null, note: '' };
  const missing = rule.mustPass.filter((s) => (annual.subjects.get(s.id) ?? null) === null);
  if (missing.length)
    return {
      eligible: null,
      note: `No published result in ${listText(missing.map((s) => s.name))} · decide manually`,
    };
  const failed = rule.mustPass.filter((s) => annual.subjects.get(s.id)! < rule.passMark);
  const low = rule.minAverage !== null && annual.average < rule.minAverage;
  const notes = [
    low && `Annual average below ${rule.minAverage}%`,
    failed.length &&
      `below the pass mark (${rule.passMark}) in ${listText(failed.map((s) => s.name))}`,
  ].filter((x): x is string => !!x);
  const note = notes.join(' · ');
  return { eligible: !low && !failed.length, note: note.charAt(0).toUpperCase() + note.slice(1) };
}

/** What the rule suggests: promote (or graduate from the final class) when eligible, else repeat. */
export function suggestionOf(eligible: boolean | null, final: boolean): PromotionOutcome | null {
  if (eligible === null) return null;
  if (!eligible) return 'REPEAT';
  return final ? 'GRADUATE' : 'PROMOTE';
}

/** A decision that goes against eligibility (it needs a reason). */
export function isException(eligible: boolean | null, decision: PromotionOutcome | null) {
  if (eligible === null || !decision) return false;
  return eligible ? decision === 'REPEAT' : decision === 'PROMOTE' || decision === 'GRADUATE';
}

export interface OrderedLevel {
  id: string;
  name: string;
  sectionId: string;
  sectionOrder: number;
  sortOrder: number;
  /** An explicit "promotes to" (ClassLevel.nextLevelId), when the school set one. */
  nextLevelId: string | null;
}

/**
 * The class level a level promotes to: its explicit next level, else the next in promotion order
 * (section order, then level order), so the last level of a section goes to the first of the
 * next (Primary 6 → JSS 1, JSS 3 → SSS 1). Null for the final class of the school.
 */
export function nextLevelOf<T extends OrderedLevel>(levels: T[], levelId: string): T | null {
  const ordered = [...levels].sort(
    (a, b) =>
      a.sectionOrder - b.sectionOrder || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const i = ordered.findIndex((l) => l.id === levelId);
  if (i < 0) return null;
  const explicit = ordered[i]!.nextLevelId;
  if (explicit) return ordered.find((l) => l.id === explicit) ?? null;
  return ordered[i + 1] ?? null;
}
