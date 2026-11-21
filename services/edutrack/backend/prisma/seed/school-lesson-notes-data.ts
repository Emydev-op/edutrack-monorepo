/**
 * Teacher Workspace demo data for Greenfield Academy's active term: weekly lesson notes, a couple
 * of scheduled CA tests and a staff announcement.
 *
 * Lesson notes (Mr. Ade, Mrs. Okafor, Mr. Bello and Mrs. Eze, for the subjects and class levels
 * they lead): every week before the current one is approved, except Mr. Ade's first slot last
 * week, returned by Mr. Bello. This week (due last Friday): Mr. Ade has a draft and a note with
 * Mr. Bello (Sciences HOD), the rest of his slots unwritten (overdue); Mrs. Okafor's notes
 * (Languages has no HOD) and Mr. Bello's own notes wait on Mrs. Eze (Academic Head); Mrs. Eze's
 * own notes are filed without review. Weeks follow `now`, so the demo stays current.
 *
 * Assessments: JSS 2B Mathematics' first CA (taken in October) and its second CA a week from now,
 * and JSS 2B English's first CA. Idempotent: the rows are cleared first (`clearSchoolLessonNotes`,
 * before the academic seeds can remove the terms, arms and components they point at).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import type { LessonNoteStatus } from '../../src/generated/prisma/enums.js';
import { currentWeek, termWeeks } from '../../src/school/lesson-notes/lesson-weeks.js';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
/** "YYYY-MM-DD" at HH:mm Lagos time. */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000+01:00`);
const name = (s: { title: string | null; firstName: string; lastName: string }) =>
  [s.title, s.firstName, s.lastName].filter(Boolean).join(' ');

/** Empties lesson notes, assessment schedules and their timelines and notifications. */
export async function clearSchoolLessonNotes(prisma: PrismaClient) {
  await prisma.lessonNote.deleteMany({});
  await prisma.assessmentSchedule.deleteMany({});
  await prisma.auditEvent.deleteMany({
    where: { entityType: { in: ['LessonNote', 'AssessmentSchedule'] } },
  });
  await prisma.notification.deleteMany({ where: { entityType: 'LessonNote' } });
}

const TOPICS: Record<string, string[]> = {
  MTH: [
    'Whole numbers and place value',
    'Fractions, decimals and percentages',
    'Indices and standard form',
    'Algebraic expressions',
    'Simple equations',
    'Ratio and proportion',
    'Revision and CA 1',
    'Angles and parallel lines',
    'Plane shapes: perimeter and area',
    'Linear inequalities',
    'Graphs of linear equations',
    'Simultaneous equations',
    'Statistics: mean, median and mode',
    'Revision for examinations',
  ],
  ENG: [
    'Parts of speech: nouns and pronouns',
    'Comprehension: reading for main ideas',
    'Letter writing: informal letters',
    'Vowel sounds',
    'Verbs and tenses',
    'Summary writing',
    'Revision and CA 1',
    'Adjectives and adverbs',
    'Narrative essays',
    'Consonant sounds',
    'Concord: subject and verb agreement',
    'Formal letters',
    'Vocabulary: synonyms and antonyms',
    'Revision for examinations',
  ],
  PHY: [
    'Measurement and units',
    'Scalars and vectors',
    'Motion: speed, velocity and acceleration',
    'Newton’s laws of motion',
    'Work, energy and power',
    'Simple machines',
    'Revision and CA 1',
    'Heat and temperature',
    'Thermal expansion',
    'Waves',
    'Light: reflection',
    'Light: refraction',
    'Electrostatics',
    'Revision for examinations',
  ],
};

const topicFor = (code: string, subjectName: string, week: number) =>
  TOPICS[code]?.[week - 1] ?? `${subjectName}: unit ${week}`;

export async function seedSchoolLessonNotes(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
  now: Date,
) {
  const schoolId = schoolIds.greenfield;
  if (!schoolId) return;
  const term = await prisma.term.findFirst({ where: { schoolId, status: 'ACTIVE' } });
  if (!term) return;
  const today = iso(new Date(now.getTime() + 3_600_000));
  const weeks = termWeeks({ start: iso(term.startsOn), end: iso(term.endsOn) }, []);
  const cw = currentWeek(weeks, today);

  const emails = {
    ade: 's.ade@greenfield.edu.ng',
    okafor: 'g.okafor@greenfield.edu.ng',
    bello: 'i.bello@greenfield.edu.ng',
    eze: 'c.eze@greenfield.edu.ng',
  };
  const members = await prisma.schoolMembership.findMany({
    where: { schoolId, kind: 'STAFF', user: { email: { in: Object.values(emails) } } },
    include: {
      user: { select: { email: true } },
      staff: true,
      roles: { include: { role: { select: { key: true } } } },
    },
  });
  const who = (email: string) => members.find((m) => m.user.email === email && m.staff);
  const eze = who(emails.eze);
  const bello = who(emails.bello);

  /* ---------- Lesson notes ---------- */

  type Plan = { status: LessonNoteStatus; returnComment?: string } | 'skip';
  const notes: Prisma.LessonNoteCreateManyInput[] = [];
  const audit: Prisma.AuditEventCreateManyInput[] = [];

  for (const key of ['ade', 'okafor', 'bello', 'eze'] as const) {
    const m = who(emails[key]);
    if (!m?.staff || cw < 1) continue;
    const staff = m.staff;
    const isHead = m.roles.some((r) => r.role.key === 'academic_head');
    const assignments = await prisma.teachingAssignment.findMany({
      where: { schoolId, termId: term.id, staffId: staff.id, lead: true },
      include: {
        subject: { include: { department: { select: { hodStaffId: true } } } },
        arm: { include: { level: true } },
      },
    });
    const slots = [
      ...new Map(assignments.map((a) => [`${a.subjectId}|${a.levelId}`, a] as const)).values(),
    ].sort(
      (a, b) =>
        a.arm.level.name.localeCompare(b.arm.level.name) ||
        a.subject.name.localeCompare(b.subject.name),
    );
    for (const [i, a] of slots.entries()) {
      const hod = a.subject.department?.hodStaffId ?? null;
      const reviewer = hod && hod !== staff.id ? hod : isHead ? null : (eze?.staffId ?? null);
      const filed = !(hod && hod !== staff.id) && isHead;
      for (let week = 1; week <= cw; week++) {
        let plan: Plan = { status: 'APPROVED' };
        if (key === 'ade' && i === 0 && week === cw - 1)
          plan = {
            status: 'RETURNED',
            returnComment: 'Add worked examples and a short class exercise before the homework.',
          };
        if (week === cw) {
          if (key === 'ade')
            plan = i === 0 ? { status: 'DRAFT' } : i === 1 ? { status: 'SUBMITTED' } : 'skip';
          if (key === 'okafor' || key === 'bello') plan = { status: 'SUBMITTED' };
        }
        if (plan === 'skip') continue;
        const w = weeks[week - 1]!;
        const topic = topicFor(a.subject.code, a.subject.name, week);
        const created = at(iso(new Date(day(w.due).getTime() - DAY)), '18:00');
        let submitted = plan.status === 'DRAFT' ? null : at(w.due, week === cw ? '17:05' : '16:20');
        if (submitted && submitted > now) submitted = new Date(now.getTime() - 3_600_000);
        const decided =
          plan.status === 'APPROVED'
            ? filed
              ? submitted
              : at(w.start, '09:15') < now
                ? at(w.start, '09:15')
                : submitted
            : plan.status === 'RETURNED'
              ? at(w.start, '10:40') < now
                ? at(w.start, '10:40')
                : submitted
              : null;
        const id = randomUUID();
        notes.push({
          id,
          schoolId,
          termId: term.id,
          teacherStaffId: staff.id,
          subjectId: a.subjectId,
          levelId: a.levelId,
          week,
          weekStartsOn: day(w.start),
          dueOn: day(w.due),
          topic,
          objectives:
            plan.status === 'DRAFT'
              ? []
              : [
                  `Define the key terms in ${topic.toLowerCase()}`,
                  `Work through examples on ${topic.toLowerCase()} with the class`,
                  'Solve the practice questions in groups and present answers',
                ],
          content: `Introduce ${topic.toLowerCase()} with a short starter activity, then teach the main ideas with worked examples on the board. Students practise in pairs, and the lesson ends with a five-question exit check and homework from the textbook.`,
          schemeTopic: `Scheme of work · ${topic}`,
          status: plan.status,
          reviewerStaffId: plan.status === 'DRAFT' ? null : reviewer,
          filedWithoutReview: filed && plan.status === 'APPROVED',
          submittedAt: submitted,
          decidedAt: decided,
          decidedByStaffId:
            (plan.status === 'APPROVED' && !filed) || plan.status === 'RETURNED' ? reviewer : null,
          returnComment: plan.status === 'RETURNED' ? plan.returnComment : null,
          createdAt: created,
          updatedAt: submitted ?? created,
        });
        const teacher = `${staff.firstName} ${staff.lastName}`;
        const reviewerName =
          reviewer === bello?.staffId && bello?.staff
            ? name(bello.staff)
            : reviewer === eze?.staffId && eze?.staff
              ? name(eze.staff)
              : 'the academic office';
        const reviewerActor =
          reviewer === bello?.staffId ? bello : reviewer === eze?.staffId ? eze : null;
        const base = {
          schoolId,
          actorKind: 'USER' as const,
          area: 'Academic',
          entityType: 'LessonNote',
          entityId: id,
        };
        audit.push({
          ...base,
          actorUserId: m.userId,
          actorName: teacher,
          action: 'lesson_note.create',
          summary: 'Draft started',
          createdAt: created,
        });
        if (submitted)
          audit.push({
            ...base,
            actorUserId: m.userId,
            actorName: teacher,
            action: filed ? 'lesson_note.file' : 'lesson_note.submit',
            summary: filed
              ? 'Filed by the Academic Head — no review needed'
              : `Submitted to ${reviewerName}`,
            createdAt: submitted,
          });
        if (decided && !filed && (plan.status === 'APPROVED' || plan.status === 'RETURNED'))
          audit.push({
            ...base,
            actorUserId: reviewerActor?.userId ?? null,
            actorName: reviewerActor?.staff
              ? `${reviewerActor.staff.firstName} ${reviewerActor.staff.lastName}`
              : null,
            action: plan.status === 'APPROVED' ? 'lesson_note.approve' : 'lesson_note.return',
            summary: `${plan.status === 'APPROVED' ? 'Approved' : 'Returned'} by ${reviewerName}`,
            detail: plan.status === 'RETURNED' ? plan.returnComment : null,
            createdAt: decided,
          });
      }
    }
  }
  if (notes.length) await prisma.lessonNote.createMany({ data: notes });
  if (audit.length) await prisma.auditEvent.createMany({ data: audit });

  /* ---------- Assessment schedules ---------- */

  const jss2b =
    (await prisma.classArm.findFirst({
      where: {
        schoolId,
        name: 'B',
        level: { name: 'JSS 2' },
        archivedAt: null,
        branch: { code: 'GFA-MC' },
      },
      include: { level: true },
    })) ?? null;
  const scheme = jss2b
    ? await prisma.assessmentScheme.findFirst({
        where: { schoolId, sessionId: term.sessionId, sectionId: jss2b.level.sectionId },
        include: { components: { orderBy: { sortOrder: 'asc' } } },
      })
    : null;
  if (jss2b && scheme && scheme.mode === 'SCORES' && scheme.components.length >= 2) {
    const [ca1, ca2] = scheme.components as [
      (typeof scheme.components)[number],
      (typeof scheme.components)[number],
    ];
    // A week from now on a weekday, inside the term.
    let next = iso(new Date(now.getTime() + 7 * DAY));
    while ([0, 6].includes(day(next).getUTCDay())) next = iso(new Date(day(next).getTime() + DAY));
    const firstCa = iso(new Date(term.startsOn.getTime() + 29 * DAY)); // a Tuesday in week 5
    const plans = [
      { code: 'MTH', comp: ca1, date: firstCa, topics: 'Whole numbers, fractions and indices' },
      { code: 'MTH', comp: ca2, date: next, topics: 'Algebraic expressions and simple equations' },
      {
        code: 'ENG',
        comp: ca1,
        date: firstCa,
        topics: 'Parts of speech, comprehension and letters',
      },
    ];
    for (const p of plans) {
      if (p.date > iso(term.endsOn) || (p.comp === ca2 && p.date <= today)) continue;
      const ta = await prisma.teachingAssignment.findFirst({
        where: {
          schoolId,
          termId: term.id,
          armId: jss2b.id,
          subject: { code: p.code },
          lead: true,
        },
        include: { staff: { select: { title: true, firstName: true, lastName: true } } },
      });
      if (!ta) continue;
      const createdAt = new Date(Math.min(day(p.date).getTime() - 14 * DAY, now.getTime() - DAY));
      const row = await prisma.assessmentSchedule.create({
        data: {
          schoolId,
          termId: term.id,
          armId: jss2b.id,
          subjectId: ta.subjectId,
          componentId: p.comp.id,
          teachingAssignmentId: ta.id,
          scheduledOn: day(p.date),
          topics: p.topics,
          instructions: p.comp === ca2 ? 'Bring a ruler, a pencil and your mathematical set.' : '',
          createdAt,
        },
      });
      await prisma.auditEvent.create({
        data: {
          schoolId,
          actorKind: 'USER',
          actorName: `${ta.staff.firstName} ${ta.staff.lastName}`,
          area: 'Academic',
          action: 'assessment.schedule',
          entityType: 'AssessmentSchedule',
          entityId: row.id,
          summary: `Scheduled by ${name(ta.staff)}`,
          detail: `${p.comp.name} · ${+p.date.slice(8, 10)} ${
            ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
              +p.date.slice(5, 7) - 1
            ]
          } ${p.date.slice(0, 4)}`,
          createdAt,
        },
      });
    }
  }

  /* ---------- A staff announcement ---------- */

  if (eze) {
    const sentAt = new Date(now.getTime() - 2 * DAY);
    await prisma.announcement.create({
      data: {
        schoolId,
        title: 'Lesson notes are due every Friday',
        body: 'Weekly lesson notes are submitted in the Teacher Workspace by the Friday before the week they cover. They go to your HOD, or to the Academic Head where a department has no HOD.\n\nReturned notes show the reviewer’s comment: revise and resubmit them the same week.',
        audienceKind: 'STAFF',
        channels: ['IN_APP'],
        status: 'SENT',
        sentAt,
        createdById: eze.userId,
        recipientCount: 0,
        createdAt: sentAt,
      },
    });
  }
}
