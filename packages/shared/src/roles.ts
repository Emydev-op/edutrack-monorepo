/**
 * Every role that can sign in to the platform. Each portal serves one audience;
 * the backend uses the same values for authorization.
 */
export const UserRole = {
  PlatformAdmin: 'PLATFORM_ADMIN',
  SchoolAdmin: 'SCHOOL_ADMIN',
  Teacher: 'TEACHER',
  Student: 'STUDENT',
  Parent: 'PARENT',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
