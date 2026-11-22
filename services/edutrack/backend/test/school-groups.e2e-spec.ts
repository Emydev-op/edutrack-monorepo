import { authed, createTestApp, login, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const G = '/api/v1/platform/groups';

interface GroupView {
  id: string;
  name: string;
  schools: { id: string; name: string }[];
  staff: { id: string; email: string; role: string; status: string }[];
}

/**
 * School groups: EduTrack puts a proprietor's schools in a group and adds the group's staff, who
 * get an account in every school of the group (one invitation opens them all), switch between the
 * schools, and see the group overview. Schools leaving or staff leaving closes those accounts.
 */
describe('School groups (e2e)', () => {
  let t: TestApp;
  let tolu: Api;
  let group: GroupView;
  let greenfield: string;
  let crestview: string;
  const suffix = Date.now().toString(36);
  const OWNER = `proprietor.${suffix}@example.ng`;
  const PASS = 'Group-Owner-2026!';
  let ip = 60;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    tolu = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
    greenfield = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    crestview = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'crestview' } })).id;
  });

  afterAll(async () => {
    await t.prisma.school.updateMany({
      where: { groupId: { not: null } },
      data: { groupId: null },
    });
    await t.prisma.schoolMembership.deleteMany({ where: { groupId: { not: null } } });
    await t.prisma.schoolGroup.deleteMany({ where: { name: { contains: suffix } } });
    await t.reseed();
    await t.close();
  });

  it('creates a group and adds the proprietor’s schools', async () => {
    const res = await tolu.post(G).send({ name: `Greenfield Group ${suffix}` });
    expect(res.status).toBe(201);
    group = res.body.data;
    expect((await tolu.post(G).send({ name: `greenfield group ${suffix}` })).body.error.code).toBe(
      'GROUP_NAME_TAKEN',
    );
    await tolu.post(`${G}/${group.id}/schools`).send({ schoolId: greenfield });
    const both = await tolu.post(`${G}/${group.id}/schools`).send({ schoolId: crestview });
    expect(both.body.data.schools.map((s: { name: string }) => s.name)).toEqual([
      'Crestview College',
      'Greenfield Academy',
    ]);
    // A school is in one group at most.
    const other = (await tolu.post(G).send({ name: `Other Group ${suffix}` })).body.data;
    const clash = await tolu.post(`${G}/${other.id}/schools`).send({ schoolId: crestview });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SCHOOL_IN_GROUP');
  });

  it('gives group staff an account in every school, opened by one invitation', async () => {
    const bad = await tolu
      .post(`${G}/${group.id}/staff`)
      .send({ name: '', email: 'x', role: 'Boss' });
    expect(bad.status).toBe(422);
    const res = await tolu
      .post(`${G}/${group.id}/staff`)
      .send({ name: 'Chief Ade Bello', email: OWNER, role: 'Group owner' });
    expect(res.status).toBe(201);
    expect(res.body.data.staff[0]).toMatchObject({
      email: OWNER,
      role: 'Group owner',
      status: 'Invited',
    });
    const accounts = await t.prisma.schoolMembership.findMany({
      where: { user: { email: OWNER } },
      include: { roles: { include: { role: true } } },
    });
    expect(accounts.map((a) => a.schoolId).sort()).toEqual([crestview, greenfield].sort());
    expect(accounts.every((a) => a.status === 'INVITED' && a.roles[0]!.role.key === 'owner')).toBe(
      true,
    );

    const sent = t.notifications.find(OWNER, 'invitation')!;
    const token = decodeURIComponent(
      (sent.data as { link: string }).link.split('/').pop()!.split('?')[0]!,
    );
    const accepted = await t
      .http()
      .post(`/api/v1/auth/invitations/${encodeURIComponent(token)}/accept`)
      .set('X-Forwarded-For', `10.9.0.${ip++}`)
      .send({ firstName: 'Ade', lastName: 'Bello', phone: '', password: PASS });
    expect(accepted.status).toBe(200);
    const active = await t.prisma.schoolMembership.count({
      where: { user: { email: OWNER }, status: 'ACTIVE' },
    });
    expect(active).toBe(2);
  });

  it('shows the group overview across its schools, with fees for the owner', async () => {
    const signedIn = await login(t, OWNER, PASS);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data.schools.map((s: { name: string }) => s.name).sort()).toEqual([
      'Crestview College',
      'Greenfield Academy',
    ]);
    const owner = authed(t, signedIn.body.data.accessToken as string);
    const o = (await owner.get('/api/v1/group/overview')).body.data;
    expect(o).toMatchObject({ group: { name: `Greenfield Group ${suffix}` }, role: 'Group owner' });
    expect(o.schools).toHaveLength(2);
    const gf = o.schools.find((s: { name: string }) => s.name === 'Greenfield Academy');
    expect(gf.students).toBeGreaterThan(10);
    expect(gf.fees).toMatchObject({ billed: expect.any(Number), collected: expect.any(Number) });
    expect(o.totals.students).toBe(
      o.schools.reduce((a: number, s: { students: number }) => a + s.students, 0),
    );

    // Group academic staff see the schools without the fees.
    const staffId = (await tolu.get(`${G}/${group.id}`)).body.data.staff[0].id;
    await tolu.put(`${G}/${group.id}/staff/${staffId}`).send({ role: 'Group academic' });
    const academic = authed(t, (await login(t, OWNER, PASS)).body.data.accessToken as string);
    const a = (await academic.get('/api/v1/group/overview')).body.data;
    expect(a.role).toBe('Group academic');
    expect(a.totals.fees).toBeNull();
    const role = await t.prisma.schoolMembership.findFirstOrThrow({
      where: { user: { email: OWNER }, schoolId: greenfield },
      include: { roles: { include: { role: true } } },
    });
    expect(role.roles[0]!.role.key).toBe('academic_head');

    // School staff who aren't group staff can't open it.
    const adaeze = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    expect((await adaeze.get('/api/v1/group/overview')).body.error.code).toBe('NOT_GROUP_STAFF');
  });

  it('closes group accounts when a school leaves or a person leaves', async () => {
    await tolu.delete(`${G}/${group.id}/schools/${crestview}`);
    const atCrestview = await t.prisma.schoolMembership.findFirstOrThrow({
      where: { user: { email: OWNER }, schoolId: crestview },
    });
    expect(atCrestview.status).toBe('DEACTIVATED');
    const staffId = (await tolu.get(`${G}/${group.id}`)).body.data.staff[0].id;
    await tolu.delete(`${G}/${group.id}/staff/${staffId}`);
    expect(
      await t.prisma.schoolMembership.count({
        where: { user: { email: OWNER }, status: { not: 'DEACTIVATED' } },
      }),
    ).toBe(0);
  });
});
