import { beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type {
  TeachingClassDetail,
  TeachingClassList,
  TeachingLessonDetail,
  TeachingStudentDetail,
  TeachingStudentList,
  TeachingSubjectDetail,
  TeachingSubjectList,
  TeachingTimetable,
} from '@/types';

import { startSession, tokenFor } from '../accounts-db';
import { LESSONS, STUDENTS } from '../school-db';
import { client, failure, signIn } from './helpers';

const PAST = 't-2526-3';
const UPCOMING = 't-2627-2';
const LATE = STUDENTS.find((s) => s.joinedOn === '2026-11-02')!;
const LEFT = STUDENTS.find((s) => s.status === 'Transferred')!;

let ade: AxiosInstance;
let okafor: AxiosInstance;
let salami: AxiosInstance;
beforeAll(async () => {
  ade = await signIn('s.ade@greenfield.edu.ng');
  okafor = await signIn('g.okafor@greenfield.edu.ng');
  salami = await signIn('t.salami@greenfield.edu.ng');
});

describe('My classes', () => {
  it('lists Mr. Ade’s four assignments on two campuses with students, periods and role', async () => {
    const { data } = await ade.get<TeachingClassList>('/v1/teaching/classes');
    expect(data).toMatchObject({ termId: 't-2627-1', readOnly: false, multiCampus: true });
    const cards = data.classes.map((c) => `${c.armId}:${c.subject}:${c.students}:${c.role}`);
    expect(cards.sort()).toEqual([
      'lk-sss1a:FMT:12:Part-time',
      'mc-jss1a:MTH:31:Subject teacher',
      'mc-jss2b:MTH:14:Subject teacher',
      'mc-sss1a:MTH:28:Subject teacher',
    ]);
    const fmt = data.classes.find((c) => c.subject === 'FMT')!;
    expect(fmt).toMatchObject({ periodsPerWeek: 3, branchShort: 'Lekki', isClassTeacher: false });
    expect(fmt.rooms).toEqual(['Lekki · Room 6']);
  });

  it('marks the class teacher’s own arm', async () => {
    const { data } = await okafor.get<TeachingClassList>('/v1/teaching/classes');
    const jss2b = data.classes.find((c) => c.armId === 'mc-jss2b')!;
    expect(jss2b).toMatchObject({ subject: 'ENG', isClassTeacher: true });
    expect(data.classes.find((c) => c.armId === 'mc-jss2a')!.isClassTeacher).toBe(false);
    expect(data.multiCampus).toBe(false);
  });

  it('is empty for a new teacher with no assignments', async () => {
    const { data } = await salami.get<TeachingClassList>('/v1/teaching/classes');
    expect(data.classes).toEqual([]);
  });

  it('shows past-term history read-only', async () => {
    const { data } = await ade.get<TeachingClassList>('/v1/teaching/classes', {
      params: { term: PAST },
    });
    expect(data.readOnly).toBe(true);
    expect(data.lockReason).toMatch(/closed/);
    expect(data.classes.map((c) => c.armName).sort()).toEqual(['JSS 1B', 'JSS 2A']);
  });
});

describe('Class page', () => {
  it('lists Lekki Further Maths’ 12 students with the next lesson', async () => {
    const { data } = await ade.get<TeachingClassDetail>('/v1/teaching/classes/lk-sss1a/FMT');
    expect(data.students.length).toBe(12);
    expect(data.class.branchName).toBe('Lekki Campus');
    expect(data.classTeacher!.name).toBe('Mr. Victor Eke');
    expect(data.department).toEqual({ id: 'sciences', name: 'Sciences', hod: 'Mr. Ibrahim Bello' });
    // Tue P7 today, 13:00 — the demo clock is Tue 08:15.
    expect(data.nextLesson).toMatchObject({
      date: '2026-12-08',
      periodId: 'P7',
      start: '13:00',
      inProgress: false,
    });
  });

  it('includes the late joiner with the day they joined', async () => {
    const { data } = await ade.get<TeachingClassDetail>('/v1/teaching/classes/mc-jss1a/MTH');
    expect(data.students.length).toBe(31);
    const late = data.students.find((s) => s.id === LATE.id)!;
    expect(late.joinedLate).toBe('2026-11-02');
    expect(data.students.filter((s) => s.joinedLate).length).toBe(1);
  });

  it('leaves the transferred student out of the current term', async () => {
    const { data } = await ade.get<TeachingClassDetail>('/v1/teaching/classes/mc-jss2b/MTH');
    expect(data.students.length).toBe(14);
    expect(data.students.some((s) => s.id === LEFT.id)).toBe(false);
    // Mr. Ade is mid-lesson with JSS 2B (P1, 08:00–08:40).
    expect(data.nextLesson).toMatchObject({ periodId: 'P1', inProgress: true });
  });

  it('refuses classes outside the assignments, and 404s unknown ones', async () => {
    const denied = await failure(ade.get('/v1/teaching/classes/mc-jss3a/MTH'));
    expect(denied.status).toBe(403);
    expect(denied.message).toMatch(/You don’t have access to JSS 3A · Mathematics\. You teach/);
    expect((await failure(ade.get('/v1/teaching/classes/mc-jss2b/ENG'))).status).toBe(403);
    expect((await failure(ade.get('/v1/teaching/classes/nope/MTH'))).status).toBe(404);
    expect((await failure(salami.get('/v1/teaching/classes/mc-jss2b/MTH'))).message).toMatch(
      /no classes assigned/,
    );
  });

  it('opens past-term classes only with that term selected, with no next lesson', async () => {
    expect((await failure(ade.get('/v1/teaching/classes/p-mc-jss1b/MTH'))).status).toBe(403);
    const { data } = await ade.get<TeachingClassDetail>('/v1/teaching/classes/p-mc-jss1b/MTH', {
      params: { term: PAST },
    });
    expect(data.readOnly).toBe(true);
    expect(data.nextLesson).toBeNull();
    expect(data.students.some((s) => s.id === LEFT.id)).toBe(true);
  });
});

describe('My subjects', () => {
  it('groups classes by subject with department and HOD', async () => {
    const { data } = await ade.get<TeachingSubjectList>('/v1/teaching/subjects');
    const mth = data.subjects.find((s) => s.code === 'MTH')!;
    expect(mth.classes.map((c) => c.armName)).toEqual(['JSS 1A', 'JSS 2B', 'SSS 1A']);
    expect(mth).toMatchObject({ students: 31 + 14 + 28, periodsPerWeek: 15 });
    expect(mth.department.hod).toBe('Mr. Ibrahim Bello');
    const okaforSubjects = (await okafor.get<TeachingSubjectList>('/v1/teaching/subjects')).data;
    expect(okaforSubjects.subjects[0]!.department).toMatchObject({ name: 'Languages', hod: null });
  });

  it('returns the school’s scheme read-only per section, and 403s other subjects', async () => {
    const { data } = await ade.get<TeachingSubjectDetail>('/v1/teaching/subjects/MTH');
    expect(data.schemes.map((s) => `${s.section}:${s.scaleName}`)).toEqual([
      'JSS:A–F',
      'SSS:WAEC (A1–F9)',
    ]);
    expect(data.schemes[0]!.components.map((c) => c.weight)).toEqual([20, 20, 60]);
    const denied = await failure(ade.get('/v1/teaching/subjects/ENG'));
    expect(denied.status).toBe(403);
    expect(denied.message).toMatch(/English Language/);
    expect((await failure(ade.get('/v1/teaching/subjects/XYZ'))).status).toBe(404);
  });
});

describe('Students', () => {
  it('lists everyone I teach once, with all my subjects for them', async () => {
    const { data } = await ade.get<TeachingStudentList>('/v1/teaching/students', {
      params: { pageSize: 100 },
    });
    // JSS 1A 31 + JSS 2B 14 + SSS 1A (Main) 28 + Lekki SSS 1A Further Maths 12.
    expect(data.meta.total).toBe(85);
    expect(new Set(data.data.map((r) => r.id)).size).toBe(85);
    expect(data.data.some((r) => r.id === LEFT.id)).toBe(false);
  });

  it('shows a student taught two subjects once, with both', async () => {
    // Mrs. Adeleke teaches Basic Technology and Computer Studies to every JSS arm at Main.
    // Her password has expired, so use a session token instead of signing in.
    const adeleke = client();
    adeleke.defaults.headers.common.Authorization = `Bearer ${tokenFor('adeleke', startSession('adeleke'))}`;
    const { data } = await adeleke.get<TeachingStudentList>('/v1/teaching/students', {
      params: { class: 'mc-jss2b', pageSize: 50 },
    });
    expect(data.meta.total).toBe(14);
    expect(new Set(data.data.map((r) => r.id)).size).toBe(14);
    expect(data.data.every((r) => r.subjects.map((x) => x.code).join() === 'BTE,CMP')).toBe(true);
    const cmp = await adeleke.get<TeachingStudentList>('/v1/teaching/students', {
      params: { subject: 'CMP', class: 'mc-jss2b' },
    });
    expect(cmp.data.meta.total).toBe(14);
  });

  it('filters by class, subject and search, and paginates', async () => {
    const byClass = await ade.get<TeachingStudentList>('/v1/teaching/students', {
      params: { class: 'mc-jss2b' },
    });
    expect(byClass.data.meta).toMatchObject({ total: 14, page: 1, pageSize: 10, totalPages: 2 });
    const bySubject = await ade.get<TeachingStudentList>('/v1/teaching/students', {
      params: { subject: 'FMT' },
    });
    expect(bySubject.data.meta.total).toBe(12);
    expect(bySubject.data.data.every((r) => r.subjects.map((s) => s.code).includes('FMT'))).toBe(
      true,
    );
    const search = await ade.get<TeachingStudentList>('/v1/teaching/students', {
      params: { q: 'favour' },
    });
    expect(search.data.data.map((r) => r.name)).toEqual(['Favour Okeke']);
    const byAdmission = await ade.get<TeachingStudentList>('/v1/teaching/students', {
      params: { q: LATE.admissionNo },
    });
    expect(byAdmission.data.data).toMatchObject([{ id: LATE.id, joinedLate: '2026-11-02' }]);
    const page2 = await ade.get<TeachingStudentList>('/v1/teaching/students', {
      params: { class: 'mc-jss2b', page: 2 },
    });
    expect(page2.data.data.length).toBe(4);
  });

  it('opens a student in scope with my subjects, never fees or guardians', async () => {
    const favour = STUDENTS.find((s) => s.name === 'Favour Okeke')!;
    const { data } = await ade.get<TeachingStudentDetail>(`/v1/teaching/students/${favour.id}`);
    expect(data).toMatchObject({
      armName: 'JSS 2B',
      classTeacher: { name: 'Mrs. Grace Okafor' },
      isMyClassStudent: false,
      mySubjects: [{ code: 'MTH', name: 'Mathematics', armId: 'mc-jss2b' }],
    });
    expect(Object.keys(data)).not.toEqual(expect.arrayContaining(['guardians']));
    expect(JSON.stringify(data)).not.toMatch(/fee|guardian|balance/i);
  });

  it('refuses out-of-scope students and keeps past-term students to that term', async () => {
    const jss3a = STUDENTS.find((s) => s.armId === 'mc-jss3a')!;
    const denied = await failure(ade.get(`/v1/teaching/students/${jss3a.id}`));
    expect(denied.status).toBe(403);
    expect(denied.message).toMatch(/You don’t have access to/);
    // The transferred student: not Mr. Ade's this term, but his in Third Term (JSS 1B).
    expect((await failure(ade.get(`/v1/teaching/students/${LEFT.id}`))).status).toBe(403);
    const past = await ade.get<TeachingStudentDetail>(`/v1/teaching/students/${LEFT.id}`, {
      params: { term: PAST },
    });
    expect(past.data).toMatchObject({ armName: 'JSS 1B', readOnly: true, status: 'Active' });
    expect((await failure(ade.get('/v1/teaching/students/nope'))).status).toBe(404);
  });
});

describe('Timetable', () => {
  it('computes Done / Now / Next / Later from the demo clock (Tue 08:15)', async () => {
    const { data } = await ade.get<TeachingTimetable>('/v1/teaching/timetable');
    expect(data).toMatchObject({ published: true, todayDay: 'Tue', today: '2026-12-08' });
    expect(data.lessons.length).toBe(5 + 5 + 5 + 3);
    expect(data.todayLessons.map((l) => `${l.periodId} ${l.armName} ${l.status}`)).toEqual([
      'P1 JSS 2B Now',
      'P2 JSS 1A Next',
      'P3 SSS 1A Later',
      'P7 SSS 1A Later',
      'P8 SSS 1A Later',
    ]);
    expect(data.todayLessons[data.todayLessons.length - 1]!.branchShort).toBe('Lekki');
    expect(data.periods.filter((p) => p.isBreak).map((p) => p.label)).toEqual(['Break', 'Lunch']);
  });

  it('is read-only with no "today" for a past term, and unpublished for the upcoming one', async () => {
    const past = (
      await ade.get<TeachingTimetable>('/v1/teaching/timetable', { params: { term: PAST } })
    ).data;
    expect(past).toMatchObject({ readOnly: true, published: true, todayDay: null });
    expect(past.todayLessons).toEqual([]);
    expect(past.lessons.length).toBeGreaterThan(0);
    const next = (
      await ade.get<TeachingTimetable>('/v1/teaching/timetable', { params: { term: UPCOMING } })
    ).data;
    expect(next).toMatchObject({ published: false, lessons: [], todayLessons: [] });
    const none = (await salami.get<TeachingTimetable>('/v1/teaching/timetable')).data;
    expect(none.lessons).toEqual([]);
  });

  it('opens my lesson with its next occurrence, and 403s someone else’s', async () => {
    const mine = LESSONS.find(
      (l) =>
        l.teacherId === 'ade' && l.termId === 't-2627-1' && l.subject === 'FMT' && l.day === 'Thu',
    )!;
    const { data } = await ade.get<TeachingLessonDetail>(`/v1/teaching/lessons/${mine.id}`);
    expect(data).toMatchObject({
      students: 12,
      lesson: { armName: 'SSS 1A', branchName: 'Lekki Campus', start: '13:00' },
      next: { date: '2026-12-10', periodId: 'P7' },
    });
    const theirs = LESSONS.find((l) => l.teacherId === 'okafor' && l.termId === 't-2627-1')!;
    const denied = await failure(ade.get(`/v1/teaching/lessons/${theirs.id}`));
    expect(denied.status).toBe(403);
    expect(denied.message).toMatch(/You don’t have access to .* English Language/);
    expect((await failure(ade.get('/v1/teaching/lessons/nope'))).status).toBe(404);
  });
});

describe('Class page results and lesson links', () => {
  it('shows the sheet on the class card and its figures on the overview', async () => {
    const { data: list } = await ade.get<TeachingClassList>('/v1/teaching/classes');
    const card = list.classes.find((c) => c.armId === 'mc-jss1a')!;
    expect(card.sheet).toEqual({
      id: 'rs-t-2627-1-mc-jss1a-MTH',
      status: 'Submitted',
      withHod: true,
    });
    const { data } = await ade.get<TeachingClassDetail>('/v1/teaching/classes/mc-jss2b/MTH');
    const res = data.results!;
    expect(res.sheet).toMatchObject({ status: 'Draft', arm: 'JSS 2B' });
    expect(res.passMark).toBe(40);
    expect(res.needsSupport.length).toBeLessThanOrEqual(2);
    expect(res.needsSupport.every((s) => s.total !== null && s.total < 40)).toBe(true);
    // Daniel Musa's exam is marked ABS on the seed sheet.
    expect(res.absentFromExam.map((s) => s.name)).toContain('Daniel Musa');
    expect(data.students.map((s) => s.id)).toContain(res.highest?.studentId);
    expect(res.highest?.total).toBeGreaterThanOrEqual(40);
  });

  it('links the lesson to the open assignment and the latest material', async () => {
    const lesson = LESSONS.find(
      (l) => l.teacherId === 'ade' && l.armId === 'mc-jss2b' && l.termId === 't-2627-1',
    )!;
    const { data } = await ade.get<TeachingLessonDetail>(`/v1/teaching/lessons/${lesson.id}`);
    expect(data.openAssignment).toMatchObject({
      title: 'Algebraic expressions',
      dueAt: '2026-12-10T16:00',
    });
    expect(data.latestMaterial === null || typeof data.latestMaterial.title === 'string').toBe(
      true,
    );
  });
});

describe('Student page scope', () => {
  const jss2b = () => STUDENTS.find((s) => s.armId === 'mc-jss2b' && s.status !== 'Transferred')!;

  it('shows only my subjects’ scores and results, never another teacher’s', async () => {
    const s = jss2b();
    const { data } = await ade.get<TeachingStudentDetail>(`/v1/teaching/students/${s.id}`);
    expect(data.scores.map((x) => x.subject)).toEqual(['MTH']);
    expect(data.results.map((x) => x.subject)).toEqual(['MTH']);
    // The Draft sheet gives no total yet.
    expect(data.results[0]).toMatchObject({ status: 'Draft', total: null, grade: null });
    expect(data.scores[0]!.components.map((c) => c.key)).toEqual(['CA1', 'CA2', 'EXAM']);
    expect(data.pastResults.every((t) => t.results.every((r) => r.subject === 'MTH'))).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/"(ENG|BSC|FRE|YOR)"/);

    // Mrs. Okafor is their class teacher and English teacher: English only.
    const o = (await okafor.get<TeachingStudentDetail>(`/v1/teaching/students/${s.id}`)).data;
    expect(o.scores.map((x) => x.subject)).toEqual(['ENG']);
    expect(o.results.map((x) => x.subject)).toEqual(['ENG']);
  });

  it('gives totals only once a sheet is Approved or Published', async () => {
    const bello = await signIn('i.bello@greenfield.edu.ng');
    const s = jss2b();
    const { data } = await bello.get<TeachingStudentDetail>(`/v1/teaching/students/${s.id}`);
    const bsc = data.results.find((x) => x.subject === 'BSC')!;
    expect(bsc.status).toBe('Approved');
    expect(bsc.total).not.toBeNull();
    expect(bsc.grade).not.toBeNull();
  });

  it('includes the term’s attendance from the register', async () => {
    const s = jss2b();
    const { data } = await ade.get<TeachingStudentDetail>(`/v1/teaching/students/${s.id}`);
    expect(data.attendance.schoolDays).toBeGreaterThan(50);
    expect(data.attendance.present).toBeGreaterThan(0);
    expect(data.attendance.percent).not.toBeNull();
  });
});
