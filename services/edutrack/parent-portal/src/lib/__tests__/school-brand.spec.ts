import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  env: { apiUrl: '/api', schoolName: 'Greenfield Academy' },
}));

const school = {
  slug: 'kingsway',
  name: 'Kingsway College',
  initials: 'KC',
  motto: null,
  brandColor: '#1F5F8B',
  logoUrl: 'https://cdn.example.com/kc.png',
  available: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  localStorage.clear();
  document.documentElement.removeAttribute('style');
});

describe('school brand', () => {
  it('shows the school at this address and themes the portal in its colour', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ success: true, message: 'Kingsway College found.', data: school }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { installSchoolBrand, useSchoolBrand } = await import('../school-brand');

    expect(useSchoolBrand().name).toBe('Greenfield Academy');
    installSchoolBrand();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/public/school', expect.anything());
    expect(useSchoolBrand()).toMatchObject({
      name: 'Kingsway College',
      initials: 'KC',
      logoUrl: 'https://cdn.example.com/kc.png',
    });
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#1f5f8b');
  });

  it('keeps the configured name when the school cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const { installSchoolBrand, useSchoolBrand } = await import('../school-brand');

    installSchoolBrand();
    await flushPromises();

    expect(useSchoolBrand().name).toBe('Greenfield Academy');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
  });
});
