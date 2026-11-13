import { MockHttpError } from '@edutrack/web-core/mock';
import { beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type { Me, MyScope } from '@/types';

import { LESSONS, STUDENTS, TEACHING_ASSIGNMENTS } from '../school-db';
import {
  assignmentsOf,
  canTeach,
  classArmOf,
  isClassTeacher,
  isEditableTerm,
  lessonNoteReviewerFor,
  requireTeaching,
  reviewerFor,
  studentsInArm,
  studentsInArmFor,
  termLockReason,
} from '../scope';
import { failure, signIn } from './helpers';

const FIRST = 't-2627-1';

function thrown(run: () => unknown): MockHttpError {
  try {
    run();
  } catch (e) {
    return e as MockHttpError;
  }
  throw new Error('Expected it to throw');
}
const PAST = 't-2526-3';

describe('Teaching scope', () => {
  it('gives Mr. Ade his four classes on two campuses', () => {
    const mine = assignmentsOf('ade', FIRST).map((a) => `${a.armId}:${a.subject}:${a.type}`);
    expect(mine.sort()).toEqual([
      'lk-sss1a:FMT:Part-time',
      'mc-jss1a:MTH:Full-time',
      'mc-jss2b:MTH:Full-time',
      'mc-sss1a:MTH:Full-time',
    ]);
    expect(assignmentsOf('salami', FIRST)).toEqual([]);
    expect(assignmentsOf('ade', PAST).length).toBe(2);
  });

  it('refuses classes outside the teacher’s assignments with what they do teach', () => {
    expect(canTeach('ade', FIRST, 'mc-jss2b', 'MTH')).toBe(true);
    expect(canTeach('ade', FIRST, 'mc-jss3a', 'MTH')).toBe(false);
    expect(canTeach('ade', FIRST, 'mc-jss2b', 'ENG')).toBe(false);
    const error = thrown(() => requireTeaching('ade', FIRST, 'mc-jss3a', 'MTH'));
    expect(error).toBeInstanceOf(MockHttpError);
    expect(error.status).toBe(403);
    expect(error.message).toMatch(/You don’t have access to JSS 3A · Mathematics/);
    expect(error.message).toMatch(/JSS 2B \(Main\) · Mathematics/);
    expect(() => requireTeaching('ade', FIRST, 'nope', 'MTH')).toThrow(/wasn’t found/);
  });

  it('assigns every subject of every arm so class progress is complete', () => {
    const first = TEACHING_ASSIGNMENTS.filter((a) => a.termId === FIRST);
    const jss2b = first.filter((a) => a.armId === 'mc-jss2b');
    expect(jss2b.length).toBe(15);
    expect(jss2b.find((a) => a.subject === 'ENG')!.teacherId).toBe('okafor');
    expect(jss2b.find((a) => a.subject === 'BSC')!.teacherId).toBe('bello');
    expect(new Set(first.map((a) => a.id)).size).toBe(first.length);
  });

  it('respects electives: 12 of Lekki SSS 1A’s 20 take Further Maths', () => {
    expect(studentsInArmFor('lk-sss1a', 'MTH', FIRST).length).toBe(20);
    expect(studentsInArmFor('lk-sss1a', 'FMT', FIRST).length).toBe(12);
    expect(studentsInArmFor('mc-sss1a', 'FMT', FIRST)).toEqual([]);
    const crs = studentsInArmFor('mc-jss2b', 'CRS', FIRST).length;
    const irs = studentsInArmFor('mc-jss2b', 'IRS', FIRST).length;
    expect(crs + irs).toBe(14);
    expect(irs).toBe(2);
  });

  it('drops a transferred student from current lists but keeps them in history', () => {
    const left = STUDENTS.find((s) => s.status === 'Transferred')!;
    expect(left).toMatchObject({ armId: 'mc-jss2b', leftOn: '2026-11-16' });
    const current = studentsInArmFor('mc-jss2b', 'MTH', FIRST);
    expect(current.length).toBe(14);
    expect(current.some((s) => s.id === left.id)).toBe(false);
    const history = studentsInArmFor('mc-jss2b', 'MTH', FIRST, { includeLeft: true });
    expect(history.some((s) => s.id === left.id)).toBe(true);
    // Last session they were in JSS 1B with the rest of today's JSS 2B.
    expect(studentsInArmFor('p-mc-jss1b', 'MTH', PAST).map((s) => s.id)).toContain(left.id);
    expect(current.map((s) => s.name)).toContain('Favour Okeke');
  });

  it('includes a student who joined JSS 1A after the mid-term break', () => {
    const joined = STUDENTS.find((s) => s.joinedOn === '2026-11-02')!;
    const jss1a = studentsInArm('mc-jss1a', FIRST);
    expect(jss1a.length).toBe(31);
    expect(jss1a.map((s) => s.id)).toContain(joined.id);
  });

  it('knows class teachers and the term lock', () => {
    expect(classArmOf('okafor', FIRST)!.name).toBe('JSS 2B');
    expect(isClassTeacher('bello')).toBe(true);
    expect(isClassTeacher('ade')).toBe(false);
    expect(isEditableTerm(FIRST)).toBe(true);
    expect(isEditableTerm(PAST)).toBe(false);
    expect(termLockReason(PAST)).toMatch(/closed/);
    expect(termLockReason('t-2627-2')).toMatch(/hasn’t started/);
  });
});

describe('Review chain', () => {
  it('sends sheets to the HOD, or straight to the academic office', () => {
    expect(reviewerFor('ade', 'MTH')!.name).toBe('Mr. Ibrahim Bello');
    expect(reviewerFor('ade', 'FMT')!.id).toBe('bello');
    expect(reviewerFor('okafor', 'ENG')).toBeNull(); // Languages has no HOD
    expect(reviewerFor('bello', 'PHY')).toBeNull(); // never their own
    expect(reviewerFor('bello', 'BSC')).toBeNull();
  });

  it('sends lesson notes to the HOD, else the Academic Head, never themself', () => {
    expect(lessonNoteReviewerFor('ade', 'MTH')!.id).toBe('bello');
    expect(lessonNoteReviewerFor('okafor', 'ENG')!.id).toBe('eze');
    expect(lessonNoteReviewerFor('bello', 'PHY')!.id).toBe('eze');
    expect(lessonNoteReviewerFor('eze', 'ENG')).toBeNull();
  });
});

describe('Published timetable', () => {
  const first = LESSONS.filter((l) => l.termId === FIRST);

  it('places every period of every assignment without clashes', () => {
    for (const ta of TEACHING_ASSIGNMENTS.filter((a) => a.termId === FIRST))
      expect(first.filter((l) => l.assignmentId === ta.id).length).toBe(ta.periodsPerWeek);
    const teacherSlots = first.map((l) => `${l.teacherId}|${l.day}|${l.periodId}`);
    expect(new Set(teacherSlots).size).toBe(teacherSlots.length);
    // Religious Studies run side by side; nothing else shares an arm's period.
    const armSlots = first
      .filter((l) => l.subject !== 'IRS')
      .map((l) => `${l.armId}|${l.day}|${l.periodId}`);
    expect(new Set(armSlots).size).toBe(armSlots.length);
  });

  it('puts Mr. Ade’s Further Maths at Lekki on Tue/Thu afternoons, never back-to-back across campuses', () => {
    const ade = first.filter((l) => l.teacherId === 'ade');
    const fmt = ade.filter((l) => l.subject === 'FMT');
    expect(fmt.map((l) => `${l.day} ${l.periodId}`).sort()).toEqual(['Thu P7', 'Tue P7', 'Tue P8']);
    expect(fmt.every((l) => l.branchId === 'lk')).toBe(true);
    const mainOnLekkiDays = ade.filter(
      (l) => l.branchId === 'mc' && ['Tue', 'Thu'].includes(l.day),
    );
    expect(mainOnLekkiDays.every((l) => ['P1', 'P2', 'P3', 'P4'].includes(l.periodId))).toBe(true);
  });
});

describe('Shell endpoints', () => {
  let ade: AxiosInstance;
  beforeAll(async () => {
    ade = await signIn('s.ade@greenfield.edu.ng');
  });

  it('describes each demo teacher’s responsibilities', async () => {
    const { data: a } = await ade.get<Me>('/v1/me');
    expect(a).toMatchObject({ isClassTeacher: false, isReviewer: false, hasAssignments: true });
    expect(a.branches.map((b) => b.id)).toEqual(['mc', 'lk']);
    const okafor = (await (await signIn('g.okafor@greenfield.edu.ng')).get<Me>('/v1/me')).data;
    expect(okafor).toMatchObject({ isClassTeacher: true, isReviewer: false });
    expect(okafor.classArm!.name).toBe('JSS 2B');
    const bello = (await (await signIn('i.bello@greenfield.edu.ng')).get<Me>('/v1/me')).data;
    expect(bello).toMatchObject({ isClassTeacher: true, isHod: true, isReviewer: true });
    expect(bello.reviews).toEqual({ resultSheets: true, lessonNotes: true });
    const eze = (await (await signIn('c.eze@greenfield.edu.ng')).get<Me>('/v1/me')).data;
    expect(eze).toMatchObject({ isAcademicHead: true, isReviewer: true });
    expect(eze.reviews).toEqual({ resultSheets: false, lessonNotes: true });
    const salami = (await (await signIn('t.salami@greenfield.edu.ng')).get<Me>('/v1/me')).data;
    expect(salami).toMatchObject({
      hasAssignments: false,
      profileComplete: false,
      isReviewer: false,
    });
  });

  it('returns my scope for a term, and 404 for an unknown term', async () => {
    const { data } = await ade.get<MyScope>('/v1/my-scope');
    expect(data.multiCampus).toBe(true);
    expect(data.assignments.find((a) => a.subject === 'FMT')!.students).toBe(12);
    const past = await ade.get<MyScope>('/v1/my-scope', { params: { term: PAST } });
    expect(past.data.assignments.map((a) => a.armName).sort()).toEqual(['JSS 1B', 'JSS 2A']);
    expect((await failure(ade.get('/v1/my-scope', { params: { term: 'nope' } }))).status).toBe(404);
  });

  it('searches only my students and classes', async () => {
    const { data } = await ade.get<{ title: string; type: string }[]>('/v1/search', {
      params: { q: 'favour' },
    });
    expect(data.map((r) => r.title)).toEqual(['Favour Okeke']);
    const none = await ade.get<unknown[]>('/v1/search', { params: { q: 'JSS 3A' } });
    expect(none.data).toEqual([]);
  });
});
