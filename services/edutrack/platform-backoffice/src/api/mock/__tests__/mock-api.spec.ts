import axios, { isAxiosError } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import { installMockApi } from '..';

const api = axios.create({ baseURL: '/api' });

async function errorOf(request: Promise<unknown>) {
  try {
    await request;
  } catch (error) {
    if (isAxiosError(error))
      return {
        status: error.response?.status,
        code: error.response?.data?.error,
        message: error.response?.data?.message,
      };
  }
  throw new Error('Expected the request to fail');
}

describe('mock platform API', () => {
  beforeAll(() => installMockApi(api));

  it('signs in with the demo account and refuses blocked accounts with a reason code', async () => {
    const { data } = await api.post('/v1/auth/login', {
      email: 'tolu@edutrack.ng',
      password: 'Edutrack2026!',
      remember: true,
    });
    expect(data.user.roleName).toBe('Platform Administrator');

    expect(
      await errorOf(api.post('/v1/auth/login', { email: 'kemi@edutrack.ng', password: 'x' })),
    ).toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' });
    expect(
      await errorOf(api.post('/v1/auth/login', { email: 'tolu@edutrack.ng', password: 'wrong' })),
    ).toMatchObject({ status: 401 });
  });

  it('filters and paginates schools', async () => {
    const { data } = await api.get('/v1/schools', { params: { status: 'Onboarding' } });
    expect(data.data.every((s: { status: string }) => s.status === 'Onboarding')).toBe(true);
    expect(data.meta).toMatchObject({ page: 1, total: data.data.length });
  });

  it('records a suspension in the activity feed and audit log', async () => {
    await api.post('/v1/schools/kings/suspend', { reason: 'Proprietor request' });
    const { data: school } = await api.get('/v1/schools/kings');
    expect(school.status).toBe('Suspended');

    const { data: audit } = await api.get('/v1/audit', { params: { search: 'kings' } });
    expect(audit.data[0]).toMatchObject({
      action: 'school.suspend',
      previousValue: 'Active',
      newValue: 'Suspended',
    });

    await api.post('/v1/schools/kings/reactivate');
    expect((await api.get('/v1/schools/kings')).data.status).toBe('Active');
  });

  it('provisions a school with several administrators, one of them school-wide', async () => {
    const admins = [
      {
        name: 'Osegbo Emeka',
        email: 'e.osegbo@crestview.ng',
        phone: '',
        position: 'Principal',
        scope: 'All branches',
      },
      {
        name: 'Ada Bello',
        email: 'a.bello@crestview.ng',
        phone: '',
        position: 'Head Teacher',
        scope: 'Lekki Campus',
      },
    ];
    const base = {
      name: 'Crestview College',
      ownership: 'Private',
      state: 'Lagos',
      lga: 'Eti Osa',
      sections: ['Primary'],
      branches: [{ name: 'Main Campus' }, { name: 'Lekki Campus' }],
      plan: 'Growth',
    };

    expect(await errorOf(api.post('/v1/schools', { ...base, admins, lga: 'Bwari' }))).toMatchObject(
      {
        status: 422,
        message: 'Bwari isn’t an LGA in Lagos',
      },
    );

    const noSchoolWide = await errorOf(
      api.post('/v1/schools', { ...base, admins: [{ ...admins[1] }] }),
    );
    expect(noSchoolWide).toMatchObject({
      status: 422,
      message: 'At least one administrator must manage all branches',
    });

    const { data: school } = await api.post('/v1/schools', { ...base, admins });
    const { data: invited } = await api.get(`/v1/schools/${school.id}/administrators`);
    expect(invited.map((a: { email: string; scope: string }) => `${a.email}:${a.scope}`)).toEqual([
      'e.osegbo@crestview.ng:All branches',
      'a.bello@crestview.ng:Lekki Campus',
    ]);
  });

  it('rejects provisioning a duplicate school name', async () => {
    const error = await errorOf(
      api.post('/v1/schools', {
        name: 'Greenfield Academy',
        admins: [{ email: 'a@b.ng', scope: 'All branches' }],
      }),
    );
    expect(error).toMatchObject({ status: 409, message: 'A school with this name already exists' });
  });

  it('creates, edits, publishes, archives and deletes plans, enforcing module requirements', async () => {
    const definition = {
      name: 'Campus Plus',
      description: '',
      pricing: { model: 'flat', prices: { annual: 900_000 } },
      trialDays: 14,
      setupFee: 0,
      limits: { students: 800, branches: 2, users: 40, storage: 20 },
      smsCreditsPerTerm: 0,
      modules: ['timetable'],
      support: 'Standard',
    };
    expect(await errorOf(api.post('/v1/plans', { ...definition, status: 'Draft' }))).toMatchObject({
      status: 422,
      message: expect.stringContaining('Timetable needs'),
    });
    expect(await errorOf(api.post('/v1/plans', { ...definition, name: 'growth' }))).toMatchObject({
      status: 409,
    });

    const modules = ['subjects', 'assign', 'timetable'];
    const { data: draft } = await api.post('/v1/plans', {
      ...definition,
      modules,
      status: 'Draft',
    });
    expect(draft).toMatchObject({ id: 'campus-plus', status: 'Draft', version: 1 });
    expect(draft.modules).toEqual(expect.arrayContaining(['profile', 'students', 'timetable']));

    const { data: edited } = await api.patch(`/v1/plans/${draft.id}`, {
      ...draft,
      limits: { ...draft.limits, students: null },
    });
    expect(edited).toMatchObject({ version: 2, limits: { students: null } });
    expect(edited.history[0].summary).toBe('Students changed');

    await api.post(`/v1/plans/${draft.id}/status`, { status: 'Active' });
    expect(await errorOf(api.delete(`/v1/plans/${draft.id}`))).toMatchObject({ status: 409 });
    const { data: archived } = await api.post(`/v1/plans/${draft.id}/status`, {
      status: 'Archived',
    });
    expect(archived.history.map((h: { summary: string }) => h.summary)).toEqual([
      'Archived',
      'Published',
      'Students changed',
      'Created as draft',
    ]);

    const { data: second } = await api.post('/v1/plans', {
      ...definition,
      name: 'Scratch',
      modules,
      status: 'Draft',
    });
    await api.delete(`/v1/plans/${second.id}`);
    expect(await errorOf(api.get(`/v1/plans/${second.id}`))).toMatchObject({ status: 404 });
  });
});
