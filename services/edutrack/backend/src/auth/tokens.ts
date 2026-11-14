import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe: refresh tokens, reset links, invitation links. */
export const randomToken = () => randomBytes(32).toString('base64url');

/** What we store instead of the token itself. SHA-256 is enough: the input is 256 random bits. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** "Chrome on macOS" from a user agent, for the devices list. */
export function deviceLabel(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl\//.test(ua)
              ? 'curl'
              : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}
