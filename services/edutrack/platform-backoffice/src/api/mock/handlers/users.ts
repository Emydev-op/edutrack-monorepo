import type { CreateRolePayload, InviteUserPayload, UpdateUserPayload, UserAction } from '@/types';

import { activity, audit, issues, ME, roles, users } from '../db';
import { mock, MockHttpError, paginate } from '@edutrack/web-core/mock';
import { findUser, fullName, isOpenIssue, requireText, roleName, toUser } from './shared';

/* ---------- Users ---------- */

const createdWithin = (created: string, window: string) =>
  window === 'Last 30 days' ? /Nov 2026|Dec 2026|Today/.test(created) : /2026|Today/.test(created);
const activeWithin = (seen: string, window: string) =>
  window === 'Today'
    ? /Today|Just now/.test(seen)
    : window === 'Last 7 days'
      ? /Today|Yesterday|Dec|Just now/.test(seen)
      : seen.endsWith('2026');

mock.get('/v1/users', ({ query }) => {
  const rows = users
    .map(toUser)
    .filter(
      (u) =>
        (query.view !== 'invitations' || u.invitation !== null) &&
        (!query.role || u.roleName === query.role) &&
        (!query.status || u.status === query.status) &&
        (!query.created || createdWithin(u.createdAt, query.created)) &&
        (!query.lastActive || activeWithin(u.lastSeen, query.lastActive)),
    );
  return paginate(rows, query, (u) => `${fullName(u)} ${u.email}`);
});

mock.get('/v1/users/:id', ({ params }) => toUser(findUser(params.id!)));

mock.post('/v1/users/invitations', ({ body }) => {
  const p = body as InviteUserPayload;
  const email = requireText(p.email, 'Enter a valid email').toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === email)) {
    throw new MockHttpError(409, 'This person already has an account or invitation', 'USER_EXISTS');
  }
  // Test hook kept from the design: an address containing "fail" shows the error state.
  if (/fail/i.test(email))
    throw new MockHttpError(
      503,
      "We couldn't send the invitation. Check your connection and try again.",
    );
  const user = {
    id: `n${Date.now().toString(36)}`,
    firstName: p.firstName.trim(),
    lastName: p.lastName.trim(),
    email,
    phone: p.phone,
    roleId: p.roleId,
    status: 'Invited' as const,
    invitation: 'Pending' as const,
    invitedBy: ME.name,
    lastSeen: '—',
    createdAt: 'Today',
  };
  users.push(user);
  audit({
    summary: `User invited · ${fullName(user)}`,
    action: 'user.invite',
    entity: 'User',
    entityId: user.id,
    next: `${email} · ${roleName(p.roleId)}`,
  });
  return toUser(user);
});

mock.patch('/v1/users/:id', ({ params, body }) => {
  const user = findUser(params.id!);
  const p = body as UpdateUserPayload;
  const previousRole = roleName(user.roleId);
  Object.assign(user, {
    firstName: requireText(p.firstName, 'Enter a first name'),
    lastName: requireText(p.lastName, 'Enter a last name'),
    email: requireText(p.email, 'Enter a valid email'),
    phone: p.phone,
    roleId: p.roleId,
  });
  if (previousRole !== roleName(p.roleId)) {
    audit({
      summary: `Role changed · ${fullName(user)} to ${roleName(p.roleId)}`,
      action: 'user.change_role',
      entity: 'User',
      entityId: user.id,
      previous: previousRole,
      next: roleName(p.roleId),
    });
  } else {
    audit({
      summary: `User details updated · ${fullName(user)}`,
      action: 'user.update',
      entity: 'User',
      entityId: user.id,
    });
  }
  return toUser(user);
});

const USER_ACTIONS: Record<
  UserAction,
  { label: string; apply?: (u: (typeof users)[number]) => void }
> = {
  suspend: { label: 'User suspended', apply: (u) => (u.status = 'Suspended') },
  reactivate: { label: 'User reactivated', apply: (u) => (u.status = 'Active') },
  deactivate: { label: 'User deactivated', apply: (u) => (u.status = 'Deactivated') },
  'password-reset': { label: 'Password reset sent' },
  'sign-out': { label: 'Signed out of all sessions' },
  'resend-invitation': { label: 'Invitation resent', apply: (u) => (u.invitation = 'Resent') },
  'revoke-invitation': {
    label: 'Invitation revoked',
    apply: (u) => Object.assign(u, { status: 'Deactivated', invitation: 'Revoked' }),
  },
};

