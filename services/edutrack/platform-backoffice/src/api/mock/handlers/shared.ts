import type { PlatformUser, SupportIssue } from '@/types';

import { issues, roles, schools, users } from '../db';
import { MockHttpError } from '@edutrack/web-core/mock';
import { slaOf } from './support-sla';

export const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
export const fullName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`;

export function findSchool(id: string) {
  const school = schools.find((s) => s.id === id);
  if (!school) throw new MockHttpError(404, 'School not found');
  return school;
}

export function findUser(id: string) {
  const user = users.find((u) => u.id === id);
  if (!user) throw new MockHttpError(404, 'User not found');
  return user;
}

export const toUser = (u: (typeof users)[number]): PlatformUser => ({
  ...u,
  roleName: roleName(u.roleId),
});

const INTERNAL_ISSUE_FIELDS = [
  'description',
  'createdMs',
  'firstReplyMs',
  'pausedSince',
  'pausedMs',
  'slaMissed',
] as const;

/** The ticket as the API returns it: internal timestamps dropped, SLA clocks worked out now. */
export function toIssue(row: (typeof issues)[number]): SupportIssue {
  const issue: Partial<typeof row> = { ...row };
  for (const key of INTERNAL_ISSUE_FIELDS) delete issue[key];
  return {
    ...(issue as Omit<typeof row, (typeof INTERNAL_ISSUE_FIELDS)[number]>),
    schoolName: schools.find((s) => s.id === row.schoolId)?.name ?? row.schoolId,
    sla: slaOf(row),
  };
}

export const isOpenIssue = (i: { status: string }) => !['Resolved', 'Closed'].includes(i.status);

export function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new MockHttpError(422, message);
  return value.trim();
}
