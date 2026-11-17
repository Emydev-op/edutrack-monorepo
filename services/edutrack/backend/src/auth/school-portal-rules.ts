import type { StudentStatus } from '../generated/prisma/enums.js';

/*
 * Who keeps Parent and Student Portal access once a student leaves the school. Pure functions so
 * the rule is unit-tested and shared by sign-in, the parent's children list and the daily job.
 */

/** A student on the roll (the others have graduated, transferred or withdrawn). */
export const CURRENT_STUDENT_STATUSES: readonly StudentStatus[] = ['ACTIVE', 'INCOMPLETE_PROFILE'];

/** Parents keep read-only access to a child's past records this long after the child left. */
export const PARENT_READ_ONLY_YEARS = 2;

export type ChildAccess = 'full' | 'read-only';

export interface StudentStanding {
  status: StudentStatus;
  leftOn: Date | null;
  exitOn?: Date | null;
  graduatedOn?: Date | null;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export const isCurrentStudent = (s: Pick<StudentStanding, 'status' | 'deletedAt'>) =>
  !s.deletedAt && CURRENT_STUDENT_STATUSES.includes(s.status);

/** The day a student left: `leftOn`, else the graduation or exit date, else the last change. */
export function leftOnOf(s: StudentStanding): Date | null {
  return s.leftOn ?? s.graduatedOn ?? s.exitOn ?? s.updatedAt ?? null;
}

/** The end of a parent's read-only window: `PARENT_READ_ONLY_YEARS` after the student left. */
export function readOnlyUntil(leftOn: Date): Date {
  const until = new Date(leftOn);
  until.setUTCFullYear(until.getUTCFullYear() + PARENT_READ_ONLY_YEARS);
  return until;
}

/**
 * What a parent may see of one child: everything while the child is on the roll, their past
 * records (read-only) for two years after they left, then nothing.
 */
export function childAccess(s: StudentStanding, now: Date): ChildAccess | null {
  if (s.deletedAt) return null;
  if (isCurrentStudent(s)) return 'full';
  const left = leftOnOf(s);
  if (!left) return 'read-only';
  return now < readOnlyUntil(left) ? 'read-only' : null;
}
