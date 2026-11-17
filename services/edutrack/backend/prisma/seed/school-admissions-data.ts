/**
 * Admission applications for the demo schools, mirroring School Admin's mock
 * (`school-admin/src/api/mock/students-db.ts`, APPLICATIONS): Greenfield Academy has five
 * applications for 2026/2027 in every stage; Crestview College has none.
 *
 * Runs after the academics seed (it needs the sessions, levels and branches). Applications don't
 * point at seeded students. Idempotent: rows have fixed ids; any other application of the two
 * schools (made by tests or by hand) is removed, and the seeded ones are put back as they were,
 * not yet admitted.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { AdmissionType, ApplicationStage } from '../../src/generated/prisma/enums.js';
import { demoUuid } from './platform-data.js';

interface ApplicationSeed {
  key: string;
  firstName: string;
  surname: string;
  note: string;
  level: string;
  branch: string;
  type: AdmissionType;
  applied: string;
  guardian: string;
  stage: ApplicationStage;
  stageNote: string;
}

const SESSION = '2026/2027';

const GREENFIELD: ApplicationSeed[] = [
  {
    key: 'kamsi',
    firstName: 'Kamsi',
    surname: 'Nwosu',
    note: 'Sister of David Nwosu (JSS 2B)',
    level: 'JSS 1',
    branch: 'Main Campus',
    type: 'TRANSFER_IN',
    applied: '2026-11-28',
    guardian: 'Mr. Obinna Nwosu',
    stage: 'OFFER_ACCEPTED',
    stageNote: '',
  },
  {
    key: 'toluwani',
    firstName: 'Toluwani',
    surname: 'Ajayi',
    note: '',
    level: 'Nursery 1',
    branch: 'Lekki Campus',
    type: 'NEW_INTAKE',
    applied: '2026-12-02',
    guardian: 'Mrs. Bimpe Ajayi',
    stage: 'PENDING',
    stageNote: 'Assessment 10 Dec',
  },
  {
    key: 'ifeanyi',
    firstName: 'Ifeanyi',
    surname: 'Okonkwo',
    note: '',
    level: 'SSS 1',
    branch: 'Main Campus',
    type: 'TRANSFER_IN',
    applied: '2026-12-01',
    guardian: 'Mr. Chuka Okonkwo',
    stage: 'UNDER_REVIEW',
    stageNote: 'Awaiting transcript',
  },
  {
    key: 'zainab',
    firstName: 'Zainab',
    surname: 'Bello',
    note: '',
    level: 'Primary 1',
    branch: 'Main Campus',
    type: 'NEW_INTAKE',
    applied: '2026-11-30',
    guardian: 'Hajia Fatima Bello',
    stage: 'PENDING',
    stageNote: 'Interview 11 Dec',
  },
  {
    key: 'oghenekaro',
    firstName: 'Oghenekaro',
    surname: 'Edewor',
    note: '',
    level: 'JSS 1',
    branch: 'Main Campus',
    type: 'NEW_INTAKE',
    applied: '2026-11-26',
    guardian: 'Mrs. Ruth Edewor',
    stage: 'REJECTED',
    stageNote: 'No space in JSS 1 for Second Term',
  },
];

const PLANS: Record<string, ApplicationSeed[]> = { greenfield: GREENFIELD, crestview: [] };

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function seedSchoolAdmissions(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
): Promise<void> {
  for (const [key, seeds] of Object.entries(PLANS)) {
    const schoolId = schoolIds[key]!;
    const ids = seeds.map((s) => demoUuid(`${key}:admissions:${s.key}`));
    await prisma.admissionApplication.deleteMany({ where: { schoolId, id: { notIn: ids } } });
    if (!seeds.length) continue;

    const [session, levels, branches] = await Promise.all([
      prisma.academicSession.findUniqueOrThrow({
        where: { schoolId_name: { schoolId, name: SESSION } },
        select: { id: true },
      }),
      prisma.classLevel.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      prisma.branch.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ]);
    // Numbers are parked first so re-numbering can't collide.
    for (const id of ids)
      await prisma.admissionApplication.updateMany({ where: { id }, data: { number: `~${id}` } });
    for (const [i, s] of seeds.entries()) {
      const data = {
        number: `APP-2026-${String(i + 1).padStart(4, '0')}`,
        sessionId: session.id,
        branchId: branches.find((b) => b.name === s.branch)!.id,
        applyingForLevelId: levels.find((l) => l.name === s.level)!.id,
        type: s.type,
        firstName: s.firstName,
        surname: s.surname,
        otherNames: null,
        gender: null,
        dateOfBirth: null,
        note: s.note || null,
        guardianName: s.guardian,
        guardianPhone: null,
        guardianEmail: null,
        appliedOn: day(s.applied),
        stage: s.stage,
        stageNote: s.stageNote || null,
        studentId: null,
      };
      await prisma.admissionApplication.upsert({
        where: { id: ids[i]! },
        create: { id: ids[i]!, schoolId, ...data },
        update: data,
      });
    }
  }
}
