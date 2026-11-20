/**
 * Academics, Phase 3a, for Greenfield: subjects and the session's curriculum, elective groups, an
 * assessment scheme per section, this term's teacher assignments, a published timetable for
 * JSS 2B (Main Campus) and its daily registers so far. Crestview is a new school and starts empty.
 *
 * Idempotent like the other seeds: everything is upserted by its natural key, and the generated
 * parts (assignments, timetable, registers) are replaced on each run.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { AttendanceMark, Weekday } from '../../src/generated/prisma/enums.js';
import { linkStaffQualifications } from './school-staff-data.js';
import {
  componentKey,
  DEFAULT_PERIODS,
  defaultScheme,
  OFFERING,
  SUGGESTED_GROUPS,
  SUGGESTED_SUBJECTS,
} from '../../src/school/curriculum/curriculum-defaults.js';

const DAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const time = (t: string) => new Date(`1970-01-01T${t}:00.000Z`);
/** Deterministic 0–1 from a string, so reseeding gives the same demo. */
const seeded = (key: string) => {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
};

/** Extra subject teachers' names (the School Admin mock's), hired as staff numbers 0301 on. */
const EXTRA_TEACHERS = [
  'Mrs. Toyin Oyelaran',
  'Mrs. Nkechi Uzor',
  'Mr. Emeka Chukwu',
  'Mrs. Halima Usman',
  'Mr. Femi Ogunleye',
  'Mrs. Joy Edet',
  'Mr. Olumide Ayodele',
  'Mrs. Patience Inyang',
  'Mr. Abdul Lawal',
  'Mrs. Bisi Oke',
  'Mr. Kayode Ajibola',
  'Mrs. Uche Nwafor',
  'Mr. Sola Daramola',
  'Mrs. Ese Omoregie',
  'Mr. Gbenga Akinola',
  'Mrs. Funke Shittu',
  'Mr. Ifeanyi Okeke',
  'Mrs. Rukayat Bello',
  'Mr. Wale Adigun',
  'Mrs. Chinwe Anozie',
  'Mr. Dapo Oyebanji',
  'Mrs. Amina Yusuf',
  'Mr. Taiwo Akande',
  'Mrs. Lola Fashola',
  'Mr. Ikechukwu Eze',
  'Mrs. Mercy Bassey',
  'Mr. Sunday Okon',
  'Mrs. Damilola Ige',
  'Mr. Jide Coker',
  'Mrs. Adaobi Okonjo',
  'Mr. Tobi Balogun',
  'Mrs. Zainab Danladi',
  'Mr. Chinedu Nnadi',
  'Mrs. Yewande Adeyinka',
  'Mr. Musa Garba',
  'Mrs. Ifunanya Ezeh',
  'Mr. Oluwaseun Oyedepo',
  'Mrs. Hadiza Lawan',
  'Mr. Obinna Ikpe',
  'Mrs. Adaobi Fagbemi',
];
const HIRED_FROM = 301;

const SCIENCES = ['MTH', 'BSC', 'BIO', 'CHE', 'PHY', 'FMT'];
const LANGUAGES = ['ENG', 'FRE', 'YOR', 'LIE'];

/** The design's class: Mrs. Okafor teaches English and is its class teacher, Mr. Ade Mathematics. */
const SHOWCASE = { level: 'JSS 2', arm: 'B', branchCode: 'GFA-MC' };

