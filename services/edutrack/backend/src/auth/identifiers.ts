const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Normalises a phone number to E.164. Accepts international numbers (`+44 20…`) and Nigerian
 * local formats (`0803 412 7781`, `234803…`). Returns null when it isn't a phone number.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, '');
  if (/^0[789][01]\d{8}$/.test(compact)) return `+234${compact.slice(1)}`;
  if (/^234[789][01]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  return null;
}

export type SignInIdentifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

/** Reads what the user typed in the sign-in box: an email or a phone number. */
export function parseIdentifier(input: string): SignInIdentifier | null {
  const value = input.trim();
  if (value.includes('@'))
    return EMAIL.test(value) ? { kind: 'email', value: value.toLowerCase() } : null;
  const phone = normalizePhone(value);
  return phone ? { kind: 'phone', value: phone } : null;
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the|&)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
