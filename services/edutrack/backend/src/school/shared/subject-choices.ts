import { AppException } from '../../common/errors/app.exception.js';
import type { TenantTx } from './tenant-tx.js';

/** One subject a student can take. */
export interface ChoiceSubject {
  subjectId: string;
  code: string;
  name: string;
}

/** A set of electives to choose from, e.g. "Science track · choose 3 to 4". */
export interface ChoiceGroup {
  /** The curriculum's elective group, or null for electives in no group. */
  id: string | null;
  name: string;
  minPicks: number;
  maxPicks: number;
  note: string;
  subjects: ChoiceSubject[];
}

/** What a class level offers in a session, and what a student must choose. */
export interface ChoiceOptions {
  sessionId: string;
  levelId: string;
  /** Taken by everyone at the level. */
  compulsory: ChoiceSubject[];
  /** Choose exactly one, when the level offers any. */
  religious: ChoiceSubject[];
  groups: ChoiceGroup[];
}

/** What a student picked: one religious subject and their electives. */
export interface ChoicePicks {
  religious?: string | null;
  electives: string[];
}

/** A pick, ready to save. */
export interface ChoiceRow {
  subjectId: string;
  groupId: string | null;
}

const between = (g: { minPicks: number; maxPicks: number }) =>
  g.minPicks === g.maxPicks
    ? `${g.minPicks}`
    : g.minPicks === 0
      ? `up to ${g.maxPicks}`
      : `${g.minPicks} to ${g.maxPicks}`;

/** "Choose 1", "choose 2 to 3", "choose up to 2". */
export const pickRule = (g: { minPicks: number; maxPicks: number }) => `choose ${between(g)}`;

/**
 * What a class level offers in a session (from the curriculum): its compulsory subjects, the
 * religious subjects (one is chosen) and its electives grouped the way Academics › Curriculum
 * groups them for the section, with each group's minimum and maximum picks. Electives in no group
 * form an "Other electives" group with no minimum.
 */
export async function choiceOptions(
  db: TenantTx,
  sessionId: string,
  levelId: string,
): Promise<ChoiceOptions> {
  const [level, entries] = await Promise.all([
    db.classLevel.findFirst({ where: { id: levelId }, select: { sectionId: true } }),
    db.curriculumEntry.findMany({
      where: { sessionId, levelId, subject: { status: 'ACTIVE' } },
      select: {
        offering: true,
        subject: { select: { id: true, code: true, name: true, category: true } },
      },
      orderBy: { subject: { name: 'asc' } },
    }),
  ]);
  const subject = (s: { id: string; code: string; name: string }): ChoiceSubject => ({
    subjectId: s.id,
    code: s.code,
    name: s.name,
  });
  const religious = entries.filter((e) => e.subject.category === 'RELIGIOUS');
  const compulsory = entries.filter(
    (e) => e.offering === 'COMPULSORY' && e.subject.category !== 'RELIGIOUS',
  );
  const electives = entries.filter(
    (e) => e.offering !== 'COMPULSORY' && e.subject.category !== 'RELIGIOUS',
  );
  const groupRows = level
    ? await db.electiveGroup.findMany({
        where: { sessionId, sectionId: level.sectionId },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          minPicks: true,
          maxPicks: true,
          note: true,
          subjects: { select: { subjectId: true } },
        },
      })
    : [];
  const grouped = new Set<string>();
  const groups: ChoiceGroup[] = [];
  for (const g of groupRows) {
    const ids = new Set(g.subjects.map((s) => s.subjectId));
    const here = electives.filter((e) => ids.has(e.subject.id) && !grouped.has(e.subject.id));
    if (!here.length) continue;
    here.forEach((e) => grouped.add(e.subject.id));
    groups.push({
      id: g.id,
      name: g.name,
      minPicks: Math.min(g.minPicks, here.length),
      maxPicks: Math.min(Math.max(g.maxPicks, g.minPicks), here.length),
      note: g.note,
      subjects: here.map((e) => subject(e.subject)),
    });
  }
  const loose = electives.filter((e) => !grouped.has(e.subject.id));
  if (loose.length)
    groups.push({
      id: null,
      name: groups.length ? 'Other electives' : 'Electives',
      minPicks: 0,
      maxPicks: loose.length,
      note: '',
      subjects: loose.map((e) => subject(e.subject)),
    });
  return {
    sessionId,
    levelId,
    compulsory: compulsory.map((e) => subject(e.subject)),
    religious: religious.map((e) => subject(e.subject)),
    groups,
  };
}

/**
 * Checks a student's picks against what the level offers: one religious subject when it offers
 * any, and each group's minimum and maximum. Returns the rows to save, or the field errors.
 */
