/**
 * Academic structure for the demo schools, mirroring School Admin's mock
 * (`school-admin/src/api/mock/academics-db.ts`):
 *
 * - Greenfield Academy is set up: four sections, 2026/2027 active with three terms and their
 *   events (2025/2026 closing, 2024/2025 archived), class levels and arms at Main and Lekki
 *   campuses.
 * - Crestview College is new: only the sections it was provisioned with (Junior and Senior
 *   Secondary at Main Campus), no session, no classes, so its admin meets the first-sign-in setup
 *   wizard.
 *
 * Setup Center step state (`SetupStepState`) comes from `platform-data.ts` (the back office shows
 * the same progress).
 *
 * Idempotent: rows have fixed ids; anything else in these tables for the two schools (made by
 * hand or by tests) is removed, and the seeded rows are put back as they were.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { SessionStatus, TermEventType, TermStatus } from '../../src/generated/prisma/enums.js';
import { demoUuid } from './platform-data.js';

type SchoolKey = 'greenfield' | 'crestview';

const STANDARD_SECTIONS = {
  Nursery: { code: 'NUR', description: 'Early years · ages 2–5' },
  Primary: { code: 'PRI', description: 'Primary 1–6 · ages 6–11' },
  'Junior Secondary': { code: 'JSS', description: 'JSS 1–3 · Basic Education Certificate' },
  'Senior Secondary': { code: 'SSS', description: 'SSS 1–3 · WAEC and NECO' },
} as const;
type SectionName = keyof typeof STANDARD_SECTIONS;

/** branch code → [section, level, arms]. */
const GF_STRUCTURE: Record<string, [SectionName, string, string[]][]> = {
  'GFA-MC': [
    ['Nursery', 'Nursery 1', ['A']],
    ['Nursery', 'Nursery 2', ['A', 'B']],
    ['Primary', 'Primary 1', ['A', 'B']],
    ['Primary', 'Primary 2', ['A', 'B']],
    ['Primary', 'Primary 3', ['A', 'B']],
    ['Primary', 'Primary 4', ['A', 'B']],
    ['Primary', 'Primary 5', ['A', 'B']],
    ['Primary', 'Primary 6', ['A']],
    ['Junior Secondary', 'JSS 1', ['A', 'B', 'C']],
    ['Junior Secondary', 'JSS 2', ['A', 'B']],
    ['Junior Secondary', 'JSS 3', ['A', 'B', 'C']],
    ['Senior Secondary', 'SSS 1', ['A', 'B', 'C']],
    ['Senior Secondary', 'SSS 2', ['A', 'B']],
    ['Senior Secondary', 'SSS 3', ['A', 'B']],
  ],
  'GFA-LK': [
    ['Nursery', 'Nursery 1', ['A']],
    ['Nursery', 'Nursery 2', ['A']],
    ['Primary', 'Primary 1', ['A']],
    ['Primary', 'Primary 2', ['A']],
    ['Primary', 'Primary 3', ['A']],
    ['Primary', 'Primary 4', ['A']],
    ['Primary', 'Primary 5', ['A']],
    ['Primary', 'Primary 6', ['A']],
    ['Senior Secondary', 'SSS 1', ['A']],
    ['Senior Secondary', 'SSS 2', ['A']],
    ['Senior Secondary', 'SSS 3', ['A']],
  ],
};

const ROOMS: Record<string, string> = {
  'JSS 2B': 'Room J2B · Block C',
  'SSS 1A': 'Science Block S1',
};

type EventSeed = [TermEventType, string, string, string];
interface TermSeed {
  name: string;
  start: string;
  end: string;
  status: TermStatus;
  /** When result entry closes (a Lagos-time instant), if the school has set it. */
  resultEntryCloses?: string;
  events: EventSeed[];
}
interface SessionSeed {
  name: string;
  start: string;
  end: string;
  status: SessionStatus;
  note: string;
  closedAt?: string;
  terms: TermSeed[];
}

const closedTerm = (name: string, start: string, end: string): TermSeed => ({
  name,
  start,
  end,
  status: 'CLOSED',
  events: [],
});

