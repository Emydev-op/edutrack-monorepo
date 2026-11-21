/**
 * Homework demo data for Greenfield Academy's active term (Teacher Workspace › Assignments and
 * Materials, and later the Parent and Student Portals):
 *
 * - Mr. Samuel Ade, JSS 2B Mathematics: "Algebraic expressions · holiday revision" (published,
 *   due in five days, out of 20, with returned, graded, handed-in and missing work and his video
 *   attached), "Number bases practice" (closed last week, out of 10, mostly returned) and a draft.
 * - Mrs. Grace Okafor, JSS 2B English: an essay (published, out of 30, a few handed in).
 * - Primary 5B: a fractions worksheet from its Mathematics teacher (published, nothing handed in
 *   yet: primary pupils hand in through a parent).
 * - Materials: video links for JSS 2B Mathematics and English (one archived).
 *
 * Seeded materials are links, not files: the seed can't put objects in storage. Idempotent: every
 * school's homework rows are cleared first (`clearSchoolHomework`, before the student and
 * academic seeds can remove what they point at), then Greenfield's are written again.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { SubmissionStatus } from '../../src/generated/prisma/enums.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Empties the homework tables, and the files uploaded for homework. */
export async function clearSchoolHomework(prisma: PrismaClient) {
  await prisma.submissionFile.deleteMany({});
  await prisma.submission.deleteMany({});
  await prisma.assignmentAttachment.deleteMany({});
  await prisma.assignment.deleteMany({});
  await prisma.materialView.deleteMany({});
  await prisma.material.deleteMany({});
  await prisma.storedFile.deleteMany({ where: { storageKey: { contains: '/homework/' } } });
  await prisma.auditEvent.deleteMany({
    where: { entityType: { in: ['Assignment', 'Submission', 'Material'] } },
  });
}

/** "16:00 Lagos" on the day `days` from now, kept inside the term. */
function dueAt(now: Date, days: number, termEnd: Date) {
  const day = new Date(now.getTime() + days * DAY).toISOString().slice(0, 10);
  const end = termEnd.toISOString().slice(0, 10);
  return new Date(`${day < end ? day : end}T15:00:00.000Z`);
}