mock.post('/v1/users/:id/:action', ({ params, body }) => {
  const user = findUser(params.id!);
  const action = USER_ACTIONS[params.action as UserAction];
  if (!action) throw new MockHttpError(404, 'Unknown action');
  const before = user.status;
  action.apply?.(user);
  const reason = (body as { reason?: string } | null)?.reason;
  audit({
    summary: `${action.label} · ${fullName(user)}${reason ? ` · "${reason}"` : ''}`,
    action: `user.${params.action}`,
    entity: 'User',
    entityId: user.id,
    previous: before,
    next: user.status,
  });
  return toUser(user);
});

mock.get('/v1/users/:id/activity', ({ params }) => {
  const user = findUser(params.id!);
  const name = fullName(user);
  const own = activity
    .filter((a) => a.actor === name || a.summary.includes(name))
    .map((a) => ({
      id: a.id,
      title: a.summary,
      detail: a.schoolName === '—' ? a.entity : a.schoolName,
      when: a.when,
      tone: 'info',
    }));
  const seeded =
    user.id === 'u2'
      ? [
          ['Replied on SUP-1182', 'Kingsway International School', 'Today 11:26'],
          ['Added internal note on SUP-1182', '', 'Today 11:15'],
          ['Approved a support session', 'Kingsway · 30 min read-only', 'Today 09:02'],
          ['Resolved SUP-1170', 'Greenfield Academy', '3 Dec'],
          ['Signed in', 'Chrome on Windows · Lagos', 'Today 09:14'],
        ]
      : user.id === 'u5'
        ? [
            ['Role changed', `Support Agent → Platform Operations · by ${ME.name}`, '28 Nov'],
            ['Extended subscription', 'Hillcrest Nursery & Primary · 1 month', '20 Nov'],
          ]
        : [['Signed in', 'Chrome', user.lastSeen]];
  return own.concat(
    seeded.map(([title, detail, when], i) => ({
      id: `s${i}`,
      title: title!,
      detail: detail!,
      when: when!,
      tone: title === 'Resolved SUP-1170' ? 'success' : 'neutral',
    })),
  );
});

mock.get('/v1/users/:id/security', ({ params }) => {
  const user = findUser(params.id!);
  const invited = user.status === 'Invited';
  return {
    lastPasswordChange: invited ? '—' : '14 Oct 2026',
    activeSessions: invited ? '0' : '2 · Chrome on Windows (Lagos), Safari on iPhone',
    failedSignIns: 0,
    twoFactor: 'Coming soon',
  };
});

mock.get('/v1/users/:id/open-issues', ({ params }) => {
  const name = fullName(findUser(params.id!));
  return { count: issues.filter((i) => i.assignee === name && isOpenIssue(i)).length };
});

/* ---------- Roles ---------- */

const withCounts = () =>
  roles.map((r) => ({
    ...r,
    activeUsers: users.filter((u) => u.roleId === r.id && u.status !== 'Deactivated').length,
  }));

mock.get('/v1/roles', () => withCounts());

mock.post('/v1/roles', ({ body }) => {
  const p = body as CreateRolePayload;
  const name = requireText(p.name, 'Give the role a name');
  if (roles.some((r) => r.name.toLowerCase() === name.toLowerCase()))
    throw new MockHttpError(409, 'A role with this name already exists');
  const role = {
    id: `r${Date.now().toString(36)}`,
    name,
    description: p.description.trim() || 'Custom role',
    permissions: p.permissions,
    predefined: false,
  };
  roles.push(role);
  const count = Object.values(p.permissions).reduce((n, list) => n + (list?.length ?? 0), 0);
  audit({
    summary: `Role created · ${name}`,
    action: 'role.create',
    entity: 'Role',
    entityId: role.id,
    next: `${count} permissions`,
  });
  return { ...role, activeUsers: 0 };
});

mock.delete('/v1/roles/:id', ({ params }) => {
  const role = roles.find((r) => r.id === params.id);
  if (!role) throw new MockHttpError(404, 'Role not found');
  if (role.predefined) throw new MockHttpError(409, "Predefined roles can't be deleted");
  if (users.some((u) => u.roleId === role.id && u.status !== 'Deactivated'))
    throw new MockHttpError(409, 'Users still have this role. Move them to another role first.');
  roles.splice(roles.indexOf(role), 1);
  audit({
    summary: `Role deleted · ${role.name}`,
    action: 'role.delete',
    entity: 'Role',
    entityId: role.id,
    previous: role.name,
  });
  return { ok: true };
});
