/** Numbering formats (admission numbers, staff IDs). Shared by the Settings form and the mock API. */

const SEQ = /\[(#{3,6})\]/g;
const TOKEN = /\[[^\]]*\]/g;

export function patternProblem(pattern: string): string | null {
  const p = pattern.trim();
  if (!p) return 'Enter a format.';
  if (p.length > 24) return 'Keep the format to 24 characters or fewer.';
  if ((p.match(SEQ) ?? []).length !== 1)
    return 'Include one running number, written [###] to [######].';
  const unknown = (p.match(TOKEN) ?? []).filter((t) => !/^\[(#{3,6}|YYYY|YY)\]$/.test(t));
  if (unknown.length) return `${unknown[0]} isn’t a format code. Use [YYYY], [YY] or [####].`;
  if (!/^[A-Z0-9/-]*$/.test(p.replace(TOKEN, '')))
    return 'Use capital letters, numbers, hyphens and slashes only.';
  return null;
}

export const formatNumber = (pattern: string, seq: number, year = new Date().getFullYear()) =>
  pattern
    .replace('[YYYY]', String(year))
    .replace('[YY]', String(year).slice(-2))
    .replace(SEQ, (_m, hashes: string) => String(seq).padStart(hashes.length, '0'));
