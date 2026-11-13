import { DAY } from '../src/common/clock/clock.js';
import { InvitationService } from '../src/auth/invitation.service.js';
import { sha256 } from '../src/auth/tokens.js';
import type { InvitationData } from '../src/notifications/templates/templates.js';
import { createTestApp, login, nextIp, PASSWORD, type TestApp } from './support/test-app.js';

const ACCEPT = {
  firstName: 'Chukwudi',
  lastName: 'Nnamdi',
  phone: '0803 999 1234',
  password: 'Welcome-To-GFA-1',
};

describe('Invitations (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
  });

  afterAll(async () => {
    await t.close();
  });

  const lookup = (token: string) =>
    t
      .http()
      .get(`/api/v1/auth/invitations/${encodeURIComponent(token)}`)
      .set('X-Forwarded-For', nextIp());
  const accept = (token: string, body: Record<string, unknown> = ACCEPT) =>
    t
      .http()
      .post(`/api/v1/auth/invitations/${encodeURIComponent(token)}/accept`)
      .set('X-Forwarded-For', nextIp())
      .send(body);

  it('shows a pending invitation for the accept page', async () => {
    const res = await lookup('GFA-INV-7Q2K');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      token: 'GFA-INV-7Q2K',
      status: 'pending',
      email: 'c.nnamdi@greenfield.edu.ng',
      firstName: 'Chukwudi',
      lastName: 'Nnamdi',
      title: 'Mr.',
      position: 'Teacher',
      department: 'Sciences',
      schoolName: 'Greenfield Academy',
      invitedBy: 'Mrs. Adaeze Okonkwo · Principal',
      expiresIn: 'In 7 days',
    });
  });

  it('accepts once: sets the password, activates the membership, then sign-in works', async () => {
    const weak = await accept('GFA-INV-7Q2K', { ...ACCEPT, password: 'weak' });
    expect(weak.status).toBe(422);
    expect(weak.body.fields.password).toBeDefined();
    const badPhone = await accept('GFA-INV-7Q2K', { ...ACCEPT, phone: '12' });
    expect(badPhone.body.fields).toEqual({ phone: 'Enter a mobile number, like 0803 412 7781.' });

    const res = await accept('GFA-INV-7Q2K');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'c.nnamdi@greenfield.edu.ng', name: 'Chukwudi Nnamdi' });

    const membership = await t.prisma.schoolMembership.findFirstOrThrow({
      where: { user: { email: 'c.nnamdi@greenfield.edu.ng' } },
      include: { user: true },
    });
    expect(membership.status).toBe('ACTIVE');
    expect(membership.user.phone).toBe('+2348039991234');
    expect(membership.user.emailVerifiedAt).not.toBeNull();
    const signIn = await login(t, 'c.nnamdi@greenfield.edu.ng', ACCEPT.password, {
      host: 'greenfield.localhost',
    });
    expect(signIn.status).toBe(200);

    const reused = await accept('GFA-INV-7Q2K');
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe('INVITATION_USED');
    expect((await lookup('GFA-INV-7Q2K')).body.status).toBe('accepted');
  });

  it('reports used, expired and unknown links', async () => {
    expect((await lookup('used')).body.status).toBe('accepted');
    expect((await accept('used')).body.code).toBe('INVITATION_USED');
    const expired = await lookup('expired');
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe('INVITATION_EXPIRED');
    expect((await accept('expired')).status).toBe(410);
    const unknown = await lookup('no-such-invitation');
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('INVITATION_INVALID');
  });

  it('activates platform staff from a back-office invitation', async () => {
    const info = await lookup('PLT-INV-DAYO');
    expect(info.body).toMatchObject({
      schoolName: 'EduTrack',
      roleName: 'Support Agent',
      invitedBy: 'Tolu Bamidele · Platform Administrator',
    });
    expect(
      (
        await accept('PLT-INV-DAYO', {
          firstName: 'Dayo',
          lastName: 'Ola',
          password: 'Agent-Password-1',
        })
      ).status,
    ).toBe(200);
    const res = await login(t, 'dayo@edutrack.ng', 'Agent-Password-1', { portal: 'platform' });
    expect(res.status).toBe(200);
    expect(res.body.user.roleId).toBe('agent');
    expect((await lookup('PLT-INV-CHIKA')).status).toBe(410);
  });

  it('asks an existing account for its current password instead of replacing it', async () => {
    // Kemi Lawal already has a password (seeded); her School Admin invitation is pending.
    const wrong = await accept('GFA-INV-LAWAL', {
      firstName: 'Kemi',
      lastName: 'Lawal',
      password: 'Some-New-Pass-1',
    });
    expect(wrong.status).toBe(422);
    expect(wrong.body.fields.password).toContain('already have an EduTrack account');
    const ok = await accept('GFA-INV-LAWAL', {
      firstName: 'Kemi',
      lastName: 'Lawal',
      password: PASSWORD,
    });
    expect(ok.status).toBe(200);
    expect((await login(t, 'kemi.lawal@greenfield.edu.ng')).status).toBe(200);
  });

  it('sends a fresh link that expires after the invitation lifetime', async () => {
    const invitation = await t.prisma.invitation.findUniqueOrThrow({
      where: { tokenHash: sha256('PLT-INV-CHIKA') },
    });
    const { token, link } = await t.app
      .get(InvitationService)
      .send(invitation.id, { resend: true });
    expect(link).toBe(`http://localhost:5170/accept-invitation/${token}`);
    const sent = t.notifications.find('chika@edutrack.ng', 'invitation');
    expect(sent).toBeDefined();
    expect((sent!.data as InvitationData).link).toBe(link);
    expect((await lookup('PLT-INV-CHIKA')).status).toBe(404); // the old token was replaced
    expect((await lookup(token)).body.status).toBe('pending');
    t.clock.advance(8 * DAY);
    expect((await lookup(token)).body.code).toBe('INVITATION_EXPIRED');
    expect(
      (await accept(token, { firstName: 'Chika', lastName: 'Obi', password: 'Agent-Password-2' }))
        .status,
    ).toBe(410);
  });
});
