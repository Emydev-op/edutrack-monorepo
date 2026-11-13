import { beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type { AssessmentDetail, AssessmentsList, ScheduleOptions } from '@/types';

import { failure, signIn } from './helpers';

const fieldsOf = async (request: Promise<unknown>) =>
  (await request.then(
    () => {
      throw new Error('Expected the request to fail');
    },
    (e) => e.response,
  )) as { status: number; data: { fields?: Record<string, string>; message: string } };

describe('Assessments', () => {
  let ade: AxiosInstance;
  beforeAll(async () => {
    ade = await signIn('s.ade@greenfield.edu.ng');
  });

  it('shows the school scheme (read-only) and my scheduled components', async () => {
    const { data } = await ade.get<AssessmentsList>('/v1/assessments');
    expect(data.editable).toBe(true);
    expect(data.schemes.map((s) => s.section)).toEqual(['JSS', 'SSS']);
    expect(data.schemes[0]!.components.map((c) => `${c.name} ${c.max} ${c.weight}%`)).toEqual([
      'CA 1 20 20%',
      'CA 2 20 20%',
      'Examination 100 60%',
    ]);
    // 4 classes × 3 components, less CA 2 for JSS 1A and Lekki Further Maths.
    expect(data.rows).toHaveLength(10);
    const jss2b = data.rows.filter((r) => r.armId === 'mc-jss2b');
    expect(jss2b.map((r) => r.componentKey).sort()).toEqual(['CA1', 'CA2', 'EXAM']);
    const ca2 = jss2b.find((r) => r.componentKey === 'CA2')!;
    // Blessing Etim's CA 2 is still blank.
    expect(ca2).toMatchObject({ status: 'Done', students: 14, scored: 13, missing: 1 });
    expect(jss2b.find((r) => r.componentKey === 'CA1')).toMatchObject({ exempt: 1 });
    expect(jss2b.find((r) => r.componentKey === 'EXAM')).toMatchObject({ absent: 1 });
    const filtered = await ade.get<AssessmentsList>('/v1/assessments', {
      params: { class: 'mc-jss1a', subject: 'MTH' },
    });
    expect(filtered.data.rows.map((r) => r.componentKey).sort()).toEqual(['CA1', 'EXAM']);
  });

  it('offers only components not yet scheduled for each class', async () => {
    const { data } = await ade.get<ScheduleOptions>('/v1/assessments/options');
    const jss1a = data.classes.find((c) => c.armId === 'mc-jss1a')!;
    expect(jss1a.available.map((c) => c.key)).toEqual(['CA2']);
    expect(data.classes.find((c) => c.armId === 'mc-jss2b')!.available).toEqual([]);
    expect(data).toMatchObject({
      termStart: '2026-09-14',
      termEnd: '2026-12-18',
      today: '2026-12-08',
    });
  });

  it('enforces the date rules', async () => {
    const base = {
      armId: 'mc-jss1a',
      subject: 'MTH',
      componentKey: 'CA2',
      topics: 'Simultaneous equations and inequalities',
    };
    const past = await fieldsOf(ade.post('/v1/assessments', { ...base, date: '2026-12-07' }));
    expect(past.status).toBe(422);
    expect(past.data.fields!.date).toMatch(/today/);
    const after = await fieldsOf(ade.post('/v1/assessments', { ...base, date: '2027-01-14' }));
    expect(after.data.fields!.date).toMatch(/inside First Term/);
    const weekend = await fieldsOf(ade.post('/v1/assessments', { ...base, date: '2026-12-12' }));
    expect(weekend.data.fields!.date).toBe('There are no classes on 12 Dec 2026 (Weekend).');
    const blank = await fieldsOf(ade.post('/v1/assessments', { ...base, date: '' }));
    expect(blank.data.fields!.date).toBe('Choose a date.');
    const topics = await fieldsOf(
      ade.post('/v1/assessments', { ...base, date: '2026-12-10', topics: '' }),
    );
    expect(topics.data.fields!.topics).toBeTruthy();
  });

  it('schedules a component once per class per term', async () => {
    const body = {
      armId: 'mc-jss1a',
      subject: 'MTH',
      componentKey: 'CA2',
      date: '2026-12-10',
      topics: 'Simultaneous equations and inequalities',
      instructions: 'Bring a calculator.',
    };
    const { data } = await ade.post<AssessmentDetail>('/v1/assessments', body);
    expect(data).toMatchObject({ status: 'Scheduled', component: 'CA 2', canReschedule: true });
    expect(data.history[0]!.title).toBe('Scheduled by Mr. Samuel Ade');
    const dup = await failure(ade.post('/v1/assessments', body));
    expect(dup).toMatchObject({ status: 409, code: 'DUPLICATE' });
    expect(dup.message).toMatch(/already scheduled for JSS 1A · Mathematics on 10 Dec 2026/);
    const again = await failure(
      ade.post('/v1/assessments', { ...body, armId: 'mc-jss2b', componentKey: 'CA1' }),
    );
    expect(again.status).toBe(409);
    const options = await ade.get<ScheduleOptions>('/v1/assessments/options');
    expect(options.data.classes.find((c) => c.armId === 'mc-jss1a')!.available).toEqual([]);
  });

  it('only schedules for my own classes, and only in the active term', async () => {
    const notMine = await failure(
      ade.post('/v1/assessments', {
        armId: 'mc-jss2b',
        subject: 'ENG',
        componentKey: 'CA1',
        date: '2026-12-10',
        topics: 'Comprehension',
      }),
    );
    expect(notMine.status).toBe(403);
    const past = await failure(
      ade.post(
        '/v1/assessments',
        {
          armId: 'p-mc-jss1b',
          subject: 'MTH',
          componentKey: 'CA1',
          date: '2026-07-01',
          topics: 'x',
        },
        { params: { term: 't-2526-3' } },
      ),
    );
    expect(past).toMatchObject({ status: 409, code: 'TERM_LOCKED' });
  });

  it('reschedules upcoming assessments, not ones already taken', async () => {
    const { data: list } = await ade.get<AssessmentsList>('/v1/assessments');
    const upcoming = list.rows.find((r) => r.status === 'Scheduled')!;
    const { data } = await ade.patch<AssessmentDetail>(`/v1/assessments/${upcoming.id}`, {
      date: '2026-12-09',
      topics: upcoming.topics,
    });
    expect(data.date).toBe('2026-12-09');
    expect(data.history[0]).toMatchObject({
      title: 'Rescheduled by Mr. Samuel Ade',
      detail: '10 Dec 2026 → 9 Dec 2026 · students notified',
    });
    const weekend = await fieldsOf(
      ade.patch(`/v1/assessments/${upcoming.id}`, { date: '2026-12-13', topics: 'x y z' }),
    );
    expect(weekend.status).toBe(422);
    const taken = list.rows.find((r) => r.status !== 'Scheduled')!;
    const res = await failure(
      ade.patch(`/v1/assessments/${taken.id}`, { date: '2026-12-10', topics: taken.topics }),
    );
    expect(res.status).toBe(409);
    const okafor = await signIn('g.okafor@greenfield.edu.ng');
    expect((await failure(okafor.get(`/v1/assessments/${upcoming.id}`))).status).toBe(403);
  });
});
