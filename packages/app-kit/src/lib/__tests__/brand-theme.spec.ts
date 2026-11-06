import chroma from 'chroma-js';
import { describe, expect, it } from 'vitest';

import { applyBrandTheme, brandPalette, DEFAULT_BRAND } from '../brand-theme';

describe('brand theme', () => {
  it('derives readable shades and tints from one colour', () => {
    const p = brandPalette('#24497A')!;
    expect(p['--primary']).toBe('#24497a');
    expect(p['--primary-foreground']).toBe('#ffffff');
    expect(chroma.contrast(p['--brand-strong'], '#ffffff')).toBeGreaterThan(
      chroma.contrast(p['--primary'], '#ffffff'),
    );
    expect(chroma(p['--brand-tint']).luminance()).toBeGreaterThan(
      chroma(p['--brand-subtle']).luminance(),
    );
    expect(chroma(p['--brand-subtle']).luminance()).toBeGreaterThan(0.6);
    // A light brand colour gets dark text on buttons.
    expect(brandPalette('#F3C94F')!['--primary-foreground']).toBe('#252321');
    expect(brandPalette('not a colour')).toBeNull();
  });

  it('sets the tokens on the root and clears them for the default colour', () => {
    const root = document.createElement('div');
    applyBrandTheme('#2F6B4F', root);
    expect(root.style.getPropertyValue('--primary')).toBe('#2f6b4f');
    expect(root.dataset.brand).toBe('#2f6b4f');
    applyBrandTheme(DEFAULT_BRAND, root);
    expect(root.style.getPropertyValue('--primary')).toBe('');
    applyBrandTheme('#2F6B4F', root);
    applyBrandTheme(null, root);
    expect(root.style.length).toBe(0);
  });
});
