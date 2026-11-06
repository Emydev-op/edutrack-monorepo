const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});
const count = new Intl.NumberFormat('en-NG');

export const formatNaira = (value: number) => naira.format(value);
export const formatCount = (value: number) => count.format(value);
/** Millions with one decimal, the unit revenue charts are read in: ₦28.4M. */
export const formatNairaMillions = (value: number, digits = 1) => `₦${value.toFixed(digits)}M`;

export function initials(name: string, max = 2): string {
  return name
    .replace(/^(Mr|Mrs|Ms|Dr|Mme)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join('')
    .slice(0, max);
}

export const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${formatCount(n)} ${n === 1 ? singular : plural}`;