export async function seedSchoolHomework(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
  now: Date,
) {
  const schoolId = schoolIds.greenfield;
  if (!schoolId) return;
  const term = await prisma.term.findFirst({ where: { schoolId, status: 'ACTIVE' } });
  if (!term) return;

  // Main Campus's arm when it has one, else the arm elsewhere.
  const findArm = async (level: string, arm: string) => {
    const where = { schoolId, name: arm, level: { name: level }, archivedAt: null };
    return (
      (await prisma.classArm.findFirst({ where: { ...where, branch: { code: 'GFA-MC' } } })) ??
      prisma.classArm.findFirst({ where })
    );
  };
  const teacherOf = async (armId: string, code: string) =>
    prisma.teachingAssignment.findFirst({
      where: { schoolId, termId: term.id, armId, subject: { code }, lead: true },
    });
  const rollOf = async (armId: string) =>
    (
      await prisma.enrollment.findMany({
        where: { schoolId, sessionId: term.sessionId, armId, status: 'ACTIVE' },
        include: { student: { select: { id: true, surname: true, firstName: true } } },
      })
    )
      .map((e) => e.student)
      .sort((a, b) => a.surname.localeCompare(b.surname) || a.firstName.localeCompare(b.firstName));

  const jss2b = await findArm('JSS 2', 'B');
  const p5b = await findArm('Primary 5', 'B');
  if (!jss2b) return;
  const roll = await rollOf(jss2b.id);
  const users = new Map(
    (
      await prisma.user.findMany({
        where: { email: { in: ['s.ade@greenfield.edu.ng', 'g.okafor@greenfield.edu.ng'] } },
        select: { id: true, email: true },
      })
    ).map((u) => [u.email, u.id]),
  );

  type Work = {
    status: SubmissionStatus;
    score?: number;
    feedback?: string;
    note?: string;
    late?: boolean;
  };
  async function assignment(o: {
    armId: string;
    code: string;
    title: string;
    instructions: string;
    status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
    due: Date | null;
    max: number | null;
    published?: Date;
    work?: Work[];
    grader?: string;
    materialId?: string;
  }) {
    const ta = await teacherOf(o.armId, o.code);
    if (!ta) return null;
    const a = await prisma.assignment.create({
      data: {
        schoolId: schoolId!,
        termId: term!.id,
        armId: o.armId,
        subjectId: ta.subjectId,
        teacherStaffId: ta.staffId,
        title: o.title,
        instructions: o.instructions,
        dueAt: o.due,
        maxScore: o.max,
        status: o.status,
        publishedAt:
          o.status === 'DRAFT' ? null : (o.published ?? new Date(now.getTime() - 2 * DAY)),
        closedAt: o.status === 'CLOSED' ? o.due : null,
        createdAt: o.published ?? new Date(now.getTime() - 2 * DAY),
      },
    });
    if (o.materialId)
      await prisma.assignmentAttachment.create({
        data: { schoolId: schoolId!, assignmentId: a.id, materialId: o.materialId },
      });
    const students = await rollOf(o.armId);
    for (const [i, w] of (o.work ?? []).entries()) {
      const st = students[i];
      if (!st || w.status === 'NOT_SUBMITTED') continue;
      const handedIn = w.status !== 'EXCUSED';
      const submittedAt = new Date(
        o.due && w.late
          ? o.due.getTime() + 5 * HOUR
          : (o.published ?? now).getTime() + (i + 1) * 3 * HOUR,
      );
      const graded = w.status === 'GRADED' || w.status === 'RETURNED';
      await prisma.submission.create({
        data: {
          schoolId: schoolId!,
          assignmentId: a.id,
          studentId: st.id,
          status: w.status,
          submittedAt: handedIn ? submittedAt : null,
          isLate: !!w.late,
          note: w.note ?? null,
          score: graded ? (w.score ?? null) : null,
          feedback: graded ? (w.feedback ?? '') : '',
          gradedAt: graded ? new Date(submittedAt.getTime() + DAY) : null,
          gradedById: graded ? (o.grader ?? null) : null,
          returnedAt: w.status === 'RETURNED' ? new Date(submittedAt.getTime() + DAY + HOUR) : null,
          excuseReason: w.status === 'EXCUSED' ? 'Sick: hospital letter seen' : null,
        },
      });
    }
    return a;
  }

  /* ---------- Materials ---------- */

  const material = async (o: {
    armId: string;
    code: string;
    title: string;
    description: string;
    link: string;
    daysAgo: number;
    archived?: boolean;
  }) => {
    const ta = await teacherOf(o.armId, o.code);
    if (!ta) return null;
    return prisma.material.create({
      data: {
        schoolId: schoolId!,
        termId: term!.id,
        armId: o.armId,
        subjectId: ta.subjectId,
        teacherStaffId: ta.staffId,
        type: 'VIDEO_LINK',
        title: o.title,
        description: o.description,
        linkUrl: o.link,
        status: o.archived ? 'ARCHIVED' : 'PUBLISHED',
        publishedAt: new Date(now.getTime() - o.daysAgo * DAY),
        archivedAt: o.archived ? new Date(now.getTime() - DAY) : null,
        viewCount: o.archived ? 3 : 9,
        lastViewedAt: new Date(now.getTime() - 6 * HOUR),
      },
    });
  };
  const video = await material({
    armId: jss2b.id,
    code: 'MTH',
    title: 'Simplifying algebraic expressions (video)',
    description: 'A short recap of like terms and brackets. Watch before you start the revision.',
    link: 'https://www.youtube.com/watch?v=l3XzepN03KQ',
    daysAgo: 3,
  });
  await material({
    armId: jss2b.id,
    code: 'MTH',
    title: 'Number bases explained',
    description: 'Converting between base 2, base 10 and base 8.',
    link: 'https://vimeo.com/76979871',
    daysAgo: 16,
    archived: true,
  });
  await material({
    armId: jss2b.id,
    code: 'ENG',
    title: 'Planning a narrative essay',
    description: 'How to plan, open and close a story. Useful for this week’s essay.',
    link: 'https://youtu.be/YbvTFlyVR8E',
    daysAgo: 2,
  });

  /* ---------- Assignments ---------- */

  const ade = users.get('s.ade@greenfield.edu.ng');
  const r = (score: number, feedback: string): Work => ({ status: 'RETURNED', score, feedback });
  const g = (score: number, feedback: string): Work => ({ status: 'GRADED', score, feedback });
  const sub = (note?: string): Work => ({ status: 'SUBMITTED', note });
  const none: Work = { status: 'NOT_SUBMITTED' };

  // Handed in: returned, graded (private), waiting to be graded; the rest are missing.
  await assignment({
    armId: jss2b.id,
    code: 'MTH',
    title: 'Algebraic expressions · holiday revision',
    instructions:
      'Simplify each expression in Exercise 4B (questions 1–20) and show your working. Take a clear photo or scan of each page and upload it. Marks are for method, not just the final answer.',
    status: 'PUBLISHED',
    due: dueAt(now, 5, term.endsOn),
    max: 20,
    published: new Date(now.getTime() - 2 * DAY),
    grader: ade,
    materialId: video?.id,
    work: [
      r(18, 'Excellent working throughout. Watch your signs in question 14.'),
      r(15, 'Good effort. Expand the brackets fully before collecting like terms.'),
      g(17, 'Very neat and clear.'),
      g(12, 'Questions 16–20 were not attempted.'),
      sub('I wasn’t sure about question 9, I tried two methods.'),
      sub(),
      sub(),
      sub('Page 2 is a bit dark, sorry.'),
      none,
      none,
    ],
  });
  await assignment({
    armId: jss2b.id,
    code: 'MTH',
    title: 'Number bases practice',
    instructions: 'Convert each number in Exercise 2A to base 10 and back. Show every step.',
    status: 'CLOSED',
    due: new Date(now.getTime() - 6 * DAY),
    max: 10,
    published: new Date(now.getTime() - 13 * DAY),
    grader: ade,
    work: roll.map((_, i) =>
      i === roll.length - 1
        ? { status: 'EXCUSED' as const }
        : i === roll.length - 2
          ? none
          : r(
              6 + (i % 5),
              i % 3 ? 'Well done.' : 'Check your carrying when converting from base 2.',
            ),
    ),
  });
  await assignment({
    armId: jss2b.id,
    code: 'MTH',
    title: 'Linear equations worksheet',
    instructions: 'Solve the ten equations on the worksheet.',
    status: 'DRAFT',
    due: null,
    max: 10,
  });
  await assignment({
    armId: jss2b.id,
    code: 'ENG',
    title: 'Essay: My most memorable day',
    instructions:
      'Write a narrative essay of about 350 words. Plan it first: an opening, three paragraphs and a closing. Type it or upload a clear photo of your handwritten work.',
    status: 'PUBLISHED',
    due: dueAt(now, 7, term.endsOn),
    max: 30,
    published: new Date(now.getTime() - DAY),
    grader: users.get('g.okafor@greenfield.edu.ng'),
    work: [sub(), sub('I wrote about my sister’s wedding.'), sub(), none, sub()],
  });
  if (p5b)
    await assignment({
      armId: p5b.id,
      code: 'MTH',
      title: 'Fractions worksheet',
      instructions:
        'Do the twelve sums on the fractions worksheet in your exercise book. A parent can take a photo and hand it in through the Parent Portal.',
      status: 'PUBLISHED',
      due: dueAt(now, 4, term.endsOn),
      max: 12,
      published: new Date(now.getTime() - DAY),
    });
}
