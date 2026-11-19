import { DailyChecksService } from '../src/platform/alerts/daily-checks.service.js';
import { lagosToday } from '../src/platform/shared/format.js';
import { authed, createTestApp, login, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const DAY = 86_400_000;
const HOST = 'greenfield.localhost';
const ADAEZE = 'adaeze.okonkwo@greenfield.edu.ng';
const OKAFOR = 'g.okafor@greenfield.edu.ng';

/**
 * A lapsed subscription (restricted, expired or cancelled): School Admin signs in and sees
 * everything but changes nothing except Support; the Teacher Workspace (and the family portals)
 * close, including sessions already open. The daily checks move subscriptions along by date.
 */
describe('School subscription rules (e2e)', () => {
  let t: TestApp;
  let schoolId: string;
  let admin: Api;
  let teacher: Api;
  let tolu: Api;

  const setStatus = (status: 'ACTIVE' | 'EXPIRED' | 'RESTRICTED' | 'CANCELLED' | 'GRACE_PERIOD') =>
    t.prisma.subscription.update({ where: { schoolId }, data: { status } });

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findFirstOrThrow({ where: { slug: 'greenfield' } })).id;
    admin = authed(t, (await signIn(t, ADAEZE)).token);
    teacher = authed(t, (await signIn(t, OKAFOR, { host: HOST })).token, { host: HOST });
    tolu = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  describe('when the subscription has lapsed', () => {
    beforeAll(() => setStatus('EXPIRED'));

    it('keeps teachers out, at sign-in and in sessions already open', async () => {
      const res = await login(t, OKAFOR, undefined, { host: HOST });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SUBSCRIPTION_LAPSED');
      expect(res.body.message).toMatch(/Greenfield Academy’s EduTrack subscription has lapsed/);

      const open = await teacher.get('/api/v1/me');
      expect(open.status).toBe(403);
      expect(open.body.error.code).toBe('SUBSCRIPTION_LAPSED');
      // Signing out still works.
      expect((await teacher.post('/api/v1/auth/logout')).status).toBeLessThan(400);
    });

    it('lets School Admin sign in and look, but not change anything', async () => {
      const res = await signIn(t, ADAEZE);
      expect(res.body.data.school.subscriptionStatus).toBe('Restricted');

      expect((await admin.get('/api/v1/students')).status).toBe(200);
      expect((await admin.get('/api/v1/school/profile')).status).toBe(200);
      const write = await admin
        .post('/api/v1/branches')
        .send({ name: 'Lekki Campus', code: 'GFA-LK' });
      expect(write.status).toBe(403);
      expect(write.body.error.code).toBe('SUBSCRIPTION_READ_ONLY');
      expect(write.body.message).toMatch(/view-only until it’s renewed/);
      expect((await admin.put('/api/v1/school/profile').send({})).body.error.code).toBe(
        'SUBSCRIPTION_READ_ONLY',
      );
    });

    it('keeps Support and the inbox working', async () => {
      const ticket = await admin.post('/api/v1/support/tickets').send({
        category: 'Account & billing',
        subject: 'Renewing our subscription',
        description: 'Our subscription lapsed. How do we pay for the new year?',
      });
      expect(ticket.status).toBe(201);
      expect((await admin.post('/api/v1/notifications/read-all')).status).toBe(200);
    });

    it.each(['RESTRICTED', 'CANCELLED'] as const)('treats %s the same way', async (status) => {
      await setStatus(status);
      expect((await login(t, OKAFOR, undefined, { host: HOST })).body.error.code).toBe(
        'SUBSCRIPTION_LAPSED',
      );
      expect(
        (await admin.post('/api/v1/branches').send({ name: 'Lekki', code: 'GFA-LK' })).body.error
          .code,
      ).toBe('SUBSCRIPTION_READ_ONLY');
    });

    it('opens everything again the moment EduTrack reactivates it', async () => {
      const res = await tolu
        .post(`/api/v1/platform/schools/${schoolId}/subscription/actions`)
        .send({ action: 'reactivate' });
      expect(res.status).toBeLessThan(300);
      const back = authed(t, (await signIn(t, OKAFOR, { host: HOST })).token, { host: HOST });
      expect((await back.get('/api/v1/me')).status).toBe(200);
      expect((await signIn(t, ADAEZE)).body.data.school.subscriptionStatus).toBe('Active');
    });
  });

  it('a grace period keeps everything open', async () => {
    await setStatus('GRACE_PERIOD');
    expect((await login(t, OKAFOR, undefined, { host: HOST })).status).toBe(200);
    const write = await admin.put('/api/v1/school/profile').send({});
    expect(write.body.error?.code).not.toBe('SUBSCRIPTION_READ_ONLY');
  });

  describe('the daily checks', () => {
    const run = () => t.app.get(DailyChecksService).run();
    const sub = () => t.prisma.subscription.findUniqueOrThrow({ where: { schoolId } });
    const today = () => lagosToday(t.clock.now());
    const set = (status: 'ACTIVE' | 'EXPIRING' | 'GRACE_PERIOD', renewsInDays: number) =>
      t.prisma.subscription.update({
        where: { schoolId },
        data: {
          status,
          renewsOn: new Date(today().getTime() + renewsInDays * DAY),
          graceEndsOn: null,
        },
      });

    it('marks a renewal inside 30 days as expiring', async () => {
      await set('ACTIVE', 10);
      await run();
      expect((await sub()).status).toBe('EXPIRING');
    });

    it('starts a 14-day grace period once the renewal date passes, and tells the admins', async () => {
      await set('EXPIRING', -1);
      await run();
      const s = await sub();
      expect(s.status).toBe('GRACE_PERIOD');
      expect(s.graceEndsOn!.getTime()).toBe(s.renewsOn.getTime() + 14 * DAY);
      const adaeze = await t.prisma.user.findUniqueOrThrow({ where: { email: ADAEZE } });
      expect(
        await t.prisma.notification.findFirst({
          where: { userId: adaeze.id, schoolId, title: 'Subscription renewal is overdue' },
        }),
      ).toBeTruthy();
    });

    it('expires it when the grace period ends, closing the school’s portals', async () => {
      await set('GRACE_PERIOD', -15);
      await run();
      expect((await sub()).status).toBe('EXPIRED');
      expect((await login(t, OKAFOR, undefined, { host: HOST })).body.error.code).toBe(
        'SUBSCRIPTION_LAPSED',
      );
      // Running again changes nothing.
      const again = await run();
      expect(again.subscriptions.expired).toBe(0);
    });

    it('leaves a subscription well before its renewal alone', async () => {
      await set('ACTIVE', 200);
      await run();
      expect((await sub()).status).toBe('ACTIVE');
    });
  });
});
