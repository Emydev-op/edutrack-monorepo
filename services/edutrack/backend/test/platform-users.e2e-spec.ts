import type { InvitationData } from '../src/notifications/templates/templates.js';
import {
  authed,
  createTestApp,
  nextIp,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

type Api = ReturnType<typeof authed>;
interface UserRow {
  id: string;
  email: string;
  status: string;
  invitation: string | null;
  roleId: string;
  roleName: string;
}

describe('Platform users and roles (e2e)', () => {
  let t: TestApp;
  let api: Api;
  const suffix = Date.now().toString(36);
  // The test database keeps users between runs, so the phone number changes each run.
  const digits = String(Date.now()).slice(-7);
  const phone = `0803 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  const ids: Record<string, string> = {};

  const userByEmail = async (email: string) =>
    (await t.prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const tokenFrom = (email: string) =>
    (t.notifications.find(email, 'invitation')!.data as InvitationData).link.split('/').pop()!;
  const accept = (token: string, firstName: string) =>
    t
      .http()
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .set('X-Forwarded-For', nextIp())
      .send({ firstName, lastName: 'Tester', password: PASSWORD });
  const invite = (as: Api, email: string, roleId: string, extra: Record<string, unknown> = {}) =>
    as.post('/api/v1/platform/users/invitations').send({
      firstName: 'New',
      lastName: 'Person',
      email,
      phone: '',
      roleId,
      ...extra,
    });

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    const { token } = await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' });
    api = authed(t, token);
    for (const name of ['tolu', 'ngozi', 'kemi', 'bayo', 'dayo', 'chika'])
      ids[name] = await userByEmail(`${name}@edutrack.ng`);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('listing', () => {
    it('lists staff with role, status and invitation state', async () => {
      const res = await api.get('/api/v1/platform/users?pageSize=50');
      expect(res.status).toBe(200);
      const rows = res.body.data as UserRow[];
      const by = (email: string) => rows.find((u) => u.email === email)!;
      expect(by('tolu@edutrack.ng')).toMatchObject({
        id: ids.tolu,
        roleId: 'admin',
        roleName: 'Platform Administrator',
        status: 'Active',
        phone: '0803 412 7781',
      });
      expect(by('kemi@edutrack.ng').status).toBe('Suspended');
      expect(by('dayo@edutrack.ng')).toMatchObject({ status: 'Invited', invitation: 'Pending' });
      expect(by('chika@edutrack.ng').invitation).toBe('Expired');
    });

    it('filters by view, status, role and search', async () => {
      const emails = async (query: string) =>
        ((await api.get(`/api/v1/platform/users?${query}`)).body.data as UserRow[]).map(
          (u) => u.email,
        );
      expect(await emails('status=Suspended')).toEqual(['kemi@edutrack.ng']);
      expect(await emails('view=invitations')).toEqual(
        expect.arrayContaining(['dayo@edutrack.ng', 'chika@edutrack.ng']),
      );
      expect(await emails('role=Platform%20Support')).toEqual(['ngozi@edutrack.ng']);
      expect(await emails('search=okafor')).toEqual(['ngozi@edutrack.ng']);
      expect((await api.get('/api/v1/platform/users?status=Gone')).status).toBe(422);
    });

    it('404s unknown and malformed ids', async () => {
      expect((await api.get('/api/v1/platform/users/nope')).status).toBe(404);
      const res = await api.get('/api/v1/platform/users/00000000-0000-4000-8000-000000000000');
      expect(res.body.message).toBe('That user doesn’t exist.');
    });
  });

  describe('inviting', () => {
    it('invites, emails the link, and alerts user managers when it is accepted', async () => {
      const email = `amaka.${suffix}@edutrack.ng`;
      const res = await invite(api, email, 'agent', { firstName: 'Amaka', phone });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        email,
        status: 'Invited',
        invitation: 'Pending',
        roleName: 'Support Agent',
        invitedBy: 'Tolu Bamidele',
        phone,
      });
      const sent = t.notifications.find(email, 'invitation')!;
      expect(sent.data).toMatchObject({ position: 'Support Agent', organisation: 'EduTrack' });

      expect((await invite(api, email, 'agent')).body.code).toBe('USER_EXISTS');
      expect((await invite(api, `x.${suffix}@edutrack.ng`, 'agent', { phone: '12' })).status).toBe(
        422,
      );
      expect((await invite(api, `y.${suffix}@edutrack.ng`, 'nobody')).body.fields).toEqual({
        roleId: 'Choose a role.',
      });

      expect((await accept(tokenFrom(email), 'Amaka')).status).toBe(200);
      const user = await api.get(`/api/v1/platform/users/${res.body.id}`);
      expect(user.body).toMatchObject({ status: 'Active', invitation: 'Accepted' });
      const alert = await t.prisma.notification.findFirst({
        where: { userId: ids.tolu, category: 'user.invitation', title: { contains: 'Amaka' } },
      });
      expect(alert?.title).toBe('Amaka Tester accepted their invitation');
    });

    it('never lets someone hand out more access than they have', async () => {
      const role = await api.post('/api/v1/platform/roles').send({
        name: `People ${suffix}`,
        permissions: { Users: ['View', 'Create', 'Edit'], Schools: ['View'] },
      });
      expect(role.status).toBe(201);
      const email = `people.${suffix}@edutrack.ng`;
      await invite(api, email, role.body.id);
      await accept(tokenFrom(email), 'People');
      const { token } = await signIn(t, email, { portal: 'platform' });
      const people = authed(t, token);

      const above = await invite(people, `above.${suffix}@edutrack.ng`, 'admin');
      expect(above.status).toBe(403);
      expect(above.body.code).toBe('ROLE_ABOVE_YOURS');
      expect((await invite(people, `ok.${suffix}@edutrack.ng`, role.body.id)).status).toBe(201);
      // Nor promote anyone above themselves.
      const promote = await people.patch(`/api/v1/platform/users/${ids.dayo}`).send({
        firstName: 'Dayo',
        lastName: 'Ola',
        email: 'dayo@edutrack.ng',
        roleId: 'admin',
      });
      expect(promote.body.code).toBe('ROLE_ABOVE_YOURS');
    });

    it('needs Users.Create', async () => {
      const { token } = await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' });
      expect((await invite(authed(t, token), `z.${suffix}@edutrack.ng`, 'agent')).status).toBe(403);
    });
  });

  describe('editing', () => {
    it('updates details and role, records both, and tells the person', async () => {
      const res = await api.patch(`/api/v1/platform/users/${ids.ngozi}`).send({
        firstName: 'Ngozi',
        lastName: 'Okafor-Eze',
        email: 'ngozi@edutrack.ng',
        phone: '0805 555 0122',
        roleId: 'ops',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ lastName: 'Okafor-Eze', roleName: 'Platform Operations' });
      const actions = (
        await t.prisma.auditEvent.findMany({
          where: { entityId: ids.ngozi, createdAt: { gte: new Date(Date.now() - 60_000) } },
        })
      ).map((e) => e.action);
      expect(actions).toEqual(expect.arrayContaining(['user.update', 'user.change_role']));
      const alert = await t.prisma.notification.findFirst({
        where: { userId: ids.ngozi, category: 'security.alert' },
      });
      expect(alert?.title).toBe('Your back-office role is now Platform Operations');
      // Security alerts are always emailed.
      expect(t.notifications.find('ngozi@edutrack.ng', 'platform-alert')).toBeDefined();
    });

    it('refuses your own role, a taken email and keeps the last administrator', async () => {
      const own = await api.patch(`/api/v1/platform/users/${ids.tolu}`).send({
        firstName: 'Tolu',
        lastName: 'Bamidele',
        email: 'tolu@edutrack.ng',
        roleId: 'ops',
      });
      expect(own.body.code).toBe('OWN_ACCOUNT');
      const taken = await api.patch(`/api/v1/platform/users/${ids.dayo}`).send({
        firstName: 'Dayo',
        lastName: 'Ola',
        email: 'tolu@edutrack.ng',
        roleId: 'agent',
      });
      expect(taken.body.fields).toEqual({ email: 'Another EduTrack account uses this email.' });
      expect(
        (await api.post(`/api/v1/platform/users/${ids.tolu}/suspend`).send({ reason: 'x' })).body
          .code,
      ).toBe('OWN_ACCOUNT');
    });
  });

  describe('lifecycle', () => {
    it('suspends (ending their sessions) and reactivates', async () => {
      const { token } = await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' });
      const ngozi = authed(t, token);
      expect((await ngozi.get('/api/v1/platform/schools')).status).toBe(200);

      expect((await api.post(`/api/v1/platform/users/${ids.ngozi}/suspend`).send({})).status).toBe(
        422,
      );
      const res = await api
        .post(`/api/v1/platform/users/${ids.ngozi}/suspend`)
        .send({ reason: 'Extended leave' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Suspended');
      expect((await ngozi.get('/api/v1/platform/schools')).status).toBe(401);
      const event = await t.prisma.auditEvent.findFirst({
        where: { action: 'user.suspend', entityId: ids.ngozi },
        orderBy: { createdAt: 'desc' },
      });
      expect(event?.summary).toBe('User suspended · Ngozi Okafor-Eze · “Extended leave”');

      const back = await api.post(`/api/v1/platform/users/${ids.ngozi}/reactivate`).send({});
      expect(back.body.status).toBe('Active');
      expect(
        (await api.post(`/api/v1/platform/users/${ids.ngozi}/reactivate`).send({})).body.code,
      ).toBe('NOT_SUSPENDED');
    });

    it('deactivates for good', async () => {
      const res = await api
        .post(`/api/v1/platform/users/${ids.kemi}/deactivate`)
        .send({ reason: 'Left EduTrack' });
      expect(res.body.status).toBe('Deactivated');
      const again = await api.post(`/api/v1/platform/users/${ids.kemi}/reactivate`).send({});
      expect(again.status).toBe(409);
      expect(again.body.message).toBe(
        'Deactivated users can’t be reactivated. Invite them again instead.',
      );
    });

    it('sends a password reset and signs someone out everywhere', async () => {
      const reset = await api.post(`/api/v1/platform/users/${ids.ngozi}/password-reset`).send({});
      expect(reset.status).toBe(200);
      expect(t.notifications.find('ngozi@edutrack.ng', 'password-reset')).toBeDefined();
      expect(
        (await api.post(`/api/v1/platform/users/${ids.dayo}/password-reset`).send({})).body.code,
      ).toBe('NOT_ACTIVE');

      await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' });
      const out = await api.post(`/api/v1/platform/users/${ids.ngozi}/sign-out`).send({});
      expect(out.status).toBe(200);
      const security = await api.get(`/api/v1/platform/users/${ids.ngozi}/security`);
      expect(security.body).toMatchObject({ activeSessions: '0', failedSignIns: 0 });
    });

    it('resends and revokes invitations, and re-invites someone who left', async () => {
      const resent = await api
        .post(`/api/v1/platform/users/${ids.chika}/resend-invitation`)
        .send({});
      expect(resent.body).toMatchObject({ status: 'Invited', invitation: 'Resent' });
      expect(t.notifications.find('chika@edutrack.ng', 'invitation')).toBeDefined();
      expect(
        (await api.post(`/api/v1/platform/users/${ids.ngozi}/resend-invitation`).send({})).body
          .code,
      ).toBe('NOT_INVITED');

      const revoked = await api
        .post(`/api/v1/platform/users/${ids.dayo}/revoke-invitation`)
        .send({});
      expect(revoked.body).toMatchObject({ status: 'Deactivated', invitation: 'Revoked' });
      t.notifications.clear();
      const again = await invite(api, 'dayo@edutrack.ng', 'agent');
      expect(again.status).toBe(201);
      expect(again.body).toMatchObject({ id: ids.dayo, status: 'Invited', invitation: 'Pending' });
      expect(t.notifications.find('dayo@edutrack.ng', 'invitation')).toBeDefined();
    });
  });

  describe('detail tabs', () => {
    it('shows activity, security and open issues', async () => {
      const activity = await api.get(`/api/v1/platform/users/${ids.ngozi}/activity`);
      expect(activity.status).toBe(200);
      expect(activity.body.map((e: { title: string }) => e.title)).toEqual(
        expect.arrayContaining([
          'Signed in',
          'User suspended · Ngozi Okafor-Eze · “Extended leave”',
        ]),
      );
      const security = await api.get(`/api/v1/platform/users/${ids.tolu}/security`);
      expect(security.body).toMatchObject({ twoFactor: 'Coming soon' });
      expect(security.body.activeSessions).toMatch(/^\d+ · /);
      const issues = await api.get(`/api/v1/platform/users/${ids.ngozi}/open-issues`);
      expect(issues.body).toEqual({ count: expect.any(Number) });
    });
  });

  describe('roles', () => {
    it('lists predefined roles first with how many people hold each', async () => {
      const res = await api.get('/api/v1/platform/roles');
      expect(res.status).toBe(200);
      expect(res.body.slice(0, 5).map((r: { id: string }) => r.id)).toEqual([
        'admin',
        'ops',
        'support',
        'agent',
        'finance',
      ]);
      expect(res.body[0]).toMatchObject({ predefined: true, activeUsers: 1 });
    });

    it('creates, refuses duplicates and empty roles, and deletes only unused custom roles', async () => {
      const name = `Auditor ${suffix}`;
      const created = await api.post('/api/v1/platform/roles').send({
        name,
        description: '',
        permissions: { Audit: ['View'], Reports: ['View', 'Nope'] },
      });
      expect(created.status).toBe(422);
      const ok = await api
        .post('/api/v1/platform/roles')
        .send({ name, permissions: { Reports: ['View'], Audit: ['View'], Users: [] } });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({
        name,
        description: 'Custom role',
        permissions: { Audit: ['View'], Reports: ['View'] },
        predefined: false,
        activeUsers: 0,
      });
      expect(
        (
          await api
            .post('/api/v1/platform/roles')
            .send({ name: name.toUpperCase(), permissions: { Audit: ['View'] } })
        ).body.code,
      ).toBe('ROLE_NAME_TAKEN');
      expect(
        (
          await api
            .post('/api/v1/platform/roles')
            .send({ name: `Empty ${suffix}`, permissions: {} })
        ).body.message,
      ).toBe('Choose at least one permission.');

      expect((await api.delete('/api/v1/platform/roles/admin')).body.code).toBe('ROLE_PREDEFINED');
      const people = (await api.get('/api/v1/platform/roles')).body.find(
        (r: { name: string }) => r.name === `People ${suffix}`,
      );
      expect((await api.delete(`/api/v1/platform/roles/${people.id}`)).body.code).toBe(
        'ROLE_IN_USE',
      );
      expect((await api.delete(`/api/v1/platform/roles/${ok.body.id}`)).status).toBe(200);
      expect((await api.delete(`/api/v1/platform/roles/${ok.body.id}`)).status).toBe(404);
    });

    it('needs Users.Manage to change roles', async () => {
      const { token } = await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' });
      const ngozi = authed(t, token);
      expect((await ngozi.get('/api/v1/platform/roles')).status).toBe(200);
      expect(
        (
          await ngozi
            .post('/api/v1/platform/roles')
            .send({ name: 'X', permissions: { Audit: ['View'] } })
        ).status,
      ).toBe(403);
    });
  });
});
