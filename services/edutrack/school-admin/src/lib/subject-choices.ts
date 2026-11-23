import type { SubjectChoice, SubjectGroup, SubjectRef } from '@/types';

/** A stable key for an elective group ("Other electives" has no id). */
export const groupKey = (g: Pick<SubjectGroup, 'id' | 'name'>) => g.id ?? `other:${g.name}`;

/** The picks a student made within one group. */
export const picksIn = (g: SubjectGroup, electives: readonly string[]) =>
  g.subjects.filter((s) => electives.includes(s.subjectId)).map((s) => s.subjectId);

/** Why a group's picks break its rule, or null when they meet it. */
export function groupProblem(g: SubjectGroup, electives: readonly string[]): string | null {
  const n = picksIn(g, electives).length;
  if (n < g.minPicks)
    return g.minPicks === g.maxPicks
      ? `Choose ${g.minPicks} from ${g.name}.`
      : `Choose at least ${g.minPicks} from ${g.name}.`;
  if (n > g.maxPicks) return `Choose no more than ${g.maxPicks} from ${g.name}.`;
  return null;
}

/** Problems per field: `religious` and one per group key. Empty when the choice is complete. */
export function choiceProblems(
  offer: { religious: SubjectRef[]; groups: SubjectGroup[] },
  choice: SubjectChoice,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (offer.religious.length && !offer.religious.some((r) => r.subjectId === choice.religious))
    e.religious = 'Choose a religious subject.';
  for (const g of offer.groups) {
    const p = groupProblem(g, choice.electives);
    if (p) e[groupKey(g)] = p;
  }
  return e;
}

/** Drops picks the offer no longer has (e.g. after changing class level). */
export function keepOffered(
  offer: { religious: SubjectRef[]; groups: SubjectGroup[] },
  choice: SubjectChoice,
): SubjectChoice {
  const electiveIds = new Set(offer.groups.flatMap((g) => g.subjects.map((s) => s.subjectId)));
  const religious =
    choice.religious && offer.religious.some((r) => r.subjectId === choice.religious)
      ? choice.religious
      : null;
  return { religious, electives: choice.electives.filter((id) => electiveIds.has(id)) };
}

/** Toggles one elective within a group, honouring the group's maximum (one pick swaps). */
export function toggleElective(
  g: SubjectGroup,
  electives: readonly string[],
  subjectId: string,
): string[] {
  const inGroup = new Set(g.subjects.map((s) => s.subjectId));
  if (electives.includes(subjectId)) return electives.filter((x) => x !== subjectId);
  if (g.maxPicks === 1) return [...electives.filter((x) => !inGroup.has(x)), subjectId];
  if (picksIn(g, electives).length >= g.maxPicks) return [...electives];
  return [...electives, subjectId];
}

/** Subject names for ids, in the order given. */
export function namesOf(
  offer: { religious: SubjectRef[]; groups: SubjectGroup[] },
  ids: readonly (string | null)[],
): string[] {
  const all = [...offer.religious, ...offer.groups.flatMap((g) => g.subjects)];
  return ids.flatMap((id) => all.find((s) => s.subjectId === id)?.name ?? []);
}
