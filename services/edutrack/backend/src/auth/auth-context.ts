import type { HostSchool } from '../common/context/request-context.js';
import type { Portal } from '../generated/prisma/enums.js';

/** The signed-in caller, as `@CurrentUser()` returns it. */
export interface AuthUserContext {
  userId: string;
  sessionId: string;
  portal: Portal;
  /** Absent for the platform back office. */
  schoolId?: string;
  membershipId?: string;
  supportSessionId?: string;
}

/** What auth flows need to know about the HTTP client making the call. */
export interface ClientInfo {
  ip?: string;
  userAgent?: string;
  hostSchool?: HostSchool;
  unknownHostSlug?: string;
}
