import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  LoginResponse,
  ReportCatalog,
  ReportView,
  ResultsMatrix,
  SchoolReport,
  StaffList,
  TeacherRow,
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
const LONG = { timeout: 30000 };

describe('Reports · Greenfield', () => {
  let api: AxiosInstance;
  const report = async (id: string, params: Record<string, string> = {}) =>
    (
      await api.get<SchoolReport>(`/v1/reports/${id}`, {
        params: { branch: 'Main Campus', session: '2026/2027', ...params },
      })
    ).data;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
  });

  it('lists every report in its group', async () => {
    const { data } = await api.get<ReportCatalog>('/v1/reports');
    expect(data.groups.map((g) => g.name)).toEqual([
      'Academic',
      'Students',
      'Staff',
      'Financial',
      'Communication',
    ]);
    const ids = data.groups.flatMap((g) => g.reports.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('collection');
  });

  it('summarises Delivery Logs per event and channel', LONG, async () => {
    const r = await report('message-delivery', { from: '2026-01-01' });
    expect(r.rows.length).toBeGreaterThan(0);
    const t = r.totals!;
    // Every recipient is delivered, pending or failed; the reach rate follows from those counts.
    expect(Number(t.delivered) + Number(t.pending) + Number(t.failed)).toBe(t.sent);
    expect(t.rate).toBe(Math.round((Number(t.delivered) / Number(t.sent)) * 100));
    await expect(
      report('message-delivery', { from: '2026-12-31', to: '2026-01-01' }),
    ).rejects.toThrow('The start date is after the end date.');
  });

  it('shows the same collection figures as Finance → Reports', LONG, async () => {
    const mine = await report('collection');
    const fin = (
      await api.get<ReportView>('/v1/finance/reports/collection', {
        params: { branch: 'Main Campus', term: mine.filters[0]!.value },
      })
    ).data;
    expect(mine.totals).toEqual(fin.totals);
    expect(mine.rows.map((r) => r.cells)).toEqual(fin.rows);
    expect(mine.blocked).toBeNull();
  });

  it('links outstanding balances to each student’s account', LONG, async () => {
    const r = await report('outstanding');
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.to)).toBe(true);
    const total = r.rows.reduce((n, x) => n + (x.cells.total as number), 0);
    expect(total).toBe(r.totals!.total);
  });

  it('counts the whole active roll by class and gender', LONG, async () => {
    const r = await report('enrollment');
    const total = r.totals!.total as number;
    expect(total).toBeGreaterThan(800);
    expect((r.totals!.male as number) + (r.totals!.female as number)).toBe(total);
    const sum = r.rows.reduce((n, x) => n + (x.cells.total as number), 0);
    expect(sum).toBe(total);
    // Admitted students not yet placed in an arm get their own row.
    expect(r.rows.some((x) => x.cells.class === 'Not placed in a class')).toBe(true);
    const jss = await report('enrollment', { section: 'Junior Secondary' });
    expect(
      jss.rows.every((x) => ['Junior Secondary', ''].includes(x.cells.section as string)),
    ).toBe(true);
    expect(jss.totals!.total).toBeLessThan(total);
  });

  it('matches the Results screen’s sheet counts', LONG, async () => {
    const matrix = (
      await api.get<ResultsMatrix>('/v1/academics/results', {
        params: { branch: 'Main Campus', section: 'Junior Secondary' },
      })
    ).data;
    const r = await report('result-completion', { section: 'Junior Secondary' });
    for (const [status, n] of Object.entries(matrix.counts)) expect(r.totals![status]).toBe(n);
  });

  it('averages approved sheets per subject and splits grades by class', LONG, async () => {
    const subj = await report('subject-performance');
    for (const row of subj.rows) {
      const avg = row.cells.average as number;
      expect(avg).toBeGreaterThanOrEqual(0);
      expect(avg).toBeLessThanOrEqual(100);
      expect(row.cells.lowest as number).toBeLessThanOrEqual(row.cells.highest as number);
    }
    const grades = await report('grade-distribution', { section: 'Junior Secondary' });
    const gradeKeys = grades.columns.slice(2, -1).map((c) => c.key);
    for (const row of grades.rows) {
      const n = gradeKeys.reduce((s, k) => s + (row.cells[k] as number), 0);
      expect(n).toBe(row.cells.results);
    }
  });

  it('agrees with the Staff directory and Teachers lists', async () => {
    const staff = (await api.get<StaffList>('/v1/staff')).data;
    const r = await report('staff', { branch: 'All branches' });
    expect(r.totals?.total).toBe(staff.total);
    const teachers = (await api.get<TeacherRow[]>('/v1/staff/teachers')).data;
    const w = await report('teacher-workload', { branch: 'All branches' });
    expect(w.rows).toHaveLength(teachers.length);
    const none = await report('teacher-workload', {
      branch: 'All branches',
      status: 'No assignments',
    });
    expect(none.rows.every((x) => x.cells.load === 'No assignments')).toBe(true);
  });

  it('filters payments by status and period, and rejects bad dates', LONG, async () => {
    const confirmed = await report('payments');
    expect(confirmed.filters.find((f) => f.key === 'status')?.value).toBe('Confirmed');
    const shares = confirmed.rows.reduce((n, x) => n + (x.cells.amount as number), 0);
    expect(shares).toBe(confirmed.totals?.amount ?? 0);
    expect(
      await failure(api.get('/v1/reports/payments', { params: { from: '2026-13-40' } })),
    ).toMatchObject({ status: 422 });
    expect(
      await failure(
        api.get('/v1/reports/payments', { params: { from: '2026-10-10', to: '2026-10-01' } }),
      ),
    ).toMatchObject({ status: 422, message: 'The start date is after the end date.' });
  });

  it('lists students who left and graduated classes', async () => {
    const r = await report('movements', { branch: 'All branches' });
    expect(r.rows.some((x) => x.cells.type === 'Transferred')).toBe(true);
    const t = await report('movements', { branch: 'All branches', status: 'Transferred' });
    expect(t.rows.every((x) => x.cells.type === 'Transferred')).toBe(true);
  });

  it('answers 404 for a report that doesn’t exist', async () => {
    expect((await failure(api.get('/v1/reports/nope'))).status).toBe(404);
  });
});

describe('Reports · a new school', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('e.udo@crestviewcollege.ng');
  });

  it('explains what to set up first instead of failing', async () => {
    const r = (await api.get<SchoolReport>('/v1/reports/result-completion')).data;
    expect(r.blocked?.title).toBe('No academic session yet');
    const fin = (await api.get<SchoolReport>('/v1/reports/collection')).data;
    expect(fin.blocked).not.toBeNull();
    const roll = (await api.get<SchoolReport>('/v1/reports/enrollment')).data;
    expect(roll.blocked).toBeNull();
    expect(roll.rows).toHaveLength(0);
  });
});
