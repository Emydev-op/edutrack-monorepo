import { createVueQueryOptions } from '@edutrack/web-core/query';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { installMockApi } from '@/api/mock';
import router from '@/router';

import LoginView from '../LoginView.vue';

async function mountLogin() {
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push('/login');
  await router.isReady();
  return mount(LoginView, {
    global: { plugins: [pinia, router, [VueQueryPlugin, createVueQueryOptions()]] },
  });
}

describe('LoginView', () => {
  beforeAll(() => installMockApi(apiClient));

  it('validates the email before calling the API', async () => {
    const wrapper = await mountLogin();
    await wrapper.find('input[type="email"]').setValue('not-an-email');
    await wrapper.find('form').trigger('submit');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Enter a valid email address'));
  });

  it('lets the user show and hide the password', async () => {
    const wrapper = await mountLogin();
    const field = () => wrapper.find('input[autocomplete="current-password"]');
    const toggle = wrapper.find('button[aria-label="Show password"]');

    expect(field().attributes('type')).toBe('password');
    await toggle.trigger('click');
    expect(field().attributes('type')).toBe('text');
    expect(wrapper.find('button[aria-label="Hide password"]').attributes('aria-pressed')).toBe(
      'true',
    );
    await wrapper.find('button[aria-label="Hide password"]').trigger('click');
    expect(field().attributes('type')).toBe('password');
  });

  it('explains why a suspended account cannot sign in', async () => {
    const wrapper = await mountLogin();
    await wrapper.find('input[type="email"]').setValue('chidi.okoro@greenfield.edu.ng');
    await wrapper.find('form').trigger('submit');
    await vi.waitFor(
      () => expect(wrapper.text()).toContain('Your school account has been temporarily suspended'),
      { timeout: 3000 },
    );
  });
});
