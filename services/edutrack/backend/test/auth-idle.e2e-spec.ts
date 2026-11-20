import { createTestApp, nextIp, signIn, type TestApp } from './support/test-app.js';

const MINUTE = 60_000;
const ADMIN = 'adaeze.okonkwo@greenfield.edu.ng';

/** Staff sessions end after the school's idle time, unless the device was remembered. */
describe('Idle sign-out (e2e)', () => {
  let t: TestApp;

  const refresh = (cookie: string) =>
    t
      .http()
      .post('/api/v1/auth/refresh')
      .set('X-Forwarded-For', nextIp())
      .set('Cookie', `et_rt_school_admin=${cookie}`)
      .send({});

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
  });

  afterAll(async () => {
    t.clock.set(Date.now());
    await t.reseed();
    await t.close();
  });

  it('sends the school’s idle time with the session', async () => {
    const { body } = await signIn(t, ADMIN);
    expect(body.data.school.idleTimeoutMinutes).toBe(30);
  });

  it('refuses to renew a session left idle past the school’s limit', async () => {
    t.clock.set(Date.now());
    const s = await signIn(t, ADMIN);
    t.clock.advance(20 * MINUTE);
    const fresh = await refresh(s.cookie);
    expect(fresh.status).toBe(200);
    const next = fresh.headers['set-cookie']!.toString().match(/et_rt_school_admin=([^;]+)/)![1]!;
    t.clock.advance(31 * MINUTE);
    const idle = await refresh(next);
    expect(idle.status).toBe(401);
    expect(idle.body.error.code).toBe('SESSION_IDLE');
    const row = await t.prisma.authSession.findFirst({
      where: { revokedReason: 'idle' },
      orderBy: { revokedAt: 'desc' },
    });
    expect(row).toBeTruthy();
  });

  it('keeps remembered devices signed in', async () => {
    t.clock.set(Date.now());
    const s = await signIn(t, ADMIN, { remember: true });
    t.clock.advance(3 * 60 * MINUTE);
    expect((await refresh(s.cookie)).status).toBe(200);
  });
});
