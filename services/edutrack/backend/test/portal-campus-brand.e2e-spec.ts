import {
  authed,
  createTestApp,
  login,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

const HOST = 'greenfield.localhost';
const COLOUR = '#0F766E';

interface Campus {
  name: string;
  brandColor: string | null;
  logoUrl: string | null;
}

/**
 * Teacher, Parent and Student Portals are themed in the person's campus: a pupil's campus, the
 * selected child's campus, and a teacher's campus when they work at one (the school's brand when
 * they work at several). Each campus here has its own colour.
 */
describe('Portal campus branding (e2e)', () => {
  let t: TestApp;
  let schoolId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    await t.prisma.branch.updateMany({ where: { schoolId }, data: { brandColor: COLOUR } });
  });

  afterAll(async () => {
    await t.prisma.branch.updateMany({ where: { schoolId }, data: { brandColor: null } });
    await t.reseed();
    await t.close();
  });

  it('gives a pupil their campus', async () => {
    const res = await login(t, 'STU-2025-0042', PASSWORD, { portal: 'student', host: HOST });
    expect(res.status).toBe(200);
    const me = authed(t, res.body.data.accessToken as string, { host: HOST });
    const o = (await me.get('/api/v1/student/overview')).body.data;
    expect(o.campus).toMatchObject({ name: o.student.branch, brandColor: COLOUR });
  });

  it('gives a parent each child’s campus', async () => {
    const res = await login(t, 'funke.adeyemi@gmail.com', PASSWORD, {
      portal: 'parent',
      host: HOST,
    });
    const funke = authed(t, res.body.data.accessToken as string, { host: HOST });
    const children = (await funke.get('/api/v1/parent/children')).body.data as {
      branch: string;
      campus: Campus | null;
    }[];
    expect(children.length).toBeGreaterThan(1);
    for (const c of children)
      expect(c.campus).toMatchObject({ name: c.branch, brandColor: COLOUR });
  });

  it('gives a teacher their campus only when they work at one', async () => {
    const okafor = authed(
      t,
      (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token,
      { host: HOST },
    );
    const me = (await okafor.get('/api/v1/me')).body.data as {
      branches: { name: string }[];
      campus: Campus | null;
    };
    if (me.branches.length === 1)
      expect(me.campus).toMatchObject({ name: me.branches[0]!.name, brandColor: COLOUR });
    else expect(me.campus).toBeNull();
  });
});