const GF_SESSIONS: SessionSeed[] = [
  {
    name: '2026/2027',
    start: '2026-09-14',
    end: '2027-07-23',
    status: 'ACTIVE',
    note: 'Copied from 2025/2026',
    terms: [
      {
        name: 'First Term',
        start: '2026-09-14',
        end: '2026-12-18',
        status: 'ACTIVE',
        // Fri 11 Dec, 23:59 in Lagos.
        resultEntryCloses: '2026-12-11T22:59:00.000Z',
        events: [
          ['RESUMPTION', 'Resumption', '2026-09-14', '2026-09-14'],
          ['PTA', 'PTA meeting', '2026-09-26', '2026-09-26'],
          ['CA', 'CA week', '2026-10-12', '2026-10-16'],
          ['MIDTERM', 'Mid-term break', '2026-10-29', '2026-11-02'],
          ['EXAMS', 'Examinations', '2026-11-24', '2026-12-05'],
          ['RESULTS', 'Results publication', '2026-12-14', '2026-12-14'],
        ],
      },
      {
        name: 'Second Term',
        start: '2027-01-12',
        end: '2027-04-02',
        status: 'UPCOMING',
        events: [
          ['RESUMPTION', 'Resumption', '2027-01-12', '2027-01-12'],
          ['MIDTERM', 'Mid-term break', '2027-02-18', '2027-02-22'],
          ['EXAMS', 'Examinations', '2027-03-15', '2027-03-26'],
        ],
      },
      {
        name: 'Third Term',
        start: '2027-04-26',
        end: '2027-07-23',
        status: 'UPCOMING',
        events: [
          ['RESUMPTION', 'Resumption', '2027-04-26', '2027-04-26'],
          ['EXAMS', 'Promotion examinations', '2027-07-05', '2027-07-16'],
        ],
      },
    ],
  },
  {
    name: '2025/2026',
    start: '2025-09-08',
    end: '2026-07-24',
    status: 'CLOSING',
    note: 'Copied from 2024/2025',
    terms: [
      closedTerm('First Term', '2025-09-08', '2025-12-12'),
      closedTerm('Second Term', '2026-01-06', '2026-03-27'),
      closedTerm('Third Term', '2026-04-20', '2026-07-24'),
    ],
  },
  {
    name: '2024/2025',
    start: '2024-09-09',
    end: '2025-07-25',
    status: 'ARCHIVED',
    note: '',
    closedAt: '2025-08-08',
    terms: [
      closedTerm('First Term', '2024-09-09', '2024-12-13'),
      closedTerm('Second Term', '2025-01-07', '2025-03-28'),
      closedTerm('Third Term', '2025-04-22', '2025-07-25'),
    ],
  },
];

interface SchoolPlan {
  sections: SectionName[];
  /** branch code → section names it runs. */
  branchSections: Record<string, SectionName[]>;
  structure: Record<string, [SectionName, string, string[]][]>;
  sessions: SessionSeed[];
}

const PLANS: Record<SchoolKey, SchoolPlan> = {
  greenfield: {
    sections: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'],
    branchSections: {
      'GFA-MC': ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'],
      'GFA-LK': ['Nursery', 'Primary', 'Senior Secondary'],
      // Inactive annex: offers Nursery (as the branches seed and the mock have it), no classes yet.
      'GFA-AJ': ['Nursery'],
    },
    structure: GF_STRUCTURE,
    sessions: GF_SESSIONS,
  },
  crestview: {
    sections: ['Junior Secondary', 'Senior Secondary'],
    branchSections: { 'CCV-MC': ['Junior Secondary', 'Senior Secondary'] },
    structure: {},
    sessions: [],
  },
};

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const armLabel = (level: string, arm: string) => `${level}${/\d$/.test(level) ? '' : ' '}${arm}`;

