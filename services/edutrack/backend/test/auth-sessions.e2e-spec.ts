import { DAY, HOUR } from '../src/common/clock/clock.js';
import { sha256 } from '../src/auth/tokens.js';
import {
  authed,
  cookieFrom,
  createTestApp,
  login,
  nextIp,
  PASSWORD,
  setCookieLine,
  signIn,
  type TestApp,
} from './support/test-app.js';

const ADAEZE = 'adaeze.okonkwo@greenfield.edu.ng';
const COOKIE = 'et_rt_school_admin';

describe('Sessions, refresh and sign-out (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
  });

  afterAll(async () => {
    await t.close();
  });

  const refresh = (cookie: string | undefined, o: { host?: string; portal?: string } = {}) => {
    let req = t.http().post('/api/v1/auth/refresh').set('X-Forwarded-For', nextIp());
    if (cookie) req = req.set('Cookie', `${o.portal ? `et_rt_${o.portal}` : COOKIE}=${cookie}`);
    if (o.host) req = req.set('Host', o.host);
    return req.send(o.portal ? { portal: o.portal } : {});
  };

  describe('refresh', () => {
    it('rotates the refresh token on every use and only stores hashes', async () => {
      const first = await signIn(t, ADAEZE);
      t.clock.advance(1_000);
      const res = await refresh(first.cookie);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(ADAEZE);
      expect(res.body.accessToken).not.toBe(first.token);
      const rotated = cookieFrom(res, COOKIE)!;
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(first.cookie);

      const session = await t.prisma.authSession.findFirstOrThrow({
        where: { refreshTokenHash: sha256(rotated) },
      });
      expect(session.previousRefreshTokenHash).toBe(sha256(first.cookie));
      expect(JSON.stringify(session)).not.toContain(rotated);

      // The new access token works.
      expect((await authed(t, res.body.accessToken).get('/api/v1/auth/me')).status).toBe(200);
    });

    it('detects reuse of a rotated token and ends the whole session', async () => {
      const first = await signIn(t, ADAEZE);
      const second = cookieFrom(await refresh(first.cookie), COOKIE)!;
      t.clock.advance(30_000); // past the parallel-tab grace window

      const replay = await refresh(first.cookie);
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('SESSION_REUSED');
      // The legitimate holder is signed out too: the session is gone.
      const legit = await refresh(second);
      expect(legit.status).toBe(401);
      expect(legit.body.code).toBe('SESSION_ENDED');
      expect((await authed(t, first.token).get('/api/v1/auth/me')).status).toBe(401);
      const session = await t.prisma.authSession.findFirstOrThrow({
        where: { previousRefreshTokenHash: sha256(first.cookie) },
      });
      expect(session.revokedReason).toBe('reuse_detected');
    });

    it('tells a parallel tab to retry instead of revoking, within the grace window', async () => {
      const first = await signIn(t, ADAEZE);
      const second = cookieFrom(await refresh(first.cookie), COOKIE)!;
      const raced = await refresh(first.cookie);
      expect(raced.status).toBe(409);
      expect(raced.body.code).toBe('REFRESH_CONFLICT');
      expect((await refresh(second)).status).toBe(200);
    });

    it('fails without a cookie, with an unknown one, or for another portal', async () => {
      expect((await refresh(undefined)).body.code).toBe('SESSION_ENDED');
      expect((await refresh('not-a-real-token')).status).toBe(401);
      const { cookie } = await signIn(t, ADAEZE);
      const other = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', `et_rt_platform=${cookie}`)
        .send({ portal: 'platform' });
      expect(other.status).toBe(401);
    });

    it('ends the session at refresh when access was taken away', async () => {
      const udo = await signIn(t, 'e.udo@crestviewcollege.ng');
      const membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { user: { email: 'e.udo@crestviewcollege.ng' } },
      });
      await t.prisma.schoolMembership.update({
        where: { id: membership.id },
        data: { status: 'SUSPENDED' },
      });
      try {
        const res = await refresh(udo.cookie);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
        expect(setCookieLine(res, COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
      } finally {
        await t.prisma.schoolMembership.update({
          where: { id: membership.id },
          data: { status: 'ACTIVE' },
        });
      }
    });
  });

  describe('remember me', () => {
    it('keeps a persistent 30-day cookie and session with "keep me signed in"', async () => {
      const res = await login(t, ADAEZE, PASSWORD, { remember: true });
      const line = setCookieLine(res, COOKIE)!;
      const maxAge = Number(/Max-Age=(\d+)/.exec(line)?.[1]);
      expect(maxAge).toBeGreaterThan(29 * 24 * 3600);
      expect(maxAge).toBeLessThanOrEqual(30 * 24 * 3600);
      const cookie = cookieFrom(res, COOKIE)!;
      t.clock.advance(20 * DAY);
      const later = await refresh(cookie);
      expect(later.status).toBe(200);
      t.clock.advance(11 * DAY);
      expect((await refresh(cookieFrom(later, COOKIE))).status).toBe(401);
    });

    it('ends a browser-session sign-in after 12 hours on the server', async () => {
      const { cookie } = await signIn(t, ADAEZE);
      t.clock.advance(11 * HOUR);
      const stillOk = await refresh(cookie);
      expect(stillOk.status).toBe(200);
      expect(setCookieLine(stillOk, COOKIE)).not.toMatch(/Max-Age/);
      t.clock.advance(2 * HOUR);
      const expired = await refresh(cookieFrom(stillOk, COOKIE));
      expect(expired.status).toBe(401);
      expect(expired.body.code).toBe('SESSION_ENDED');
    });

    it('expires access tokens after 15 minutes', async () => {
      const { token } = await signIn(t, ADAEZE);
      t.clock.advance(16 * 60_000);
      const res = await authed(t, token).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('logout', () => {
    it('revokes the session at once and clears the cookie', async () => {
      const { token, cookie } = await signIn(t, ADAEZE);
      const res = await authed(t, token).post('/api/v1/auth/logout').send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, signedOut: 1 });
      expect(setCookieLine(res, COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect((await authed(t, token).get('/api/v1/auth/me')).body.code).toBe('SESSION_ENDED');
      expect((await refresh(cookie)).status).toBe(401);
    });

    it('works with only the refresh cookie (expired access token) and can sign out every device', async () => {
      const a = await signIn(t, ADAEZE);
      const b = await signIn(t, ADAEZE);
      const res = await t
        .http()
        .post('/api/v1/auth/logout')
        .set('Cookie', `${COOKIE}=${a.cookie}`)
        .send({ allDevices: true });
      expect(res.body.ok).toBe(true);
      expect(res.body.signedOut).toBeGreaterThanOrEqual(2);
      expect((await authed(t, b.token).get('/api/v1/auth/me')).status).toBe(401);
    });

    it('always answers ok, even with nothing to sign out', async () => {
      const res = await t.http().post('/api/v1/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, signedOut: 0 });
    });
  });

  describe('me', () => {
    it('returns the user, school, membership, roles and permissions', async () => {
      const { token } = await signIn(t, ADAEZE);
      const res = await authed(t, token).get('/api/v1/auth/me');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        portal: 'school_admin',
        user: { email: ADAEZE, roleName: 'School Admin' },
        school: { slug: 'greenfield' },
        membership: {
          kind: 'STAFF',
          roles: expect.arrayContaining([expect.objectContaining({ key: 'school_admin' })]),
        },
      });
      expect(res.body.membership.permissions).toEqual(
        expect.arrayContaining(['students.view', 'settings.users', 'results.publish']),
      );
    });

    it('returns the AuthUser shape plus permissions for platform staff', async () => {
      const { token } = await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' });
      const res = await authed(t, token).get('/api/v1/auth/me');
      expect(res.body).toMatchObject({
        portal: 'platform',
        roleId: 'support',
        email: 'ngozi@edutrack.ng',
      });
      expect(res.body.permissions).toContain('Support.Manage');
      expect(res.body.permissions).not.toContain('Settings.View');
    });
  });

  describe('devices', () => {
    it('lists live sessions current-first, signs out one, refuses the current one', async () => {
      const desk = await signIn(t, 'i.bello@greenfield.edu.ng', { host: 'greenfield.localhost' });
      const phone = await signIn(t, 'i.bello@greenfield.edu.ng', {
        host: 'greenfield.localhost',
        userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36',
      });
      const api = authed(t, desk.token, { host: 'greenfield.localhost' });
      const list = await api.get('/api/v1/auth/sessions');
      expect(list.status).toBe(200);
      expect(list.body[0]).toMatchObject({
        current: true,
        device: 'Chrome on macOS',
        portal: 'teacher',
      });
      const other = list.body.find((s: { device: string }) => s.device === 'Chrome on Android');
      expect(other).toMatchObject({ current: false });
      expect(Date.parse(other.signedInAt)).not.toBeNaN();

      const current = await api.delete(`/api/v1/auth/sessions/${list.body[0].id}`);
      expect(current.status).toBe(409);
      expect(current.body.code).toBe('CURRENT_SESSION');
      expect((await api.delete(`/api/v1/auth/sessions/${other.id}`)).body).toEqual({ ok: true });
      expect(
        (await authed(t, phone.token, { host: 'greenfield.localhost' }).get('/api/v1/auth/me'))
          .status,
      ).toBe(401);
      const again = await api.delete(`/api/v1/auth/sessions/${other.id}`);
      expect(again.status).toBe(404);
      expect((await api.delete('/api/v1/auth/sessions/not-a-uuid')).status).toBe(404);
    });

    it('cannot end another user’s session', async () => {
      const mine = await signIn(t, ADAEZE);
      const theirs = await signIn(t, 'e.udo@crestviewcollege.ng');
      const theirSession = await t.prisma.authSession.findFirstOrThrow({
        where: { refreshTokenHash: sha256(theirs.cookie) },
      });
      const res = await authed(t, mine.token).delete(`/api/v1/auth/sessions/${theirSession.id}`);
      expect(res.status).toBe(404);
      expect((await authed(t, theirs.token).get('/api/v1/auth/me')).status).toBe(200);
    });

    it('signs out every other device', async () => {
      const keep = await signIn(t, 'e.udo@crestviewcollege.ng');
      const other = await signIn(t, 'e.udo@crestviewcollege.ng');
      const res = await authed(t, keep.token).post('/api/v1/auth/sessions/sign-out-others');
      expect(res.status).toBe(200);
      expect(res.body.signedOut).toBeGreaterThanOrEqual(1);
      expect((await authed(t, other.token).get('/api/v1/auth/me')).status).toBe(401);
      expect((await authed(t, keep.token).get('/api/v1/auth/me')).status).toBe(200);
    });
  });

  describe('change password', () => {
    it('checks the current password and policy, keeps this session, ends the others', async () => {
      const email = 's.ade@greenfield.edu.ng';
      const host = 'greenfield.localhost';
      const here = await signIn(t, email, { host });
      const there = await signIn(t, email, { host });
      const api = authed(t, here.token, { host });

      const wrong = await api
        .post('/api/v1/auth/password/change')
        .send({ current: 'nope', next: 'New-Password-2026' });
      expect(wrong.status).toBe(422);
      expect(wrong.body.fields).toEqual({ current: 'Your current password is incorrect.' });
      const weak = await api
        .post('/api/v1/auth/password/change')
        .send({ current: PASSWORD, next: 'weakpass' });
      expect(weak.body.fields.next).toContain('at least 8 characters');
      const same = await api
        .post('/api/v1/auth/password/change')
        .send({ current: PASSWORD, next: PASSWORD });
      expect(same.status).toBe(422);

      const ok = await api
        .post('/api/v1/auth/password/change')
        .send({ current: PASSWORD, next: 'New-Password-2026' });
      expect(ok.status).toBe(200);
      expect(ok.body.signedOut).toBeGreaterThanOrEqual(1);
      expect((await authed(t, there.token, { host }).get('/api/v1/auth/me')).status).toBe(401);
      expect((await api.get('/api/v1/auth/me')).status).toBe(200);
      expect((await login(t, email, PASSWORD, { host })).status).toBe(401);
      expect((await login(t, email, 'New-Password-2026', { host })).status).toBe(200);
      expect(t.notifications.find(email, 'password-changed')).toBeDefined();
    });
  });

  describe('switch school', () => {
    it('lists every school and moves the session to the chosen one', async () => {
      const crestview = await t.prisma.school.findUniqueOrThrow({ where: { slug: 'crestview' } });
      const greenfield = await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } });
      const adaeze = await t.prisma.user.findUniqueOrThrow({ where: { email: ADAEZE } });
      const role = await t.prisma.schoolRole.findFirstOrThrow({
        where: { schoolId: crestview.id, key: 'school_admin' },
      });
      const membership = await t.prisma.schoolMembership.create({
        data: {
          schoolId: crestview.id,
          userId: adaeze.id,
          kind: 'STAFF',
          status: 'ACTIVE',
          // Nested rows take school_id from the composite foreign key.
          roles: { create: { roleId: role.id } },
        },
      });
      try {
        const signedIn = await signIn(t, ADAEZE, { schoolId: greenfield.id });
        expect(signedIn.body.school.slug).toBe('greenfield');
        expect(signedIn.body.schools.map((s: { slug: string }) => s.slug).sort()).toEqual([
          'crestview',
          'greenfield',
        ]);

        const switched = await authed(t, signedIn.token)
          .post('/api/v1/auth/switch-school')
          .send({ schoolId: crestview.id });
        expect(switched.status).toBe(200);
        expect(switched.body.school.slug).toBe('crestview');
        expect(switched.body.schools.find((s: { current: boolean }) => s.current).slug).toBe(
          'crestview',
        );
        // The old token named Greenfield; the session now says Crestview, so it no longer works.
        expect((await authed(t, signedIn.token).get('/api/v1/auth/me')).status).toBe(401);
        const me = await authed(t, switched.body.accessToken).get('/api/v1/auth/me');
        expect(me.body.school.slug).toBe('crestview');
        // Refresh keeps the chosen school.
        expect((await refresh(signedIn.cookie)).body.school.slug).toBe('crestview');

        const nowhere = await authed(t, switched.body.accessToken)
          .post('/api/v1/auth/switch-school')
          .send({ schoolId: '01a1d53d-0000-7000-8000-000000000000' });
        expect(nowhere.status).toBe(403);
        expect(nowhere.body.code).toBe('NO_ACCESS');
      } finally {
        await t.prisma.schoolMembership.delete({ where: { id: membership.id } });
      }
    });

    it('is School Admin only', async () => {
      const { token } = await signIn(t, 'c.eze@greenfield.edu.ng', {
        host: 'greenfield.localhost',
      });
      const res = await authed(t, token, { host: 'greenfield.localhost' })
        .post('/api/v1/auth/switch-school')
        .send({ schoolId: '01a1d53d-0000-7000-8000-000000000000' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('WRONG_PORTAL');
    });
  });
});
