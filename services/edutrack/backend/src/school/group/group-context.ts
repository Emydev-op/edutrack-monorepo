import { RequestContext } from '../../common/context/request-context.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Runs `fn` as one of the group's schools: the tenant is that school and, when the signed-in
 * person is a member there, their membership there (so the school's own permission and section
 * checks apply). The person's working term and branch in their current school don't carry over.
 */
export async function asGroupSchool<T>(
  prisma: PrismaService,
  schoolId: string,
  userId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const membership = userId
    ? await prisma.schoolMembership.findFirst({
        where: { schoolId, userId, status: 'ACTIVE' },
        select: { id: true },
      })
    : null;
  const parent = RequestContext.get();
  return RequestContext.run(
    {
      ...parent,
      requestId: parent?.requestId ?? 'group',
      schoolId,
      membershipId: membership?.id,
      working: undefined,
      branchScope: undefined,
    },
    fn,
  );
}
