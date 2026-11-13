import { MockHttpError } from '@edutrack/web-core/mock';

import type { AuthUser } from '@/types';

import { SCHOOL, type StaffRecord } from '../school-db';

export const authUser = (s: StaffRecord): AuthUser => ({
  id: s.id,
  title: s.title,
  firstName: s.firstName,
  lastName: s.lastName,
  displayName: s.name,
  email: s.email,
  position: s.position,
});

export const schoolSummary = () => ({
  id: SCHOOL.id,
  name: SCHOOL.name,
  initials: SCHOOL.initials,
});

export const NG_MOBILE = /^(\+234|0)[789][01]\d{8}$/;
/** Nigerian mobile number, after removing spaces (and dashes). */
export const isNigerianMobile = (v: string) => NG_MOBILE.test(v.replace(/[\s-]/g, ''));

export function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new MockHttpError(422, message, 'VALIDATION');
  return value.trim();
}

export const invalid = (message: string): never => {
  throw new MockHttpError(422, message, 'VALIDATION');
};
