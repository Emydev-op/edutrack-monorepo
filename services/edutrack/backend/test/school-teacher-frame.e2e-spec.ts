import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const OKAFOR = 'g.okafor@greenfield.edu.ng';

/**
 * The Teacher Workspace's frame on the API: dashboard, sidebar counts, notifications and email
 * preferences, and the teacher's own profile. School Admin keeps its own shapes on the same
 * notification paths.
 */
describe('Teacher Workspace frame (e2e)', () => {
  let t: TestApp;
  let okafor: Api;
  let admin: Api;
  let userId: string;
  let schoolId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    okafor = authed(t, (await signIn(t, OKAFOR, { host: HOST })).token, { host: HOST });
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    userId = (await t.prisma.user.findUniqueOrThrow({ where: { email: OKAFOR } })).id;
    schoolId = (await t.prisma.school.findFirstOrThrow({ where: { slug: 'greenfield' } })).id;
  });

  afterAll(async () => {
    await t.prisma.notification.deleteMany({ where: { userId, category: 'account' } });
    await t.prisma.notificationPreference.deleteMany({ where: { userId, schoolId } });
    await t.reseed();
    await t.close();
  });

  it('builds the dashboard from the timetable and today’s register', async () => {
    const res = await okafor.get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({
      termId: expect.any(String),
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      hasAssignments: true,
      metrics: { ok: true },
      lessons: { ok: true },
      todo: { ok: true },
    });
    expect(d.metrics.data.register).toMatchObject({ armName: 'JSS 2B' });
    expect(typeof d.metrics.data.classesToday).toBe('number');
    // Today's register (when it can be taken and isn't yet) is on the to-do list and the sidebar.
    const counts = (await okafor.get('/api/v1/nav-counts')).body.data;
    const open = !d.metrics.data.register.taken && !d.metrics.data.register.closedReason;
    // Results counts join these (school-results.e2e-spec.ts checks them on a fixed clock).
    expect(counts.register ?? 0).toBe(open ? 1 : 0);
    expect(d.todo.data.some((x: { kind: string }) => x.kind === 'register')).toBe(open);
  });

  it('pages notifications and marks them read, in the Teacher Workspace’s shape', async () => {
    await t.prisma.notification.createMany({
      data: [1, 2, 3].map((i) => ({
        userId,
        schoolId,
        category: 'account',
        title: `Note ${i}`,
        body: 'Hello',
        link: '/profile',
        createdAt: new Date(t.clock.now().getTime() - i * 60_000),
      })),
    });
    const list = (await okafor.get('/api/v1/notifications?filter=unread&pageSize=10')).body.data;
    expect(list.unread).toBeGreaterThanOrEqual(3);
    const first = list.rows[0];
    expect(first).toMatchObject({
      title: 'Note 1',
      body: 'Hello',
      category: 'account',
      to: '/profile',
      read: false,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    });
    const read = await okafor.post(`/api/v1/notifications/${first.id}/read`);
    expect(read.body.data).toMatchObject({ id: first.id, read: true });
    const all = await okafor.post('/api/v1/notifications/read-all');
    expect(all.body.data.marked).toBeGreaterThanOrEqual(2);
    expect((await okafor.get('/api/v1/notifications')).body.data.unread).toBe(0);
    // Someone else's notification isn't found.
    const other = await t.prisma.notification.findFirst({ where: { userId: { not: userId } } });
    if (other)
      expect((await okafor.post(`/api/v1/notifications/${other.id}/read`)).status).toBe(404);
    // School Admin still gets its bell list on the same path.
    const bell = await admin.get('/api/v1/notifications');
    expect(Array.isArray(bell.body.data)).toBe(true);
  });

  it('keeps email preferences', async () => {
    const before = (await okafor.get('/api/v1/notifications/preferences')).body.data;
    expect(before.find((p: { key: string }) => p.key === 'sheet-returned').enabled).toBe(true);
    const saved = await okafor
      .put('/api/v1/notifications/preferences')
      .send({ 'sheet-returned': false, nonsense: true });
    expect(saved.status).toBe(200);
    expect(saved.body.data.find((p: { key: string }) => p.key === 'sheet-returned').enabled).toBe(
      false,
    );
    expect((await admin.get('/api/v1/notifications/preferences')).status).toBe(403);
  });

  it('shows and saves my profile (contact details only)', async () => {
    const p = (await okafor.get('/api/v1/profile')).body.data;
    expect(p).toMatchObject({
      firstName: 'Grace',
      lastName: 'Okafor',
      classTeacherOf: expect.stringContaining('JSS 2B'),
      teaching: expect.arrayContaining([expect.stringContaining('JSS 2B')]),
    });
    const bad = await okafor.put('/api/v1/profile').send({ phone: '123', address: '' });
    expect(bad.status).toBe(422);
    const noName = await okafor
      .put('/api/v1/profile')
      .send({ phone: '0803 412 7781', emergencyContact: { name: '', phone: '0803 000 0000' } });
    expect(noName.body.message).toBe('Enter the emergency contact’s name.');
    const ok = await okafor.put('/api/v1/profile').send({
      phone: '0803 412 7781',
      address: '12 Allen Avenue, Ikeja',
      emergencyContact: { name: 'Chidi Okafor', phone: '0805 111 2222', relationship: 'Husband' },
      firstName: 'Hacker',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      firstName: 'Grace',
      address: '12 Allen Avenue, Ikeja',
      emergencyContact: { name: 'Chidi Okafor', relationship: 'Husband' },
    });
  });
});
