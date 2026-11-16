import { afterEach, describe, expect, it, vi } from 'vitest';

import { recallBrandColor, rememberBrandColor } from '../brand-memory';

describe('brand memory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('remembers the colour per address', () => {
    rememberBrandColor('#1F5F8B', 'greenfield.localhost');

    expect(recallBrandColor('greenfield.localhost')).toBe('#1F5F8B');
    expect(recallBrandColor('kingsway.localhost')).toBeNull();

    rememberBrandColor(null, 'greenfield.localhost');
    expect(recallBrandColor('greenfield.localhost')).toBeNull();
  });

  it('carries on when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(() => rememberBrandColor('#1F5F8B', 'greenfield.localhost')).not.toThrow();
    expect(recallBrandColor('greenfield.localhost')).toBeNull();
  });
});
