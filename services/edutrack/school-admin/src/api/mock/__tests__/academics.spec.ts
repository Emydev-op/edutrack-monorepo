import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  AssessmentView,
  AssignmentsView,
  CalendarView,
  ClassDetail,
  ClassesView,
  ContextOptions,
  Correction,
  CurriculumView,
  LoginResponse,
  PromotionView,
  PublishCheck,
  ReportCard,
  ResultSheet,
  ResultsMatrix,
  SectionsView,
  SessionsView,
  SetupProgress,
  StudentRow,
  TimetableView,
} from '@/types';

import { installMockApi } from '..';

async function signIn(email: string): Promise<AxiosInstance> {
  const client = axios.create({ baseURL: '/api' });
  installMockApi(client);
  const { data } = await client.post<LoginResponse>('/v1/auth/login', {
    email,
    password: 'Edutrack2026!',
  });
  client.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
  return client;
}
async function failure(request: Promise<unknown>) {
  try {
    await request;
  } catch (e) {
    if (isAxiosError(e))
      return { status: e.response?.status, message: e.response?.data?.message as string };
  }
  throw new Error('Expected the request to fail');
}
const step = (s: SetupProgress, id: string) => s.steps.find((x) => x.id === id)!;
const LONG = { timeout: 30000 };

describe('Academics · established school (Greenfield)', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
  });

  it('describes academic setup steps from real data', async () => {
    const { data } = await api.get<SetupProgress>('/v1/setup');
    expect(step(data, 'classes-arms')).toMatchObject({ auto: true, done: true });
    expect(step(data, 'classes-arms').description).toMatch(/arms across/);
    expect(step(data, 'assessment-grading')).toMatchObject({ done: false });
    expect(step(data, 'assessment-grading').description).toContain('Nursery');
    expect(step(data, 'teacher-assignments').description).toMatch(/of \d+ subject slots/);
  });

  it('lists sessions with a term checklist and context from Academics', async () => {
    const { data } = await api.get<SessionsView>('/v1/academics/sessions');
    expect(data.sessions.map((s) => s.status)).toEqual(['Active', 'Closing', 'Archived']);
    expect(data.termChecklist?.canClose).toBe(false);
    const ctx = await api.get<ContextOptions>('/v1/context-options');
    expect(ctx.data.sessions[0]).toEqual({ name: '2026/2027', status: 'Active' });
  });

  it('validates new sessions and terms', LONG, async () => {
    const bad = await failure(
      api.post('/v1/academics/sessions', {
        name: '2027/2028',
        start: '2027-01-01',
        end: '2027-03-01',
        structure: '3 terms',
        termNames: ['First Term'],
        copy: [],
      }),
    );
    expect(bad.message).toMatch(/5 and 15 months|overlap/);
    const { data: created } = await api.post('/v1/academics/sessions', {
      name: '2027/2028',
      start: '2027-09-13',
      end: '2028-07-21',
      structure: '3 terms',
      termNames: ['First Term', 'Second Term', 'Third Term'],
      copy: ['calendar'],
    });
    expect(created.status).toBe('Upcoming');
    expect(created.terms).toHaveLength(3);
    const overlap = await failure(
      api.put(`/v1/academics/sessions/${created.id}/terms`, {
        terms: [
          { name: 'First Term', start: '2027-09-13', end: '2027-12-17', events: [] },
          { name: 'Second Term', start: '2027-12-01', end: '2028-03-30', events: [] },
        ],
      }),
    );
    expect(overlap.message).toMatch(/overlap/);
  });

  it('manages classes, guarding arms with students', LONG, async () => {
    const { data } = await api.get<ClassesView>('/v1/academics/classes');
    const jss2 = data.levels.find((l) => l.name === 'JSS 2' && l.branchId === 'mc')!;
    const b = jss2.arms.find((a) => a.arm === 'B')!;
    expect(b.students).toBeGreaterThan(10);
    expect(b.classTeacher).toBe('Mrs. Grace Okafor');
    expect((await failure(api.delete(`/v1/academics/classes/arms/${b.id}`))).status).toBe(409);
    const added = await api.post<ClassesView>(`/v1/academics/classes/levels/${jss2.id}/arms`, {
      capacity: 30,
      classTeacherId: null,
      room: '',
    });
    const c = added.data.levels.find((l) => l.id === jss2.id)!.arms.find((a) => a.arm === 'C')!;
    expect(c).toBeTruthy();
    // The Students section sees the new arm.
    const opts = await api.get('/v1/enrollment/options');
    expect(JSON.stringify(opts.data)).toContain('"arm":"C"');
    await api.delete(`/v1/academics/classes/arms/${c.id}`);
    const detail = await api.get<ClassDetail>(`/v1/academics/classes/${b.id}`);
    expect(detail.data.subjects.length).toBeGreaterThan(8);
    expect(detail.data.students.length).toBeGreaterThan(10);
  });

  it('serves curriculum, assignments with warnings, and timetables', LONG, async () => {
    const cur = await api.get<CurriculumView>('/v1/academics/curriculum');
    expect(cur.data.subjects.find((s) => s.code === 'MTH')?.levels).toContain('JSS 2');
    const as = await api.get<AssignmentsView>('/v1/academics/assignments', {
      params: { branch: 'Main Campus' },
    });
    expect(as.data.gaps.find((g) => g.subject === 'CHE')?.arms.length).toBeGreaterThan(0);
    expect(as.data.armsWithoutClassTeacher.map((a) => a.name)).toContain('SSS 1C');
    const sss1a = as.data.arms.find((a) => a.name === 'SSS 1A')!;
    const warn = await api.post('/v1/academics/assignments/check', {
      teacherId: 'ade',
      subject: 'CHE',
      armId: sss1a.id,
      type: 'Temporary',
    });
    expect(warn.data.map((w: { kind: string }) => w.kind)).toContain('qualification');

    const tt = await api.get<TimetableView>('/v1/academics/timetable', {
      params: { arm: 'arm-mc-jss2b', term: 't-2026-2' },
    });
    expect(tt.data.status).toBe('Draft');
    const placed = Object.keys(tt.data.grid).length;
    const need = tt.data.palette.reduce((n, p) => n + p.need, 0);
    expect(placed).toBeLessThan(need);
    const early = await failure(
      api.post('/v1/academics/timetable/review', { armId: 'arm-mc-jss2b', termId: 't-2026-2' }),
    );
    expect(early.message).toMatch(/still need/);
    const sug = await api.post<TimetableView>('/v1/academics/timetable/suggest', {
      armId: 'arm-mc-jss2b',
      termId: 't-2026-2',
      grid: tt.data.grid,
    });
    expect(Object.keys(sug.data.grid).length).toBeGreaterThan(placed);
  });

  it('enforces assessment weights and grade scales', async () => {
    const { data } = await api.get<AssessmentView>('/v1/academics/assessment');
    expect(data.missing).toEqual(['Nursery']);
    const jss = structuredClone(data.schemes['Junior Secondary']!);
    jss.components[0]!.weight = 30;
    const err = await failure(
      api.put('/v1/academics/assessment', {
        ...data,
        schemes: { ...data.schemes, 'Junior Secondary': jss },
      }),
    );
    expect(err.message).toMatch(/must total 100/);
    const nursery = {
      mode: 'descriptive',
      components: [],
      scale: [],
      ratings: [
        { name: 'Secure', description: '' },
        { name: 'Developing', description: '' },
      ],
    };
    const ok = await api.put<AssessmentView>('/v1/academics/assessment', {
      ...data,
      schemes: { ...data.schemes, Nursery: nursery },
    });
    expect(ok.data.missing).toEqual([]);
    await api.post('/v1/setup/steps/assessment-grading/complete');
    const setup = await api.get<SetupProgress>('/v1/setup');
    expect(step(setup.data, 'assessment-grading').done).toBe(true);
  });

  it(
    'reviews, approves and publishes results; corrections version report cards',
    LONG,
    async () => {
      const m = await api.get<ResultsMatrix>('/v1/academics/results', {
        params: { section: 'Junior Secondary' },
      });
      const row = m.data.rows.find((r) => r.arm === 'JSS 2B')!;
      expect(row.cells.MTH).toBe('Submitted');
      expect(row.ready).toBe(false);
      const sheet = await api.get<ResultSheet>('/v1/academics/results/sheets/arm-mc-jss2b/MTH');
      expect(sheet.data.stats.absent).toBe(1);
      expect(sheet.data.rows.length).toBeGreaterThan(10);
      await api.post('/v1/academics/results/sheets/arm-mc-jss2b/MTH/approve');
      const check = await api.get<PublishCheck>('/v1/academics/results/publish/arm-mc-jss2b');
      expect(check.data.notApproved).toEqual([]);
      expect(check.data.flags.length).toBeGreaterThan(0);
      expect(
        (
          await failure(
            api.post('/v1/academics/results/publish/arm-mc-jss2b', { acknowledged: false }),
          )
        ).message,
      ).toMatch(/Acknowledge/);
      await api.post('/v1/academics/results/publish/arm-mc-jss2b', { acknowledged: true });
      const card = await api.get<ReportCard>('/v1/academics/results/report-card/emmanuel');
      expect(card.data).toMatchObject({ published: true, version: 1 });
      expect(card.data.position).toMatch(/of \d+/);

      const corr = await api.get<Correction[]>('/v1/academics/results/corrections');
      expect(corr.data[0]).toMatchObject({ status: 'Under review', student: 'Chinedu Obiora' });
      expect(corr.data[0]!.proposed).toBeGreaterThan(corr.data[0]!.original);
      const applied = await api.post<Correction>(
        `/v1/academics/results/corrections/${corr.data[0]!.id}/approve`,
        { note: '' },
      );
      expect(applied.data.status).toBe('Applied');
    },
  );

  it('requires reasons for promotion exceptions and creates enrollments', LONG, async () => {
    const { data } = await api.get<PromotionView>('/v1/academics/promotion');
    expect(data.className).toBe('JSS 1B');
    const uche = data.students.find((s) => s.id === 'uche')!;
    expect(uche.eligible).toBe(false);
    await api.put(`/v1/academics/promotion/${data.classId}`, {
      decisions: data.students.map((s) => ({
        studentId: s.id,
        decision: s.suggestion,
        reason: '',
      })),
    });
    const err = await failure(api.post(`/v1/academics/promotion/${data.classId}/apply`));
    expect(err.message).toMatch(/reason/);
    await api.put(`/v1/academics/promotion/${data.classId}`, {
      decisions: [{ studentId: 'uche', decision: 'Promote', reason: 'Passed the re-sit' }],
    });
    const applied = await api.post(`/v1/academics/promotion/${data.classId}/apply`);
    expect(applied.data.created).toBeGreaterThan(0);
    const students = await api.get<{ data: StudentRow[] }>('/v1/students', {
      params: { search: 'Musa Garba' },
    });
    expect(students.data.data.length).toBe(1);
    const close = await api.get(`/v1/academics/sessions/s-2025/close`);
    expect(close.data.checklist.canClose).toBe(true);
  });
});

