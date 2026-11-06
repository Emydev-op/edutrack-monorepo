import chroma from 'chroma-js';

/** Edutrack's default brand colour (Brick). Schools on it keep the design's hand-tuned tokens. */
export const DEFAULT_BRAND = '#9B403C';

/** The design tokens a school's brand colour drives. Everything else (status colours, neutrals) stays fixed. */
export type BrandToken =
  | '--primary'
  | '--primary-hover'
  | '--primary-foreground'
  | '--ring'
  | '--brand-strong'
  | '--brand-subtle'
  | '--brand-tint'
  | '--sidebar-primary'
  | '--sidebar-primary-foreground'
  | '--sidebar-ring';

const TOKENS: BrandToken[] = [
  '--primary',
  '--primary-hover',
  '--primary-foreground',
  '--ring',
  '--brand-strong',
  '--brand-subtle',
  '--brand-tint',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-ring',
];

const INK = '#252321';

/**
 * The full brand palette from one colour: the colour itself for buttons and links, darker shades
 * for hover and strong text, and light tints for selected rows, chips and soft backgrounds.
 * Returns null for anything that isn't a colour.
 */
export function brandPalette(colour: string): Record<BrandToken, string> | null {
  if (!chroma.valid(colour)) return null;
  const base = chroma(colour);
  const hex = base.hex();
  // Text on the brand colour: white when it's readable (WCAG AA, 4.5:1), otherwise ink.
  const onBrand = chroma.contrast(base, '#ffffff') >= 4.5 ? '#ffffff' : INK;
  return {
    '--primary': hex,
    '--primary-hover': base.darken(0.45).hex(),
    '--primary-foreground': onBrand,
    '--ring': hex,
    '--brand-strong': base.darken(0.7).hex(),
    '--brand-subtle': chroma.mix(base, '#ffffff', 0.82, 'lab').hex(),
    '--brand-tint': chroma.mix(base, '#ffffff', 0.94, 'lab').hex(),
    '--sidebar-primary': hex,
    '--sidebar-primary-foreground': onBrand,
    '--sidebar-ring': hex,
  };
}

/**
 * Re-themes the page in a school's colour by overriding the brand tokens on the root element,
 * the way the Mance web app does. Pass nothing (or the default colour) to go back to Edutrack's
 * own palette, e.g. after sign-out.
 */
export function applyBrandTheme(
  colour: string | null | undefined,
  root: HTMLElement = document.documentElement,
) {
  const palette =
    colour && chroma.valid(colour) && chroma(colour).hex() !== chroma(DEFAULT_BRAND).hex()
      ? brandPalette(colour)
      : null;
  for (const token of TOKENS) {
    if (palette) root.style.setProperty(token, palette[token]);
    else root.style.removeProperty(token);
  }
  if (palette) root.dataset.brand = palette['--primary'];
  else delete root.dataset.brand;
}
