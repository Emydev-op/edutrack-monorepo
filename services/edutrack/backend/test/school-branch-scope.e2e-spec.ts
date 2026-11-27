import { hashPassword } from '../src/auth/password.js';
import { authed, createTestApp, PASSWORD, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const LEKKI_ADMIN = `lekki.admin.${Date.now()}@greenfield.edu.ng`;

/**
 * A branch-scoped School Admin user (Users & Roles › scope "Branch") works only in their branches:
 * the switcher lists only theirs, lists stay on their branch, records at other branches are
 * refused, changes aimed elsewhere are refused, and school-wide settings stay with whole-school
 * admins. Whole-school admins are unaffected.
 */
describe('Branch-scoped School Admin users (e2e)', () => {
  let t: TestApp;
  let lekki: Api;
  let admin: Api;
  let mainStudent: string;
  let mainArm: string;
  let userId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    const school = await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } });
    const branch = await t.prisma.branch.findFirstOrThrow({
      where: { schoolId: school.id, code: 'GFA-LK' },
    });
    // Owner as well as Branch Admin: even full permissions stop at the branch scope.
    const roles = await t.prisma.schoolRole.findMany({
      where: { schoolId: school.id, key: { in: ['branch_admin', 'owner'] } },
    });
    const user = await t.prisma.user.create({
      data: {
        email: LEKKI_ADMIN,
        firstName: 'Lekki',
        lastName: 'Admin',
        status: 'ACTIVE',
        passwordHash: await hashPassword(PASSWORD),
        passwordChangedAt: new Date(),
      },
    });
    userId = user.id;
    await t.prisma.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: user.id,
        kind: 'STAFF',
        status: 'ACTIVE',
        scope: 'BRANCH',
        activatedAt: new Date(),
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
        branches: { create: { branchId: branch.id } },
      },
    });
    lekki = authed(t, (await signIn(t, LEKKI_ADMIN)).token);
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    const e = await t.prisma.enrollment.findFirstOrThrow({
      where: {
        schoolId: school.id,
        status: 'ACTIVE',
        branch: { code: 'GFA-MC' },
        armId: { not: null },
      },
    });
    mainStudent = e.studentId;
    mainArm = e.armId!;
  });

  afterAll(async () => {
    await t.prisma.schoolMembership.deleteMany({ where: { userId } });
    await t.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await t.reseed();
    await t.close();
  });

  it('switches only between their own branches', async () => {
    const o = (await lekki.get('/api/v1/context-options')).body.data;
    expect(o.branches.map((b: { name: string }) => b.name)).toEqual(['Lekki Campus']);
    expect(o.defaults.branch).toBe('Lekki Campus');
    const all = (await admin.get('/api/v1/context-options')).body.data;
    expect(all.branches.map((b: { name: string }) => b.name)).toContain('All branches');
  });

  it('keeps lists on their branch, whatever branch is asked for', async () => {
    const asked = await lekki.get('/api/v1/students?branch=Main%20Campus&pageSize=50');
    expect(asked.status).toBe(200);
    expect(JSON.stringify(asked.body.data)).not.toContain(mainStudent);
    const allAsked = await lekki.get('/api/v1/students?branch=All%20branches&pageSize=50');
    expect(JSON.stringify(allAsked.body.data)).not.toContain(mainStudent);
    const whole = await admin.get('/api/v1/students?branch=Main%20Campus&pageSize=50');
    expect(JSON.stringify(whole.body.data)).toContain(mainStudent);
  });

  it('keeps a list on their branch when no working branch is sent at all', async () => {
    // No `branch` query and no working-context headers (a script or another client).
    const bare = await lekki.get('/api/v1/students?pageSize=50');
    expect(bare.status).toBe(200);
    expect(JSON.stringify(bare.body.data)).not.toContain(mainStudent);
    const whole = await admin.get('/api/v1/students?pageSize=50');
    expect(whole.body.meta.total).toBeGreaterThan(bare.body.meta.total);
  });

  it('keeps boarding on their branch: hostels, boarders and hostel records', async () => {
    const school = await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } });
    const main = await t.prisma.branch.findFirstOrThrow({
      where: { schoolId: school.id, code: 'GFA-MC' },
    });
    const hostel = await t.prisma.hostel.create({
      data: { schoolId: school.id, branchId: main.id, name: 'Scope Test House', gender: 'MIXED' },
    });
    try {
      const mine = await lekki.get('/api/v1/boarding/hostels');
      expect(mine.status).toBe(200);
      expect(JSON.stringify(mine.body.data)).not.toContain(hostel.id);
      const asked = await lekki.get(`/api/v1/boarding/hostels?branchId=${main.id}`);
      expect(JSON.stringify(asked.body.data)).not.toContain(hostel.id);
      expect((await lekki.get(`/api/v1/boarding/hostels/${hostel.id}`)).status).toBe(403);
      expect((await lekki.get(`/api/v1/boarding/hostels/${hostel.id}/occupancy`)).status).toBe(403);
      const boarders = await lekki.get(`/api/v1/boarding/boarders?branchId=${main.id}`);
      expect(boarders.status).toBe(200);
      expect(JSON.stringify(boarders.body.data)).not.toContain(mainStudent);
      // The whole-school admin sees it.
      const all = await admin.get('/api/v1/boarding/hostels');
      expect(JSON.stringify(all.body.data)).toContain(hostel.id);
    } finally {
      await t.prisma.hostel.delete({ where: { id: hostel.id } });
    }
  });

  it('refuses records at other branches', async () => {
    const student = await lekki.get(`/api/v1/students/${mainStudent}`);
    expect(student.status).toBe(403);
    expect(student.body.error.code).toBe('BRANCH_SCOPE');
    expect(student.body.message).toBe('That’s at Main Campus. You manage Lekki Campus only.');
    expect((await lekki.get(`/api/v1/academics/classes/${mainArm}`)).body.error.code).toBe(
      'BRANCH_SCOPE',
    );
    expect(
      (await lekki.get(`/api/v1/academics/results/report-card/${mainStudent}`)).body.error.code,
    ).toBe('BRANCH_SCOPE');
    expect((await lekki.get(`/api/v1/finance/students/${mainStudent}`)).status).toBe(403);
    // The whole-school admin opens them.
    expect((await admin.get(`/api/v1/students/${mainStudent}`)).status).toBe(200);
  });

  it('refuses changes aimed at another branch, and school-wide ones', async () => {
    const admit = await lekki.post('/api/v1/admissions').send({ branch: 'Main Campus' });
    expect(admit.status).toBe(403);
    expect(admit.body.error.code).toBe('BRANCH_SCOPE');
    const profile = await lekki.put('/api/v1/school/profile').send({});
    expect(profile.status).toBe(403);
    expect(profile.body.error.code).toBe('SCHOOL_WIDE_ONLY');
    const branch = await lekki.post('/api/v1/branches').send({ name: 'Ikoyi', code: 'GFA-IK' });
    expect(branch.body.error.code).toBe('SCHOOL_WIDE_ONLY');
    // Reading school-wide settings is fine.
    expect((await lekki.get('/api/v1/school/profile')).status).toBe(200);
  });
});
