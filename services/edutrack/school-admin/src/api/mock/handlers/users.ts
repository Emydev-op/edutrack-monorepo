import { mock, MockHttpError } from '@edutrack/web-core/mock';

import { ACTION_LABELS, PERMISSION_MODULES, ROLE_SCOPES } from '@/config/permissions';
import type { AccessPayload, InvitePayload, RolePayload } from '@/types';

import { staffInvited } from '../comms-events';
import type { SchoolData, UserRow } from '../school-db';
import { EMAIL, historyOf, requireText, schoolDataFor } from './shared';

/* ---------------- Users ---------------- */

const findUser = (data: SchoolData, id: string) => {
  const u = data.users.find((x) => x.id === id);
  if (!u) throw new MockHttpError(404, 'This user doesn’t exist');
  return u;
};

const isYou = (data: SchoolData, u: UserRow) => u.staffId === data.adminStaffId;

mock.get('/v1/users', (req) => schoolDataFor(req).data.users);

mock.get('/v1/users/:id', (req) => {
  const { data } = schoolDataFor(req);
  const u = findUser(data, req.params.id!);
  const can = PERMISSION_MODULES.map((m) => {
    const actions = [
      ...new Set(
        u.roles.flatMap((n) => data.roles.find((r) => r.name === n)?.permissions[m.key] ?? []),
      ),
    ];
    return actions.length
      ? ([m.label, actions.map((a) => ACTION_LABELS[a] ?? a).join(', ')] as [string, string])
      : null;
  }).filter((x): x is [string, string] => !!x);
  return {
    ...u,
    isYou: isYou(data, u),
    staffNumber: data.staff.find((s) => s.id === u.staffId)?.staffNumber ?? null,
    can,
    history: [
      ...historyOf(data, `User:${u.id}`),
      {
        id: 'created',
        title: 'Account created',
        detail: u.invited ? 'Invitation sent' : 'Invitation accepted',
        when: u.created,
      },
    ],
  };
});

function validateAccess(data: SchoolData, p: AccessPayload) {
  if (!p.roles?.length) throw new MockHttpError(422, 'Choose at least one role.');
  if (p.roles.some((r) => !data.roles.some((x) => x.name === r)))
    throw new MockHttpError(422, 'One of those roles doesn’t exist.');
  if (p.scope === 'Branch' && !p.branches?.length)
    throw new MockHttpError(422, 'Choose at least one branch.');
}

mock.post('/v1/users/invitations', (req) => {
  const { data, log, schoolId, actor } = schoolDataFor(req);
  const p = req.body as InvitePayload;
  const staff = p.staffId ? data.staff.find((s) => s.id === p.staffId) : null;
  if (p.staffId && !staff) throw new MockHttpError(422, 'Choose the staff member.');
  const name = staff?.name ?? requireText(p.name, 'Enter their full name.');
  const email = (p.email ?? '').trim();
  if (!EMAIL.test(email)) throw new MockHttpError(422, 'Enter a valid email address.');
  if (
    data.users.some(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() &&
        !['Deactivated', 'Revoked'].includes(u.status),
    )
  )
    throw new MockHttpError(409, 'This email already has an account or a pending invitation.');
  if (p.roles?.includes('Owner'))
    throw new MockHttpError(422, 'The Owner role can’t be given by invitation.');
  validateAccess(data, p);
  if (/fail/i.test(email))
    throw new MockHttpError(
      502,
      'We couldn’t send the invitation email. Check the address and try again.',
    );
  const user: UserRow = {
    id: `u${Date.now().toString(36)}`,
    staffId: staff?.id ?? null,
    name,
    email,
    position: staff?.position ?? 'Staff',
    roles: p.roles,
    scope: p.scope,
    branches: p.scope === 'Branch' ? p.branches : [],
    status: 'Invited',
    lastActive: '—',
    created: 'Today',
    invited: 'Today',
  };
  data.users.push(user);
  staffInvited(
    schoolId,
    { id: staff?.id ?? user.id, name, email, phone: staff?.phone ?? '' },
    p.roles.join(', '),
    actor,
    user.id,
  );
  log(
    `User:${user.id}`,
    `Invited as ${p.roles.join(', ')}`,
    p.scope === 'School' ? 'Whole school' : p.branches.join(', '),
  );
  return user;
});

mock.patch('/v1/users/:id/access', (req) => {
  const { data, log } = schoolDataFor(req);
  const u = findUser(data, req.params.id!);
  const p = req.body as AccessPayload;
  validateAccess(data, p);
  if (isYou(data, u) && !p.roles.includes('School Admin'))
    throw new MockHttpError(409, 'You can’t remove your own School Admin role.');
  const added = p.roles.filter((r) => !u.roles.includes(r));
  const removed = u.roles.filter((r) => !p.roles.includes(r));
  Object.assign(u, {
    roles: p.roles,
    scope: p.scope,
    branches: p.scope === 'Branch' ? p.branches : [],
  });
  log(
    `User:${u.id}`,
    'Access changed',
    [
      added.length ? `+${added.join(', +')}` : '',
      removed.length ? `−${removed.join(', −')}` : '',
      p.scope === 'School' ? 'Whole school' : p.branches.join(', '),
    ]
      .filter(Boolean)
      .join(' · '),
  );
  return u;
});

type UserAction = 'suspend' | 'reactivate' | 'deactivate' | 'password-reset' | 'resend' | 'revoke';
const ALLOWED: Record<UserAction, UserRow['status'][]> = {
  suspend: ['Active'],
  reactivate: ['Suspended'],
  deactivate: ['Suspended', 'Active'],
  'password-reset': ['Active'],
  resend: ['Invited'],
  revoke: ['Invited'],
};

