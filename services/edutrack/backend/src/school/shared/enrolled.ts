/**
 * Enrolled in a session's class, for reads: ACTIVE in the running session, COMPLETED once that
 * session closed (promotion sets the outcome), never LEFT. In the active session this is the same
 * as ACTIVE, so screens show a past session's classes as they were.
 */
export const ENROLLED = { not: 'LEFT' as const };