export async function seedSchoolAcademics(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
): Promise<void> {
  for (const [key, plan] of Object.entries(PLANS) as [SchoolKey, SchoolPlan][]) {
    const schoolId = schoolIds[key]!;
    const id = (name: string) => demoUuid(`${key}:academics:${name}`);
    const branches = await prisma.branch.findMany({ where: { schoolId } });
    const branchId = (code: string) => branches.find((b) => b.code === code)!.id;

    /* ---------- What should exist ---------- */

    // Sections are matched by name: the branches seed upserts the same ones (same names and
    // codes), so either seed can run first. Codes are parked first so a swap can't collide.
    for (const row of await prisma.section.findMany({ where: { schoolId } }))
      await prisma.section.update({
        where: { id: row.id },
        data: { code: `~${row.id.slice(-8)}` },
      });
    const sections: { id: string; name: SectionName }[] = [];
    for (const [i, name] of plan.sections.entries()) {
      const data = { ...STANDARD_SECTIONS[name], sortOrder: i };
      const row = await prisma.section.upsert({
        where: { schoolId_name: { schoolId, name } },
        create: { schoolId, name, ...data },
        update: data,
      });
      sections.push({ id: row.id, name });
    }
    const sectionId = (name: SectionName) => sections.find((s) => s.name === name)!.id;
    const branchSections = Object.entries(plan.branchSections).flatMap(([code, names]) =>
      names.map((n) => ({ branchId: branchId(code), sectionId: sectionId(n) })),
    );

    const levelNames: { name: string; section: SectionName }[] = [];
    for (const rows of Object.values(plan.structure))
      for (const [section, name] of rows)
        if (!levelNames.some((l) => l.name === name)) levelNames.push({ name, section });
    const levels = levelNames.map((l) => ({
      id: id(`level:${l.name}`),
      name: l.name,
      sectionId: sectionId(l.section),
      sortOrder: levelNames.filter((x) => x.section === l.section).indexOf(l),
    }));
    const levelId = (name: string) => levels.find((l) => l.name === name)!.id;
    const branchLevels = Object.entries(plan.structure).flatMap(([code, rows]) =>
      rows.map(([, name]) => ({ branchId: branchId(code), levelId: levelId(name) })),
    );
    const arms = Object.entries(plan.structure).flatMap(([code, rows]) =>
      rows.flatMap(([section, name, letters]) =>
        letters.map((arm) => {
          const label = armLabel(name, arm);
          return {
            id: id(`arm:${code}:${label}`),
            branchId: branchId(code),
            levelId: levelId(name),
            name: arm,
            capacity: section === 'Nursery' ? 25 : 35,
            room: code.endsWith('-MC') ? (ROOMS[label] ?? null) : null,
          };
        }),
      ),
    );

    const sessions = plan.sessions.map((s) => ({ ...s, id: id(`session:${s.name}`) }));
    const terms = sessions.flatMap((s) =>
      s.terms.map((t, i) => ({
        ...t,
        id: id(`term:${s.name}:${t.name}`),
        sessionId: s.id,
        sequence: i + 1,
      })),
    );
    const events = terms.flatMap((t) =>
      t.events.map(([type, name, start, end], i) => ({
        id: id(`event:${t.id}:${i}`),
        termId: t.id,
        type,
        name,
        start,
        end,
      })),
    );

    /* ---------- Remove everything else ---------- */

    const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);
    // Results hang off terms, arms and teacher assignments: tests make their own, so they go
    // first (the planning seed rebuilds the assignments).
    await prisma.reportCard.deleteMany({ where: { schoolId } });
    await prisma.resultPublication.deleteMany({ where: { schoolId } });
    await prisma.scoreCorrection.deleteMany({ where: { schoolId } });
    await prisma.resultSheetReminder.deleteMany({ where: { schoolId } });
    await prisma.resultEntry.deleteMany({ where: { schoolId } });
    await prisma.resultSheetEvent.deleteMany({ where: { schoolId } });
    await prisma.resultSheet.deleteMany({ where: { schoolId } });
    await prisma.classTeacherAssignment.deleteMany({ where: { schoolId } });
    await prisma.classArm.deleteMany({ where: { schoolId, id: { notIn: ids(arms) } } });
    await prisma.branchLevel.deleteMany({
      where: {
        schoolId,
        NOT: { OR: branchLevels.map((bl) => ({ branchId: bl.branchId, levelId: bl.levelId })) },
      },
    });
    await prisma.classLevel.updateMany({ where: { schoolId }, data: { nextLevelId: null } });
    await prisma.classLevel.deleteMany({ where: { schoolId, id: { notIn: ids(levels) } } });
    await prisma.termEvent.deleteMany({ where: { schoolId, id: { notIn: ids(events) } } });
    await prisma.academicSession.updateMany({ where: { schoolId }, data: { copiedFromId: null } });
    await prisma.term.deleteMany({ where: { schoolId, id: { notIn: ids(terms) } } });
    await prisma.academicSession.deleteMany({ where: { schoolId, id: { notIn: ids(sessions) } } });

    // Park the seeded rows that remain, so restoring names and statuses can't collide.
    await prisma.term.updateMany({ where: { schoolId }, data: { status: 'UPCOMING' } });
    await prisma.academicSession.updateMany({ where: { schoolId }, data: { status: 'UPCOMING' } });
    for (const l of await prisma.classLevel.findMany({ where: { schoolId } }))
      await prisma.classLevel.update({ where: { id: l.id }, data: { name: `~${l.id}` } });
    for (const a of await prisma.classArm.findMany({ where: { schoolId } }))
      await prisma.classArm.update({ where: { id: a.id }, data: { name: `~${a.id}` } });
    for (const t of await prisma.term.findMany({ where: { schoolId } }))
      await prisma.term.update({
        where: { id: t.id },
        data: { name: `~${t.id}`, sequence: t.sequence + 1000 },
      });
    for (const s of await prisma.academicSession.findMany({ where: { schoolId } }))
      await prisma.academicSession.update({ where: { id: s.id }, data: { name: `~${s.id}` } });

    /* ---------- Put the seeded rows back ---------- */

    for (const bs of branchSections)
      await prisma.branchSection.upsert({
        where: { branchId_sectionId: { branchId: bs.branchId, sectionId: bs.sectionId } },
        create: { schoolId, ...bs },
        update: {},
      });
    for (const l of levels) {
      const data = {
        name: l.name,
        sectionId: l.sectionId,
        sortOrder: l.sortOrder,
        nextLevelId: null,
      };
      await prisma.classLevel.upsert({
        where: { id: l.id },
        create: { id: l.id, schoolId, ...data },
        update: data,
      });
    }
    // Anything else in Sections goes once no seeded level points at it.
    await prisma.branchSection.deleteMany({
      where: {
        schoolId,
        NOT: {
          OR: branchSections.map((bs) => ({ branchId: bs.branchId, sectionId: bs.sectionId })),
        },
      },
    });
    await prisma.section.deleteMany({ where: { schoolId, id: { notIn: ids(sections) } } });
    for (const bl of branchLevels)
      await prisma.branchLevel.upsert({
        where: { branchId_levelId: { branchId: bl.branchId, levelId: bl.levelId } },
        create: { schoolId, ...bl },
        update: {},
      });
    for (const a of arms) {
      const data = {
        branchId: a.branchId,
        levelId: a.levelId,
        name: a.name,
        capacity: a.capacity,
        room: a.room,
        archivedAt: null,
      };
      await prisma.classArm.upsert({
        where: { id: a.id },
        create: { id: a.id, schoolId, ...data },
        update: data,
      });
    }
    // Statuses last (one active session and term per school), active ones after the rest.
    const byActive = <T extends { status: string }>(rows: T[]) =>
      [...rows].sort((a, b) => Number(a.status === 'ACTIVE') - Number(b.status === 'ACTIVE'));
    for (const s of byActive(sessions)) {
      const data = {
        name: s.name,
        startsOn: day(s.start),
        endsOn: day(s.end),
        status: s.status,
        structure: 'THREE_TERMS' as const,
        note: s.note || null,
        copiedFromId: null,
        closedAt: s.closedAt ? day(s.closedAt) : null,
      };
      await prisma.academicSession.upsert({
        where: { id: s.id },
        create: { id: s.id, schoolId, ...data },
        update: data,
      });
    }
    for (const t of byActive(terms)) {
      const data = {
        sessionId: t.sessionId,
        name: t.name,
        sequence: t.sequence,
        startsOn: day(t.start),
        endsOn: day(t.end),
        status: t.status,
        closedAt: t.status === 'CLOSED' ? day(t.end) : null,
        resultEntryClosesAt: t.resultEntryCloses ? new Date(t.resultEntryCloses) : null,
      };
      await prisma.term.upsert({
        where: { id: t.id },
        create: { id: t.id, schoolId, ...data },
        update: data,
      });
    }
    for (const e of events) {
      const data = {
        termId: e.termId,
        type: e.type,
        name: e.name,
        startsOn: day(e.start),
        endsOn: day(e.end),
        closesSchool: e.type === 'MIDTERM',
      };
      await prisma.termEvent.upsert({
        where: { id: e.id },
        create: { id: e.id, schoolId, ...data },
        update: data,
      });
    }
  }
}
