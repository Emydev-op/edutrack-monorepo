/**
 * Staff directory details for the demo schools, matching School Admin's mock staff list
 * (`school-admin/src/api/mock/school-db.ts` and the teachers in `academics-db.ts`): branches,
 * start dates, employment, contacts, teaching load caps, qualifications, document metadata, and
 * the School-section staff who have no portal account here. The people themselves (and their
 * accounts) come from `demo-data.ts`; this file only extends them. Idempotent.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  DocumentStatus,
  Employment,
  StaffGroup,
  StaffKind,
} from '../../src/generated/prisma/enums.js';
import { demoUuid } from './platform-data.js';

type Branch = 'Main Campus' | 'Lekki Campus';

interface StaffDetails {
  /** Matches the seeded staff record by email (or staff number for people without one). */
  email?: string;
  staffNumber: string;
  branches: Branch[] | 'all';
  since: string;
  leftOn?: string;
  employment?: Employment;
  maxPeriods?: number;
  /** Subject codes, linked once Academics has those subjects. */
  qualified?: string[];
  documents?: { kind: string; name: string; status: DocumentStatus }[];
  /** Only for people demo-data.ts doesn't create (no portal account here). */
  person?: {
    title: string;
    firstName: string;
    lastName: string;
    phone?: string;
    position: string;
    kind: StaffKind;
    group: StaffGroup;
  };
}

const LETTER = {
  kind: 'Employment letter',
  name: 'employment-letter.pdf',
  status: 'VERIFIED',
} as const;
const GUARANTOR = { kind: 'Guarantor form', name: '', status: 'MISSING' } as const;
const TRCN = {
  kind: 'Teaching certificate (TRCN)',
  name: 'trcn-certificate.pdf',
  status: 'VERIFIED',
} as const;
const OFFICE_DOCS = [LETTER, GUARANTOR];
const TEACHER_DOCS = [LETTER, TRCN, GUARANTOR];

