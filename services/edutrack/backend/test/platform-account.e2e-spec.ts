import { DAY } from '../src/common/clock/clock.js';
import { DailyChecksService } from '../src/platform/alerts/daily-checks.service.js';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

// The smallest valid PNG (1×1, transparent).
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('Platform account, settings, notifications, history and search (e2e)', () => {
  let t: TestApp;
  let api: Api;
  let ngozi: Api;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    api = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
    ngozi = authed(t, (await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' })).token);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('profile', () => {
    it('shows and updates your own profile', async () => {
      const res = await api.get('/api/v1/platform/me/profile');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        firstName: 'Tolu',
        email: 'tolu@edutrack.ng',
        roleName: 'Platform Administrator',
        status: 'Active',
        phone: '0803 412 7781',
        avatarUrl: null,
      });
      expect(res.body.lastSignIn).toMatch(/^\d{1,2} \w{3} \d{4} · \d{2}:\d{2}/);

      const bad = await api
        .patch('/api/v1/platform/me/profile')
        .send({ firstName: 'Tolu', lastName: 'Bamidele', phone: '12' });
      expect(bad.status).toBe(422);
      const taken = await api
        .patch('/api/v1/platform/me/profile')
        .send({ firstName: 'Tolu', lastName: 'Bamidele', phone: '0805 555 0122' });
      expect(taken.body.fields.phone).toMatch(/already used/);
      const ok = await api
        .patch('/api/v1/platform/me/profile')
        .send({ firstName: 'Toluwani', lastName: 'Bamidele', phone: '' });
      expect(ok.body).toMatchObject({ firstName: 'Toluwani', phone: '' });
      await api
        .patch('/api/v1/platform/me/profile')
        .send({ firstName: 'Tolu', lastName: 'Bamidele', phone: '0803 412 7781' });
    });

    it('stores, replaces and removes the photo, checking type and size', async () => {
      const up = await api.put('/api/v1/platform/me/avatar').send({ avatarUrl: PNG });
      expect(up.status).toBe(200);
      expect(up.body.avatarUrl).toMatch(/^https:\/\/storage\.test\/platform\/avatars\/.+\.png$/);
      const firstKey = (up.body.avatarUrl as string).replace('https://storage.test/', '');
      expect(t.storage.objects.get(firstKey)?.contentType).toBe('image/png');

      const again = await api.put('/api/v1/platform/me/avatar').send({ avatarUrl: PNG });
      expect(again.body.avatarUrl).not.toBe(up.body.avatarUrl);
      expect(t.storage.objects.has(firstKey)).toBe(false);

      const fake = await api.put('/api/v1/platform/me/avatar').send({
        avatarUrl: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`,
      });
      expect(fake.body.message).toBe('Use a JPG or PNG image.');
      const gif = await api
        .put('/api/v1/platform/me/avatar')
        .send({ avatarUrl: 'data:image/gif;base64,R0lG' });
      expect(gif.status).toBe(422);
      const big = Buffer.alloc(2 * 1024 * 1024 + 10);
      big.set([0x89, 0x50, 0x4e, 0x47]);
      const tooBig = await api
        .put('/api/v1/platform/me/avatar')
        .send({ avatarUrl: `data:image/png;base64,${big.toString('base64')}` });
      expect(tooBig.body.message).toBe('The photo is larger than 2 MB.');

      const removed = await api.put('/api/v1/platform/me/avatar').send({ avatarUrl: null });
      expect(removed.body.avatarUrl).toBeNull();
      expect(t.storage.objects.size).toBe(0);
    });
  });

  describe('notification preferences', () => {
    it('starts from the defaults and saves one channel at a time', async () => {
      const res = await api.get('/api/v1/platform/settings/notifications');
      expect(res.body.map((p: { event: string }) => p.event)).toEqual([
        'User invitation',
        'Subscription expiring',
        'Subscription overdue',
        'School provisioned',
        'Support issue created',
        'Support issue urgent',
        'Security alert',
      ]);
      expect(res.body[6]).toEqual({
        event: 'Security alert',
        channels: { 'in-app': true, email: true, sms: true },
        locked: ['email'],
      });

      const saved = await api
        .put('/api/v1/platform/settings/notifications')
        .send({ event: 'Subscription expiring', channel: 'sms', enabled: false });
      expect(saved.body[1].channels).toEqual({ 'in-app': true, email: true, sms: false });

      const locked = await api
        .put('/api/v1/platform/settings/notifications')
        .send({ event: 'Security alert', channel: 'email', enabled: false });
      expect(locked.body.code).toBe('CHANNEL_LOCKED');
      const unknown = await api
        .put('/api/v1/platform/settings/notifications')
        .send({ event: 'Lunch', channel: 'email', enabled: false });
      expect(unknown.status).toBe(422);
    });
  });

  describe('security settings', () => {
    it('saves the new-device toggle, refuses IP restriction, and needs Settings', async () => {
      expect((await api.get('/api/v1/platform/settings/security')).body).toEqual({
        newDeviceAlerts: true,
        ipRestriction: false,
      });
      const off = await api
        .put('/api/v1/platform/settings/security')
        .send({ newDeviceAlerts: false });
      expect(off.body).toEqual({ newDeviceAlerts: false, ipRestriction: false });
      const event = await t.prisma.auditEvent.findFirst({
        where: { action: 'settings.security' },
        orderBy: { createdAt: 'desc' },
      });
      expect(event?.after).toEqual({ value: 'New-device alerts off · IP restriction off' });

      const ip = await api.put('/api/v1/platform/settings/security').send({ ipRestriction: true });
      expect(ip.status).toBe(422);
      expect(ip.body.code).toBe('IP_RANGES_REQUIRED');

      expect((await ngozi.get('/api/v1/platform/settings/security')).status).toBe(403);
      await api.put('/api/v1/platform/settings/security').send({ newDeviceAlerts: true });
    });
  });

  describe('notifications', () => {
    it('lists your notifications and marks them read', async () => {
      const res = await api.get('/api/v1/platform/notifications');
      expect(res.status).toBe(200);
      expect(res.body.filter((n: { unread: boolean }) => n.unread)).toHaveLength(2);
      expect(res.body[0]).toMatchObject({
        title: 'Unity Model College has an overdue invoice',
        to: expect.stringMatching(/^\/schools\/.+\/billing$/),
      });
      const read = await api.post('/api/v1/platform/notifications/read-all');
      expect(read.status).toBe(200);
      expect(read.body.every((n: { unread: boolean }) => !n.unread)).toBe(true);
    });
  });

  describe('daily checks', () => {
    it('alerts once about renewals, overdue invoices and lapsed invitations', async () => {
      const checks = t.app.get(DailyChecksService);
      const ngoziId = (
        await t.prisma.user.findUniqueOrThrow({ where: { email: 'ngozi@edutrack.ng' } })
      ).id;
      const count = (category: string) =>
        t.prisma.notification.count({ where: { userId: ngoziId, category } });

      const first = await checks.run();
      expect(first.expiring).toBeGreaterThanOrEqual(1);
      expect(first.overdue).toBeGreaterThanOrEqual(2);
      const expiring = await count('subscription.expiring');
      const overdue = await count('subscription.overdue');
      expect(expiring).toBeGreaterThanOrEqual(1);
      expect(overdue).toBeGreaterThanOrEqual(2);
      expect(t.notifications.find('ngozi@edutrack.ng', 'platform-alert')).toBeDefined();

      await checks.run();
      expect(await count('subscription.expiring')).toBe(expiring);
      expect(await count('subscription.overdue')).toBe(overdue);

      // A week later Dayo's invitation has lapsed.
      t.clock.advance(8 * DAY);
      const later = await checks.run();
      // Plus any invitations other test files left pending.
      expect(later.invitationsExpired).toBeGreaterThanOrEqual(1);
      const dayo = await t.prisma.invitation.findFirstOrThrow({
        where: { email: 'dayo@edutrack.ng', kind: 'PLATFORM_STAFF' },
        orderBy: { createdAt: 'desc' },
      });
      expect(dayo.status).toBe('EXPIRED');
      expect(
        await t.prisma.notification.count({
          where: { userId: ngoziId, title: 'Dayo Ola’s invitation expired' },
        }),
      ).toBe(1);
      t.clock.set(Date.now());
      api = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
    });
  });

  describe('activity and audit', () => {
    it('lists back-office actions with filters, and the actors in the trail', async () => {
      const activity = await api.get('/api/v1/platform/activity?entity=School&pageSize=50');
      expect(activity.status).toBe(200);
      expect(activity.body.meta.total).toBeGreaterThan(0);
      expect(activity.body.data.every((a: { entity: string }) => a.entity === 'School')).toBe(true);
      expect(activity.body.data[0].when).toMatch(/^\d{1,2} \w{3} \d{4} · \d{2}:\d{2}$/);

      const search = await api.get('/api/v1/platform/activity?search=Pinnacle');
      expect(search.body.data[0].schoolName).toBe('Pinnacle Heights Academy');

      const future = await api.get('/api/v1/platform/audit?dateFrom=2099-01-01');
      expect(future.body.meta.total).toBe(0);
      expect((await api.get('/api/v1/platform/audit?dateFrom=yesterday')).status).toBe(422);

      const audit = await api.get('/api/v1/platform/audit?actor=Tolu%20Bamidele&pageSize=10');
      expect(audit.body.data.length).toBeGreaterThan(0);
      expect(audit.body.data.every((e: { actor: string }) => e.actor === 'Tolu Bamidele')).toBe(
        true,
      );
      const one = await api.get(`/api/v1/platform/audit/${audit.body.data[0].id}`);
      expect(one.body).toEqual(audit.body.data[0]);
      expect(
        (await api.get('/api/v1/platform/audit/00000000-0000-4000-8000-000000000000')).status,
      ).toBe(404);

      const actors = await api.get('/api/v1/platform/audit/actors');
      expect(actors.body).toEqual(expect.arrayContaining(['Tolu Bamidele', 'EduTrack']));
    });
  });

  describe('search', () => {
    it('finds schools, staff and nothing it shouldn’t', async () => {
      const unity = await api.get('/api/v1/platform/search?q=unity');
      expect(unity.body[0]).toMatchObject({
        type: 'School',
        title: 'Unity Model College',
        meta: expect.stringContaining('Grace period'),
        to: expect.stringMatching(/^\/schools\//),
      });
      const people = await api.get('/api/v1/platform/search?q=okafor');
      expect(people.body).toEqual([
        expect.objectContaining({
          type: 'User',
          title: 'Ngozi Okafor',
          meta: expect.stringContaining('Platform Support'),
        }),
      ]);
      const empty = await api.get('/api/v1/platform/search?q=zzzz-nothing');
      expect(empty.body).toEqual([]);
      const all = await api.get('/api/v1/platform/search');
      expect(all.body.length).toBeLessThanOrEqual(9);
    });
  });
});
