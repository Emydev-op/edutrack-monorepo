import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

import LoginView from '../LoginView.vue';

function mountLogin() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'login', component: LoginView }],
  });
  return mount(LoginView, {
    global: {
      plugins: [createPinia(), router, [VueQueryPlugin, { queryClient: new QueryClient() }]],
    },
  });
}

describe('LoginView', () => {
  it('shows validation errors for an empty form', async () => {
    const wrapper = mountLogin();

    await wrapper.find('form').trigger('submit');

    // Yup validates asynchronously, so wait for the errors to render.
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Email is required');
      expect(wrapper.text()).toContain('Password is required');
    });
  });
});
