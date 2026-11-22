import { authed, createTestApp, login, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const ADAEZE = 'adaeze.okonkwo@greenfield.edu.ng';

/**
 * The school's plan: modules outside it are refused (MODULE_NOT_IN_PLAN) and left out of the Setup
 * Center, its portals close when the plan lacks them, and the student and staff-login limits refuse
 * new ones at the limit while telling EduTrack's back office.
 */
describe('Plan modules and limits (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  let originalPlanId: string;
  let smallPlanId: string;

  const usePlan = (patch: {
    modules?: string[];
    studentLimit?: number | null;
    userLimit?: number | null;
  }) => t.prisma.plan.update({ where: { id: smallPlanId }, data: patch });

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    const school = await t.prisma.school.findUniqueOrThrow({
      where: { slug: 'greenfield' },
      include: { subscription: { include: { plan: true } } },
    });
    schoolId = school.id;
    originalPlanId = school.subscription!.planId;
    const { id: _id, name: _n, createdAt: _c, updatedAt: _u, ...rest } = school.subscription!.plan;
    smallPlanId = (
      await t.prisma.plan.create({
        data: { ...rest, name: `Test plan ${Date.now()}`, status: 'ACTIVE' },
      })
    ).id;
    await t.prisma.subscription.update({ where: { schoolId }, data: { planId: smallPlanId } });
    admin = authed(t, (await signIn(t, ADAEZE)).token);
  });

  afterAll(async () => {
    await t.prisma.subscription.update({ where: { schoolId }, data: { planId: originalPlanId } });
    await t.prisma.plan.delete({ where: { id: smallPlanId } });
    await t.reseed();
    await t.close();
  });

  describe('modules', () => {
    beforeAll(() =>
      usePlan({
        modules: [
          'profile',
          'users',
          'sessions',
          'classes',
          'students',
          'staff',
          'subjects',
          'teacher',
        ],
      }),
    );

    it('tells the screens which modules the plan has', async () => {
      const res = await signIn(t, ADAEZE);
      const modules = res.body.data.school.modules as string[];
      expect(modules).toEqual(expect.arrayContaining(['students', 'subjects', 'teacher']));
      expect(modules).not.toContain('fees');
    });

    it('refuses features outside the plan, and keeps the rest', async () => {
      const fees = await admin.get('/api/v1/finance/invoices');
      expect(fees.status).toBe(403);
      expect(fees.body.error.code).toBe('MODULE_NOT_IN_PLAN');
      expect(fees.body.message).toMatch(/^Fees & invoices isn’t included in your Test plan/);
      expect((await admin.get('/api/v1/reports')).body.error.code).toBe('MODULE_NOT_IN_PLAN');
      expect((await admin.get('/api/v1/academics/timetable')).body.error.code).toBe(
        'MODULE_NOT_IN_PLAN',
      );
      expect((await admin.get('/api/v1/academics/results')).body.error.code).toBe(
        'MODULE_NOT_IN_PLAN',
      );
      expect((await admin.get('/api/v1/students')).status).toBe(200);
      expect((await admin.get('/api/v1/academics/curriculum')).status).toBe(200);
    });

    it('leaves those features out of the Setup Center', async () => {
      const ids = ((await admin.get('/api/v1/setup')).body.data.steps as { id: string }[]).map(
        (s) => s.id,
      );
      expect(ids).toContain('subjects-curriculum');
      expect(ids).not.toEqual(expect.arrayContaining(['fees']));
      expect(ids).not.toContain('timetable');
      expect(ids).not.toContain('assessment-grading');
    });

    it('closes portals the plan doesn’t include, and features inside open ones', async () => {
      const parent = await login(t, 'funke.adeyemi@gmail.com', undefined, {
        host: HOST,
        portal: 'parent',
      });
      expect(parent.status).toBe(403);
      expect(parent.body.error.code).toBe('MODULE_NOT_IN_PLAN');
      expect(parent.body.message).toMatch(/doesn’t include the Parent Portal/);
      const student = await login(t, 'STU-2025-0042', undefined, { host: HOST, portal: 'student' });
      expect(student.body.error.code).toBe('MODULE_NOT_IN_PLAN');
      // The Teacher Workspace is in the plan, homework isn't.
      const teacher = authed(
        t,
        (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token,
        { host: HOST },
      );
      expect((await teacher.get('/api/v1/me')).status).toBe(200);
      expect((await teacher.get('/api/v1/assignments')).body.error.code).toBe('MODULE_NOT_IN_PLAN');
      // Taking the Teacher Workspace off closes sessions already open.
      await usePlan({ modules: ['profile', 'users', 'sessions', 'classes', 'students', 'staff'] });
      expect((await teacher.get('/api/v1/me')).body.error.code).toBe('MODULE_NOT_IN_PLAN');
      expect((await teacher.post('/api/v1/auth/logout')).status).toBeLessThan(400);
    });
  });

  describe('limits', () => {
    beforeAll(async () => {
      const full = await t.prisma.plan.findUniqueOrThrow({ where: { id: originalPlanId } });
      await usePlan({ modules: full.modules });
    });

    it('refuses an admission at the student limit and alerts EduTrack', async () => {
      const onRoll = await t.prisma.student.count({
        where: { schoolId, status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] }, deletedAt: null },
      });
      await usePlan({ studentLimit: onRoll });
      const res = await admin.post('/api/v1/admissions').send({
        applicationId: null,
        surname: 'Limit',
        firstName: 'Tester',
        otherNames: '',
        gender: 'Female',
        dateOfBirth: '2014-05-12',
        stateOfOrigin: 'lagos',
        previousSchool: '',
        guardian: { mode: 'skip' },
        relationship: 'Mother',
        paysFees: true,
        invite: false,
        branch: 'Main Campus',
        level: 'JSS 1',
        arm: 'A',
        admissionType: 'New intake',
        admissionDate: '',
        religious: 'CRS',
        elective: 'Computer Studies',
        documents: { birth: 'birth.pdf', photo: null, report: null },
        billing: 'full',
        siblingDiscount: false,
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STUDENT_LIMIT');
      expect(res.body.message).toMatch(/Upgrade your plan to admit more\.$/);
      const tolu = await t.prisma.user.findUniqueOrThrow({ where: { email: 'tolu@edutrack.ng' } });
      expect(
        await t.prisma.notification.count({
          where: { userId: tolu.id, category: 'plan.limit', entityId: schoolId },
        }),
      ).toBeGreaterThan(0);
      await usePlan({ studentLimit: null });
    });

    it('refuses another staff login at the user limit', async () => {
      const logins = await t.prisma.schoolMembership.count({
        where: { schoolId, kind: 'STAFF', status: { in: ['INVITED', 'ACTIVE', 'SUSPENDED'] } },
      });
      await usePlan({ userLimit: logins });
      const res = await admin.post('/api/v1/users/invitations').send({
        name: 'New Bursar',
        email: `limit-${Date.now()}@greenfield.edu.ng`,
        roles: ['Teacher'],
        scope: 'School',
        branches: [],
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USER_LIMIT');
      await usePlan({ userLimit: null });
    });
  });
});
