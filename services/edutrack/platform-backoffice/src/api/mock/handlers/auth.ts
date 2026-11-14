import type { AcceptInvitationPayload, LoginPayload } from '@/types';

import { ME, passwords, users } from '../db';
import { mock, MockHttpError } from '@edutrack/web-core/mock';
import { fullName, roleName } from './shared';

const tokenFor = (id: string) => `mock-token.${id}`;
export const userIdFromToken = (token: string | undefined) =>
  token?.replace('mock-token.', '') ?? ME.id;

const authUser = (u: (typeof users)[number]) => ({
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  roleId: u.roleId,
  roleName: roleName(u.roleId),
  avatarUrl: null,
});

/**
 * Stands in for the API's HttpOnly refresh cookie: which user is "signed in" on this device.
 * Remember-me keeps it in localStorage, otherwise in sessionStorage (like a session cookie).
 */
const COOKIE = 'edutrack.platform.mock-refresh';
function readCookie(): string | null {
  try {
    return sessionStorage.getItem(COOKIE) ?? localStorage.getItem(COOKIE);
  } catch {
    return null;
  }
}
function writeCookie(id: string | null, remember = false) {
  try {
    sessionStorage.removeItem(COOKIE);
    localStorage.removeItem(COOKIE);
    if (id) (remember ? localStorage : sessionStorage).setItem(COOKIE, id);
  } catch {
    // Storage blocked (private window): the session lasts until the page reloads.
  }
}

mock.post('/v1/auth/refresh', () => {
  const account = users.find((u) => u.id === readCookie());
  if (!account || account.status !== 'Active') {
    writeCookie(null);
    throw new MockHttpError(401, 'Your session has ended. Sign in again.', 'SESSION_ENDED');
  }
  return { accessToken: tokenFor(account.id), expiresIn: 900, user: authUser(account) };
});

mock.post('/v1/auth/login', ({ body }) => {
  const { email, password, remember } = body as LoginPayload;
  const account = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (account?.status === 'Suspended')
    throw new MockHttpError(403, 'This account is suspended', 'ACCOUNT_SUSPENDED');
  if (account?.status === 'Deactivated')
    throw new MockHttpError(403, 'This account has been deactivated', 'ACCOUNT_DEACTIVATED');
  if (account?.status === 'Invited')
    throw new MockHttpError(403, 'This account is not activated yet', 'ACCOUNT_PENDING');
  if (!account || passwords.get(account.email) !== password) {
    throw new MockHttpError(401, 'The email or password you entered is incorrect.');
  }
  account.lastSeen = 'Just now';
  writeCookie(account.id, remember);
  return { accessToken: tokenFor(account.id), expiresIn: 900, user: authUser(account) };
});

mock.post('/v1/auth/logout', () => {
  writeCookie(null);
  return { ok: true };
});

mock.get('/v1/auth/me', () => authUser(users.find((u) => u.id === ME.id)!));

mock.post('/v1/auth/password/forgot', () => ({ ok: true }));

mock.post('/v1/auth/password/reset', ({ body }) => {
  const { token, password } = body as { token: string; password: string };
  if (token === 'expired')
    throw new MockHttpError(410, 'This reset link has expired', 'RESET_EXPIRED');
  if (!token || token === 'invalid')
    throw new MockHttpError(400, "This reset link isn't valid", 'RESET_INVALID');
  passwords.set(ME.email, password);
  return { ok: true };
});

function invitationFor(token: string) {
  if (token === 'expired')
    throw new MockHttpError(410, 'This invitation has expired', 'INVITATION_EXPIRED');
  const invitee = users.find((u) => u.id === token) ?? users.find((u) => u.id === 'u6')!;
  if (invitee.invitation === 'Expired')
    throw new MockHttpError(410, 'This invitation has expired', 'INVITATION_EXPIRED');
  return invitee;
}

mock.get('/v1/auth/invitations/:token', ({ params }) => {
  const invitee = invitationFor(params.token!);
  return {
    token: params.token,
    email: invitee.email,
    firstName: invitee.firstName,
    lastName: invitee.lastName,
    roleName: roleName(invitee.roleId),
    invitedBy: `${ME.name} · Platform Administrator`,
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
    invitation: 'Accepted',
    lastSeen: 'Just now',
  });
  passwords.set(invitee.email, payload.password);
  return { email: invitee.email, name: fullName(invitee) };
});
