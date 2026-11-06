import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type { ContextOptions, LoginResponse, SchoolProfile, SetupProgress } from '@/types';

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

describe('New-school onboarding', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('e.udo@crestviewcollege.ng');
  });

  it('starts guided, with the School steps open and no manual completion', async () => {
    const { data } = await api.get<SetupProgress>('/v1/setup');
    expect(data).toMatchObject({ onboarding: true, finished: false });
    for (const id of ['school-profile', 'branches', 'organogram-roles'])
      expect(step(data, id)).toMatchObject({ auto: true, done: false });
    expect(step(data, 'school-profile').to).toEqual({
      name: 'school-profile-edit',
      query: { from: 'setup' },
    });
    expect((await failure(api.post('/v1/setup/steps/school-profile/complete'))).status).toBe(409);
  });

  it('completes School Profile by saving the profile', { timeout: 15_000 }, async () => {
    const { data: p } = await api.get<SchoolProfile>('/v1/school/profile');
    await api.put('/v1/school/profile', { ...p, motto: 'Excellence in all things' });
    const { data } = await api.get<SetupProgress>('/v1/setup');
    expect(step(data, 'school-profile')).toMatchObject({ done: true });
    expect(step(data, 'school-profile').description).toContain('no logo yet');
  });

  it('checks branches before the Branches step completes', { timeout: 15_000 }, async () => {
    await api.post('/v1/branches', {
      name: 'Kubwa Annex',
      code: 'CC-KB',
      street: 'Plot 4, Arab Road',
      city: 'Kubwa',
      lga: 'Bwari',
      state: 'FCT',
      phone: '',
      email: '',
      headId: null,
      sections: ['Junior Secondary'],
      hasStore: false,
    });
    const ctx = (await api.get<ContextOptions>('/v1/context-options')).data;
    expect(ctx.branches.map((b) => b.name)).toEqual(['Main Campus', 'Kubwa Annex', 'All branches']);
    await api.post('/v1/setup/steps/branches/complete');
    const { data } = await api.get<SetupProgress>('/v1/setup');
    expect(step(data, 'branches')).toMatchObject({
      done: true,
      description: '2 branches · 2 active',
    });
  });

  it(
    'needs a real organogram before Organogram & Roles completes',
    { timeout: 15_000 },
    async () => {
      expect(
        (await failure(api.post('/v1/setup/steps/organogram-roles/complete'))).message,
      ).toContain('at least one position');
      await api.post('/v1/organogram/positions', {
        title: 'Vice Principal',
        parentId: 'principal',
        holderIds: [],
        suggestedRoles: [],
        responsibilities: '',
        approvals: [],
      });
      await api.post('/v1/setup/steps/organogram-roles/complete');
      const { data } = await api.get<SetupProgress>('/v1/setup');
      expect(step(data, 'organogram-roles').done).toBe(true);
      expect((await failure(api.post('/v1/setup/finish'))).status).toBe(409);
    },
  );
});