const GREENFIELD: StaffDetails[] = [
  {
    email: 'adaeze.okonkwo@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0001',
    branches: ['Main Campus'],
    since: '2015-01-05',
  },
  {
    email: 'c.eze@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0042',
    branches: ['Main Campus'],
    since: '2016-09-12',
    maxPeriods: 12,
    qualified: ['ENG', 'LIE'],
    documents: TEACHER_DOCS,
  },
  {
    email: 'i.bello@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0061',
    branches: ['Main Campus'],
    since: '2017-09-11',
    maxPeriods: 24,
    qualified: ['PHY', 'BSC'],
    documents: TEACHER_DOCS,
  },
  {
    email: 's.ade@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0117',
    branches: ['Main Campus', 'Lekki Campus'],
    since: '2019-09-09',
    maxPeriods: 28,
    qualified: ['MTH', 'FMT'],
    documents: TEACHER_DOCS,
  },
  {
    email: 'g.okafor@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0098',
    branches: ['Main Campus'],
    since: '2018-09-10',
    maxPeriods: 28,
    qualified: ['ENG', 'LIE'],
    documents: TEACHER_DOCS,
  },
  {
    email: 'r.adeleke@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0081',
    branches: ['Main Campus'],
    since: '2018-09-10',
    maxPeriods: 28,
    qualified: ['BTE', 'CMP'],
    documents: TEACHER_DOCS,
  },
  {
    email: 'y.oladipo@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0066',
    branches: ['Main Campus'],
    since: '2018-01-08',
    maxPeriods: 28,
    qualified: ['BIO', 'AGR'],
    documents: TEACHER_DOCS,
  },
  {
    email: 't.salami@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0131',
    branches: ['Main Campus'],
    since: '2022-09-12',
    maxPeriods: 28,
    documents: TEACHER_DOCS,
  },
  {
    email: 'c.nnamdi@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0133',
    branches: ['Main Campus'],
    since: '2026-09-14',
    maxPeriods: 28,
    documents: [GUARANTOR],
  },
  {
    email: 'f.adebayo@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0058',
    branches: ['Main Campus'],
    since: '2017-09-11',
    leftOn: '2026-07-31',
    maxPeriods: 28,
    documents: TEACHER_DOCS,
  },
  {
    email: 'tunde.ojo@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0019',
    branches: ['Main Campus'],
    since: '2018-09-10',
    leftOn: '2026-07-31',
    maxPeriods: 28,
    qualified: ['CHE'],
    documents: TEACHER_DOCS,
  },
  {
    email: 'kunle.bakare@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0024',
    branches: 'all',
    since: '2017-03-06',
  },
  {
    email: 'kemi.lawal@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0140',
    branches: ['Main Campus'],
    since: '2026-11-02',
    documents: [GUARANTOR],
  },
  {
    email: 'chidi.okoro@greenfield.edu.ng',
    staffNumber: 'GFA-ST-0012',
    branches: 'all',
    since: '2018-09-10',
  },
  // In School Admin's staff list, without a portal account in the demo data.
  {
    staffNumber: 'GFA-ST-0002',
    email: 'f.ogunbiyi@greenfield.edu.ng',
    branches: 'all',
    since: '2009-09-07',
    person: {
      title: 'Dr.',
      firstName: 'Folasade',
      lastName: 'Ogunbiyi',
      phone: '+2348025550120',
      position: 'Proprietor',
      kind: 'NON_TEACHING',
      group: 'ADMINISTRATIVE',
    },
  },
  {
    staffNumber: 'GFA-ST-0062',
    email: 'femi.adebayo@greenfield.edu.ng',
    branches: ['Lekki Campus'],
    since: '2018-09-10',
    person: {
      title: 'Mr.',
      firstName: 'Femi',
      lastName: 'Adebayo',
      phone: '+2348085550162',
      position: 'Head of Campus, Lekki',
      kind: 'NON_TEACHING',
      group: 'ADMINISTRATIVE',
    },
  },
  {
    staffNumber: 'GFA-ST-0071',
    email: 'i.nwachukwu@greenfield.edu.ng',
    branches: ['Main Campus'],
    since: '2019-01-07',
    maxPeriods: 20,
    qualified: ['NUM', 'LIT', 'PHO'],
    documents: TEACHER_DOCS,
    person: {
      title: 'Mrs.',
      firstName: 'Ifeoma',
      lastName: 'Nwachukwu',
      phone: '+2348025550169',
      position: 'Nursery Coordinator',
      kind: 'TEACHING',
      group: 'TEACHING',
    },
  },
  {
    staffNumber: 'GFA-ST-0103',
    email: 'm.yakubu@greenfield.edu.ng',
    branches: ['Main Campus'],
    since: '2019-02-04',
    person: {
      title: 'Mr.',
      firstName: 'Musa',
      lastName: 'Yakubu',
      phone: '+2348065550197',
      position: 'Store Keeper',
      kind: 'NON_TEACHING',
      group: 'OPERATIONS',
    },
  },
  {
    staffNumber: 'GFA-ST-0126',
    branches: ['Main Campus'],
    since: '2021-05-03',
    person: {
      title: 'Mr.',
      firstName: 'Peter',
      lastName: 'Adamu',
      phone: '+2348025550204',
      position: 'Driver',
      kind: 'NON_TEACHING',
      group: 'OPERATIONS',
    },
  },
];

