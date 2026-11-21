/**
 * Portal-account settings for the demo schools: Student Portal logins per section (Junior and
 * Senior Secondary on, Nursery and Primary off), for Greenfield Academy and Crestview College.
 *
 * Parent and student accounts are normally created by the school (invitations, login slips). One
 * parent login is seeded so the Parent Portal can be tried at once: Mrs. Funke Adeyemi
 * (funke.adeyemi@gmail.com, the demo password), mother of Emmanuel (JSS 2B) and Michael
 * (Primary 5B), signs in at greenfield.<host>/parent. One student login is seeded for the
 * Student Portal: Emmanuel Adeyemi (JSS 2B) signs in at greenfield.<host>/student with his
 * admission number STU-2025-0042 and the demo password (already changed: no first-sign-in step).
 *
 * Idempotent: puts the per-section default back on every run, and Funke's and Emmanuel's
 * accounts and memberships back to active.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { STUDENT_LOGIN_SECTION_CODES } from '../../src/school/student-logins/student-login-rules.js';
import { demoUuid } from './platform-data.js';

/** The seeded Parent Portal account. */
export const DEMO_PARENT = {
  email: 'funke.adeyemi@gmail.com',
  guardianKey: 'funke',
  title: 'Mrs.',
  firstName: 'Funke',
  lastName: 'Adeyemi',
  phone: '+2348035550161',
} as const;

/** The seeded Student Portal login (signs in with the admission number). */
export const DEMO_STUDENT = {
  admissionNo: 'STU-2025-0042',
  firstName: 'Emmanuel',
  lastName: 'Adeyemi',
} as const;

export async function seedSchoolAccounts(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
  ctx?: { passwordHash: string; now: Date },
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
  if (ctx && schoolIds.greenfield) {
    await seedDemoParent(prisma, schoolIds.greenfield, ctx);
    await seedDemoStudent(prisma, schoolIds.greenfield, ctx);
  }
}

/** Emmanuel Adeyemi's Student Portal login at Greenfield Academy. */
async function seedDemoStudent(
  prisma: PrismaClient,
  schoolId: string,
  { passwordHash, now }: { passwordHash: string; now: Date },
) {
  const studentId = demoUuid(`greenfield:student:${DEMO_STUDENT.admissionNo}`);
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return;
  const userId = demoUuid(`greenfield:student-user:${DEMO_STUDENT.admissionNo}`);
  // A login made for him while using the demo (School Admin › Students › Logins) is replaced.
  const others = await prisma.schoolMembership.findMany({
    where: { schoolId, studentId, userId: { not: userId } },
    select: { id: true },
  });
  if (others.length) {
    const ids = others.map((m) => m.id);
    await prisma.invitation.deleteMany({ where: { membershipId: { in: ids } } });
    await prisma.schoolMembership.deleteMany({ where: { id: { in: ids } } });
  }
  const data = {
    firstName: DEMO_STUDENT.firstName,
    lastName: DEMO_STUDENT.lastName,
    status: 'ACTIVE' as const,
    passwordHash,
    passwordChangedAt: now,
    mustChangePassword: false,
    failedSignInCount: 0,
    lockedUntil: null,
    lastFailedSignInAt: null,
    deletedAt: null,
  };
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, ...data },
    update: data,
  });
  const membership = { status: 'ACTIVE' as const, studentId, activatedAt: now, statusReason: null };
  await prisma.schoolMembership.upsert({
    where: { schoolId_userId_kind: { schoolId, userId, kind: 'STUDENT' } },
    create: { schoolId, userId, kind: 'STUDENT', ...membership },
    update: membership,
  });
  await prisma.notificationPreference.deleteMany({ where: { userId, schoolId } });
}

/** Mrs. Funke Adeyemi's Parent Portal login at Greenfield Academy. */
async function seedDemoParent(
  prisma: PrismaClient,
  schoolId: string,
  { passwordHash, now }: { passwordHash: string; now: Date },
) {
  const guardianId = demoUuid(`greenfield:guardian:${DEMO_PARENT.guardianKey}`);
  const guardian = await prisma.guardian.findUnique({ where: { id: guardianId } });
  if (!guardian) return;
  // The number may have been given to another account while using the demo.
  await prisma.user.updateMany({
    where: { phone: DEMO_PARENT.phone, email: { not: DEMO_PARENT.email } },
    data: { phone: null },
  });
  const data = {
    title: DEMO_PARENT.title,
    firstName: DEMO_PARENT.firstName,
    lastName: DEMO_PARENT.lastName,
    phone: DEMO_PARENT.phone,
    status: 'ACTIVE' as const,
    passwordHash,
    passwordChangedAt: now,
    mustChangePassword: false,
    failedSignInCount: 0,
    lockedUntil: null,
    lastFailedSignInAt: null,
    emailVerifiedAt: now,
    deletedAt: null,
  };
  const user = await prisma.user.upsert({
    where: { email: DEMO_PARENT.email },
    create: { email: DEMO_PARENT.email, ...data },
    update: data,
  });
  // Another account may hold Funke's guardian record (an invitation accepted while trying it).
  const others = await prisma.schoolMembership.findMany({
    where: { schoolId, guardianId, userId: { not: user.id } },
    select: { id: true },
  });
  if (others.length) {
    const ids = others.map((m) => m.id);
    await prisma.invitation.deleteMany({ where: { membershipId: { in: ids } } });
    await prisma.schoolMembership.deleteMany({ where: { id: { in: ids } } });
  }
  const membership = {
    status: 'ACTIVE' as const,
    guardianId,
    invitedAt: now,
    activatedAt: now,
    statusReason: null,
  };
  await prisma.schoolMembership.upsert({
    where: { schoolId_userId_kind: { schoolId, userId: user.id, kind: 'GUARDIAN' } },
    create: { schoolId, userId: user.id, kind: 'GUARDIAN', ...membership },
    update: membership,
  });
  await prisma.notificationPreference.deleteMany({ where: { userId: user.id, schoolId } });
}
