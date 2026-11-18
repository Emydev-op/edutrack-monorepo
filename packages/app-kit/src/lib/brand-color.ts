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

export { brandColorProblem, contrastWithWhite, isHexColor } from '@edutrack/shared';

export const paletteName = (hex: string) =>
  BRAND_PALETTE.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? 'Custom';
