/**
 * The class teacher's part of each report card: a remark (20–400 characters) and five conduct
 * ratings (1–5), per student per term. Editable until the class's results are published, and
 * only in the active term.
 *
 * Seeded for every arm: First Term has about two thirds done (JSS 2B: 9 of 14), Third Term
 * 2025/2026 is complete. Other features read progress through `remarksProgress`.
 */
import { MockHttpError } from '@edutrack/web-core/mock';

import { CONDUCT_TRAITS, REMARK_LIMITS, type ConductTrait } from '@/types';

import { nowLocal } from './clock';
import { logHistory } from './notify-db';
import { sheetsForArm } from './results-db';
import { ARMS, TERMS, seeded } from './school-db';
import { studentsInArm, termById, termLockReason } from './scope';

export interface RemarkRecord {
  remark: string;
  ratings: Partial<Record<ConductTrait, number>>;
  by: string;
  updatedAt: string;
}

/** "termId|studentId" → the class teacher's entry. */
export const REMARKS = new Map<string, RemarkRecord>();
export const remarkKey = (termId: string, studentId: string) => `${termId}|${studentId}`;
export const remarkOf = (termId: string, studentId: string) =>
  REMARKS.get(remarkKey(termId, studentId)) ?? null;
export const reportCardHistoryKey = (termId: string, studentId: string) =>
  `report-card:${termId}|${studentId}`;

/** Remark written and all five traits rated. */
export const isDone = (r: RemarkRecord | null) =>
  Boolean(r?.remark && CONDUCT_TRAITS.every((t) => r.ratings[t]));

/** Students who get a report card: those in the arm now (or at the end of a past term). */
export const reportCardStudents = (armId: string, termId: string) => studentsInArm(armId, termId);

/** Remarks and ratings done for an arm, of the students who get a report card. */
export function remarksProgress(armId: string, termId: string) {
  const students = reportCardStudents(armId, termId);
  return {
    done: students.filter((s) => isDone(remarkOf(termId, s.id))).length,
    total: students.length,
  };
}

/** Every subject sheet of the arm is Published: report cards are out, remarks are locked. */
export function classResultsPublished(armId: string, termId: string) {
  const sheets = sheetsForArm(armId, termId);
  return sheets.length > 0 && sheets.every((s) => s.status === 'Published');
}

/** Why the remarks of an arm can't be changed, or null. */
export function reportCardLock(armId: string, termId: string) {
  const term = termLockReason(termId);
  if (term) return { code: 'TERM_LOCKED', reason: term };
  if (classResultsPublished(armId, termId))
    return {
      code: 'RESULTS_PUBLISHED',
      reason: `${termById(termId).name} results for this class are published, so remarks and ratings are read-only.`,
    };
  return null;
}

/** Validates and saves a student's remark and ratings. 422 with `fields` when anything is off. */
export function saveRemark(
  armId: string,
  termId: string,
  studentId: string,
  teacherId: string,
  teacherName: string,
  body: unknown,
) {
  const lock = reportCardLock(armId, termId);
  if (lock) throw new MockHttpError(409, lock.reason, lock.code);
  const input = (body ?? {}) as { remark?: unknown; ratings?: Record<string, unknown> };
  const fields: Record<string, string> = {};
  const remark = typeof input.remark === 'string' ? input.remark.trim() : '';
  if (!remark) fields.remark = 'Write a remark for this student.';
  else if (remark.length < REMARK_LIMITS.min)
    fields.remark = `Write at least ${REMARK_LIMITS.min} characters (${remark.length} so far).`;
  else if (remark.length > REMARK_LIMITS.max)
    fields.remark = `Keep the remark to ${REMARK_LIMITS.max} characters (${remark.length} now).`;
  const ratings: Partial<Record<ConductTrait, number>> = {};
  for (const trait of CONDUCT_TRAITS) {
    const v = input.ratings?.[trait];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5)
      fields[`ratings.${trait}`] = `Rate ${trait.toLowerCase()} from 1 to 5.`;
    else ratings[trait] = v;
  }
  if (Object.keys(fields).length)
    throw new MockHttpError(
      422,
      'Check the remark and give all five ratings before saving.',
      'VALIDATION',
      fields,
    );
  const existing = remarkOf(termId, studentId);
  const record: RemarkRecord = { remark, ratings, by: teacherId, updatedAt: nowLocal() };
  REMARKS.set(remarkKey(termId, studentId), record);
  logHistory(
    reportCardHistoryKey(termId, studentId),
    existing ? `Remark updated by ${teacherName}` : `Remark and ratings added by ${teacherName}`,
    CONDUCT_TRAITS.map((t) => `${t} ${ratings[t]}`).join(' · '),
    existing ? 'info' : 'success',
  );
  return record;
}

/* ---------- Seed ---------- */

const OPENERS = [
  'is a hardworking and cheerful student',
  'has shown steady improvement this term',
  'is attentive in class and participates well',
  'is respectful and relates well with classmates',
  'is a quiet but focused learner',
  'shows good leadership among peers',
];
const CLOSERS = [
  'Keep it up next term.',
  'More effort in Mathematics will help.',
  'Should read more widely to build vocabulary.',
  'Needs to be more punctual in the mornings.',
  'A pleasure to have in class.',
  'Should hand in homework on time.',
];

function seedRemarks() {
  for (const term of TERMS) {
    if (term.status === 'Upcoming') continue;
    for (const arm of ARMS.filter((a) => a.sessionId === term.sessionId && a.classTeacherId)) {
      const rng = seeded(
        [...`${term.id}${arm.id}`].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5),
      );
      const students = reportCardStudents(arm.id, term.id);
      // JSS 2B: the first 9 in register order are done, the rest missing (for the demo).
      const doneCount =
        term.status === 'Closed'
          ? students.length
          : arm.id === 'mc-jss2b'
            ? 9
            : Math.round(students.length * 0.65);
      students.forEach((s, i) => {
        if (i >= doneCount) return;
        const ratings = Object.fromEntries(CONDUCT_TRAITS.map((t) => [t, rng.int(3, 5)])) as Record<
          ConductTrait,
          number
        >;
        const at =
          term.status === 'Closed'
            ? '2026-07-16T15:00'
            : `2026-12-0${rng.int(1, 7)}T16:${String(rng.int(10, 59))}`;
        REMARKS.set(remarkKey(term.id, s.id), {
          remark: `${s.firstName} ${rng.pick(OPENERS)}. ${rng.pick(CLOSERS)}`,
          ratings,
          by: arm.classTeacherId!,
          updatedAt: at,
        });
      });
    }
  }
}

seedRemarks();