export function checkChoices(
  options: ChoiceOptions,
  picks: ChoicePicks,
): { rows: ChoiceRow[]; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const rows: ChoiceRow[] = [];
  if (options.religious.length) {
    const r = options.religious.find((s) => s.subjectId === picks.religious);
    if (!r) errors.religious = 'Choose one religious studies subject.';
    else rows.push({ subjectId: r.subjectId, groupId: null });
  }
  const chosen = [...new Set(picks.electives ?? [])];
  const unknown = chosen.filter(
    (id) => !options.groups.some((g) => g.subjects.some((s) => s.subjectId === id)),
  );
  const problems: string[] = [];
  if (unknown.length) problems.push('Some subjects chosen aren’t offered in this class.');
  for (const g of options.groups) {
    const mine = g.subjects.filter((s) => chosen.includes(s.subjectId));
    if (mine.length < g.minPicks || mine.length > g.maxPicks)
      problems.push(`${g.name}: ${pickRule(g)}.`);
    rows.push(...mine.map((s) => ({ subjectId: s.subjectId, groupId: g.id })));
  }
  if (problems.length) errors.electives = problems.join(' ');
  return { rows, errors };
}

/** Like `checkChoices`, but throws a 422 with the field errors. */
export function requireChoices(options: ChoiceOptions, picks: ChoicePicks, prefix = '') {
  const { rows, errors } = checkChoices(options, picks);
  if (Object.keys(errors).length)
    throw AppException.validation(
      Object.fromEntries(Object.entries(errors).map(([k, v]) => [`${prefix}${k}`, v])),
      Object.values(errors)[0],
    );
  return rows;
}

/** Whether a student's saved subjects meet every rule (for "needs choosing" flags). */
export const choicesComplete = (options: ChoiceOptions, subjectIds: string[]) => {
  const religious = options.religious.find((s) => subjectIds.includes(s.subjectId));
  return (
    Object.keys(
      checkChoices(options, {
        religious: religious?.subjectId ?? null,
        electives: subjectIds.filter((id) => id !== religious?.subjectId),
      }).errors,
    ).length === 0
  );
};

/**
 * Replaces a student's choices for a session: subjects they keep keep their start date, new ones
 * start on `startedOn`, dropped ones are removed (scores already entered stay on their sheets).
 * Returns what was added and dropped.
 */
export async function saveChoices(
  db: TenantTx,
  schoolId: string,
  studentId: string,
  sessionId: string,
  rows: ChoiceRow[],
  startedOn: Date,
) {
  const current = await db.studentSubject.findMany({
    where: { studentId, sessionId },
    select: { id: true, subjectId: true, groupId: true },
  });
  const want = new Map(rows.map((r) => [r.subjectId, r.groupId]));
  const dropped = current.filter((c) => !want.has(c.subjectId));
  const added = rows.filter((r) => !current.some((c) => c.subjectId === r.subjectId));
  if (dropped.length)
    await db.studentSubject.deleteMany({ where: { id: { in: dropped.map((d) => d.id) } } });
  for (const c of current)
    if (want.has(c.subjectId) && want.get(c.subjectId) !== c.groupId)
      await db.studentSubject.update({
        where: { id: c.id },
        data: { groupId: want.get(c.subjectId) ?? null },
      });
  if (added.length)
    await db.studentSubject.createMany({
      data: added.map((r) => ({
        schoolId,
        studentId,
        sessionId,
        subjectId: r.subjectId,
        groupId: r.groupId,
        startedOn,
      })),
      skipDuplicates: true,
    });
  return { added: added.map((a) => a.subjectId), dropped: dropped.map((d) => d.subjectId) };
}

/**
 * Carries students' choices into the next session: each subject they took that their new class
 * level still offers (as a religious subject or an elective) is kept; the rest are left for the
 * school to choose. Returns how many students kept a complete set.
 */
export async function carryChoices(
  db: TenantTx,
  schoolId: string,
  moves: { studentId: string; levelId: string }[],
  fromSessionId: string,
  toSessionId: string,
  startedOn: Date,
) {
  if (!moves.length) return { complete: 0, incomplete: 0 };
  const previous = await db.studentSubject.findMany({
    where: { sessionId: fromSessionId, studentId: { in: moves.map((m) => m.studentId) } },
    select: { studentId: true, subjectId: true },
  });
  const optionsByLevel = new Map<string, ChoiceOptions>();
  let complete = 0;
  let incomplete = 0;
  for (const m of moves) {
    if (!optionsByLevel.has(m.levelId))
      optionsByLevel.set(m.levelId, await choiceOptions(db, toSessionId, m.levelId));
    const options = optionsByLevel.get(m.levelId)!;
    const had = previous.filter((p) => p.studentId === m.studentId).map((p) => p.subjectId);
    const rows: ChoiceRow[] = [];
    for (const id of had) {
      if (options.religious.some((s) => s.subjectId === id))
        rows.push({ subjectId: id, groupId: null });
      const g = options.groups.find((x) => x.subjects.some((s) => s.subjectId === id));
      if (g) rows.push({ subjectId: id, groupId: g.id });
    }
    if (rows.length)
      await db.studentSubject.createMany({
        data: rows.map((r) => ({
          schoolId,
          studentId: m.studentId,
          sessionId: toSessionId,
          subjectId: r.subjectId,
          groupId: r.groupId,
          startedOn,
        })),
        skipDuplicates: true,
      });
    if (
      choicesComplete(
        options,
        rows.map((r) => r.subjectId),
      )
    )
      complete++;
    else incomplete++;
  }
  return { complete, incomplete };
}
