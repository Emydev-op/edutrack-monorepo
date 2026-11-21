/**
 * Last session's records for Greenfield, so School Admin's session switcher has something to show
 * for 2025/2026: every student on this year's roll in last year's class (one level down, same
 * arm, promoted), JSS 1B's Third Term registers, and its published Third Term results and report
 * cards (a copy of this session's Junior Secondary scheme and JSS 1 subjects).
 *
 * Runs after the students and planning seeds. Results and class teachers are cleared by the
 * academics seed on every run; enrollments, registers and the copied scheme are upserted or
 * replaced, so reseeding gives the same demo.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { AttendanceMark } from '../../src/generated/prisma/enums.js';
import { demoUuid } from './platform-data.js';

const PAST = '2025/2026';
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
/** Deterministic 0–1 from a string, so reseeding gives the same demo. */
const seeded = (key: string) => {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
};
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export async function seedSchoolHistory(prisma: PrismaClient, schoolIds: Record<string, string>) {
  const schoolId = schoolIds.greenfield;
  if (!schoolId) return;
  const [past, current] = await Promise.all([
    prisma.academicSession.findFirst({
      where: { schoolId, name: PAST },
      include: { terms: { orderBy: { sequence: 'asc' } } },
    }),
    prisma.academicSession.findFirst({ where: { schoolId, status: 'ACTIVE' } }),
  ]);
  if (!past || !current) return;
  const third = past.terms.at(-1)!;

  /* ---------- Last year's classes ---------- */

  const levels = await prisma.classLevel.findMany({ where: { schoolId } });
  const below = new Map(levels.filter((l) => l.nextLevelId).map((l) => [l.nextLevelId!, l]));
  const arms = await prisma.classArm.findMany({ where: { schoolId, archivedAt: null } });
  const armAt = (branchId: string, levelId: string, name: string) =>
    arms.find((a) => a.branchId === branchId && a.levelId === levelId && a.name === name);
  const roll = await prisma.enrollment.findMany({
    where: { schoolId, sessionId: current.id, status: 'ACTIVE', armId: { not: null } },
    include: { student: true, arm: true },
  });
  for (const e of roll) {
    // New this year (admitted for 2026/2027): no history here.
    if (e.student.admittedOn && e.student.admittedOn >= current.startsOn) continue;
    const lower = below.get(e.levelId);
    const arm = lower && armAt(e.branchId, lower.id, e.arm!.name);
    if (!lower || !arm) continue;
    const id = demoUuid(`greenfield:enrollment:${e.student.admissionNo}:${PAST}`);
    const data = {
      branchId: e.branchId,
      levelId: lower.id,
      armId: arm.id,
      status: 'COMPLETED' as const,
      enrolledOn: past.startsOn,
      outcome: 'PROMOTE' as const,
    };
    await prisma.enrollment.upsert({
      where: { id },
      create: { id, schoolId, studentId: e.studentId, sessionId: past.id, ...data },
      update: data,
    });
  }

  /* ---------- JSS 1B, Third Term ---------- */

  const jss1 = levels.find((l) => l.name === 'JSS 1');
  const main = await prisma.branch.findFirst({ where: { schoolId, code: 'GFA-MN' } });
  const armB = jss1 && main && armAt(main.id, jss1.id, 'B');
  if (!jss1 || !armB) return;
  const pupils = await prisma.enrollment.findMany({
    where: { schoolId, sessionId: past.id, armId: armB.id, status: { not: 'LEFT' } },
    include: { student: true },
  });
  if (!pupils.length) return;
  const okafor = await prisma.staff.findFirst({
    where: { schoolId, email: 'g.okafor@greenfield.edu.ng' },
    include: { membership: true },
  });
  if (okafor)
    await prisma.classTeacherAssignment.create({
      data: {
        schoolId,
        sessionId: past.id,
        armId: armB.id,
        staffId: okafor.id,
        startsOn: past.startsOn,
      },
    });

  // Registers on school days (no public holidays), most days taken.
  await prisma.attendanceRegister.deleteMany({ where: { schoolId, termId: third.id } });
  const holidays = new Set(
    (
      await prisma.publicHoliday.findMany({
        where: { date: { gte: third.startsOn, lte: third.endsOn } },
      })
    ).map((h) => iso(h.date)),
  );
  const presence = new Map<
    string,
    { present: number; late: number; absent: number; excused: number }
  >();
  let schoolDays = 0;
  const taker = okafor?.membership?.userId;
  for (let t = third.startsOn.getTime(); t <= third.endsOn.getTime() && taker; t += DAY) {
    const d = iso(new Date(t));
    const wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6 || holidays.has(d)) continue;
    schoolDays += 1;
    const register = await prisma.attendanceRegister.create({
      data: {
        schoolId,
        termId: third.id,
        armId: armB.id,
        date: day(d),
        takenById: taker,
        takenByStaffId: okafor!.id,
        takenAt: new Date(`${d}T07:55:00.000Z`),
      },
    });
    await prisma.attendanceEntry.createMany({
      data: pupils.map((e) => {
        const r = seeded(`past${e.studentId}${d}`);
        const mark: AttendanceMark =
          r < 0.03 ? 'ABSENT' : r < 0.05 ? 'EXCUSED' : r < 0.1 ? 'LATE' : 'PRESENT';
        const p = presence.get(e.studentId) ?? { present: 0, late: 0, absent: 0, excused: 0 };
        if (mark === 'PRESENT') p.present += 1;
        else if (mark === 'LATE') p.late += 1;
        else if (mark === 'ABSENT') p.absent += 1;
        else p.excused += 1;
        presence.set(e.studentId, p);
        return {
          schoolId,
          registerId: register.id,
          studentId: e.studentId,
          termId: third.id,
          date: day(d),
          mark,
          reason: mark === 'EXCUSED' ? 'Hospital appointment' : mark === 'ABSENT' ? 'Unwell' : null,
        };
      }),
    });
  }

  // Last session's Junior Secondary scheme: a copy of this session's.
  const source = await prisma.assessmentScheme.findFirst({
    where: { schoolId, sessionId: current.id, sectionId: jss1.sectionId },
    include: { components: { orderBy: { sortOrder: 'asc' } }, gradeBands: true },
  });
  if (!source) return;
  const scheme = await prisma.assessmentScheme.upsert({
    where: { sessionId_sectionId: { sessionId: past.id, sectionId: jss1.sectionId } },
    create: {
      schoolId,
      sessionId: past.id,
      sectionId: jss1.sectionId,
      mode: source.mode,
      showPosition: source.showPosition,
      passMark: source.passMark,
      rounding: source.rounding,
      lockedAt: third.endsOn,
    },
    update: { mode: source.mode, showPosition: source.showPosition, lockedAt: third.endsOn },
  });
  await prisma.assessmentComponent.deleteMany({ where: { schemeId: scheme.id } });
  await prisma.gradeBand.deleteMany({ where: { schemeId: scheme.id } });
  await prisma.assessmentComponent.createMany({
    data: source.components.map((c) => ({
      schoolId,
      schemeId: scheme.id,
      key: c.key,
      name: c.name,
      maxScore: c.maxScore,
      weight: c.weight,
      typicalWhen: c.typicalWhen,
      sortOrder: c.sortOrder,
    })),
  });
  await prisma.gradeBand.createMany({
    data: source.gradeBands.map(
      ({ id: _id, schemeId: _s, createdAt: _c, updatedAt: _u, ...g }) => ({
        ...g,
        schemeId: scheme.id,
      }),
    ),
  });
  const components = await prisma.assessmentComponent.findMany({
    where: { schemeId: scheme.id },
    orderBy: { sortOrder: 'asc' },
  });
  const bands = [...source.gradeBands].sort((a, b) => Number(b.minScore) - Number(a.minScore));
  const gradeOf = (total: number) =>
    bands.find((b) => total >= Number(b.minScore)) ?? bands.at(-1) ?? null;

  // JSS 1's core subjects, carried into last session's curriculum.
  const entries = await prisma.curriculumEntry.findMany({
    where: { schoolId, sessionId: current.id, levelId: jss1.id, offering: 'COMPULSORY' },
    include: { subject: true },
  });
  for (const c of entries)
    await prisma.curriculumEntry.upsert({
      where: {
        sessionId_levelId_subjectId: {
          sessionId: past.id,
          levelId: jss1.id,
          subjectId: c.subjectId,
        },
      },
      create: {
        schoolId,
        sessionId: past.id,
        levelId: jss1.id,
        subjectId: c.subjectId,
        offering: c.offering,
        periodsPerWeek: c.periodsPerWeek,
      },
      update: { offering: c.offering, periodsPerWeek: c.periodsPerWeek },
    });

  // Scores: steady per student, varied per subject; published at the end of term.
  const published = new Date(third.endsOn.getTime() + 5 * DAY);
  const totals = new Map<string, { name: string; total: number }[]>();
  for (const c of entries) {
    const sheet = await prisma.resultSheet.create({
      data: {
        schoolId,
        sessionId: past.id,
        termId: third.id,
        levelId: jss1.id,
        armId: armB.id,
        subjectId: c.subjectId,
        schemeId: scheme.id,
        status: 'PUBLISHED',
        submittedAt: third.endsOn,
        approvedAt: third.endsOn,
        publishedAt: published,
      },
    });
    const rows = pupils.map((e) => {
      const ability = 0.45 + seeded(`ability${e.studentId}`) * 0.45;
      const scores = components.map((comp) => {
        const r = Math.min(
          1,
          Math.max(0.2, ability + (seeded(`${e.studentId}${c.subjectId}${comp.key}`) - 0.5) * 0.3),
        );
        return { comp, score: Math.round(Number(comp.maxScore) * r) };
      });
      return { e, scores, total: scores.reduce((s, x) => s + x.score, 0) };
    });
    const ranked = [...rows].sort((a, b) => b.total - a.total);
    for (const r of rows) {
      const band = gradeOf(r.total);
      const entry = await prisma.resultEntry.create({
        data: {
          schoolId,
          sheetId: sheet.id,
          studentId: r.e.studentId,
          total: r.total,
          grade: band?.grade ?? null,
          teacherRemark: band?.remark ?? null,
          position: ranked.findIndex((x) => x.total === r.total) + 1,
        },
      });
      await prisma.resultScore.createMany({
        data: r.scores.map((s) => ({
          schoolId,
          entryId: entry.id,
          componentId: s.comp.id,
          state: 'SCORED' as const,
          score: s.score,
        })),
      });
      const list = totals.get(r.e.studentId) ?? [];
      list.push({ name: c.subject.name, total: r.total });
      totals.set(r.e.studentId, list);
    }
  }

  // Published report cards, frozen like the publishing step does.
  await prisma.resultPublication.create({
    data: { schoolId, termId: third.id, armId: armB.id, publishedAt: published },
  });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  const averages = pupils
    .map((e) => {
      const list = totals.get(e.studentId) ?? [];
      return { e, avg: list.reduce((s, x) => s + x.total, 0) / Math.max(1, list.length) };
    })
    .sort((a, b) => b.avg - a.avg);
  const subjectRank = new Map<string, number>();
  for (const c of entries) {
    const ranked = pupils
      .map((e) => ({
        id: e.studentId,
        t: totals.get(e.studentId)?.find((x) => x.name === c.subject.name)?.total ?? 0,
      }))
      .sort((a, b) => b.t - a.t);
    ranked.forEach((r, i) => subjectRank.set(`${r.id}:${c.subject.name}`, i + 1));
  }
  for (const [i, { e, avg }] of averages.entries()) {
    const band = gradeOf(avg);
    const att = presence.get(e.studentId);
    const subjects = await prisma.resultEntry.findMany({
      where: { studentId: e.studentId, sheet: { termId: third.id } },
      include: { sheet: { include: { subject: true } }, scores: { include: { component: true } } },
    });
    await prisma.reportCard.create({
      data: {
        schoolId,
        termId: third.id,
        studentId: e.studentId,
        armId: armB.id,
        classTeacherStaffId: okafor?.id ?? null,
        classTeacherRemark:
          avg >= 60
            ? 'A hardworking student. Well done this session.'
            : 'Steady effort. Keep working hard next session.',
        average: Math.round(avg * 100) / 100,
        grade: band?.grade ?? null,
        position: i + 1,
        version: 1,
        publishedAt: published,
        snapshot: {
          school: {
            name: school.name,
            motto: school.motto ?? '',
            address: [school.street, school.city, school.state].filter(Boolean).join(', '),
            logoUrl: null,
            brandColor: school.brandColor,
          },
          title: `${third.name} Report · ${PAST}`,
          student: {
            id: e.studentId,
            name: `${e.student.firstName} ${e.student.surname}`,
            admissionNo: e.student.admissionNo,
            gender: e.student.gender,
            className: 'JSS 1B',
          },
          classTeacher: okafor
            ? `${okafor.title ?? ''} ${okafor.firstName} ${okafor.lastName}`.trim()
            : null,
          components: components.map((c) => `${c.name} /${Number(c.maxScore)}`),
          subjects: subjects
            .sort((a, b) => a.sheet.subject.name.localeCompare(b.sheet.subject.name))
            .map((s) => ({
              name: s.sheet.subject.name,
              scores: components.map((c) =>
                Number(s.scores.find((x) => x.componentId === c.id)?.score ?? 0),
              ),
              total: Number(s.total).toFixed(1),
              grade: s.grade ?? '—',
              remark: s.teacherRemark ?? '',
              position: `${ordinal(subjectRank.get(`${e.studentId}:${s.sheet.subject.name}`) ?? 0)} of ${pupils.length}`,
            })),
          average: `${avg.toFixed(1)}%`,
          grade: band?.grade ?? '—',
          position: `${ordinal(i + 1)} of ${pupils.length}`,
          published: true,
          version: 1,
          nextTerm: `${current.name} begins ${iso(current.startsOn)}`,
          classTeacherRemark:
            avg >= 60
              ? 'A hardworking student. Well done this session.'
              : 'Steady effort. Keep working hard next session.',
          conduct: [],
          attendance: att
            ? {
                present: att.present + att.late,
                late: att.late,
                absent: att.absent,
                excused: att.excused,
                schoolDays,
              }
            : null,
          cumulative: null,
          publishedAt: iso(published),
        },
      },
    });
  }
}
