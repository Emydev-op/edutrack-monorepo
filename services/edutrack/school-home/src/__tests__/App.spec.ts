import type { PublicSchool } from '@edutrack/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App.vue';
import { recallBrandColor } from '@edutrack/app-kit/lib/brand-memory';

const GREENFIELD: PublicSchool = {
  slug: 'greenfield',
  name: 'Greenfield Academy',
  initials: 'GA',
  motto: 'Knowledge and character',
  brandColor: '#1F5F8B',
  logoUrl: null,
  available: true,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const found = (school: Partial<PublicSchool> = {}) =>
  json(200, {
    success: true,
    message: 'Greenfield Academy found.',
    data: { ...GREENFIELD, ...school },
  });

const notFound = () =>
  json(404, {
    success: false,
    message: 'We couldn’t find a school at this address. Check the link your school sent you.',
    error: { code: 'SCHOOL_NOT_FOUND' },
  });

const fetchMock = vi.fn<typeof fetch>();

async function mountApp() {
  const wrapper = mount(App);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  document.title = 'Edutrack';
  document.documentElement.removeAttribute('style');
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('school entry page', () => {
  it('shows the school with a link to each portal', async () => {
    fetchMock.mockResolvedValue(found());
    const wrapper = await mountApp();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/public/school', expect.anything());
    expect(wrapper.find('h1').text()).toBe('Greenfield Academy');
    expect(wrapper.text()).toContain('Knowledge and character');
    expect(wrapper.text()).toContain('GA');

    const links = wrapper.findAll('nav a');
    expect(links.map((a) => a.attributes('href'))).toEqual(['/teacher/', '/parent/', '/student/']);
    expect(links.map((a) => a.text())).toEqual([
      expect.stringContaining('Teacher'),
      expect.stringContaining('Parent'),
      expect.stringContaining('Student'),
    ]);

    expect(document.title).toBe('Greenfield Academy');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#1f5f8b');
    expect(recallBrandColor()).toBe('#1F5F8B');
  });

  it('shows the logo when the school has one', async () => {
    fetchMock.mockResolvedValue(found({ logoUrl: 'https://cdn.example.com/logo.png' }));
    const wrapper = await mountApp();

    expect(wrapper.find('header img').attributes('src')).toBe('https://cdn.example.com/logo.png');
  });

  it('shows a skeleton while the school loads', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const wrapper = mount(App);

    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Loading your school');
    expect(wrapper.findAll('nav a')).toHaveLength(0);
  });

  it('explains an unknown address', async () => {
    localStorage.setItem(`edutrack:brand-color:${location.host}`, '#1F5F8B');
    fetchMock.mockResolvedValue(notFound());
    const wrapper = await mountApp();

    expect(wrapper.find('h1').text()).toBe('School not found');
    expect(wrapper.text()).toContain('Check the link your school sent you');
    expect(wrapper.findAll('a')).toHaveLength(0);
    expect(document.title).toBe('School not found · Edutrack');
    expect(recallBrandColor()).toBeNull();
  });

  it('offers no sign-in while the school is unavailable', async () => {
    fetchMock.mockResolvedValue(found({ available: false }));
    const wrapper = await mountApp();

    expect(wrapper.find('h1').text()).toBe('Greenfield Academy');
    expect(wrapper.text()).toContain('Sign-in is unavailable');
    expect(wrapper.text()).toContain('contact the school');
    expect(wrapper.findAll('a')).toHaveLength(0);
  });

  it('offers a retry when the API cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const wrapper = await mountApp();

    expect(wrapper.find('h1').text()).toBe('We couldn’t load this page');
    expect(wrapper.find('[role="alert"]').text()).toContain('Check your connection');

    fetchMock.mockResolvedValueOnce(found());
    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.find('h1').text()).toBe('Greenfield Academy');
  });

  it('treats a server error as retryable, not as a missing school', async () => {
    fetchMock.mockResolvedValue(
      json(500, { success: false, message: 'Boom', error: { code: 'INTERNAL' } }),
    );
    const wrapper = await mountApp();

    expect(wrapper.find('h1').text()).toBe('We couldn’t load this page');
    expect(wrapper.find('button').text()).toContain('Try again');
  });
});
