import { createVueQueryOptions } from '@edutrack/web-core/query';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { installMockApi } from '@/api/mock';
import router from '@/router';
import { useAuthStore } from '@/stores/auth';

import ProvisionSchoolView from '../ProvisionSchoolView.vue';

const step = (w: VueWrapper) => w.find('[aria-current="step"]').text();
/** Presses Continue and waits until the wizard shows `expected` (validation is async). */
async function next(w: VueWrapper, expected = '') {
  await w.find('form').trigger('submit');
  await flushPromises();
  await vi.waitFor(() => expect(step(w)).toContain(expected));
}
/** Opens the searchable dropdown showing `placeholder` and picks `option` from its list. */
async function choose(w: VueWrapper, placeholder: string, option: string) {
  await w
    .findAll('button[role="combobox"]')
    .find((b) => b.text() === placeholder)!
    .trigger('click');
  await flushPromises();
  const item = [...document.querySelectorAll<HTMLElement>('[data-slot="command-item"]')].find(
    (el) => el.textContent?.trim() === option,
  );
  item!.click();
  await flushPromises();
}
async function type(w: VueWrapper, placeholder: string, value: string, index = 0) {
  await w.findAll(`input[placeholder="${placeholder}"]`)[index]!.setValue(value);
}

describe('Provision school wizard', () => {
  beforeAll(() => {
    installMockApi(apiClient);
    // jsdom has no layout, so the dropdown's scroll-to-highlighted-option is a no-op here.
    Element.prototype.scrollIntoView = vi.fn<() => void>();
  });

  it('keeps every step’s answers through to review and provisions with several administrators', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore().setSession(
      {
        token: 'mock-token.u1',
        user: {
          id: 'u1',
          firstName: 'Tolu',
          lastName: 'Bamidele',
          email: 'tolu@edutrack.ng',
          roleId: 'admin',
          roleName: 'Platform Administrator',
          avatarUrl: null,
        },
      },
      false,
    );
    await router.push('/schools/provision');
    await router.isReady();
    const w = mount(ProvisionSchoolView, {
      attachTo: document.body,
      global: { plugins: [pinia, router, [VueQueryPlugin, createVueQueryOptions()]] },
    });

    await type(w, 'Crestview College', 'Wizard Test College');
    await type(w, 'info@crestviewcollege.ng', 'info@wizardtest.ng');
    await choose(w, 'Select a state', 'FCT');
    await choose(w, 'Select an LGA', 'Bwari');
    await next(w, 'Academic offering');
    await next(w, 'Branches');
    await w
      .findAll('button')
      .find((b) => b.text().includes('Add branch'))!
      .trigger('click');
    await type(w, 'Main Campus', 'Lekki Campus', 1);
    await next(w, 'Subscription');
    await next(w, 'Administrators');

    await type(w, 'Osegbo Emeka', 'Osegbo Emeka');
    await type(w, 'e.osegbo@crestviewcollege.ng', 'e.osegbo@wizardtest.ng');
    await w
      .findAll('button')
      .find((b) => b.text().includes('Add another administrator'))!
      .trigger('click');
    await flushPromises();
    await type(w, 'Osegbo Emeka', 'Ada Bello', 1);
    await type(w, 'e.osegbo@crestviewcollege.ng', 'a.bello@wizardtest.ng', 1);
    await w.findAll('[data-admin]')[1]!.findAll('select')[1]!.setValue('Lekki Campus');
    await next(w, 'Review');

    // Every earlier step's answers survived the steps unmounting.
    const review = w.text();
    for (const text of [
      'Wizard Test College',
      'info@wizardtest.ng',
      'Bwari, FCT',
      'Junior Secondary',
      'Lekki Campus',
      'Starter',
      'Ada Bello',
      'Lekki Campus only',
    ]) {
      expect(review).toContain(text);
    }

    const push = vi.spyOn(router, 'push');
    await next(w); // provision
    await vi.waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({ params: { id: 'wizard-test-college' } }),
      ),
    );
    const { data: admins } = await apiClient.get(
      '/v1/platform/schools/wizard-test-college/administrators',
    );
    expect(admins).toHaveLength(2);
    w.unmount();
  });
});
