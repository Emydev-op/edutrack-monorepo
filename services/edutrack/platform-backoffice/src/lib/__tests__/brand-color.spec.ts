import { describe, expect, it } from 'vitest';

import { contrastWithWhite, isHexColor, paletteName } from '../brand-color';

describe('brand colors', () => {
  it('accepts every palette color for white text and rejects light ones', () => {
    expect(contrastWithWhite('#24497A')).toBeGreaterThanOrEqual(4.5);
    expect(contrastWithWhite('#F3E3CB')).toBeLessThan(4.5);
    expect(isHexColor('#24497a')).toBe(true);
    expect(isHexColor('24497A')).toBe(false);
    expect(paletteName('#24497a')).toBe('Navy');
    expect(paletteName('#123456')).toBe('Custom');
  });
});
