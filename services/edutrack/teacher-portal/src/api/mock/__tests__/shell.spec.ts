import { beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type {
  AnnouncementSummary,
  EmailPreference,
  NavCounts,
  NotificationList,
  Profile,
  ShellContext,
} from '@/types';

import { registerNavCount } from '../handlers/shell';
import { notify } from '../notify-db';
import { assignmentsOf } from '../scope';
import { failure, signIn } from './helpers';

describe('Context and sidebar counts', () => {
  let ade: AxiosInstance;
  beforeAll(async () => {
    ade = await signIn('s.ade@greenfield.edu.ng');
  });

  it('returns the clock, the terms and the entry deadline', async () => {
    const { data } = await ade.get<ShellContext>('/v1/context');
    expect(data).toMatchObject({
      today: '2026-12-08',
      now: '2026-12-08T08:15',
      activeTermId: 't-2627-1',
      entryDeadline: '2026-12-11T23:59',
      isSchoolDay: true,
    });
    expect(data.terms.map((t) => `${t.label} ${t.status}`)).toEqual([
      '2026/2027 · Second Term Upcoming',
      '2026/2027 · First Term Active',
      '2025/2026 · Third Term Closed',
    ]);
    expect(data.terms.find((t) => t.status === 'Closed')!.lockReason).toMatch(/read-only/);
  });

  it('adds up registered counts per route and term, ignoring broken counters', async () => {
    // Route names of their own, so features registering real counts don't change this test.
    expect((await ade.get<NavCounts>('/v1/nav-counts')).data['test-a']).toBeUndefined();
    registerNavCount('test-a', (teacherId, termId) => assignmentsOf(teacherId, termId).length);
    registerNavCount('test-a', () => 1);
    registerNavCount('test-b', () => {
      throw new Error('broken');
    });
    registerNavCount('test-c', () => 0);
    const counts = (await ade.get<NavCounts>('/v1/nav-counts')).data;
    expect(counts['test-a']).toBe(5);
    expect('test-b' in counts || 'test-c' in counts).toBe(false);
    const past = await ade.get<NavCounts>('/v1/nav-counts', { params: { term: 't-2526-3' } });
    expect(past.data['test-a']).toBe(3);
  });
});

describe('Notifications', () => {
  it('lists, marks read and keeps email preferences', async () => {
    const api = await signIn('s.ade@greenfield.edu.ng');
    const first = await api.get<NotificationList>('/v1/notifications');
    expect(first.data.unread).toBeGreaterThan(0);
    notify('ade', {
      title: 'Test notice',
      body: 'Body',
      category: 'results',
      to: { name: 'results' },
    });
    const { data } = await api.get<NotificationList>('/v1/notifications', {
      params: { filter: 'unread' },
    });
    expect(data.rows[0]).toMatchObject({ title: 'Test notice', when: 'Just now', read: false });
    expect(data.unread).toBe(first.data.unread + 1);
    await api.post(`/v1/notifications/${data.rows[0]!.id}/read`);
    await api.post('/v1/notifications/read-all');
    const after = await api.get<NotificationList>('/v1/notifications', {
      params: { filter: 'unread' },
    });
    expect(after.data).toMatchObject({ unread: 0, rows: [] });
    // Someone else's notification is not found.
    const okafor = await signIn('g.okafor@greenfield.edu.ng');
    expect((await failure(okafor.post(`/v1/notifications/${data.rows[0]!.id}/read`))).status).toBe(
      404,
    );

    const prefs = await api.get<EmailPreference[]>('/v1/notifications/preferences');
    expect(prefs.data.find((p) => p.key === 'sheet-returned')!.enabled).toBe(true);
    const saved = await api.put<EmailPreference[]>('/v1/notifications/preferences', {
      'sheet-returned': false,
      bogus: true,
    });
    expect(saved.data.find((p) => p.key === 'sheet-returned')!.enabled).toBe(false);
    expect(saved.data.some((p) => p.key === 'bogus')).toBe(false);
  });
});

describe('Announcements', () => {
  it('shows campus announcements only to teachers on that campus', async () => {
    const ade = await signIn('s.ade@greenfield.edu.ng');
    const okafor = await signIn('g.okafor@greenfield.edu.ng');
    const mine = (await ade.get<AnnouncementSummary[]>('/v1/announcements')).data;
    expect(mine[0]!.pinned).toBe(true);
    expect(mine.some((a) => a.id === 'an-4')).toBe(true);
    const hers = (await okafor.get<AnnouncementSummary[]>('/v1/announcements')).data;
    expect(hers.some((a) => a.id === 'an-4')).toBe(false);
    expect((await failure(okafor.get('/v1/announcements/an-4'))).status).toBe(404);
    expect((await ade.get('/v1/announcements/an-4')).data).toMatchObject({
      campuses: 'Lekki Campus',
    });
  });
});

describe('Profile', () => {
  const save = async (phone: string) =>
    (await signIn('t.salami@greenfield.edu.ng')).put<Profile>('/v1/profile', {
      phone,
      address: '5 Bode Thomas Street, Surulere',
      emergencyContact: null,
    });

  it.each(['0803 412 7781', '08034127781', '+234 803 412 7781', '0703-412-7781'])(
    'accepts the mobile number %s',
    async (phone) => {
      expect((await save(phone)).data.phone).toBe(phone);
    },
  );

  it.each(['0603 412 7781', '0803 412 778', '0823 412 7781', ''])(
    'refuses the mobile number "%s"',
    async (phone) => {
      expect(await failure(save(phone))).toMatchObject({ status: 422 });
    },
  );

  it('validates the emergency contact and completes the profile', async () => {
    const api = await signIn('t.salami@greenfield.edu.ng');
    const bad = await failure(
      api.put('/v1/profile', {
        phone: '0803 000 1111',
        address: '',
        emergencyContact: { name: 'Mrs. Salami', phone: '123', relationship: 'Spouse' },
      }),
    );
    expect(bad.message).toMatch(/emergency contact/);
    await api.put('/v1/profile', {
      phone: '0803 000 1111',
      address: '',
      emergencyContact: { name: 'Mrs. Salami', phone: '0803 000 2222', relationship: 'Spouse' },
    });
    const { data } = await api.get<{ profileComplete: boolean }>('/v1/me');
    expect(data.profileComplete).toBe(true);
  });
});
