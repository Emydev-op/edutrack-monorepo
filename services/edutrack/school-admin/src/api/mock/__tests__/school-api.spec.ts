import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type { DashboardSummary, LoginResponse, SetupProgress } from '@/types';

import { installMockApi } from '..';

const PASSWORD = 'Edutrack2026!';

async function signIn(email: string): Promise<AxiosInstance> {
  const client = axios.create({ baseURL: '/api' });
  installMockApi(client);
  const { data } = await client.post<LoginResponse>('/v1/auth/login', {
    email,
    password: PASSWORD,
    remember: false,
  });
  client.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
  return client;
}

async function failure(request: Promise<unknown>) {
  try {
    await request;
  } catch (e) {
    if (isAxiosError(e))
      return { status: e.response?.status, code: e.response?.data?.error as string | undefined };
  }
  throw new Error('Expected the request to fail');
}

describe('school admin mock API', () => {
  let greenfield: AxiosInstance;
  let crestview: AxiosInstance;
  beforeAll(async () => {
    greenfield = await signIn('adaeze.okonkwo@greenfield.edu.ng');
    crestview = await signIn('e.udo@crestviewcollege.ng');
  });

  it('signs in with the school attached and explains blocked accounts', async () => {
    const raw = axios.create({ baseURL: '/api' });
    installMockApi(raw);
    const { data } = await raw.post<LoginResponse>('/v1/auth/login', {
      email: 'adaeze.okonkwo@greenfield.edu.ng',
      password: PASSWORD,
    });
    expect(data.school).toMatchObject({ id: 'greenfield', name: 'Greenfield Academy' });
    expect(data.user.position).toBe('Principal');

    const login = (email: string) => raw.post('/v1/auth/login', { email, password: PASSWORD });
    expect(await failure(login('chidi.okoro@greenfield.edu.ng'))).toMatchObject({
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
    });
    expect((await failure(login('kunle.bakare@greenfield.edu.ng'))).code).toBe('PASSWORD_EXPIRED');
    expect(await failure(raw.get('/v1/dashboard'))).toMatchObject({ status: 401 });
  });

  it('pauses sign-in after five wrong passwords', { timeout: 15_000 }, async () => {
    const raw = axios.create({ baseURL: '/api' });
    installMockApi(raw);
    const wrong = () =>
      raw.post('/v1/auth/login', { email: 'tunde.ojo@greenfield.edu.ng', password: 'nope' });
    for (let i = 0; i < 4; i++) expect((await failure(wrong())).status).toBe(401);
    expect(await failure(wrong())).toMatchObject({ status: 423, code: 'ACCOUNT_LOCKED' });
  });

  it('scopes data to the signed-in school and the chosen branch', async () => {
    const main = (await greenfield.get<DashboardSummary>('/v1/dashboard')).data;
    const lekki = (
      await greenfield.get<DashboardSummary>('/v1/dashboard', {
        params: { branch: 'Lekki Campus' },
      })
    ).data;
    expect(main.metrics[0]).toMatchObject({ label: 'Students', value: '842' });
    expect(lekki.metrics[0]?.value).toBe('406');
    expect(main.attention.length).toBeGreaterThan(0);

    const empty = (await crestview.get<DashboardSummary>('/v1/dashboard')).data;
    expect(empty).toMatchObject({ hasData: false, attention: [], activity: [] });
    expect((await crestview.get('/v1/search', { params: { q: 'Adeyemi' } })).data).toEqual([]);
    expect((await greenfield.get('/v1/search', { params: { q: 'Adeyemi' } })).data).toHaveLength(4);
  });

  it('only finishes setup once every required step is done', { timeout: 20_000 }, async () => {
    const { data } = await greenfield.get<SetupProgress>('/v1/setup');
    const left = data.steps.filter((s) => s.required && !s.done);
    expect(left.map((s) => s.name)).toEqual([
      'Assessment & Grading',
      'Teacher Assignments',
      'Fees',
    ]);
    expect((await greenfield.get('/v1/nav-counts')).data.setup).toBe(3);

    expect((await failure(greenfield.post('/v1/setup/finish'))).status).toBe(409);
    // Assessment & Grading completes only once Nursery has a (descriptive) scheme.
    const assessment = (await greenfield.get('/v1/academics/assessment')).data;
    await greenfield.put('/v1/academics/assessment', {
      ...assessment,
      schemes: {
        ...assessment.schemes,
        Nursery: {
          mode: 'descriptive',
          components: [],
          scale: [],
          ratings: [
            { name: 'Secure', description: '' },
            { name: 'Developing', description: '' },
          ],
        },
      },
    });
    for (const step of left) await greenfield.post(`/v1/setup/steps/${step.id}/complete`);
    const done = (await greenfield.post<SetupProgress>('/v1/setup/finish')).data;
    expect(done.finished).toBe(true);
    expect((await greenfield.get('/v1/nav-counts')).data.setup).toBe(0);

    // Another school's setup is untouched.
    expect((await crestview.get<SetupProgress>('/v1/setup')).data.finished).toBe(false);
  });
});
