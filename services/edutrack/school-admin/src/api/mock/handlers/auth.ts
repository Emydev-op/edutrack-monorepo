import { mock, MockHttpError } from '@edutrack/web-core/mock';

import type { AcceptInvitationPayload, LoginPayload } from '@/types';

import { failedAttempts, passwords, users } from '../db';
import { signInRulesFor } from '../settings-db';
import { authUser, schoolOf, tokenFor } from './shared';

/** When each email's sign-in was paused. */
const lockedAt = new Map<string, number>();

mock.post('/v1/auth/login', ({ body }) => {
  const { email, password } = body as LoginPayload;
  const key = email.trim().toLowerCase();
  const account = users.find((u) => u.email.toLowerCase() === key);
  // The school's own lockout rule (Settings → Security); unknown emails get the platform default.
  const rules = account ? signInRulesFor(account.schoolId) : null;
  const MAX_ATTEMPTS = rules?.lockoutAttempts ?? 5;
  // The pause lifts after the school's lockout length.
  const since = lockedAt.get(key);
  if (since && Date.now() - since >= (rules?.lockoutMinutes ?? 15) * 60_000) {
    lockedAt.delete(key);
    failedAttempts.delete(key);
  }
  if ((failedAttempts.get(key) ?? 0) >= MAX_ATTEMPTS)
    throw new MockHttpError(423, 'Sign-in is paused on this account', 'ACCOUNT_LOCKED');
  if (!account || passwords.get(account.email) !== password) {
    const attempts = (failedAttempts.get(key) ?? 0) + 1;
    failedAttempts.set(key, attempts);
    if (attempts >= MAX_ATTEMPTS) {
      lockedAt.set(key, Date.now());
      throw new MockHttpError(423, 'Sign-in is paused on this account', 'ACCOUNT_LOCKED');
    }
    const left = MAX_ATTEMPTS - attempts;
    throw new MockHttpError(
      401,
      `The email or password you entered is incorrect. ${left} attempt${left === 1 ? '' : 's'} left before sign-in is paused.`,
    );
  }
  failedAttempts.delete(key);
  if (account.status === 'Suspended')
    throw new MockHttpError(403, 'This account is suspended', 'ACCOUNT_SUSPENDED');
  if (account.status === 'Deactivated')
    throw new MockHttpError(403, 'This account is no longer active', 'ACCOUNT_DEACTIVATED');
  if (account.status === 'Invited')
    throw new MockHttpError(403, 'This account is not activated yet', 'ACCOUNT_PENDING');
  if (account.passwordExpired)
    throw new MockHttpError(403, 'Your password has expired', 'PASSWORD_EXPIRED');
  return { accessToken: tokenFor(account.id), user: authUser(account), school: schoolOf(account) };
});

mock.post('/v1/auth/logout', () => ({ ok: true }));

mock.post('/v1/auth/password/forgot', () => ({ ok: true }));

mock.post('/v1/auth/password/reset', ({ body }) => {
  const { token, password } = body as { token: string; password: string };
  if (token === 'expired')
    throw new MockHttpError(410, 'This reset link has expired', 'RESET_EXPIRED');
  if (!token || token === 'invalid')
    throw new MockHttpError(400, "This reset link isn't valid", 'RESET_INVALID');
  const account = users.find((u) => u.id === token) ?? users[0]!;
  passwords.set(account.email, password);
  account.passwordExpired = false;
  return { ok: true };
});

function invitationFor(token: string) {
  if (token === 'expired')
    throw new MockHttpError(410, 'This invitation has expired', 'INVITATION_EXPIRED');
  return users.find((u) => u.id === token) ?? users.find((u) => u.status === 'Invited')!;
}

mock.get('/v1/auth/invitations/:token', ({ params }) => {
  const invitee = invitationFor(params.token!);
  return {
    token: params.token,
    email: invitee.email,
    firstName: invitee.firstName,
    lastName: invitee.lastName,
    position: `${invitee.position} · ${invitee.roleName}`,
    schoolName: schoolOf(invitee).name,
    invitedBy: 'Mrs. Adaeze Okonkwo · School Administrator',
    expiresIn: 'In 7 days',
    status: invitee.status === 'Invited' ? 'pending' : 'accepted',
  };
});

mock.post('/v1/auth/invitations/:token/accept', ({ params, body }) => {
  const invitee = invitationFor(params.token!);
  const payload = body as AcceptInvitationPayload;
  Object.assign(invitee, {
    firstName: payload.firstName,
    lastName: payload.lastName,
    phone: payload.phone,
    status: 'Active',
  });
  passwords.set(invitee.email, payload.password);
  return { email: invitee.email, name: `${invitee.firstName} ${invitee.lastName}` };
});
