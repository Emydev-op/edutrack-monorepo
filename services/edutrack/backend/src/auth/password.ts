import argon2 from 'argon2';

/**
 * argon2id with OWASP-recommended cost (19 MiB, 2 passes). Parameters live in the PHC string, so
 * raising them later only affects new hashes; `needsRehash` upgrades old ones at next sign-in.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Upper bound so a huge "password" can't burn CPU (argon2 hashes any length). */
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_POLICY_MESSAGE =
  'Use at least 8 characters with an uppercase and a lowercase letter, a number and a symbol.';

/**
 * The platform password policy, identical to the portals' (`@edutrack/app-kit/lib/password`):
 * 8+ characters, upper and lower case, a number and a symbol.
 */
export function meetsPasswordPolicy(password: string): boolean {
  return (
    password.length >= 8 &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (password.length > PASSWORD_MAX_LENGTH) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, OPTIONS);
  } catch {
    return true;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies against a throwaway hash so an unknown email or a user without a password costs the
 * same time as a wrong password (no account enumeration by timing).
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-Password-1!');
  await verifyPassword(await dummyHash, password.slice(0, PASSWORD_MAX_LENGTH));
}