describe('Academics · new school (Crestview) via the Setup Center', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('e.udo@crestviewcollege.ng');
  });

  it('starts empty and walks the academic steps in order', LONG, async () => {
    let setup = (await api.get<SetupProgress>('/v1/setup')).data;
    expect(step(setup, 'academic-sections')).toMatchObject({ auto: true, done: false });
    expect((await failure(api.post('/v1/setup/steps/classes-arms/complete'))).message).toMatch(
      /Academic Sections/,
    );

    const sec = await api.get<SectionsView>('/v1/academics/sections');
    expect(sec.data.sections.map((s) => s.code)).toEqual(['JSS', 'SSS']);
    await api.put('/v1/academics/sections', { sections: sec.data.sections });
    await api.post('/v1/setup/steps/academic-sections/complete');

    const session = await api.post('/v1/academics/sessions', {
      name: '2026/2027',
      start: '2026-09-14',
      end: '2027-07-23',
      structure: '3 terms',
      termNames: ['First Term', 'Second Term', 'Third Term'],
      copy: [],
    });
    expect(session.data.status).toBe('Active');
    await api.put(`/v1/academics/sessions/${session.data.id}/terms`, {
      terms: session.data.terms.map(
        (t: { id: string; name: string; start: string; end: string }) => ({
          ...t,
          events: [
            { id: '', type: 'midterm', name: 'Mid-term break', start: t.start, end: t.start },
          ],
        }),
      ),
    });
    const cal = await api.get<CalendarView>('/v1/academics/calendar');
    expect(cal.data.events.some((e) => e.title === 'Mid-term break')).toBe(true);

    const classes = await api.post<ClassesView>('/v1/academics/classes/defaults');
    expect(classes.data.levels.map((l) => l.name)).toEqual([
      'JSS 1',
      'JSS 2',
      'JSS 3',
      'SSS 1',
      'SSS 2',
      'SSS 3',
    ]);
    await api.post('/v1/setup/steps/classes-arms/complete');

    const cur = await api.post<CurriculumView>('/v1/academics/subjects/defaults');
    expect(cur.data.subjects.length).toBeGreaterThan(15);
    await api.post('/v1/setup/steps/subjects-curriculum/complete');

    const assess = await api.get<AssessmentView>('/v1/academics/assessment');
    expect(assess.data.missing).toEqual(['All sections']);

    setup = (await api.get<SetupProgress>('/v1/setup')).data;
    for (const id of [
      'academic-sections',
      'academic-session',
      'terms',
      'classes-arms',
      'subjects-curriculum',
    ])
      expect(step(setup, id).done).toBe(true);
    const ctx = await api.get<ContextOptions>('/v1/context-options');
    expect(ctx.data.sessions).toEqual([{ name: '2026/2027', status: 'Active' }]);

    // Admissions now offer Crestview's real classes.
    const opts = await api.get('/v1/enrollment/options');
    expect(JSON.stringify(opts.data)).toContain('SSS 3');
  });
});
