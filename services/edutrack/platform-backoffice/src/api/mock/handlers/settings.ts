import type { NotificationPreference, SecuritySettings, UpdateProfilePayload } from '@/types';
import { NOTIFICATION_CHANNELS } from '@/types';

import {
  audit,
  ME,
  notificationPreferences,
  notifications,
  profile,
  securityToggles,
  issues,
  schools,
  users,
} from '../db';
import { mock, MockHttpError } from '@edutrack/web-core/mock';
import { fullName, requireText, roleName, toIssue } from './shared';

mock.get('/v1/platform/me/profile', () => ({
  ...profile,
  email: 'tolu.bamidele@edutrack.ng',
  roleName: 'Platform Administrator',
  status: 'Active',
  memberSince: '14 Mar 2024',
  lastSignIn: 'Today, 08:14 · Chrome on macOS, Lagos',
}));

mock.patch('/v1/platform/me/profile', ({ body }) => {
  const p = body as UpdateProfilePayload;
  Object.assign(profile, {
    firstName: requireText(p.firstName, 'Enter your first name'),
    lastName: requireText(p.lastName, 'Enter your last name'),
    phone: p.phone.trim(),
  });
  const me = users.find((u) => u.id === ME.id)!;
  Object.assign(me, {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
  });
  audit({
    summary: 'Updated own profile',
    action: 'user.update_self',
    entity: 'User',
    entityId: ME.id,
  });
  return profile;
});

mock.put('/v1/platform/me/avatar', ({ body }) => {
  profile.avatarUrl = (body as { avatarUrl: string | null }).avatarUrl;
  audit({
    summary: profile.avatarUrl ? 'Updated profile photo' : 'Removed profile photo',
    action: 'user.avatar',
    entity: 'User',
    entityId: ME.id,
  });
  return profile;
});

const preferences = (): NotificationPreference[] =>
  notificationPreferences.map(([event, flags]) => ({
    event,
    channels: Object.fromEntries(
      NOTIFICATION_CHANNELS.map((c, i) => [c, flags[i]]),
    ) as NotificationPreference['channels'],
    locked: event === 'Security alert' ? ['email'] : [],
  }));

mock.get('/v1/platform/settings/notifications', preferences);

mock.put('/v1/platform/settings/notifications', ({ body }) => {
  const { event, channel, enabled } = body as {
    event: string;
    channel: (typeof NOTIFICATION_CHANNELS)[number];
    enabled: boolean;
  };
  const row = notificationPreferences.find(([e]) => e === event);
  if (row && !(event === 'Security alert' && channel === 'email'))
    row[1][NOTIFICATION_CHANNELS.indexOf(channel)] = enabled;
  return preferences();
});

mock.get('/v1/platform/settings/security', () => securityToggles);

mock.put('/v1/platform/settings/security', ({ body }) => {
  const before = { ...securityToggles };
  // Same rule as the API: there is nowhere to enter approved ranges yet.
  if ((body as Partial<SecuritySettings>).ipRestriction && !securityToggles.ipRestriction)
    throw new MockHttpError(
      422,
      'Add approved IP ranges before turning this on. Managing IP ranges isn’t available yet.',
      'IP_RANGES_REQUIRED',
    );
  Object.assign(securityToggles, body as Partial<SecuritySettings>);
  audit({
    summary: 'Sign-in security settings changed',
    action: 'settings.security',
    entity: 'Settings',
    entityId: 'security',
    previous: JSON.stringify(before),
    next: JSON.stringify(securityToggles),
  });
  return securityToggles;
});

mock.get('/v1/platform/search', ({ query }) => {
  const q = (query.q ?? '').trim().toLowerCase();
  const results = [
    ...schools.map((s) => ({
      id: s.id,
      type: 'School',
      title: s.name,
      meta: `${s.type} · ${s.plan} · ${s.status}`,
      to: `/schools/${s.id}`,
    })),
    ...users.map((u) => ({
      id: u.id,
      type: 'User',
      title: fullName(u),
      meta: `${roleName(u.roleId)} · ${u.email}`,
      to: `/users/${u.id}`,
    })),
    ...issues.map(toIssue).map((i) => ({
      id: i.id,
      type: 'Issue',
      title: `${i.id} · ${i.subject}`,
      meta: `${i.schoolName} · ${i.status}`,
      to: `/support/${i.id}`,
    })),
  ];
  return results.filter((r) => !q || `${r.title} ${r.meta}`.toLowerCase().includes(q)).slice(0, 9);
});

mock.get('/v1/platform/notifications', () => notifications);

mock.post('/v1/platform/notifications/read-all', () => {
  notifications.forEach((n) => (n.unread = false));
  return notifications;
});