export async function seedSchoolPlanning(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
  now: Date,
): Promise<void> {
  const schoolId = schoolIds.greenfield!;
  const session = await prisma.academicSession.findFirst({
    where: { schoolId, status: 'ACTIVE' },
    include: { terms: { orderBy: { sequence: 'asc' } } },
  });
  const term = session?.terms.find((t) => t.status === 'ACTIVE');
  if (!session || !term) return;

  /* ---------- Subjects, curriculum, elective groups ---------- */

  const sections = await prisma.section.findMany({ where: { schoolId } });
  const levels = await prisma.classLevel.findMany({
    where: { schoolId, branchLevels: { some: {} } },
  });
  const subjectId = new Map<string, string>();
  // The science subjects go to Sciences (its HOD reviews their result sheets) and the languages
  // to Languages (no HOD: straight to the academic office). The rest have no department.
  const departments = await prisma.department.findMany({ where: { schoolId } });
  const deptOf = (code: string) =>
    departments.find(
      (d) =>
        d.name ===
        (SCIENCES.includes(code) ? 'Sciences' : LANGUAGES.includes(code) ? 'Languages' : null),
    )?.id ?? null;
  // Lessons per week per arm go back to the defaults.
  await prisma.curriculumArm.deleteMany({ where: { schoolId } });
  for (const [name, code, category, periods, by] of SUGGESTED_SUBJECTS) {
    if (!sections.some((s) => by[s.code])) continue;
    // A subject only one section offers belongs to it; the rest are shared.
    const offeredBy = sections.filter((x) => by[x.code]);
    const sectionId = offeredBy.length === 1 ? offeredBy[0]!.id : null;
    const row = await prisma.subject.upsert({
      where: { schoolId_code: { schoolId, code } },
      create: {
        schoolId,
        code,
        name,
        category,
        periodsPerWeek: periods,
        sectionId,
        departmentId: deptOf(code),
      },
      update: {
        name,
        category,
        periodsPerWeek: periods,
        status: 'ACTIVE',
        sectionId,
        departmentId: deptOf(code),
      },
    });
    subjectId.set(code, row.id);
    for (const s of sections.filter((x) => by[x.code]))
      for (const lv of levels.filter((l) => l.sectionId === s.id))
        await prisma.curriculumEntry.upsert({
          where: {
            sessionId_levelId_subjectId: {
              sessionId: session.id,
              levelId: lv.id,
              subjectId: row.id,
            },
          },
          create: {
            schoolId,
            sessionId: session.id,
            levelId: lv.id,
            subjectId: row.id,
            offering: OFFERING[by[s.code]!],
          },
          update: { offering: OFFERING[by[s.code]!], periodsPerWeek: null },
        });
  }
  for (const s of sections)
    for (const [name, codes, min, max, note] of SUGGESTED_GROUPS[s.code] ?? []) {
      const group = await prisma.electiveGroup.upsert({
        where: { sessionId_sectionId_name: { sessionId: session.id, sectionId: s.id, name } },
        create: {
          schoolId,
          sessionId: session.id,
          sectionId: s.id,
          name,
          minPicks: min,
          maxPicks: max,
          note,
        },
        update: { minPicks: min, maxPicks: max, note },
      });
      await prisma.electiveGroupSubject.deleteMany({ where: { groupId: group.id } });
      await prisma.electiveGroupSubject.createMany({
        data: codes
          .filter((c) => subjectId.has(c))
          .map((c) => ({ schoolId, groupId: group.id, subjectId: subjectId.get(c)! })),
      });
    }

  // Staff qualifications wait for the subjects (the staff seed runs first).
  await linkStaffQualifications(prisma, schoolIds);

  /* ---------- Assessment schemes ---------- */

  await prisma.schoolSettings.upsert({
    where: { schoolId },
    create: { schoolId, sameSchemeForAllSections: false },
    update: { sameSchemeForAllSections: false },
  });
  for (const s of sections) {
    const d = defaultScheme(s.code);
    const scheme = await prisma.assessmentScheme.upsert({
      where: { sessionId_sectionId: { sessionId: session.id, sectionId: s.id } },
      create: {
        schoolId,
        sessionId: session.id,
        sectionId: s.id,
        mode: d.mode === 'descriptive' ? 'DESCRIPTIVE' : 'SCORES',
        showPosition: d.showPosition,
      },
      update: {
        mode: d.mode === 'descriptive' ? 'DESCRIPTIVE' : 'SCORES',
        showPosition: d.showPosition,
        rounding: 'WHOLE_NUMBER',
        passMark: 40,
        lockedAt: null,
      },
    });
    // Back to the default components (a test or demo may have changed them).
    await prisma.assessmentComponent.deleteMany({
      where: { schemeId: scheme.id, key: { notIn: d.components.map((c) => componentKey(c.name)) } },
    });
    for (const c of await prisma.assessmentComponent.findMany({ where: { schemeId: scheme.id } }))
      await prisma.assessmentComponent.update({
        where: { id: c.id },
        data: { sortOrder: -1000 - c.sortOrder },
      });
    for (const [i, c] of d.components.entries())
      await prisma.assessmentComponent.upsert({
        where: { schemeId_key: { schemeId: scheme.id, key: componentKey(c.name) } },
        create: {
          schoolId,
          schemeId: scheme.id,
          key: componentKey(c.name),
          name: c.name,
          maxScore: c.max,
          weight: c.weight,
          typicalWhen: c.when,
          sortOrder: i + 1,
        },
        update: {
          name: c.name,
          maxScore: c.max,
          weight: c.weight,
          typicalWhen: c.when,
          sortOrder: i + 1,
        },
      });
    await prisma.gradeBand.deleteMany({ where: { schemeId: scheme.id } });
    await prisma.gradeBand.createMany({
      data: d.scale.map((g, i) => ({
        schoolId,
        schemeId: scheme.id,
        grade: g.grade,
        minScore: g.min,
        maxScore: g.max,
        remark: g.remark,
        points: g.points,
        isPass: g.pass,
        sortOrder: i + 1,
      })),
    });
    for (const [i, r] of d.ratings.entries())
      await prisma.descriptiveRating.upsert({
        where: { schemeId_name: { schemeId: scheme.id, name: r.name } },
        create: {
          schoolId,
          schemeId: scheme.id,
          name: r.name,
          description: r.description,
          sortOrder: i + 1,
        },
        update: { description: r.description, sortOrder: i + 1 },
      });
    // Every section runs the default bell schedule.
    for (const [i, [label, start, end, isBreak]] of DEFAULT_PERIODS.entries())
      await prisma.timetablePeriod.upsert({
        where: { sectionId_sortOrder: { sectionId: s.id, sortOrder: i + 1 } },
        create: {
          schoolId,
          sectionId: s.id,
          label,
          startsAt: time(start),
          endsAt: time(end),
          isBreak,
          sortOrder: i + 1,
        },
        update: { label, startsAt: time(start), endsAt: time(end), isBreak },
      });
  }

  /* ---------- This term's teacher assignments ---------- */

  // Generated parts are rebuilt each run.
  await prisma.attendanceRegister.deleteMany({ where: { schoolId, termId: term.id } });
  await prisma.timetable.deleteMany({ where: { schoolId } });
  await prisma.teachingAssignment.deleteMany({ where: { schoolId } });

  const findTeachers = () =>
    prisma.staff.findMany({
      where: { schoolId, kind: 'TEACHING', status: 'ACTIVE' },
      include: { branches: true, qualifications: { include: { subject: true } } },
      orderBy: { staffNumber: 'asc' },
    });
  const teachers = await findTeachers();
  const arms = await prisma.classArm.findMany({
    where: { schoolId, archivedAt: null },
    include: { level: { include: { section: true } }, branch: true },
  });
  arms.sort(
    (a, b) =>
      a.level.section.sortOrder - b.level.section.sortOrder ||
      a.level.sortOrder - b.level.sortOrder ||
      a.branch.code.localeCompare(b.branch.code) ||
      a.name.localeCompare(b.name),
  );
  const offered = await prisma.curriculumEntry.findMany({
    where: { sessionId: session.id },
    include: { subject: true },
  });
  const load = new Map<string, number>();
  const worksAt = (t: (typeof teachers)[number], branchId: string) =>
    t.allBranches || t.branches.some((b) => b.branchId === branchId);
  const showcase = arms.find(
    (a) =>
      a.level.name === SHOWCASE.level &&
      a.name === SHOWCASE.arm &&
      a.branch.code === SHOWCASE.branchCode,
  );
  const named = (first: string) => teachers.find((t) => t.firstName === first);
  const fixed: Record<string, string | undefined> = {
    ENG: named('Grace')?.id,
    MTH: named('Samuel')?.id,
  };
  const rows: {
    armId: string;
    levelId: string;
    subjectId: string;
    staffId: string;
    periods: number;
    temporary: boolean;
  }[] = [];
  const give = (
    arm: (typeof arms)[number],
    e: (typeof offered)[number],
    staffId: string,
    temporary = false,
  ) => {
    load.set(staffId, (load.get(staffId) ?? 0) + e.subject.periodsPerWeek);
    rows.push({
      armId: arm.id,
      levelId: arm.levelId,
      subjectId: e.subjectId,
      staffId,
      periods: e.subject.periodsPerWeek,
      temporary,
    });
  };
  /**
   * A subject teacher for a slot nobody can take: a new teaching staff record (no portal
   * account), qualified in the subject and a few of its kin, like the School Admin mock's extra
   * teachers. Reseeding finds them by staff number.
   */
  const subjects = await prisma.subject.findMany({ where: { schoolId } });
  const hire = async (branchId: string, subjectId: string) => {
    const subject = subjects.find((x) => x.id === subjectId)!;
    const n = HIRED_FROM + hired++;
    const i = n - HIRED_FROM;
    const L = EXTRA_TEACHERS.length;
    const [title, firstName] = EXTRA_TEACHERS[i % L]!.split(' ') as [string, string];
    // Past the list, pair each first name with another entry's surname.
    const lastName = EXTRA_TEACHERS[i < L ? i : (i * 7 + Math.floor(i / L)) % L]!.split(' ')[2]!;
    const kin = subjects
      .filter((x) => x.category === subject.category && x.id !== subject.id)
      .slice(0, 3);
    const staffNumber = `GFA-ST-${String(n).padStart(4, '0')}`;
    const staff = await prisma.staff.upsert({
      where: { schoolId_staffNumber: { schoolId, staffNumber } },
      create: {
        schoolId,
        staffNumber,
        title,
        firstName,
        lastName,
        gender: title === 'Mr.' ? 'MALE' : 'FEMALE',
        kind: 'TEACHING',
        group: 'TEACHING',
        positionTitle: `${subject.name} Teacher`,
        maxPeriodsPerWeek: 28,
        startedOn: day('2022-09-12'),
      },
      update: { status: 'ACTIVE', leftOn: null, positionTitle: `${subject.name} Teacher` },
    });
    await prisma.staffBranch.deleteMany({ where: { staffId: staff.id } });
    await prisma.staffBranch.create({ data: { schoolId, staffId: staff.id, branchId } });
    await prisma.staffQualification.deleteMany({ where: { staffId: staff.id } });
    await prisma.staffQualification.createMany({
      data: [subject, ...kin].map((x) => ({ schoolId, staffId: staff.id, subjectId: x.id })),
    });
    const [fresh] = (await findTeachers()).filter((t) => t.id === staff.id);
    teachers.push(fresh!);
    return fresh!;
  };
  let hired = 0;

  // The showcase class first (its named teachers), then everyone else.
  const order = showcase ? [showcase, ...arms.filter((a) => a !== showcase)] : arms;
  for (const arm of order) {
    for (const e of offered
      .filter((x) => x.levelId === arm.levelId)
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name))) {
      const room = (t: (typeof teachers)[number]) =>
        (load.get(t.id) ?? 0) + e.subject.periodsPerWeek <= t.maxPeriodsPerWeek;
      const wanted = arm === showcase ? fixed[e.subject.code] : undefined;
      const qualified = teachers.find(
        (t) =>
          worksAt(t, arm.branchId) &&
          room(t) &&
          t.qualifications.some((q) => q.subjectId === e.subjectId),
      );
      // Chemistry at Main Campus has had no teacher since Mr. Tunde Ojo left in July (the
      // design's gap).
      if (e.subject.code === 'CHE' && arm.branch.code === SHOWCASE.branchCode) continue;
      if (wanted) give(arm, e, wanted);
      else if (qualified) give(arm, e, qualified.id);
      else give(arm, e, (await hire(arm.branchId, e.subjectId)).id);
    }
  }
  await prisma.teachingAssignment.createMany({
    data: rows.map((r) => ({
      schoolId,
      sessionId: session.id,
      termId: term.id,
      levelId: r.levelId,
      armId: r.armId,
      subjectId: r.subjectId,
      staffId: r.staffId,
      type: r.temporary ? ('TEMPORARY' as const) : ('SUBJECT_TEACHER' as const),
      periodsPerWeek: r.periods,
    })),
  });

  /* ---------- Class teachers (where an arm has none) ---------- */

  const current = await prisma.classTeacherAssignment.findMany({
    where: { schoolId, sessionId: session.id, endsOn: null },
  });
  const taken = new Set(current.map((c) => c.staffId));
  const hasOne = new Set(current.map((c) => c.armId));
  const okafor = named('Grace');
  for (const arm of order) {
    if (hasOne.has(arm.id)) continue;
    // SSS 1C at Main Campus has had no class teacher since the start of term (a gap to show).
    if (arm.level.name === 'SSS 1' && arm.name === 'C' && arm.branch.code === SHOWCASE.branchCode)
      continue;
    const staffId =
      arm === showcase && okafor && !taken.has(okafor.id)
        ? okafor.id
        : rows.find(
            (r) =>
              r.armId === arm.id &&
              !taken.has(r.staffId) &&
              !(okafor && r.staffId === okafor.id && showcase),
          )?.staffId;
    if (!staffId) continue;
    taken.add(staffId);
    await prisma.classTeacherAssignment.create({
      data: { schoolId, sessionId: session.id, armId: arm.id, staffId, startsOn: session.startsOn },
    });
  }

  if (!showcase) return;

  /* ---------- JSS 2B's published timetable ---------- */

  const periods = await prisma.timetablePeriod.findMany({
    where: { sectionId: showcase.level.sectionId, isBreak: false },
    orderBy: { sortOrder: 'asc' },
  });
  const mine = rows.filter((r) => r.armId === showcase.id);
  const grid = new Map<string, { subjectId: string; staffId: string }>();
  for (const r of mine) {
    let left = r.periods;
    for (let pass = 0; pass < 2 && left > 0; pass++)
      for (const [di, d] of DAYS.entries()) {
        if (left <= 0) break;
        if (pass === 0 && periods.some((p) => grid.get(`${d}|${p.id}`)?.subjectId === r.subjectId))
          continue;
        const offset = Math.floor(seeded(r.subjectId + di) * periods.length);
        for (let k = 0; k < periods.length && left > 0; k++) {
          const idx = (k + offset) % periods.length;
          const p = periods[idx]!;
          if (grid.has(`${d}|${p.id}`)) continue;
          // No more than 2 lessons of a subject in a row (the timetable rule).
          const at = (j: number) => grid.get(`${d}|${periods[j]?.id}`)?.subjectId;
          let run = 1;
          for (let j = idx - 1; j >= 0 && at(j) === r.subjectId; j--) run++;
          for (let j = idx + 1; j < periods.length && at(j) === r.subjectId; j++) run++;
          if (run > 2) continue;
          grid.set(`${d}|${p.id}`, { subjectId: r.subjectId, staffId: r.staffId });
          left--;
          if (pass === 0) break;
        }
      }
  }
  const tt = await prisma.timetable.create({
    data: {
      schoolId,
      termId: term.id,
      armId: showcase.id,
      status: 'PUBLISHED',
      version: 1,
      publishedVersion: 1,
      publishedAt: now,
    },
  });
  await prisma.timetableSlot.createMany({
    data: (['DRAFT', 'PUBLISHED'] as const).flatMap((layer) =>
      [...grid].map(([key, v]) => {
        const [d, periodId] = key.split('|') as [Weekday, string];
        return { schoolId, timetableId: tt.id, termId: term.id, layer, day: d, periodId, ...v };
      }),
    ),
  });

  /* ---------- JSS 2B's registers so far ---------- */

  const classTeacher = await prisma.classTeacherAssignment.findFirst({
    where: { armId: showcase.id, sessionId: session.id, endsOn: null },
    include: { staff: { include: { membership: true } } },
  });
  const roll = await prisma.enrollment.findMany({
    where: { sessionId: session.id, armId: showcase.id, status: 'ACTIVE' },
  });
  const takerUserId = classTeacher?.staff.membership?.userId;
  if (!roll.length || !classTeacher || !takerUserId) return;
  const holidays = new Set(
    (
      await prisma.publicHoliday.findMany({
        where: { date: { gte: term.startsOn, lte: term.endsOn } },
      })
    ).map((h) => iso(h.date)),
  );
  const breaks = await prisma.termEvent.findMany({
    where: { termId: term.id, OR: [{ closesSchool: true }, { type: 'MIDTERM' }] },
  });
  const closed = (d: string) =>
    holidays.has(d) || breaks.some((b) => d >= iso(b.startsOn) && d <= iso(b.endsOn));
  const today = iso(now);
  for (
    let d = iso(term.startsOn);
    d < today && d <= iso(term.endsOn);
    d = iso(new Date(day(d).getTime() + 86_400_000))
  ) {
    const wd = day(d).getUTCDay();
    if (wd === 0 || wd === 6 || closed(d)) continue;
    // A few days the register wasn't taken, so School Admin has gaps to chase.
    if (seeded(`missed${d}`) < 0.06) continue;
    const takenAt = new Date(`${d}T07:5${Math.floor(seeded(d) * 9)}:00.000Z`);
    const register = await prisma.attendanceRegister.create({
      data: {
        schoolId,
        termId: term.id,
        armId: showcase.id,
        date: day(d),
        takenById: takerUserId,
        takenByStaffId: classTeacher.staffId,
        takenAt,
      },
    });
    await prisma.attendanceEntry.createMany({
      data: roll.map((e) => {
        const r = seeded(`${e.studentId}${d}`);
        const mark: AttendanceMark =
          r < 0.03 ? 'ABSENT' : r < 0.05 ? 'EXCUSED' : r < 0.1 ? 'LATE' : 'PRESENT';
        return {
          schoolId,
          registerId: register.id,
          studentId: e.studentId,
          termId: term.id,
          date: day(d),
          mark,
          reason: mark === 'EXCUSED' ? 'Hospital appointment' : mark === 'ABSENT' ? 'Unwell' : null,
        };
      }),
    });
  }
}
