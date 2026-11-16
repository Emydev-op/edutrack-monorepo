import type { Prisma } from '../generated/prisma/client.js';

/** `PlatformSetting` key for the back office's sign-in security toggles. */
export const PLATFORM_SECURITY_KEY = 'security';

export interface PlatformSecuritySettings {
  /** Email back-office staff when they sign in from a new device. */
  newDeviceAlerts: boolean;
  /** Only allow sign-in from approved IP ranges (can't be turned on until ranges exist). */
  ipRestriction: boolean;
}

export const DEFAULT_PLATFORM_SECURITY: PlatformSecuritySettings = {
  newDeviceAlerts: true,
  ipRestriction: false,
};

/** The stored value merged over the defaults (unknown keys dropped). */
export function readPlatformSecurity(
  value: Prisma.JsonValue | undefined,
): PlatformSecuritySettings {
  const stored = (
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  ) as Record<string, unknown>;
  return {
    newDeviceAlerts:
      typeof stored.newDeviceAlerts === 'boolean'
        ? stored.newDeviceAlerts
        : DEFAULT_PLATFORM_SECURITY.newDeviceAlerts,
    ipRestriction:
      typeof stored.ipRestriction === 'boolean'
        ? stored.ipRestriction
        : DEFAULT_PLATFORM_SECURITY.ipRestriction,
  };
}