mock.post('/v1/users/:id/:action', (req) => {
  const { data, log, schoolId, actor } = schoolDataFor(req);
  const u = findUser(data, req.params.id!);
  const action = req.params.action as UserAction;
  if (!ALLOWED[action]) throw new MockHttpError(404, 'Unknown action');
  if (!ALLOWED[action].includes(u.status))
    throw new MockHttpError(
      409,
      `That isn’t possible while the account is ${u.status.toLowerCase()}.`,
    );
  if (isYou(data, u) && ['suspend', 'deactivate'].includes(action))
    throw new MockHttpError(409, 'You can’t suspend or deactivate your own account.');
  const reason = (req.body as { reason?: string } | undefined)?.reason?.trim();
  switch (action) {
    case 'suspend':
      requireText(reason, 'Give a reason for suspending.');
      u.status = 'Suspended';
      log(`User:${u.id}`, 'Suspended account', reason);
      break;
    case 'reactivate':
      u.status = 'Active';
      log(`User:${u.id}`, 'Reactivated account');
      break;
    case 'deactivate':
      u.status = 'Deactivated';
      u.lastActive = '—';
      log(`User:${u.id}`, 'Deactivated account');
      break;
    case 'password-reset':
      log(`User:${u.id}`, 'Sent password reset', u.email);
      break;
    case 'resend': {
      u.invited = 'Today';
      const s = u.staffId ? data.staff.find((x) => x.id === u.staffId) : null;
      staffInvited(
        schoolId,
        { id: s?.id ?? u.id, name: u.name, email: u.email, phone: s?.phone ?? '' },
        u.roles.join(', '),
        actor,
        u.id,
      );
      log(`User:${u.id}`, 'Resent invitation');
      break;
    }
    case 'revoke':
      u.status = 'Revoked';
      log(`User:${u.id}`, 'Revoked invitation');
      break;
  }
  return u;
});

/* ---------------- Roles ---------------- */

const withCount = (data: SchoolData) => (r: SchoolData['roles'][number]) => ({
  ...r,
  users: data.users.filter((u) => u.roles.includes(r.name) && u.status !== 'Revoked').length,
});

mock.get('/v1/roles', (req) => {
  const { data } = schoolDataFor(req);
  return data.roles.map(withCount(data));
});

const findRole = (data: SchoolData, id: string) => {
  const r = data.roles.find((x) => x.id === id);
  if (!r) throw new MockHttpError(404, 'This role doesn’t exist');
  return r;
};

mock.get('/v1/roles/:id', (req) => {
  const { data } = schoolDataFor(req);
  return withCount(data)(findRole(data, req.params.id!));
});

function validateRole(data: SchoolData, p: RolePayload, currentId?: string) {
  const name = requireText(p.name, 'Name the role.');
  if (data.roles.some((x) => x.id !== currentId && x.name.toLowerCase() === name.toLowerCase()))
    throw new MockHttpError(422, 'A role with this name already exists.');
  if (!ROLE_SCOPES.includes(p.scope)) throw new MockHttpError(422, 'Choose a default scope.');
  const valid = Object.fromEntries(
    PERMISSION_MODULES.map(
      (m) =>
        [
          m.key,
          (p.permissions?.[m.key] ?? []).filter((a) =>
            (m.actions as readonly string[]).includes(a),
          ),
        ] as const,
    ).filter(([, a]) => a.length > 0),
  );
  if (!Object.keys(valid).length)
    throw new MockHttpError(422, 'Give the role at least one permission.');
  return { name, permissions: valid as Record<string, string[]> };
}

mock.post('/v1/roles', (req) => {
  const { data, log } = schoolDataFor(req);
  const p = req.body as RolePayload;
  const { name, permissions } = validateRole(data, p);
  const row = {
    id: `r${Date.now().toString(36)}`,
    name,
    type: 'Custom' as const,
    scope: p.scope,
    description: (p.description ?? '').trim(),
    permissions,
  };
  data.roles.push(row);
  log('Role', `Created role · ${name}`, `${Object.values(permissions).flat().length} permissions`);
  return withCount(data)(row);
});

mock.patch('/v1/roles/:id', (req) => {
  const { data, log } = schoolDataFor(req);
  const r = findRole(data, req.params.id!);
  if (r.type === 'Predefined')
    throw new MockHttpError(
      409,
      'Predefined roles can’t be edited. Duplicate it to make a custom version.',
    );
  const p = req.body as RolePayload;
  const { name, permissions } = validateRole(data, p, r.id);
  if (name !== r.name)
    for (const u of data.users) u.roles = u.roles.map((x) => (x === r.name ? name : x));
  Object.assign(r, {
    name,
    scope: p.scope,
    description: (p.description ?? '').trim(),
    permissions,
  });
  log('Role', `Updated role · ${name}`);
  return withCount(data)(r);
});

mock.delete('/v1/roles/:id', (req) => {
  const { data, log } = schoolDataFor(req);
  const r = findRole(data, req.params.id!);
  if (r.type === 'Predefined') throw new MockHttpError(409, 'Predefined roles can’t be deleted.');
  const holders = withCount(data)(r).users;
  if (holders)
    throw new MockHttpError(
      409,
      `${holders} user${holders > 1 ? 's have' : ' has'} this role. Remove it from them first.`,
    );
  data.roles = data.roles.filter((x) => x !== r);
  log('Role', `Deleted role · ${r.name}`);
  return { ok: true };
});
