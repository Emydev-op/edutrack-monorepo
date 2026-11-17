/**
 * Portal-account settings for the demo schools: Student Portal logins per section (Junior and
 * Senior Secondary on, Nursery and Primary off), for Greenfield Academy and Crestview College.
 * Parent and student accounts themselves are created by the school (invitations, login slips),
 * so none are seeded here.
 *
 * Idempotent: puts the per-section default back on every run.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { STUDENT_LOGIN_SECTION_CODES } from '../../src/school/student-logins/student-login-rules.js';

export async function seedSchoolAccounts(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
): Promise<void> {
  for (const key of ['greenfield', 'crestview']) {
    const schoolId = schoolIds[key];
    if (!schoolId) continue;
    await prisma.section.updateMany({
      where: { schoolId, code: { in: [...STUDENT_LOGIN_SECTION_CODES] } },
      data: { studentLogins: true },
    });
    await prisma.section.updateMany({
      where: { schoolId, code: { notIn: [...STUDENT_LOGIN_SECTION_CODES] } },
      data: { studentLogins: false },
    });
  }
}
