import { describe, expect, it } from 'vitest';

import { accessRule, safeRedirect } from '../guards';

const to = (name: string, fullPath: string, requiresAuth = false) => ({
  name,
  fullPath,
  matched: requiresAuth ? [{ meta: { requiresAuth: true } }] : [],
});

describe('accessRule', () => {
  it('sends signed-out parents to sign in, remembering where they were going', () => {
    expect(accessRule(to('fees', '/fees', true) as never, false)).toEqual({
      name: 'login',
      query: { redirect: '/fees' },
    });
    expect(accessRule(to('home', '/home', true) as never, false)).toEqual({
      name: 'login',
      query: {},
    });
  });

  it('lets signed-in parents through and sends them home from the sign-in page', () => {
    expect(accessRule(to('fees', '/fees', true) as never, true)).toBe(true);
    expect(accessRule(to('login', '/login') as never, true)).toEqual({ name: 'home' });
  });

  it('keeps invitations and reset links open while signed in', () => {
    expect(accessRule(to('accept-invitation', '/accept-invitation/abc') as never, true)).toBe(true);
    expect(accessRule(to('reset-password', '/reset-password?token=x') as never, false)).toBe(true);
  });
});

describe('safeRedirect', () => {
  it('only follows paths inside the portal', () => {
    expect(safeRedirect('/fees/pay')).toBe('/fees/pay');
    expect(safeRedirect('//evil.example.com')).toBeNull();
    expect(safeRedirect('https://evil.example.com')).toBeNull();
    expect(safeRedirect(['/fees'])).toBeNull();
  });
});
