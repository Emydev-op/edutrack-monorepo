export interface PasswordRule {
  label: string;
  met: boolean;
}

/** The platform password policy, shown live while the user types. */
export function passwordRules(password: string): PasswordRule[] {
  return [
    { label: 'At least 10 characters', met: password.length >= 10 },
    {
      label: 'An uppercase and a lowercase letter',
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
    },
    { label: 'A number', met: /\d/.test(password) },
    { label: 'A symbol', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export const meetsPasswordPolicy = (password: string) =>
  passwordRules(password).every((rule) => rule.met);
