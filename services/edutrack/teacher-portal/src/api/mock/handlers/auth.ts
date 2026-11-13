import { mock, MockHttpError } from '@edutrack/web-core/mock';

import { meetsPasswordPolicy } from '@edutrack/app-kit/lib/password';
import type { AcceptInvitationPayload, LoginPayload } from '@/types';

import {
  ACCOUNTS,
  DEVICE_SESSIONS,
  INVITATIONS,
  LOCKOUT_MINUTES,
  MAX_ATTEMPTS,
  accountByEmail,
  accountOf,
  endSession,
  endSessions,
  failedAttempts,
  lockedAt,
  passwords,
  startSession,
  tokenFor,
  type AccountRecord,
} from '../accounts-db';
import { formatDay } from '../clock';
import { DEPARTMENTS, SCHOOL, STAFF } from '../school-db';
import { currentSessionId, currentTeacher, staffById } from '../scope';
import { authUser, invalid, isNigerianMobile, schoolSummary } from './shared';

const POLICY = 'Your password doesn’t meet every requirement yet.';

function signIn(account: AccountRecord, device?: string) {
  const staff = staffById(account.staffId);
  const sessionId = startSession(staff.id, device);
  return {
    accessToken: tokenFor(staff.id, sessionId),
    user: authUser(staff),
    school: schoolSummary(),
  };
}

/** Clears a pause that has run its 15 minutes (real time: the demo clock doesn't move). */
function liftExpiredLock(key: string) {
  const since = lockedAt.get(key);
  if (since && Date.now() - since >= LOCKOUT_MINUTES * 60_000) {
    lockedAt.delete(key);
    failedAttempts.delete(key);
  }
}

const locked = () =>
  new MockHttpError(
    423,
    `Too many unsuccessful attempts. Sign-in is paused for ${LOCKOUT_MINUTES} minutes on this account.`,
    'ACCOUNT_LOCKED',
  );

/** Checks the email and password, counting failures toward the lockout. */
function checkCredentials(email: string, password: string) {
  const key = email.trim().toLowerCase();
  liftExpiredLock(key);
  if ((failedAttempts.get(key) ?? 0) >= MAX_ATTEMPTS) throw locked();
  const account = accountByEmail(key);
  if (!account || passwords.get(account.email) !== password) {
    const attempts = (failedAttempts.get(key) ?? 0) + 1;
    failedAttempts.set(key, attempts);
    if (attempts >= MAX_ATTEMPTS) {
      lockedAt.set(key, Date.now());
      throw locked();
    }
    const left = MAX_ATTEMPTS - attempts;
    throw new MockHttpError(
      401,
      `The email or password you entered is incorrect. ${left} attempt${left === 1 ? '' : 's'} left before sign-in is paused.`,
      'INVALID_CREDENTIALS',
    );
  }
  failedAttempts.delete(key);
  return account;
}

mock.post('/v1/auth/login', ({ body }) => {
  const { email = '', password = '' } = (body ?? {}) as Partial<LoginPayload>;
  const account = checkCredentials(email, password);
  if (account.status === 'Suspended')
    throw new MockHttpError(
      403,
      account.statusReason ?? 'This account is suspended.',
      'ACCOUNT_SUSPENDED',
    );
  if (account.status === 'Deactivated')
    throw new MockHttpError(
      403,
      account.statusReason ?? 'This account is no longer active.',
      'ACCOUNT_DEACTIVATED',
    );
  if (account.status === 'Invited')
    throw new MockHttpError(403, 'This account is not activated yet.', 'ACCOUNT_PENDING');
  if (account.passwordExpired)
    throw new MockHttpError(403, 'Your password has expired.', 'PASSWORD_EXPIRED');
  return signIn(account);
});

/** Sets a new password after "password expired" and signs in. */
mock.post('/v1/auth/password/expired', ({ body }) => {
  const { email = '', current = '', next = '' } = (body ?? {}) as Record<string, string>;
  const account = checkCredentials(email, current);
  if (!account.passwordExpired) throw new MockHttpError(409, 'Your password hasn’t expired.');
  if (!meetsPasswordPolicy(next)) invalid(POLICY);
  if (next === current) invalid('Choose a password you haven’t used before.');
  passwords.set(account.email, next);
  account.passwordExpired = false;
  endSessions(account.staffId);
  return signIn(account);
});

mock.post('/v1/auth/logout', (req) => {
  const sessionId = currentSessionId(req);
  if (sessionId) endSession(sessionId);
  return { ok: true };
});

mock.post('/v1/auth/password/forgot', () => ({ ok: true }));

