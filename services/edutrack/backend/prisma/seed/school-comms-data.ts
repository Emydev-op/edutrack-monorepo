/**
 * Communication demo data: every school's notification settings start from the defaults, with
 * its plan's SMS units for the current term. Greenfield has quiet hours on and its sender ID
 * "GREENFIELD" waiting for EduTrack's approval (SMS goes out as EDUTRACK until then).
 *
 * Announcements, messages and deliveries are cleared on every seed (tests send their own), before
 * the student and staff seeds can remove the people those rows point at.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/** Empties the communication tables (run before the other school seeds). */
export async function clearSchoolComms(prisma: PrismaClient) {
  await prisma.smsCreditTransaction.deleteMany({});
  await prisma.messageDelivery.deleteMany({});
  await prisma.messageRecipient.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.announcementArm.deleteMany({});
  await prisma.announcement.deleteMany({});
  await prisma.messageTemplate.deleteMany({});
  await prisma.commsEventSetting.deleteMany({});
  await prisma.senderIdRequest.deleteMany({});
  await prisma.communicationSettings.deleteMany({});
  // In-app copies of messages (they point at deliveries that no longer exist), and
  // Communication's own notices (scheduled sends, top-ups, sender ID decisions).
  await prisma.notification.deleteMany({
    where: { OR: [{ deliveryId: { not: null } }, { category: 'communication' }] },
  });
}

export async function seedSchoolComms(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
  now: Date,
) {
  for (const [key, schoolId] of Object.entries(schoolIds)) {
    const greenfield = key === 'greenfield';
    const term = await prisma.term.findFirst({
      where: { schoolId, status: 'ACTIVE' },
      select: { id: true },
    });
    const sub = await prisma.subscription.findUnique({
      where: { schoolId },
      select: { plan: { select: { name: true, smsCreditsPerTerm: true } } },
    });
    const allowance = term ? (sub?.plan.smsCreditsPerTerm ?? 0) : 0;
    await prisma.communicationSettings.create({
      data: {
        schoolId,
        quietHoursEnabled: greenfield,
        senderId: greenfield ? 'GREENFIELD' : null,
        senderIdStatus: greenfield ? 'PENDING_APPROVAL' : 'NOT_REQUESTED',
        smsBalanceUnits: allowance,
      },
    });
    if (allowance)
      await prisma.smsCreditTransaction.create({
        data: {
          schoolId,
          kind: 'PLAN_ALLOWANCE',
          units: allowance,
          termId: term!.id,
          note: `${sub!.plan.name} plan · SMS units for the term`,
          createdAt: now,
        },
      });
    if (greenfield) {
      const adaeze = await prisma.user.findUnique({
        where: { email: 'adaeze.okonkwo@greenfield.edu.ng' },
        select: { id: true },
      });
      await prisma.senderIdRequest.create({
        data: {
          schoolId,
          name: 'GREENFIELD',
          requestedById: adaeze?.id ?? null,
          createdAt: new Date(now.getTime() - 23 * 86_400_000),
        },
      });
    }
  }
}
