/**
 * Sign-in accounts, passwords and signed-in devices for the mock API. Every demo password is
 * `Edutrack2026!` (see `config/demo.ts`).
 */
import { nowLocal } from './clock';

export const DEMO_PASSWORD = 'Edutrack2026!';

export type AccountStatus = 'Active' | 'Suspended' | 'Deactivated' | 'Invited';

export interface AccountRecord {
  staffId: string;
  email: string;
  status: AccountStatus;
  /** Shown when sign-in is refused. */
  statusReason?: string;
  passwordExpired: boolean;
}

export const ACCOUNTS: AccountRecord[] = [
  { staffId: 'ade', email: 's.ade@greenfield.edu.ng', status: 'Active', passwordExpired: false },
  {
    staffId: 'okafor',
    email: 'g.okafor@greenfield.edu.ng',
    status: 'Active',
    passwordExpired: false,
  },
  {
    staffId: 'bello',
    email: 'i.bello@greenfield.edu.ng',
    status: 'Active',
    passwordExpired: false,
  },
  { staffId: 'eze', email: 'c.eze@greenfield.edu.ng', status: 'Active', passwordExpired: false },
  {
    staffId: 'salami',
    email: 't.salami@greenfield.edu.ng',
    status: 'Active',
    passwordExpired: false,
  },
  {
    staffId: 'oladipo',
    email: 'y.oladipo@greenfield.edu.ng',
    status: 'Suspended',
    statusReason:
      'Suspended by the school administrator on 2 Dec 2026 while a staff review is completed.',
    passwordExpired: false,
  },
  {
    staffId: 'adebayo',
    email: 'f.adebayo@greenfield.edu.ng',
    status: 'Deactivated',
    statusReason: 'Deactivated on 31 Jul 2026 when this staff member left Greenfield Academy.',
    passwordExpired: false,
  },
  {
    staffId: 'adeleke',
    email: 'r.adeleke@greenfield.edu.ng',
    status: 'Active',
    passwordExpired: true,
  },
  {
    staffId: 'nnamdi',
    email: 'c.nnamdi@greenfield.edu.ng',
    status: 'Invited',
    passwordExpired: false,
  },
];

export const passwords = new Map(ACCOUNTS.map((a) => [a.email, DEMO_PASSWORD]));
/** Wrong passwords in a row, by lower-cased email. */
export const failedAttempts = new Map<string, number>();
/** When sign-in was paused (real elapsed time: the demo clock doesn't move). */
export const lockedAt = new Map<string, number>();
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export const accountByEmail = (email: string) =>
  ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
export const accountOf = (staffId: string) => ACCOUNTS.find((a) => a.staffId === staffId);

/* ---------- Devices ---------- */

export interface DeviceSessionRecord {
  id: string;
  staffId: string;
  device: string;
  location: string;
  signedInAt: string;
  lastActive: string;
}

let sessionSeq = 0;
/** Sessions signed out in this page load; anything else a token names is still signed in. */
const endedSessions = new Set<string>();
export const DEVICE_SESSIONS: DeviceSessionRecord[] = ACCOUNTS.filter(
  (a) => a.status === 'Active',
).flatMap((a) => [
  {
    id: `dev-${a.staffId}-phone`,
    staffId: a.staffId,
    device: 'Chrome on Android',
    location: 'Ikeja, Lagos',
    signedInAt: '2026-11-30T07:02',
    lastActive: '2026-12-07T21:14',
  },
  {
    id: `dev-${a.staffId}-staffroom`,
    staffId: a.staffId,
    device: 'Edge on Windows · Staff room PC',
    location: 'Greenfield Academy, Main Campus',
    signedInAt: '2026-12-01T12:30',
    lastActive: '2026-12-04T13:05',
  },
]);

export const tokenFor = (staffId: string, sessionId: string) =>
  `mock-token.${staffId}.${sessionId}`;

/** Starts a signed-in device session and returns its id. */
export function startSession(staffId: string, device = 'This browser') {
  // Unique across page reloads too, since the mock's memory starts over on each load.
  const id = `dev-${staffId}-${Date.now().toString(36)}${++sessionSeq}`;
  DEVICE_SESSIONS.push({
    id,
    staffId,
    device,
    location: 'Lagos',
    signedInAt: nowLocal(),
    lastActive: nowLocal(),
  });
  return id;
}

/**
 * The session a bearer token belongs to, if it is still signed in. The mock's memory starts over
 * when the page reloads, so a well-formed token for an active account that wasn't signed out in
 * this load is taken as still signed in (its device is recorded again).
 */
export function sessionOfToken(token: string | undefined) {
  const match = /^mock-token\.([^.]+)\.(.+)$/.exec(token ?? '');
  if (!match) return null;
  const [, staffId, id] = match as unknown as [string, string, string];
  const session = DEVICE_SESSIONS.find((s) => s.id === id && s.staffId === staffId);
  if (session) return session;
  if (endedSessions.has(id) || accountOf(staffId)?.status !== 'Active') return null;
  const revived = {
    id,
    staffId,
    device: 'This browser',
    location: 'Lagos',
    signedInAt: nowLocal(),
    lastActive: nowLocal(),
  };
  DEVICE_SESSIONS.push(revived);
  return revived;
}

/** Signs one device session out. */
export function endSession(id: string) {
  const index = DEVICE_SESSIONS.findIndex((s) => s.id === id);
  if (index >= 0) DEVICE_SESSIONS.splice(index, 1);
  endedSessions.add(id);
}

export function endSessions(staffId: string, keep?: string) {
  let ended = 0;
  for (let i = DEVICE_SESSIONS.length - 1; i >= 0; i--) {
    const s = DEVICE_SESSIONS[i]!;
    if (s.staffId === staffId && s.id !== keep) {
      DEVICE_SESSIONS.splice(i, 1);
      endedSessions.add(s.id);
      ended++;
    }
  }
  return ended;
}

/* ---------- Invitations and reset links ---------- */

export interface InvitationRecord {
  token: string;
  staffId: string;
  status: 'pending' | 'accepted' | 'expired';
  invitedBy: string;
  sentOn: string;
  expiresOn: string;
}

/** `GFA-INV-7Q2K` is the valid link; `expired` and `used` show the other states. */
export const INVITATIONS: InvitationRecord[] = [
  {
    token: 'GFA-INV-7Q2K',
    staffId: 'nnamdi',
    status: 'pending',
    invitedBy: 'Mrs. Adaeze Okonkwo · Principal',
    sentOn: '2026-12-07',
    expiresOn: '2026-12-14',
  },
  {
    token: 'expired',
    staffId: 'nnamdi',
    status: 'expired',
    invitedBy: 'Mrs. Adaeze Okonkwo · Principal',
    sentOn: '2026-11-20',
    expiresOn: '2026-11-27',
  },
  {
    token: 'used',
    staffId: 'salami',
    status: 'accepted',
    invitedBy: 'Mrs. Adaeze Okonkwo · Principal',
    sentOn: '2026-11-27',
    expiresOn: '2026-12-04',
  },
];
export const VALID_INVITATION = 'GFA-INV-7Q2K';