/** Reset links: `expired` → 410, `invalid` or empty → 400, `demo:<email>` resets that account. */
mock.post('/v1/auth/password/reset', ({ body }) => {
  const { token = '', password = '' } = (body ?? {}) as Record<string, string>;
  if (token === 'expired')
    throw new MockHttpError(410, 'This reset link has expired', 'RESET_EXPIRED');
  if (!token || token === 'invalid')
    throw new MockHttpError(400, 'This reset link isn’t valid', 'RESET_INVALID');
  if (!meetsPasswordPolicy(password)) invalid(POLICY);
  const email = token.startsWith('demo:') ? token.slice(5) : '';
  const account = accountByEmail(email) ?? accountOf('ade')!;
  passwords.set(account.email, password);
  account.passwordExpired = false;
  failedAttempts.delete(account.email.toLowerCase());
  lockedAt.delete(account.email.toLowerCase());
  endSessions(account.staffId);
  return { ok: true };
});

/* ---------- Invitations ---------- */

function invitationFor(token: string) {
  const inv = INVITATIONS.find((i) => i.token === token);
  if (!inv) throw new MockHttpError(404, 'This invitation link isn’t valid', 'INVITATION_INVALID');
  if (inv.status === 'expired')
    throw new MockHttpError(410, 'This invitation has expired', 'INVITATION_EXPIRED');
  return inv;
}

mock.get('/v1/auth/invitations/:token', ({ params }) => {
  const inv = invitationFor(params.token!);
  const staff = staffById(inv.staffId);
  return {
    token: inv.token,
    email: staff.email,
    firstName: staff.firstName,
    lastName: staff.lastName,
    title: staff.title,
    position: staff.position,
    department: DEPARTMENTS.find((d) => d.id === staff.departmentId)?.name ?? null,
    schoolName: SCHOOL.name,
    invitedBy: inv.invitedBy,
    expiresOn: formatDay(inv.expiresOn),
    status: inv.status,
  };
});

mock.post('/v1/auth/invitations/:token/accept', ({ params, body }) => {
  const inv = invitationFor(params.token!);
  if (inv.status === 'accepted')
    throw new MockHttpError(409, 'This invitation has already been accepted.', 'INVITATION_USED');
  const payload = (body ?? {}) as Partial<AcceptInvitationPayload>;
  if (!payload.firstName?.trim() || !payload.lastName?.trim())
    invalid('Enter your first and last name.');
  if (payload.phone && !isNigerianMobile(payload.phone))
    invalid('Enter a Nigerian mobile number, like 0803 412 7781.');
  if (!meetsPasswordPolicy(payload.password ?? '')) invalid(POLICY);
  const staff = STAFF.find((s) => s.id === inv.staffId)!;
  Object.assign(staff, {
    firstName: payload.firstName!.trim(),
    lastName: payload.lastName!.trim(),
    name: `${staff.title} ${payload.firstName!.trim()} ${payload.lastName!.trim()}`,
    phone: payload.phone?.trim() ?? '',
  });
  const account = ACCOUNTS.find((a) => a.staffId === staff.id)!;
  account.status = 'Active';
  passwords.set(account.email, payload.password!);
  inv.status = 'accepted';
  return { email: staff.email, name: staff.name };
});

/* ---------- Signed-in teacher: password and devices ---------- */

mock.post('/v1/auth/password/change', (req) => {
  const me = currentTeacher(req);
  const { current = '', next = '' } = (req.body ?? {}) as Record<string, string>;
  const account = accountOf(me.id)!;
  if (passwords.get(account.email) !== current) invalid('Your current password is incorrect.');
  if (!meetsPasswordPolicy(next)) invalid(POLICY);
  if (next === current) invalid('Choose a password you haven’t just used.');
  passwords.set(account.email, next);
  return { signedOut: endSessions(me.id, currentSessionId(req) ?? undefined) };
});

mock.get('/v1/auth/sessions', (req) => {
  const me = currentTeacher(req);
  const current = currentSessionId(req);
  return DEVICE_SESSIONS.filter((s) => s.staffId === me.id)
    .map((s) => ({
      id: s.id,
      device: s.device,
      location: s.location,
      signedInAt: s.signedInAt,
      lastActive: s.lastActive,
      current: s.id === current,
    }))
    .sort(
      (a, b) => Number(b.current) - Number(a.current) || b.lastActive.localeCompare(a.lastActive),
    );
});

mock.delete('/v1/auth/sessions/:id', (req) => {
  const me = currentTeacher(req);
  const index = DEVICE_SESSIONS.findIndex((s) => s.id === req.params.id && s.staffId === me.id);
  if (index < 0) throw new MockHttpError(404, 'That device is already signed out.', 'NOT_FOUND');
  if (DEVICE_SESSIONS[index]!.id === currentSessionId(req))
    invalid('This is the device you’re using. Sign out from the account menu instead.');
  endSession(DEVICE_SESSIONS[index]!.id);
  return { ok: true };
});

mock.post('/v1/auth/sessions/sign-out-others', (req) => {
  const me = currentTeacher(req);
  return { signedOut: endSessions(me.id, currentSessionId(req) ?? undefined) };
});