const CRESTVIEW: StaffDetails[] = [
  {
    email: 'e.udo@crestviewcollege.ng',
    staffNumber: 'CCV-ST-0001',
    branches: 'all',
    since: '2026-11-02',
    documents: [],
  },
];

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function seedSchoolStaffData(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
): Promise<void> {
  for (const [key, list, prefix] of [
    ['greenfield', GREENFIELD, 'GFA'],
    ['crestview', CRESTVIEW, 'CCV'],
  ] as const) {
    const schoolId = schoolIds[key]!;
    // The mock's staff ID format; left alone once the school changed it in Settings.
    await prisma.schoolSettings.updateMany({
      where: { schoolId, staffNumberPattern: 'STF-[####]' },
      data: { staffNumberPattern: `${prefix}-ST-[####]` },
    });
    const branches = await prisma.branch.findMany({
      where: { schoolId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    for (const d of list) {
      const ids =
        d.branches === 'all'
          ? branches.map((b) => b.id)
          : branches.filter((b) => (d.branches as string[]).includes(b.name)).map((b) => b.id);
      const title = d.person?.title ?? null;
      const details = {
        allBranches: d.branches === 'all',
        startedOn: day(d.since),
        employment: d.employment ?? ('FULL_TIME' as const),
        maxPeriodsPerWeek: d.maxPeriods ?? 0,
        address: 'Ikeja, Lagos',
        emergencyContactName: 'Spouse · 0803 555 0144',
        ...(d.leftOn
          ? { leftOn: day(d.leftOn), status: 'DEACTIVATED' as const }
          : { leftOn: null }),
      };
      let staff = await prisma.staff.findUnique({
        where: { schoolId_staffNumber: { schoolId, staffNumber: d.staffNumber } },
        select: { id: true, title: true },
      });
      if (!staff && !d.person) continue;
      if (d.person) {
        const p = d.person;
        const person = {
          title: p.title,
          firstName: p.firstName,
          lastName: p.lastName,
          phone: p.phone ?? null,
          email: d.email ?? null,
          positionTitle: p.position,
          kind: p.kind,
          group: p.group,
          status: 'ACTIVE' as const,
          leftOn: null,
        };
        staff = await prisma.staff.upsert({
          where: { schoolId_staffNumber: { schoolId, staffNumber: d.staffNumber } },
          create: { schoolId, staffNumber: d.staffNumber, ...person, ...details },
          update: { ...person, ...details },
          select: { id: true, title: true },
        });
      } else await prisma.staff.update({ where: { id: staff!.id }, data: details });
      const staffId = staff!.id;
      const gender = /^(Mrs|Miss|Ms|Mme)/.test(staff!.title ?? title ?? '')
        ? ('FEMALE' as const)
        : (staff!.title ?? title) === 'Mr.'
          ? ('MALE' as const)
          : null;
      await prisma.staff.update({ where: { id: staffId }, data: { gender } });

      await prisma.staffBranch.deleteMany({ where: { staffId, branchId: { notIn: ids } } });
      for (const branchId of ids)
        await prisma.staffBranch.upsert({
          where: { staffId_branchId: { staffId, branchId } },
          create: { schoolId, staffId, branchId },
          update: {},
        });

      // Qualifications need the school's subjects (seeded with Academics); unknown codes wait.
      const subjects = d.qualified?.length
        ? await prisma.subject.findMany({
            where: { schoolId, code: { in: d.qualified } },
            select: { id: true },
          })
        : [];
      await prisma.staffQualification.deleteMany({
        where: { staffId, subjectId: { notIn: subjects.map((s) => s.id) } },
      });
      for (const s of subjects)
        await prisma.staffQualification.upsert({
          where: { staffId_subjectId: { staffId, subjectId: s.id } },
          create: { schoolId, staffId, subjectId: s.id },
          update: {},
        });

      // Document records as the mock lists them (metadata only: there are no demo files).
      const docs = d.documents ?? OFFICE_DOCS;
      const docIds = docs.map((doc) =>
        demoUuid(`staff-document:${schoolId}:${d.staffNumber}:${doc.kind}`),
      );
      await prisma.staffDocument.deleteMany({ where: { staffId, id: { notIn: docIds } } });
      for (const [i, doc] of docs.entries()) {
        const data = {
          name: doc.name,
          kind: doc.kind,
          status: doc.status,
          fileId: null,
          verifiedAt: doc.status === 'VERIFIED' ? day(d.since) : null,
          verifiedById: null,
          deletedAt: null,
          // A second apart, so the profile lists them in this order.
          createdAt: new Date(day(d.since).getTime() + i * 1000),
          updatedAt: day(d.since),
        };
        await prisma.staffDocument.upsert({
          where: { id: docIds[i]! },
          create: { id: docIds[i]!, schoolId, staffId, ...data },
          update: data,
        });
      }
    }
  }
}

/** Links each seeded teacher to the subjects they're qualified for, once the subjects exist. */
export async function linkStaffQualifications(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
): Promise<void> {
  for (const [key, list] of [
    ['greenfield', GREENFIELD],
    ['crestview', CRESTVIEW],
  ] as const) {
    const schoolId = schoolIds[key]!;
    for (const d of list) {
      if (!d.qualified?.length) continue;
      const staff = await prisma.staff.findUnique({
        where: { schoolId_staffNumber: { schoolId, staffNumber: d.staffNumber } },
      });
      if (!staff) continue;
      const subjects = await prisma.subject.findMany({
        where: { schoolId, code: { in: d.qualified } },
        select: { id: true },
      });
      for (const s of subjects)
        await prisma.staffQualification.upsert({
          where: { staffId_subjectId: { staffId: staff.id, subjectId: s.id } },
          create: { schoolId, staffId: staff.id, subjectId: s.id },
          update: {},
        });
    }
  }
}
