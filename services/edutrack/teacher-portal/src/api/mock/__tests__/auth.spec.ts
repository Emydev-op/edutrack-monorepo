import { describe, expect, it } from 'vitest';

import type { DeviceSession, Invitation, LoginResponse, Me } from '@/types';

import { PASSWORD, client, failure, signIn } from './helpers';

const NEW_PASSWORD = 'Greenfield#2027';

describe('Sign-in', () => {
  it.each([
    ['s.ade@greenfield.edu.ng', 'Mr. Samuel Ade'],
    ['g.okafor@greenfield.edu.ng', 'Mrs. Grace Okafor'],
    ['i.bello@greenfield.edu.ng', 'Mr. Ibrahim Bello'],
    ['c.eze@greenfield.edu.ng', 'Mrs. Chioma Eze'],
    ['t.salami@greenfield.edu.ng', 'Mr. Babatunde Salami'],
  ])('signs %s in', async (email, name) => {
    const { data } = await client().post<LoginResponse>('/v1/auth/login', {
      email: email.toUpperCase(),
      password: PASSWORD,
    });
    expect(data.user.displayName).toBe(name);
    expect(data.school.name).toBe('Greenfield Academy');
  });

  it('counts down wrong passwords, then pauses sign-in for 15 minutes', async () => {
    const api = client();
    const email = 'g.okafor@greenfield.edu.ng';
    for (let left = 4; left >= 1; left--) {
      const f = await failure(api.post('/v1/auth/login', { email, password: 'nope' }));
      expect(f.status).toBe(401);
      expect(f.message).toContain(`${left} attempt${left === 1 ? '' : 's'} left`);
    }
    const fifth = await failure(api.post('/v1/auth/login', { email, password: 'nope' }));
    expect(fifth).toMatchObject({ status: 423, code: 'ACCOUNT_LOCKED' });
    expect(fifth.message).toContain('15 minutes');
    // Even the right password is refused while paused.
    const right = await failure(api.post('/v1/auth/login', { email, password: PASSWORD }));
    expect(right.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses suspended, deactivated and not-yet-activated accounts with the reason', async () => {
    const api = client();
    const suspended = await failure(
      api.post('/v1/auth/login', { email: 'y.oladipo@greenfield.edu.ng', password: PASSWORD }),
    );
    expect(suspended).toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' });
    expect(suspended.message).toMatch(/Suspended by the school administrator/);
    const deactivated = await failure(
      api.post('/v1/auth/login', { email: 'f.adebayo@greenfield.edu.ng', password: PASSWORD }),
    );
    expect(deactivated.code).toBe('ACCOUNT_DEACTIVATED');
    const pending = await failure(
      api.post('/v1/auth/login', { email: 'c.nnamdi@greenfield.edu.ng', password: PASSWORD }),
    );
    expect(pending.code).toBe('ACCOUNT_PENDING');
  });

  it('makes an expired password be replaced, then signs in', async () => {
    const api = client();
    const email = 'r.adeleke@greenfield.edu.ng';
    const expired = await failure(api.post('/v1/auth/login', { email, password: PASSWORD }));
    expect(expired.code).toBe('PASSWORD_EXPIRED');
    const weak = await failure(
      api.post('/v1/auth/password/expired', { email, current: PASSWORD, next: 'short' }),
    );
    expect(weak.status).toBe(422);
    const { data } = await api.post<LoginResponse>('/v1/auth/password/expired', {
      email,
      current: PASSWORD,
      next: NEW_PASSWORD,
    });
    expect(data.accessToken).toBeTruthy();
    await expect(
      api.post('/v1/auth/login', { email, password: NEW_PASSWORD }),
    ).resolves.toBeTruthy();
  });

  it('resets a password from a link and rejects expired or invalid links', async () => {
    const api = client();
    expect(
      (
        await failure(
          api.post('/v1/auth/password/reset', { token: 'expired', password: NEW_PASSWORD }),
        )
      ).status,
    ).toBe(410);
    expect(
      (await failure(api.post('/v1/auth/password/reset', { token: '', password: NEW_PASSWORD })))
        .status,
    ).toBe(400);
    await api.post('/v1/auth/password/reset', {
      token: 'demo:c.eze@greenfield.edu.ng',
      password: NEW_PASSWORD,
    });
    await expect(
      api.post('/v1/auth/login', { email: 'c.eze@greenfield.edu.ng', password: NEW_PASSWORD }),
    ).resolves.toBeTruthy();
  });
});

describe('Invitations', () => {
  it('validates the link, accepts it once, then signs in', async () => {
    const api = client();
    const { data: inv } = await api.get<Invitation>('/v1/auth/invitations/GFA-INV-7Q2K');
    expect(inv).toMatchObject({ email: 'c.nnamdi@greenfield.edu.ng', status: 'pending' });
    expect((await failure(api.get('/v1/auth/invitations/expired'))).status).toBe(410);
    expect((await failure(api.get('/v1/auth/invitations/nonsense'))).status).toBe(404);
    const { data: used } = await api.get<Invitation>('/v1/auth/invitations/used');
    expect(used.status).toBe('accepted');

    const badPhone = await failure(
      api.post('/v1/auth/invitations/GFA-INV-7Q2K/accept', {
        firstName: 'Chukwudi',
        lastName: 'Nnamdi',
        phone: '12345',
        password: NEW_PASSWORD,
      }),
    );
    expect(badPhone.status).toBe(422);
    await api.post('/v1/auth/invitations/GFA-INV-7Q2K/accept', {
      firstName: 'Chukwudi',
      lastName: 'Nnamdi',
      phone: '0809 111 2233',
      password: NEW_PASSWORD,
    });
    expect((await failure(api.post('/v1/auth/invitations/GFA-INV-7Q2K/accept', {}))).status).toBe(
      409,
    );
    const me = await signIn('c.nnamdi@greenfield.edu.ng', NEW_PASSWORD);
    const { data } = await me.get<Me>('/v1/me');
    expect(data.hasAssignments).toBe(false);
  });
});

describe('Password and devices', () => {
  it('lists devices, signs out the others and changes the password', async () => {
    const api = await signIn('i.bello@greenfield.edu.ng');
    const other = await signIn('i.bello@greenfield.edu.ng');
    const { data: devices } = await api.get<DeviceSession[]>('/v1/auth/sessions');
    expect(devices[0]!.current).toBe(true);
    expect(devices.length).toBeGreaterThanOrEqual(4);

    const wrong = await failure(
      api.post('/v1/auth/password/change', { current: 'wrong', next: NEW_PASSWORD }),
    );
    expect(wrong).toMatchObject({ status: 422, message: 'Your current password is incorrect.' });
    const { data } = await api.post<{ signedOut: number }>('/v1/auth/password/change', {
      current: PASSWORD,
      next: NEW_PASSWORD,
    });
    expect(data.signedOut).toBe(devices.length - 1);
    expect((await failure(other.get('/v1/me'))).status).toBe(401);
    await expect(api.get('/v1/me')).resolves.toBeTruthy();
  });

  it('signs out one device, or every other device, and logs out', async () => {
    const api = await signIn('s.ade@greenfield.edu.ng');
    const { data: devices } = await api.get<DeviceSession[]>('/v1/auth/sessions');
    const here = devices.find((d) => d.current)!;
    expect((await failure(api.delete(`/v1/auth/sessions/${here.id}`))).status).toBe(422);
    const phone = devices.find((d) => !d.current)!;
    await api.delete(`/v1/auth/sessions/${phone.id}`);
    const { data } = await api.post<{ signedOut: number }>('/v1/auth/sessions/sign-out-others');
    expect(data.signedOut).toBe(devices.length - 2);
    await api.post('/v1/auth/logout');
    expect((await failure(api.get('/v1/me'))).status).toBe(401);
  });
});
