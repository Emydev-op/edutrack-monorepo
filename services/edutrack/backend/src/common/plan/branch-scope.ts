import { HttpStatus, SetMetadata } from '@nestjs/common';
import { AppException } from '../errors/app.exception.js';

export const SCHOOL_WIDE = 'scope:school-wide';

/**
 * Changes that belong to the whole school (school profile, branches, users and roles, sessions,
 * sections, subjects, settings): a branch-scoped admin can look but not change them.
 */
export const SchoolWide = () => SetMetadata(SCHOOL_WIDE, true);

const list = (names: string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** 403 BRANCH_SCOPE: the record or change is at a branch this admin doesn't manage. */
export function outOfBranch(mine: string[], where?: string | null) {
  return new AppException(
    HttpStatus.FORBIDDEN,
    `${where ? `That’s at ${where}. ` : 'That’s at another branch. '}You manage ${list(mine)} only.`,
    'BRANCH_SCOPE',
  );
}

/** 403 SCHOOL_WIDE_ONLY. */
export function schoolWideOnly(mine: string[]) {
  return new AppException(
    HttpStatus.FORBIDDEN,
    `Only whole-school admins can change this. You manage ${list(mine)}.`,
    'SCHOOL_WIDE_ONLY',
  );
}

export type ScopedKind = 'student' | 'staff' | 'arm' | 'level' | 'invoice' | 'payment';
export const SCOPED_BY = 'scope:scoped-by';

/**
 * The route's `:id` (or `param`) is a record at a branch: a branch-scoped admin may only open it
 * at their branches. `:armId` and `:studentId` are checked without this.
 */
export const ScopedBy = (kind: ScopedKind, param = 'id') => SetMetadata(SCOPED_BY, { kind, param });
