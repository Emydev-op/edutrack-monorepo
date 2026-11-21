import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { childAccess, type ChildAccess } from '../../auth/school-portal-rules.js';
import type { Gender, StudentStatus } from '../../generated/prisma/enums.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';

/** The signed-in pupil, for every Student Portal route. */
export interface StudentScope {
  membershipId: string;
  access: ChildAccess;
  student: {
    id: string;
    firstName: string;
    surname: string;
    otherNames: string | null;
    admissionNo: string;
    gender: Gender;
    dateOfBirth: Date | null;
    status: StudentStatus;
    branchId: string;
    admittedOn: Date;
    leftOn: Date | null;
  };
}

export const STUDENT_READ_ONLY_MESSAGE =
  'You’ve left the school, so your Student Portal is read-only.';

/**
 * Who the signed-in pupil is. Everything in the Student Portal is scoped to the student behind
 * the session's STUDENT membership: there are no ids in the paths to guess. A pupil who has left
 * keeps a read-only view while their session lasts (sign-in is refused); past the parents'
 * two-year window, nothing.
 */
@Injectable()
export class StudentScopeService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly clock: Clock,
  ) {}

  async me(auth: AuthUserContext): Promise<StudentScope> {
    const m = await this.tenant.db.schoolMembership.findFirst({
      where: { id: auth.membershipId, userId: auth.userId, kind: 'STUDENT', status: 'ACTIVE' },
      include: { student: true },
    });
    if (!m?.student)
      throw AppException.forbidden(
        'This account doesn’t have access to the Student Portal at this school.',
        'NO_ACCESS',
      );
    const access = childAccess(m.student, this.clock.now());
    if (!access)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'You’ve left the school, so your student login is closed.',
        'STUDENT_LEFT',
      );
    return { membershipId: m.id, access, student: m.student };
  }

  /** Writes (handing in work) are refused once the pupil has left. */
  static requireFull(scope: StudentScope) {
    if (scope.access !== 'full')
      throw AppException.forbidden(STUDENT_READ_ONLY_MESSAGE, 'READ_ONLY');
  }
}
