import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  BranchDetail,
  BranchList,
  LoginResponse,
  Organogram,
  Role,
  SchoolProfile,
  SchoolUserRow,
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

const branchBody = (over: object = {}) => ({
  name: 'Ikoyi Campus',
  code: 'GFA-IK',
  street: '3 Bourdillon Road',
  city: 'Ikoyi',
  lga: 'Eti Osa',
  state: 'Lagos',
  phone: '',
  email: '',
  headId: 'eze',
  sections: ['Primary'],
  hasStore: true,
  grantBranchAdmin: true,
  ...over,
});

describe('School section mock API', () => {
  let api: AxiosInstance;
  let crest: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
    crest = await signIn('e.udo@crestviewcollege.ng');
  });

  it(
    'saves the school profile, validates it and records what changed',
    { timeout: 15_000 },
    async () => {
      const { data: p } = await api.get<SchoolProfile>('/v1/school/profile');
      expect(p).toMatchObject({
        name: 'Greenfield Academy',
        legalName: 'Greenfield Academy Limited',
      });
      expect((await failure(api.put('/v1/school/profile', { ...p, phone: '123' }))).status).toBe(
        422,
      );
      expect(
        (await failure(api.put('/v1/school/profile', { ...p, state: 'Atlantis' }))).status,
      ).toBe(422);
      const { data: saved } = await api.put<SchoolProfile>('/v1/school/profile', {
        ...p,
        motto: 'Learn and serve',
      });
      expect(saved.motto).toBe('Learn and serve');
      expect(saved.history[0]).toMatchObject({ title: 'Updated school details' });
      expect(saved.history[0]?.detail).toContain('motto');
      // Another school is untouched.
      expect((await crest.get<SchoolProfile>('/v1/school/profile')).data.name).toBe(
        'Crestview College',
      );
    },
  );

  it(
    'creates branches within the plan, rejects duplicates and grants the head access',
    { timeout: 20_000 },
    async () => {
      expect(
        (await failure(api.post('/v1/branches', branchBody({ code: 'GFA-MC' })))).message,
      ).toContain('Main Campus');
      expect(
        (await failure(api.post('/v1/branches', branchBody({ name: 'lekki campus' })))).status,
      ).toBe(422);
      const { data: b } = await api.post<BranchDetail>('/v1/branches', branchBody());
      expect(b).toMatchObject({ status: 'Active', headName: 'Mrs. Chioma Eze', canDelete: true });
      const eze = (await api.get<SchoolUserRow[]>('/v1/users')).data.find((u) => u.id === 'eze')!;
      expect(eze.roles).toContain('Branch Admin');
      expect(eze.branches).toContain('Ikoyi Campus');

      await api.post(
        '/v1/branches',
        branchBody({ name: 'Yaba Campus', code: 'GFA-YB', headId: null }),
      );
      const { data: list } = await api.get<BranchList>('/v1/branches');
      expect(list.branches).toHaveLength(5);
      expect(
        (await failure(api.post('/v1/branches', branchBody({ name: 'Sixth', code: 'GFA-SX' }))))
          .status,
      ).toBe(409);

      await api.delete(`/v1/branches/${b.id}`);
      expect((await failure(api.delete('/v1/branches/mc'))).status).toBe(409);
    },
  );

  it(
    'only deactivates branches without students, and never the last active one',
    { timeout: 15_000 },
    async () => {
      expect(
        (await failure(api.post('/v1/branches/mc/deactivate', { reason: 'x' }))).message,
      ).toContain('847 students');
      expect(
        (await failure(crest.post('/v1/branches/cmc/deactivate', { reason: 'x' }))).message,
      ).toContain('at least one active branch');
      await api.post('/v1/branches/aj/reactivate');
      expect((await failure(api.post('/v1/branches/aj/deactivate', {}))).status).toBe(422);
      const { data } = await api.post<BranchDetail>('/v1/branches/aj/deactivate', {
        reason: 'Renovation',
      });
      expect(data.status).toBe('Inactive');
    },
  );

  it('invites, changes access and protects the signed-in admin', { timeout: 20_000 }, async () => {
    expect(
      (
        await failure(
          api.post('/v1/users/invitations', {
            staffId: 'adamu',
            email: 'bakare@greenfieldacademy.ng',
            roles: ['Teacher'],
            scope: 'School',
            branches: [],
          }),
        )
      ).status,
    ).toBe(409);
    const { data: u } = await api.post<SchoolUserRow>('/v1/users/invitations', {
      staffId: 'adamu',
      name: '',
      email: 'p.adamu@greenfieldacademy.ng',
      roles: ['Inventory Officer'],
      scope: 'Branch',
      branches: ['Main Campus'],
    });
    expect(u).toMatchObject({ status: 'Invited', name: 'Mr. Peter Adamu' });
    await api.post(`/v1/users/${u.id}/revoke`);

    expect(
      (
        await failure(
          api.patch('/v1/users/okonkwo/access', {
            roles: ['Principal'],
            scope: 'School',
            branches: [],
          }),
        )
      ).status,
    ).toBe(409);
    expect((await failure(api.post('/v1/users/okonkwo/suspend', { reason: 'x' }))).status).toBe(
      409,
    );
    expect((await failure(api.post('/v1/users/bakare/suspend', {}))).status).toBe(422);
    await api.post('/v1/users/bakare/suspend', { reason: 'On leave' });
    await api.post('/v1/users/bakare/reactivate');
    expect((await failure(api.post('/v1/users/bakare/resend'))).status).toBe(409);
  });

  it('keeps predefined roles fixed and custom roles editable', { timeout: 15_000 }, async () => {
    expect(
      (
        await failure(
          api.patch('/v1/roles/teacher', {
            name: 'Teacher',
            scope: 'School',
            description: '',
            permissions: { students: ['view'] },
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await failure(
          api.post('/v1/roles', {
            name: 'Empty',
            scope: 'Branch',
            description: '',
            permissions: {},
          }),
        )
      ).status,
    ).toBe(422);
    const { data: r } = await api.post<Role>('/v1/roles', {
      name: 'Librarian',
      scope: 'Branch',
      description: 'Lends books',
      permissions: { students: ['view', 'fly'] },
    });
    expect(r.permissions).toEqual({ students: ['view'] });
    expect((await failure(api.delete('/v1/roles/teacher'))).status).toBe(409);
    await api.delete(`/v1/roles/${r.id}`);
  });

  it('stops positions reporting to their own reports', { timeout: 15_000 }, async () => {
    const body = (over: object) => ({
      title: 'Principal',
      parentId: 'prop',
      holderIds: ['okonkwo'],
      suggestedRoles: [],
      responsibilities: '',
      approvals: [],
      ...over,
    });
    expect(
      (await failure(api.patch('/v1/organogram/positions/principal', body({ parentId: 'math' }))))
        .status,
    ).toBe(422);
    expect(
      (
        await failure(
          api.post('/v1/organogram/positions', body({ title: 'Deputy', parentId: null })),
        )
      ).status,
    ).toBe(422);
    expect((await failure(api.delete('/v1/organogram/positions/vpa'))).message).toContain(
      'HOD Sciences',
    );
    const { data: o } = await api.get<Organogram>('/v1/organogram');
    expect(o.positions.find((p) => p.id === 'hodl')?.holderNames).toEqual([]);
    await api.delete('/v1/organogram/positions/hodl');
  });
});
