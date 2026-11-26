import { hashPassword } from '../src/auth/password.js';
import { RequestContext } from '../src/common/context/request-context.js';
import type { InvitationData } from '../src/notifications/templates/templates.js';
import { OrganogramService } from '../src/school/organogram/organogram.service.js';
import {
  authed,
  createTestApp,
  nextIp,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

type Api = ReturnType<typeof authed>;
interface Position {
  id: string;
  title: string;
  parentId: string | null;
  holderIds: string[];
  holderNames: string[];
  suggestedRoles: string[];
}
interface UserRow {
  id: string;
  staffId: string | null;
  name: string;
  email: string;
  roles: string[];
  scope: string;
  branches: string[];
  status: string;
}
interface Role {
  id: string;
  name: string;
  type: string;
  scope: string;
  users: number;
}

const ADAEZE = 'adaeze.okonkwo@greenfield.edu.ng';
const UDO = 'e.udo@crestviewcollege.ng';
const GRACE = 'g.okafor@greenfield.edu.ng';
const UUID = '0193a7c1-5d1e-7c2a-9f00-4b1f6a2d9e11';

describe('School organogram, users and roles (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let crest: Api;
  let greenfieldId: string;
  let crestviewId: string;
  const suffix = Date.now().toString(36);

  const positions = async () =>
    (await admin.get('/api/v1/organogram')).body.data.positions as Position[];
  const users = async (as: Api = admin) => (await as.get('/api/v1/users')).body.data as UserRow[];
  const userByEmail = async (email: string) => (await users()).find((u) => u.email === email)!;
  const roles = async () => (await admin.get('/api/v1/roles')).body.data as Role[];
  const staffId = async (staffNumber: string, schoolId = greenfieldId) =>
    (
      await t.prisma.staff.findUniqueOrThrow({
        where: { schoolId_staffNumber: { schoolId, staffNumber } },
      })
    ).id;
  const tokenFrom = (email: string) =>
    decodeURIComponent(
      (t.notifications.find(email, 'invitation')!.data as InvitationData).link
        .split('/')
        .pop()!
        .split('?')[0]!,
    );

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    greenfieldId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    crestviewId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'crestview' } })).id;
    admin = authed(t, (await signIn(t, ADAEZE)).token);
    crest = authed(t, (await signIn(t, UDO)).token);
  });

  afterAll(async () => {
    await t.close();
  });

  /* ---------------- Organogram ---------------- */

  describe('organogram', () => {
    it('loads Greenfield’s organogram as the mock has it', async () => {
      const res = await admin.get('/api/v1/organogram');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Organogram loaded.');
      const list = res.body.data.positions as Position[];
      expect(list).toHaveLength(12);
      expect(list[0]).toMatchObject({
        title: 'Proprietor',
        parentId: null,
        holderNames: ['Dr. Folasade Ogunbiyi'],
        suggestedRoles: ['Owner'],
        approvals: ['Payroll: final approval', 'Refunds above ₦500,000'],
      });
      const principal = list.find((p) => p.title === 'Principal')!;
      expect(principal.parentId).toBe(list[0]!.id);
      expect(principal.suggestedRoles).toEqual(['School Admin', 'Principal']);
      expect(list.find((p) => p.title === 'HOD Languages')!.holderIds).toEqual([]);
      expect(Array.isArray(res.body.data.history)).toBe(true);
    });

    it('reports the setup step’s state', async () => {
      const service = t.app.get(OrganogramService);
      const state = await RequestContext.forSchool(greenfieldId, () =>
        service.organogramStepState(),
      );
      expect(state).toMatchObject({ positions: 12, vacant: 1, roles: 16, topHolder: true });
      const crestState = await RequestContext.forSchool(crestviewId, () =>
        service.organogramStepState(),
      );
      expect(crestState).toMatchObject({ positions: 1, vacant: 0, roles: 14, topHolder: true });
    });

    let added: Position;
    it('adds, edits and removes a position', async () => {
      const list = await positions();
      const principal = list.find((p) => p.title === 'Principal')!;
      const driver = await staffId('GFA-ST-0126');
      const res = await admin.post('/api/v1/organogram/positions').send({
        title: `Transport Lead ${suffix}`,
        parentId: principal.id,
        holderIds: [driver],
        suggestedRoles: ['Exams Officer'],
        responsibilities: '  School buses.  ',
        approvals: ['Stock issue'],
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Position added.');
      added = res.body.data;
      expect(added).toMatchObject({
        parentId: principal.id,
        holderIds: [driver],
        holderNames: ['Mr. Peter Adamu'],
        suggestedRoles: ['Exams Officer'],
        responsibilities: 'School buses.',
      });

      const edit = await admin.patch(`/api/v1/organogram/positions/${added.id}`).send({
        title: `Transport Manager ${suffix}`,
        parentId: principal.id,
        holderIds: [],
        suggestedRoles: [],
      });
      expect(edit.status).toBe(200);
      expect(edit.body.message).toBe('Position saved.');
      expect(edit.body.data).toMatchObject({ holderIds: [], suggestedRoles: [] });

      const chart = (await admin.get('/api/v1/organogram')).body.data;
      expect(chart.history[0].title).toBe(`Updated position · Transport Manager ${suffix}`);
      expect(chart.history[1].title).toBe(`Added position · Transport Lead ${suffix}`);
      expect(chart.history[1].detail).toBe('Adaeze Okonkwo · reports to Principal');
    });

    it('checks positions as the mock does', async () => {
      const list = await positions();
      const principal = list.find((p) => p.title === 'Principal')!;
      const post = (body: object) => admin.post('/api/v1/organogram/positions').send(body);
      const cases: [object, string][] = [
        [{ title: '  ', parentId: principal.id }, 'Enter the position title.'],
        [{ title: 'bursar', parentId: principal.id }, 'This position already exists.'],
        [
          { title: 'Chaplain', parentId: null },
          'Only one position can be at the top. Choose who this reports to.',
        ],
        [{ title: 'Chaplain', parentId: UUID }, 'Choose who this position reports to.'],
        [
          { title: 'Chaplain', parentId: principal.id, holderIds: [UUID] },
          'Holders must be current staff.',
        ],
        [
          { title: 'Chaplain', parentId: principal.id, holderIds: [await staffId('GFA-ST-0019')] },
          'Holders must be current staff.',
        ],
        [
          { title: 'Chaplain', parentId: principal.id, suggestedRoles: ['Wizard'] },
          'One of those roles doesn’t exist.',
        ],
      ];
      for (const [body, message] of cases) {
        const res = await post(body);
        expect(res.status, message).toBe(422);
        expect(res.body.message).toBe(message);
      }
      const cycle = await admin
        .patch(`/api/v1/organogram/positions/${principal.id}`)
        .send({ title: 'Principal', parentId: added.id });
      expect(cycle.status).toBe(422);
      expect(cycle.body.message).toBe(
        'A position can’t report to itself or to one of its own reports.',
      );
    });

    it('keeps the top and positions with reports', async () => {
      const list = await positions();
      const top = list.find((p) => !p.parentId)!;
      const vpa = list.find((p) => p.title === 'Vice Principal (Academics)')!;
      const delTop = await admin.delete(`/api/v1/organogram/positions/${top.id}`);
      expect(delTop.status).toBe(409);
      expect(delTop.body.message).toBe('The top position can’t be removed.');
      const delVpa = await admin.delete(`/api/v1/organogram/positions/${vpa.id}`);
      expect(delVpa.status).toBe(409);
      expect(delVpa.body.message).toBe(
        'HOD Sciences, HOD Languages, Nursery Coordinator report to Vice Principal (Academics). Move them first.',
      );
      const del = await admin.delete(`/api/v1/organogram/positions/${added.id}`);
      expect(del.status).toBe(200);
      expect(del.body).toMatchObject({ message: 'Position removed.', data: { ok: true } });
      for (const id of [added.id, 'nope'])
        expect((await admin.delete(`/api/v1/organogram/positions/${id}`)).status).toBe(404);
    });
  });

  /* ---------------- Roles ---------------- */

  describe('roles', () => {
    it('lists predefined roles first, with holders', async () => {
      const res = await admin.get('/api/v1/roles');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Roles loaded.');
      const list = res.body.data as Role[];
      expect(list.map((r) => r.name)).toEqual([
        'Owner',
        'School Admin',
        'Principal',
        'Academic Head',
        'HOD',
        'Teacher',
        'Bursar',
        'Accountant',
        'Inventory Officer',
        'Branch Admin',
        'Head of Boarding',
        'House Staff',
        'Gate Officer',
        'Nurse',
        'Admissions Officer',
        'Exams Officer',
      ]);
      expect(list[0]).toMatchObject({ type: 'Predefined', scope: 'School', users: 1 });
      expect(list.at(-1)).toMatchObject({ type: 'Custom', scope: 'Section', users: 0 });
    });

    it('locks predefined roles', async () => {
      const owner = (await roles())[0]!;
      const edit = await admin
        .patch(`/api/v1/roles/${owner.id}`)
        .send({ name: 'Owner', scope: 'School', permissions: { students: ['view'] } });
      expect(edit.status).toBe(409);
      expect(edit.body.message).toBe(
        'Predefined roles can’t be edited. Duplicate it to make a custom version.',
      );
      const del = await admin.delete(`/api/v1/roles/${owner.id}`);
      expect(del.status).toBe(409);
      expect(del.body.message).toBe('Predefined roles can’t be deleted.');
    });

    it('creates, edits and deletes a custom role', async () => {
      const name = `Librarian ${suffix}`;
      const res = await admin.post('/api/v1/roles').send({
        name,
        scope: 'Branch',
        description: 'Books',
        permissions: { students: ['view', 'fly'], unknown: ['view'], comms: [] },
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Role created. Assign it from a user’s access settings.');
      expect(res.body.data).toMatchObject({
        name,
        type: 'Custom',
        scope: 'Branch',
        permissions: { students: ['view'] },
        users: 0,
      });
      const id = res.body.data.id as string;

      const edit = await admin
        .patch(`/api/v1/roles/${id}`)
        .send({ name, scope: 'School', permissions: { students: ['view', 'edit'] } });
      expect(edit.status).toBe(200);
      expect(edit.body.message).toBe('Role saved. No users have this role yet.');

      // Held by someone: can't be deleted.
      const grace = await userByEmail(GRACE);
      await admin
        .patch(`/api/v1/users/${grace.id}/access`)
        .send({ roles: ['Teacher', name], scope: 'School', branches: [] });
      const saved = await admin
        .patch(`/api/v1/roles/${id}`)
        .send({ name, scope: 'School', permissions: { students: ['view'] } });
      expect(saved.body.message).toBe('Role saved. 1 user’s access updated.');
      const inUse = await admin.delete(`/api/v1/roles/${id}`);
      expect(inUse.status).toBe(409);
      expect(inUse.body.message).toBe('1 user has this role. Remove it from them first.');
      await admin
        .patch(`/api/v1/users/${grace.id}/access`)
        .send({ roles: ['Teacher'], scope: 'School', branches: [] });
      const del = await admin.delete(`/api/v1/roles/${id}`);
      expect(del.status).toBe(200);
      expect(del.body.message).toBe('Role deleted.');
      expect((await admin.get(`/api/v1/roles/${id}`)).status).toBe(404);
    });

    it('validates roles', async () => {
      const cases: [object, string][] = [
        [{ name: '', scope: 'School', permissions: { students: ['view'] } }, 'Name the role.'],
        [
          { name: 'exams officer', scope: 'School', permissions: { students: ['view'] } },
          'A role with this name already exists.',
        ],
        [
          { name: 'X', scope: 'Galaxy', permissions: { students: ['view'] } },
          'Choose a default scope.',
        ],
        [
          { name: 'X', scope: 'School', permissions: { students: ['fly'] } },
          'Give the role at least one permission.',
        ],
      ];
      for (const [body, message] of cases) {
        const res = await admin.post('/api/v1/roles').send(body);
        expect(res.status, message).toBe(422);
        expect(res.body.message).toBe(message);
      }
    });
  });

  /* ---------------- Users ---------------- */

  describe('users', () => {
    it('lists the school’s accounts', async () => {
      const res = await admin.get('/api/v1/users');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Users loaded.');
      const list = res.body.data as UserRow[];
      expect(list.find((u) => u.email === ADAEZE)).toMatchObject({
        name: 'Mrs. Adaeze Okonkwo',
        position: 'Principal',
        roles: ['School Admin', 'Principal'],
        scope: 'School',
        status: 'Active',
        invited: null,
      });
      expect(list.find((u) => u.email === 'femi.adebayo@greenfield.edu.ng')).toMatchObject({
        roles: ['Branch Admin'],
        scope: 'Branch',
        branches: ['Lekki Campus'],
      });
      expect(list.find((u) => u.email === 'kemi.lawal@greenfield.edu.ng')!.status).toBe('Invited');
      expect(list.some((u) => u.email === UDO)).toBe(false);
    });

    it('shows a user with what they can do', async () => {
      const me = await userByEmail(ADAEZE);
      const res = await admin.get(`/api/v1/users/${me.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ isYou: true, staffNumber: 'GFA-ST-0001' });
      expect(res.body.data.can).toContainEqual([
        'School settings',
        'School profile, Branches, Users, Roles',
      ]);
      expect(res.body.data.history.at(-1)).toMatchObject({
        id: 'created',
        title: 'Account created',
      });
      expect((await admin.get(`/api/v1/users/${UUID}`)).status).toBe(404);
    });

    it('lists staff for pickers', async () => {
      const res = await admin.get('/api/v1/staff/options');
      expect(res.status).toBe(200);
      const list = res.body.data as {
        name: string;
        account: string;
        hasSchoolWideAccess: boolean;
      }[];
      expect(list.find((s) => s.name === 'Mr. Peter Adamu')).toMatchObject({
        account: 'No account',
        hasSchoolWideAccess: false,
      });
      expect(list.find((s) => s.name === 'Mrs. Adaeze Okonkwo')).toMatchObject({
        account: 'Active',
        hasSchoolWideAccess: true,
      });
      // Tunde Ojo has left.
      expect(list.some((s) => s.name === 'Mr. Tunde Ojo')).toBe(false);
    });

    it('invites someone, who accepts and signs in', async () => {
      const email = `peter.adamu.${suffix}@greenfield.edu.ng`;
      const driver = await staffId('GFA-ST-0126');
      const res = await admin.post('/api/v1/users/invitations').send({
        staffId: driver,
        name: '',
        email: email.toUpperCase(),
        roles: ['Teacher'],
        scope: 'Branch',
        branches: ['Main Campus'],
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe(`Invitation sent to ${email}.`);
      expect(res.body.data).toMatchObject({
        staffId: driver,
        name: 'Mr. Peter Adamu',
        email,
        position: 'Driver',
        roles: ['Teacher'],
        scope: 'Branch',
        branches: ['Main Campus'],
        status: 'Invited',
        invited: 'Today',
      });
      const mail = t.notifications.find(email, 'invitation')!.data as InvitationData;
      expect(mail).toMatchObject({ organisation: 'Greenfield Academy', position: 'Driver' });

      const token = tokenFrom(email);
      const lookup = await t
        .http()
        .get(`/api/v1/auth/invitations/${token}`)
        .set('X-Forwarded-For', nextIp());
      expect(lookup.status).toBe(200);
      expect(lookup.body.data).toMatchObject({
        schoolName: 'Greenfield Academy',
        roleName: 'Teacher',
      });
      const accept = await t
        .http()
        .post(`/api/v1/auth/invitations/${token}/accept`)
        .set('X-Forwarded-For', nextIp())
        .send({ firstName: 'Peter', lastName: 'Adamu', password: PASSWORD });
      expect(accept.status).toBe(200);
      expect((await userByEmail(email)).status).toBe('Active');
      await signIn(t, email, { tenant: 'greenfield' });
    });

    it('resends and revokes an invitation', async () => {
      const email = `visitor.${suffix}@example.com`;
      const res = await admin.post('/api/v1/users/invitations').send({
        staffId: null,
        name: 'Mrs. Ada Visitor',
        email,
        roles: ['Exams Officer'],
        scope: 'School',
        branches: [],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Mrs. Ada Visitor');
      const first = tokenFrom(email);
      t.notifications.clear();
      const resend = await admin.post(`/api/v1/users/${res.body.data.id}/resend`).send({});
      expect(resend.status).toBe(200);
      expect(resend.body.message).toBe(`Invitation resent to ${email}.`);
      const second = tokenFrom(email);
      expect(second).not.toBe(first);
      const revoke = await admin.post(`/api/v1/users/${res.body.data.id}/revoke`).send({});
      expect(revoke.body).toMatchObject({
        message: 'Invitation revoked.',
        data: { status: 'Revoked' },
      });
      const gone = await t
        .http()
        .get(`/api/v1/auth/invitations/${second}`)
        .set('X-Forwarded-For', nextIp());
      expect(gone.status).toBe(410);
      // Revoked: the email can be invited again on the same account.
      const again = await admin.post('/api/v1/users/invitations').send({
        staffId: null,
        name: 'Ada Visitor',
        email,
        roles: ['Teacher'],
        scope: 'School',
        branches: [],
      });
      expect(again.status).toBe(201);
      expect(again.body.data.id).toBe(res.body.data.id);
    });

    it('validates invitations', async () => {
      const base = {
        staffId: null,
        name: 'New Person',
        email: `new.${suffix}@example.com`,
        roles: ['Teacher'],
        scope: 'School',
        branches: [],
      };
      const cases: [object, number, string][] = [
        [{ ...base, email: 'nope' }, 422, 'Enter a valid email address.'],
        [{ ...base, name: '' }, 422, 'Enter their full name.'],
        [{ ...base, staffId: UUID }, 422, 'Choose the staff member.'],
        [{ ...base, roles: [] }, 422, 'Choose at least one role.'],
        [{ ...base, roles: ['Wizard'] }, 422, 'One of those roles doesn’t exist.'],
        [{ ...base, roles: ['Owner'] }, 422, 'The Owner role can’t be given by invitation.'],
        [{ ...base, scope: 'Branch', branches: [] }, 422, 'Choose at least one branch.'],
        [
          { ...base, scope: 'Branch', branches: ['Moon Campus'] },
          422,
          'One of those branches doesn’t exist.',
        ],
        [
          { ...base, email: GRACE },
          409,
          'This email already has an account or a pending invitation.',
        ],
      ];
      for (const [body, status, message] of cases) {
        const res = await admin.post('/api/v1/users/invitations').send(body);
        expect(res.status, message).toBe(status);
        expect(res.body.message).toBe(message);
      }
    });

    it('changes access, with the mock’s guards', async () => {
      const grace = await userByEmail(GRACE);
      const res = await admin
        .patch(`/api/v1/users/${grace.id}/access`)
        .send({ roles: ['Teacher', 'Exams Officer'], scope: 'Branch', branches: ['Main Campus'] });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Mrs. Grace Okafor’s access updated.');
      expect(res.body.data).toMatchObject({
        roles: ['Teacher', 'Exams Officer'],
        scope: 'Branch',
        branches: ['Main Campus'],
      });
      const detail = await admin.get(`/api/v1/users/${grace.id}`);
      expect(detail.body.data.history[0]).toMatchObject({
        title: 'Access changed',
        detail: 'Adaeze Okonkwo · +Exams Officer · Main Campus',
      });

      const me = await userByEmail(ADAEZE);
      const self = await admin
        .patch(`/api/v1/users/${me.id}/access`)
        .send({ roles: ['Principal'], scope: 'School', branches: [] });
      expect(self.status).toBe(409);
      expect(self.body.message).toBe('You can’t remove your own School Admin role.');

      const owner = await admin
        .patch(`/api/v1/users/${grace.id}/access`)
        .send({ roles: ['Teacher', 'Owner'], scope: 'School', branches: [] });
      expect(owner.status).toBe(403);
      expect(owner.body.error.code).toBe('OWNER_ONLY');
    });

    it('suspends someone and ends their sessions', async () => {
      const teacher = await signIn(t, GRACE, { tenant: 'greenfield' });
      const asGrace = authed(t, teacher.token, { tenant: 'greenfield' });
      expect((await asGrace.get('/api/v1/auth/me')).status).toBe(200);

      const grace = await userByEmail(GRACE);
      const noReason = await admin.post(`/api/v1/users/${grace.id}/suspend`).send({});
      expect(noReason.status).toBe(422);
      expect(noReason.body.message).toBe('Give a reason for suspending.');

      const res = await admin.post(`/api/v1/users/${grace.id}/suspend`).send({ reason: 'Review' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        message: 'Mrs. Grace Okafor suspended.',
        data: { status: 'Suspended' },
      });
      expect((await asGrace.get('/api/v1/auth/me')).status).toBe(401);

      const twice = await admin.post(`/api/v1/users/${grace.id}/suspend`).send({ reason: 'Again' });
      expect(twice.status).toBe(409);
      expect(twice.body.message).toBe('That isn’t possible while the account is suspended.');

      const back = await admin.post(`/api/v1/users/${grace.id}/reactivate`).send({});
      expect(back.body).toMatchObject({
        message: 'Mrs. Grace Okafor reactivated.',
        data: { status: 'Active' },
      });

      const reset = await admin.post(`/api/v1/users/${grace.id}/password-reset`).send({});
      expect(reset.body.message).toBe(`Reset link sent to ${GRACE}.`);
      expect(t.notifications.find(GRACE, 'password-reset')).toBeDefined();
    });

    it('never lets an admin lock themself out or remove the last admin', async () => {
      const me = await userByEmail(ADAEZE);
      for (const action of ['suspend', 'deactivate']) {
        const res = await admin.post(`/api/v1/users/${me.id}/${action}`).send({ reason: 'x' });
        expect(res.status).toBe(409);
        expect(res.body.message).toBe('You can’t suspend or deactivate your own account.');
      }

      // Crestview: Emem Udo is the only School Admin. A registrar who manages users can't
      // deactivate him or take his School Admin role.
      const email = `registrar.${suffix}@crestviewcollege.ng`;
      const role = await t.prisma.schoolRole.create({
        data: {
          schoolId: crestviewId,
          name: `Registrar ${suffix}`,
          permissions: { settings: ['users'] },
        },
      });
      const user = await t.prisma.user.create({
        data: {
          email,
          firstName: 'Rita',
          lastName: 'Registrar',
          passwordHash: await hashPassword(PASSWORD),
          passwordChangedAt: new Date(),
        },
      });
      await t.prisma.schoolMembership.create({
        data: {
          schoolId: crestviewId,
          userId: user.id,
          kind: 'STAFF',
          status: 'ACTIVE',
          roles: { create: { roleId: role.id } },
        },
      });
      const registrar = authed(t, (await signIn(t, email)).token);
      const udo = (await users(crest)).find((u) => u.email === UDO)!;
      const deactivate = await registrar.post(`/api/v1/users/${udo.id}/deactivate`).send({});
      expect(deactivate.status).toBe(409);
      expect(deactivate.body.error.code).toBe('LAST_ADMIN');
      const demote = await registrar
        .patch(`/api/v1/users/${udo.id}/access`)
        .send({ roles: ['Principal'], scope: 'School', branches: [] });
      expect(demote.status).toBe(409);
      expect(demote.body.error.code).toBe('LAST_ADMIN');
    });
  });

  /* ---------------- Permissions ---------------- */

  describe('permissions', () => {
    const routes = (ids: { user: string; role: string; position: string }) =>
      [
        ['get', '/api/v1/organogram'],
        ['post', '/api/v1/organogram/positions'],
        ['patch', `/api/v1/organogram/positions/${ids.position}`],
        ['delete', `/api/v1/organogram/positions/${ids.position}`],
        ['get', '/api/v1/users'],
        ['get', `/api/v1/users/${ids.user}`],
        ['post', '/api/v1/users/invitations'],
        ['patch', `/api/v1/users/${ids.user}/access`],
        ['post', `/api/v1/users/${ids.user}/suspend`],
        ['get', '/api/v1/roles'],
        ['get', `/api/v1/roles/${ids.role}`],
        ['post', '/api/v1/roles'],
        ['patch', `/api/v1/roles/${ids.role}`],
        ['delete', `/api/v1/roles/${ids.role}`],
        ['get', '/api/v1/staff/options'],
      ] as const;

    const greenfieldIds = async () => ({
      user: (await userByEmail(GRACE)).id,
      role: (await roles()).find((r) => r.name === 'Exams Officer')!.id,
      position: (await positions()).find((p) => p.title === 'Bursar')!.id,
    });

    it('refuses staff without settings.users / settings.roles', async () => {
      const ids = await greenfieldIds();
      // Academic Head opens School Admin but can't manage users or roles.
      const head = authed(t, (await signIn(t, 'c.eze@greenfield.edu.ng')).token);
      // A Bursar (only): give Kunle Bakare a fresh password and just the Bursar role.
      const bakare = await t.prisma.user.update({
        where: { email: 'kunle.bakare@greenfield.edu.ng' },
        data: { passwordChangedAt: new Date() },
        include: { memberships: true },
      });
      await t.prisma.membershipRole.deleteMany({
        where: { membershipId: bakare.memberships[0]!.id, role: { key: { not: 'bursar' } } },
      });
      const bursar = authed(t, (await signIn(t, 'kunle.bakare@greenfield.edu.ng')).token);
      // A classroom teacher in the Teacher Workspace.
      const teacher = authed(
        t,
        (await signIn(t, 's.ade@greenfield.edu.ng', { tenant: 'greenfield' })).token,
        {
          tenant: 'greenfield',
        },
      );
      for (const as of [head, bursar, teacher])
        for (const [method, path] of routes(ids)) {
          const res = await as[method](path).send({});
          expect(res.status, `${method} ${path}`).toBe(403);
        }
    });

    it('keeps each school’s records to itself', async () => {
      const ids = await greenfieldIds();
      for (const [method, path] of routes(ids).filter(([, p]) => /\/[0-9a-f-]{36}/.test(p))) {
        const body = path.includes('/organogram/')
          ? { title: 'Hijack', parentId: null }
          : path.includes('/roles/')
            ? { name: 'Hijack', scope: 'School', permissions: { students: ['view'] } }
            : path.endsWith('/access')
              ? { roles: ['Teacher'], scope: 'School', branches: [] }
              : { reason: 'x' };
        const res = await crest[method](path).send(method === 'get' ? undefined : body);
        expect(res.status, `${method} ${path}`).toBe(404);
      }
      // Crestview's lists only hold Crestview.
      expect((await users(crest)).map((u) => u.email)).not.toContain(GRACE);
      const crestChart = (await crest.get('/api/v1/organogram')).body.data.positions as Position[];
      expect(crestChart.map((p) => p.title)).toEqual(['Principal']);
      const crestRoles = (await crest.get('/api/v1/roles')).body.data as Role[];
      expect(crestRoles.some((r) => r.name === 'Exams Officer')).toBe(false);
      // Greenfield staff and roles can't be used from Crestview.
      const pos = await crest.post('/api/v1/organogram/positions').send({
        title: `Deputy ${suffix}`,
        parentId: crestChart[0]!.id,
        holderIds: [await staffId('GFA-ST-0117')],
      });
      expect(pos.status).toBe(422);
      const invite = await crest.post('/api/v1/users/invitations').send({
        staffId: await staffId('GFA-ST-0117'),
        name: '',
        email: `steal.${suffix}@example.com`,
        roles: ['Teacher'],
        scope: 'School',
        branches: [],
      });
      expect(invite.status).toBe(422);
      expect(invite.body.message).toBe('Choose the staff member.');
      // And Greenfield's records are unchanged.
      expect((await positions()).find((p) => p.title === 'Bursar')).toBeDefined();
      expect((await userByEmail(GRACE)).status).toBe('Active');
    });
  });
});
