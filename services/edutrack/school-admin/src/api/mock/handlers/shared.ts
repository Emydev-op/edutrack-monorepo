import { MockHttpError, type MockRequest } from '@edutrack/web-core/mock';

import { schools, users, type SchoolUser } from '../db';
import { schoolData, type SchoolData } from '../school-db';

export const tokenFor = (userId: string) => `mock-token.${userId}`;

/** The signed-in user, from the bearer token, as the real API resolves the tenant. */
export function currentUser({ headers }: Pick<MockRequest, 'headers'>): SchoolUser {
  const token = headers.authorization?.replace(/^Bearer\s+/i, '');
  const user = users.find((u) => tokenFor(u.id) === token);
  if (!user) throw new MockHttpError(401, 'Sign in to continue');
  return user;
}

/** The school summary sent at sign-in, with the logo and brand colour from its profile. */
export function schoolOf(user: SchoolUser) {
  const school = schools.find((s) => s.id === user.schoolId)!;
  const profile = schoolData[user.schoolId]?.profile;
  return {
    ...school,
    brandColor: profile?.brandColor ?? school.brandColor,
    logoUrl: profile?.logo?.dataUrl ?? null,
  };
}

export const authUser = (u: SchoolUser) => ({
  id: u.id,
  firstName: u.firstName,
  lastName: u.lastName,
  email: u.email,
  position: u.position,
  roleName: u.roleName,
  avatarUrl: null,
});

export function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new MockHttpError(422, message);
  return value.trim();
}

/** The signed-in school's School-section data, and a logger that records who did what. */
export function schoolDataFor(req: Pick<MockRequest, 'headers'>) {
  const user = currentUser(req);
  const data = schoolData[user.schoolId]!;
  const actor = `${user.firstName} ${user.lastName}`;
  const log = (entity: string, title: string, detail = '') =>
    data.log.unshift({
      id: `log${Date.now()}${Math.random()}`,
      entity,
      title,
      detail: detail ? `${actor} · ${detail}` : actor,
      when: 'Just now',
      tone: 'success',
    });
  return { data, actor, log, schoolId: user.schoolId };
}

export const historyOf = (data: SchoolData, entity: string) =>
  data.log.filter((l) => l.entity === entity).map(({ entity: _entity, ...entry }) => entry);

export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const NG_PHONE = /^(\+234|0)[789][01]\d{8}$/;
export const isPhone = (v: string) => NG_PHONE.test(v.replace(/[\s-]/g, ''));
