import { MINUTE } from '../src/common/clock/clock.js';
import type { PasswordResetData } from '../src/notifications/templates/templates.js';
import {
  authed,
  createTestApp,
  login,
  nextIp,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

const NEW_PASSWORD = 'Brand-New-Pass-2026';

describe('Forgot, reset and expired passwords (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
  });

  afterAll(async () => {
    await t.close();
  });

  const forgot = (email: string, o: { host?: string; portal?: string } = {}) => {
    let req = t.http().post('/api/v1/auth/password/forgot').set('X-Forwarded-For', nextIp());
    if (o.host) req = req.set('Host', o.host);
    return req.send({ email, ...(o.portal && { portal: o.portal }) });
  };
  const reset = (token: string, password = NEW_PASSWORD) =>
    t
      .http()
      .post('/api/v1/auth/password/reset')
      .set('X-Forwarded-For', nextIp())
      .send({ token, password });
  const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;

  it('emails a single-use link for the portal it came from; reset ends every session', async () => {
    const email = 'e.udo@crestviewcollege.ng';
    const before = await signIn(t, email);
    expect((await forgot(email)).body).toEqual({ ok: true });
    const message = await t.notifications.waitFor(email, 'password-reset');
    const { link, expiresInMinutes } = message.data as PasswordResetData;
    expect(link.startsWith('http://localhost:5171/reset-password?token=')).toBe(true);
    expect(expiresInMinutes).toBe(60);

    const weak = await reset(tokenOf(link), 'weak');
    expect(weak.status).toBe(422);
    expect(weak.body.fields.password).toContain('at least 8 characters');

    const ok = await reset(tokenOf(link));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });
    expect((await authed(t, before.token).get('/api/v1/auth/me')).status).toBe(401);
    expect((await login(t, email)).status).toBe(401);
    expect((await login(t, email, NEW_PASSWORD)).status).toBe(200);
    expect(t.notifications.find(email, 'password-changed')).toBeDefined();

    const again = await reset(tokenOf(link), 'Another-Pass-2026');
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('RESET_INVALID');
  });

  it('builds Teacher Workspace links on the school’s address', async () => {
    await forgot('g.okafor@greenfield.edu.ng', { host: 'greenfield.localhost' });
    const message = await t.notifications.waitFor('g.okafor@greenfield.edu.ng', 'password-reset');
    expect((message.data as PasswordResetData).link).toMatch(
      /^http:\/\/localhost:5172\/reset-password\?token=/,
    );
  });

  it('expires links, and only the newest link works', async () => {
    const email = 'ngozi@edutrack.ng';
    await forgot(email, { portal: 'platform' });
    const first = await t.notifications.waitFor(email, 'password-reset');
    t.notifications.clear();
    await forgot(email, { portal: 'platform' });
    const second = await t.notifications.waitFor(email, 'password-reset');
    const firstToken = tokenOf((first.data as PasswordResetData).link);
    const secondToken = tokenOf((second.data as PasswordResetData).link);
    expect((second.data as PasswordResetData).link.startsWith('http://localhost:5170/')).toBe(true);

    expect((await reset(firstToken)).body.code).toBe('RESET_INVALID');
    t.clock.advance(61 * MINUTE);
    const expired = await reset(secondToken);
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe('RESET_EXPIRED');
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    t.notifications.clear();
    const res = await forgot('nobody@nowhere.ng');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 200));
    expect(t.notifications.sent).toHaveLength(0);
    expect((await reset('made-up-token')).body.code).toBe('RESET_INVALID');
  });

  it('clears a sign-in pause when the password is reset', async () => {
    const email = 'c.eze@greenfield.edu.ng';
    const host = 'greenfield.localhost';
    for (let i = 0; i < 5; i++) await login(t, email, 'Wrong-password-1', { host });
    expect((await login(t, email, PASSWORD, { host })).status).toBe(423);
    await forgot(email, { host });
    const message = await t.notifications.waitFor(email, 'password-reset');
    expect((await reset(tokenOf((message.data as PasswordResetData).link))).status).toBe(200);
    expect((await login(t, email, NEW_PASSWORD, { host })).status).toBe(200);
  });

  describe('expired password', () => {
    const expired = (body: Record<string, unknown>, host?: string) => {
      let req = t.http().post('/api/v1/auth/password/expired').set('X-Forwarded-For', nextIp());
      if (host) req = req.set('Host', host);
      return req.send(body);
    };

    it('lets a user with an expired password set a new one and signs them in', async () => {
      const email = 'r.adeleke@greenfield.edu.ng';
      const host = 'greenfield.localhost';
      expect((await login(t, email, PASSWORD, { host })).body.code).toBe('PASSWORD_EXPIRED');

      const wrong = await expired({ email, current: 'Wrong-password-1', next: NEW_PASSWORD }, host);
      expect(wrong.status).toBe(401);
      const same = await expired({ email, current: PASSWORD, next: PASSWORD }, host);
      expect(same.status).toBe(422);
      expect(same.body.fields.next).toBeDefined();

      const ok = await expired({ email, current: PASSWORD, next: NEW_PASSWORD }, host);
      expect(ok.status).toBe(200);
      expect(ok.body.user.displayName).toBe('Mrs. Ronke Adeleke');
      expect((await login(t, email, NEW_PASSWORD, { host })).status).toBe(200);

      const notExpired = await expired(
        { email, current: NEW_PASSWORD, next: 'Yet-Another-Pass-1' },
        host,
      );
      expect(notExpired.status).toBe(409);
      expect(notExpired.body.code).toBe('PASSWORD_NOT_EXPIRED');
    });

    it('works for School Admin too (Kunle Bakare)', async () => {
      const ok = await expired({
        email: 'kunle.bakare@greenfield.edu.ng',
        current: PASSWORD,
        next: NEW_PASSWORD,
      });
      expect(ok.status).toBe(200);
      expect(ok.body.user.roles).toEqual(['School Admin', 'Bursar']);
    });

    it('honours "passwords never expire" (0 days)', async () => {
      const school = await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } });
      await t.prisma.schoolSettings.update({
        where: { schoolId: school.id },
        data: { passwordExpiryDays: 0 },
      });
      try {
        await t.prisma.user.update({
          where: { email: 'i.bello@greenfield.edu.ng' },
          data: { passwordChangedAt: new Date('2020-01-01') },
        });
        expect(
          (await login(t, 'i.bello@greenfield.edu.ng', PASSWORD, { host: 'greenfield.localhost' }))
            .status,
        ).toBe(200);
      } finally {
        await t.prisma.schoolSettings.update({
          where: { schoolId: school.id },
          data: { passwordExpiryDays: 90 },
        });
      }
    });
  });
});
