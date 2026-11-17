/** Nigerian mobile numbers: 0 or +234, then 70x/80x/81x/90x/91x… (11 digits from the 0). */
export const NIGERIAN_MOBILE = /^(\+234|0)[789][01]\d{8}$/;

export const compactPhone = (value: string) => value.replace(/[\s()-]/g, '');

export const isNigerianMobile = (value: string) => NIGERIAN_MOBILE.test(compactPhone(value));

/**
 * What is wrong with a number, in words a person can act on, or null when it is fine. Most
 * mistakes are one digit too many or too few, so say that rather than repeat the example.
 */
export function nigerianPhoneProblem(value: string, example = '0803 412 7781'): string | null {
  const compact = compactPhone(value);
  if (!compact || NIGERIAN_MOBILE.test(compact)) return null;
  if (/[^+\d]/.test(compact)) return `Use digits only, like ${example}`;
  const local = compact.startsWith('+234')
    ? `0${compact.slice(4)}`
    : compact.startsWith('234')
      ? `0${compact.slice(3)}`
      : compact;
  if (!local.startsWith('0')) return `Start with 0 or +234, like ${example}`;
  if (local.length !== 11)
    return `Nigerian mobile numbers have 11 digits; this has ${local.length}`;
  if (!/^0[789][01]/.test(local))
    return `That isn't a mobile number. Mobile numbers start with 070, 080, 081, 090 or 091`;
  return `Enter a Nigerian mobile number, like ${example}`;
}
