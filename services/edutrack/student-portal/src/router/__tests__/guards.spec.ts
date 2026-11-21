import { describe, expect, it } from 'vitest';

import { notificationTarget } from '@/lib/notifications';

import { accessRule, safeRedirect } from '../guards';

const to = (name: string, fullPath: string, requiresAuth = false) => ({
  name,
  fullPath,
  matched: requiresAuth ? [{ meta: { requiresAuth: true } }] : [],
});

describe('accessRule', () => {
  it('sends signed-out students to sign in, remembering where they were going', () => {
    expect(accessRule(to('results', '/results', true) as never, false)).toEqual({
      name: 'login',
      query: { redirect: '/results' },
    });
    expect(accessRule(to('home', '/home', true) as never, false)).toEqual({
      name: 'login',
      query: {},
    });
  });

  it('lets signed-in students through and sends them home from the sign-in page', () => {
    expect(accessRule(to('results', '/results', true) as never, true)).toBe(true);
    expect(accessRule(to('login', '/login') as never, true)).toEqual({ name: 'home' });
  });

  it('keeps the set-a-new-password page open either way', () => {
    expect(accessRule(to('password-expired', '/password-expired') as never, true)).toBe(true);
    expect(accessRule(to('password-expired', '/password-expired') as never, false)).toBe(true);
  });
});

describe('safeRedirect', () => {
  it('only follows paths inside the portal', () => {
    expect(safeRedirect('/assignments/1')).toBe('/assignments/1');
    expect(safeRedirect('//evil.example.com')).toBeNull();
    expect(safeRedirect('https://evil.example.com')).toBeNull();
    expect(safeRedirect(['/results'])).toBeNull();
  });
});

describe('notificationTarget', () => {
  it('opens assignments, results and the rest inside the portal', () => {
    expect(notificationTarget({ to: '/assignments/abc' })).toEqual({
      name: 'assignment',
      params: { assignmentId: 'abc' },
    });
    expect(notificationTarget({ to: '/results?term=1' })).toEqual({ name: 'results' });
    expect(notificationTarget({ to: '/fees' })).toEqual({ name: 'home' });
  });
});
