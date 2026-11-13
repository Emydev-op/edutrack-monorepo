import { MINUTE } from '../src/common/clock/clock.js';
import {
  authed,
  createTestApp,
  login,
  nextIp,
  PASSWORD,
  setCookieLine,
  signIn,
  type TestApp,
} from './support/test-app.js';

describe('Sign-in (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('School Admin', () => {
    it('signs in with email: LoginResponse shape, short access token, HttpOnly refresh cookie', async () => {
      const res = await login(t, 'adaeze.okonkwo@greenfield.edu.ng');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        expiresIn: 900,
        user: {
          firstName: 'Adaeze',
          lastName: 'Okonkwo',
          email: 'adaeze.okonkwo@greenfield.edu.ng',
          position: 'Principal',
          roleName: 'School Admin',
          avatarUrl: null,
        },
        school: {
          name: 'Greenfield Academy',
          slug: 'greenfield',
          initials: 'GA',
          plan: 'Growth · Annual',
          brandColor: '#9B403C',
          logoUrl: null,
          subscriptionStatus: 'Active',
        },
        schools: [expect.objectContaining({ slug: 'greenfield', current: true })],
      });
      expect(typeof res.body.accessToken).toBe('string');
      const cookie = setCookieLine(res, 'et_rt_school_admin')!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      // Without "keep me signed in": a browser-session cookie.
      expect(cookie).not.toMatch(/Max-Age|Expires/i);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('signs in with a phone number in local format', async () => {
      const res = await login(t, '0809 120 4455');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('adaeze.okonkwo@greenfield.edu.ng');
    });

    it('opens a newly provisioned school', async () => {
      const res = await login(t, 'e.udo@crestviewcollege.ng');
      expect(res.status).toBe(200);
      expect(res.body.school).toMatchObject({
        name: 'Crestview College',
        plan: 'Starter · Annual',
      });
    });

    it.each([
      ['chidi.okoro@greenfield.edu.ng', 'ACCOUNT_SUSPENDED'],
      ['tunde.ojo@greenfield.edu.ng', 'ACCOUNT_DEACTIVATED'],
      ['kemi.lawal@greenfield.edu.ng', 'ACCOUNT_PENDING'],
      ['kunle.bakare@greenfield.edu.ng', 'PASSWORD_EXPIRED'],
    ])('%s is refused with %s after a correct password', async (email, code) => {
      const res = await login(t, email);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ statusCode: 403, code, error: code });
    });

    it('does not reveal block states for a wrong password', async () => {
      const res = await login(t, 'chidi.okoro@greenfield.edu.ng', 'Wrong-password-1');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('refuses a teacher-only account with NO_ACCESS', async () => {
      const res = await login(t, 's.ade@greenfield.edu.ng');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NO_ACCESS');
    });
  });

  describe('Teacher Workspace (school subdomain)', () => {
    it('signs in on the school host with the Teacher shape', async () => {
      const res = await login(t, 's.ade@greenfield.edu.ng', PASSWORD, {
        host: 'greenfield.localhost',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        user: {
          title: 'Mr.',
          firstName: 'Samuel',
          displayName: 'Mr. Samuel Ade',
          position: 'Mathematics Teacher',
          email: 's.ade@greenfield.edu.ng',
        },
        school: { name: 'Greenfield Academy', initials: 'GA', slug: 'greenfield' },
      });
      expect(setCookieLine(res, 'et_rt_teacher')).toBeDefined();
    });

    it('accepts the dev tenant header outside production', async () => {
      const res = await login(t, 'i.bello@greenfield.edu.ng', PASSWORD, { tenant: 'greenfield' });
      expect(res.status).toBe(200);
      expect(res.body.user.displayName).toBe('Mr. Ibrahim Bello');
    });

    it('shows the school’s reason for suspended and deactivated staff', async () => {
      const suspended = await login(t, 'y.oladipo@greenfield.edu.ng', PASSWORD, {
        host: 'greenfield.localhost',
      });
      expect(suspended.status).toBe(403);
      expect(suspended.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
      expect(suspended.body.message).toContain('staff review');
      const left = await login(t, 'f.adebayo@greenfield.edu.ng', PASSWORD, {
        host: 'greenfield.localhost',
      });
      expect(left.body).toMatchObject({ code: 'ACCOUNT_DEACTIVATED' });
      const expired = await login(t, 'r.adeleke@greenfield.edu.ng', PASSWORD, {
        host: 'greenfield.localhost',
      });
      expect(expired.body).toMatchObject({ code: 'PASSWORD_EXPIRED' });
    });

    it('needs a school host, and only that school’s staff get in', async () => {
      const noSchool = await login(t, 's.ade@greenfield.edu.ng', PASSWORD, { portal: 'teacher' });
      expect(noSchool.status).toBe(400);
      expect(noSchool.body.code).toBe('TENANT_REQUIRED');
      const unknown = await login(t, 's.ade@greenfield.edu.ng', PASSWORD, {
        host: 'nowhere.localhost',
      });
      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe('SCHOOL_NOT_FOUND');
      const otherSchool = await login(t, 's.ade@greenfield.edu.ng', PASSWORD, {
        host: 'crestview.localhost',
      });
      expect(otherSchool.status).toBe(403);
      expect(otherSchool.body.code).toBe('NO_ACCESS');
    });

    it('rejects a Greenfield session presented on another school’s host', async () => {
      const { token } = await signIn(t, 'g.okafor@greenfield.edu.ng', {
        host: 'greenfield.localhost',
      });
      const ok = await authed(t, token, { host: 'greenfield.localhost' }).get('/api/v1/auth/me');
      expect(ok.status).toBe(200);
      const res = await authed(t, token, { host: 'crestview.localhost' }).get('/api/v1/auth/me');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TENANT_MISMATCH');
    });
  });

  describe('Platform back office', () => {
    it('signs in platform staff with the back-office shape', async () => {
      const res = await login(t, 'tolu@edutrack.ng', PASSWORD, { portal: 'platform' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        user: {
          firstName: 'Tolu',
          roleId: 'admin',
          roleName: 'Platform Administrator',
          avatarUrl: null,
        },
      });
      expect(res.body.school).toBeUndefined();
    });

    it.each([
      ['kemi@edutrack.ng', 403, 'ACCOUNT_SUSPENDED'],
      ['bayo@edutrack.ng', 403, 'ACCOUNT_DEACTIVATED'],
      // Invited and never accepted: no password yet, so it is just a wrong password.
      ['dayo@edutrack.ng', 401, 'INVALID_CREDENTIALS'],
      // School staff are not platform staff.
      ['adaeze.okonkwo@greenfield.edu.ng', 403, 'NO_ACCESS'],
    ])('%s → %s %s', async (email, status, code) => {
      const res = await login(t, email, PASSWORD, { portal: 'platform' });
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
    });
  });

  describe('lockout', () => {
    it('counts down, pauses sign-in, then lifts after the school’s lockout time', async () => {
      const email = 'g.okafor@greenfield.edu.ng';
      const host = 'greenfield.localhost';
      for (let left = 4; left >= 1; left--) {
        const res = await login(t, email, 'Wrong-password-1', { host });
        expect(res.status).toBe(401);
        expect(res.body.message).toBe(
          `The email or password you entered is incorrect. ${left} attempt${left === 1 ? '' : 's'} left before sign-in is paused.`,
        );
      }
      const fifth = await login(t, email, 'Wrong-password-1', { host });
      expect(fifth.status).toBe(423);
      expect(fifth.body).toMatchObject({ code: 'ACCOUNT_LOCKED' });
      expect(fifth.body.message).toContain('15 minutes');

      // Even the right password is refused while paused.
      expect((await login(t, email, PASSWORD, { host })).status).toBe(423);
      t.clock.advance(14 * MINUTE);
      expect((await login(t, email, PASSWORD, { host })).status).toBe(423);
      t.clock.advance(2 * MINUTE);
      const after = await login(t, email, PASSWORD, { host });
      expect(after.status).toBe(200);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.failedSignInCount).toBe(0);
      expect(user.lockedUntil).toBeNull();
    });

    it('follows the school’s own sign-in rules', async () => {
      const school = await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } });
      await t.prisma.schoolSettings.update({
        where: { schoolId: school.id },
        data: { lockoutAttempts: 3, lockoutMinutes: 30 },
      });
      try {
        const email = 'c.eze@greenfield.edu.ng';
        const first = await login(t, email, 'Wrong-password-1', { host: 'greenfield.localhost' });
        expect(first.body.message).toContain('2 attempts left');
        await login(t, email, 'Wrong-password-1', { host: 'greenfield.localhost' });
        const third = await login(t, email, 'Wrong-password-1', { host: 'greenfield.localhost' });
        expect(third.status).toBe(423);
        expect(third.body.message).toContain('30 minutes');
      } finally {
        await t.prisma.schoolSettings.update({
          where: { schoolId: school.id },
          data: { lockoutAttempts: 5, lockoutMinutes: 15 },
        });
      }
    });

    it('answers unknown emails exactly like real ones, including the pause', async () => {
      const email = 'nobody-here@greenfield.edu.ng';
      const first = await login(t, email, 'Wrong-password-1');
      expect(first.status).toBe(401);
      expect(first.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message:
          'The email or password you entered is incorrect. 4 attempts left before sign-in is paused.',
      });
      for (let i = 0; i < 3; i++) await login(t, email, 'Wrong-password-1');
      const fifth = await login(t, email, 'Wrong-password-1');
      expect(fifth.status).toBe(423);
      expect(fifth.body.code).toBe('ACCOUNT_LOCKED');
    });
  });

  describe('input and rate limits', () => {
    it('answers 422 with fields for bad input', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', nextIp())
        .send({ password: '', unexpected: true });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'VALIDATION' });
      expect(res.body.fields).toMatchObject({
        email: 'Enter your email address or phone number.',
        password: 'Enter your password.',
        unexpected: expect.any(String),
      });
      const notAnEmail = await login(t, 'not an email');
      expect(notAnEmail.status).toBe(422);
      expect(notAnEmail.body.fields).toEqual({
        email: 'Enter a valid email address or phone number.',
      });
    });

    it('rate-limits repeated attempts per IP and identifier with Retry-After', async () => {
      const ip = nextIp();
      let last;
      for (let i = 0; i < 21; i++)
        last = await login(t, 'spray-target@example.com', 'Wrong-password-1', { ip });
      expect(last!.status).toBe(429);
      expect(last!.body.code).toBe('RATE_LIMITED');
      expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
    });
  });
});
