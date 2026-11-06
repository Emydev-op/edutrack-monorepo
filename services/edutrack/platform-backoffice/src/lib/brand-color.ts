/** Brand colors a school can be provisioned with. Each passes 4.5:1 against white text. */
export const BRAND_PALETTE = [
  { name: 'Brick', hex: '#9B403C' },
  { name: 'Forest', hex: '#2F6B4F' },
  { name: 'Navy', hex: '#24497A' },
  { name: 'Royal', hex: '#4B3F9E' },
  { name: 'Teal', hex: '#19707A' },
  { name: 'Plum', hex: '#7A2E62' },
  { name: 'Ochre', hex: '#8A560B' },
  { name: 'Charcoal', hex: '#3D4148' },
] as const;

export const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
}

/** WCAG contrast ratio of white text on the color. */
export const contrastWithWhite = (hex: string) =>
  isHexColor(hex) ? 1.05 / (luminance(hex) + 0.05) : 0;

export const paletteName = (hex: string) =>
  BRAND_PALETTE.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? 'Custom';
