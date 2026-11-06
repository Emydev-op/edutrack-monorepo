import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import { useAuthStore } from '@/stores/auth';

import { installSchoolTheme } from '../school-theme';

const school = (brandColor: string) => ({
  id: 'crestview',
  name: 'Crestview College',
  initials: 'CC',
  plan: 'Starter · Annual',
  brandColor,
  logoUrl: null,
  subscriptionStatus: 'Active' as const,
});
const user = {
  id: 'udo',
  firstName: 'Emem',
  lastName: 'Udo',
  email: 'e.udo@crestviewcollege.ng',
  position: 'Principal',
  roleName: 'School Admin',
  avatarUrl: null,
};
const primary = () => document.documentElement.style.getPropertyValue('--primary');

describe('school theme', () => {
  it('follows the signed-in school and resets on sign-out', async () => {
    setActivePinia(createPinia());
    const auth = useAuthStore();
    auth.clear();
    const stop = installSchoolTheme();
    expect(primary()).toBe('');

    auth.setSession({ token: 't', user, school: school('#24497A') }, false);
    await nextTick();
    expect(primary()).toBe('#24497a');

    auth.updateSchool({ brandColor: '#2F6B4F' });
    await nextTick();
    expect(primary()).toBe('#2f6b4f');

    auth.clear();
    await nextTick();
    expect(primary()).toBe('');
    stop();
  });
});
