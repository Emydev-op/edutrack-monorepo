/** Edutrack's brand palette for schools; each colour passes 4.5:1 against white text. */
export const BRAND_PALETTE: [name: string, hex: string][] = [
  ['Brick', '#9B403C'],
  ['Forest', '#2F6B4F'],
  ['Navy', '#24497A'],
  ['Royal', '#4B3F9E'],
  ['Teal', '#19707A'],
  ['Plum', '#7A2E62'],
  ['Ochre', '#8A560B'],
  ['Charcoal', '#3D4148'],
];

export const paletteName = (hex: string) =>
  BRAND_PALETTE.find(([, h]) => h.toLowerCase() === hex.toLowerCase())?.[0] ?? 'Custom';
