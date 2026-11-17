/**
 * School profile, sections and branches for the School Admin demo schools, matching the School
 * Admin mock (`school-admin/src/api/mock/school-db.ts`): Greenfield Academy is fully set up (three
 * campuses, one inactive, registration details and certificate); Crestview College stays as
 * EduTrack provisioned it. Idempotent: re-running restores the seeded state and removes branches
 * added since (when nothing else points at them).
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { BranchStatus } from '../../src/generated/prisma/enums.js';
import { demoUuid } from './platform-data.js';

const SECTIONS = [
  { name: 'Nursery', code: 'NUR' },
  { name: 'Primary', code: 'PRI' },
  { name: 'Junior Secondary', code: 'JSS' },
  { name: 'Senior Secondary', code: 'SSS' },
] as const;
type SectionName = (typeof SECTIONS)[number]['name'];

interface BranchSeed {
  code: string;
  name: string;
  street: string | null;
  city: string;
  lga: string | null;
  state: string;
  phone: string | null;
  email: string | null;
  /** Staff number of the head of campus (set when that staff record exists). */
  head: string | null;
  sections: SectionName[];
  hasStore: boolean;
  status: BranchStatus;
  isOriginal: boolean;
}

const ALL: SectionName[] = SECTIONS.map((s) => s.name);

const SCHOOLS: Record<
  'greenfield' | 'crestview',
  {
    sections: SectionName[];
    profile?: Record<string, unknown>;
    certificate?: { name: string; sizeBytes: number };
    branches: BranchSeed[];
  }
> = {
  greenfield: {
    sections: ALL,
    profile: {
      ownership: 'PRIVATE',
      foundedYear: 2009,
      website: 'greenfieldacademy.ng',
      street: '14 Adeniyi Jones Avenue',
      lga: 'Ikeja',
      approvingBody: 'Lagos State Ministry of Basic & Secondary Education',
      approvalNumber: 'LSMOE/PS/2009/0418',
      cacNumber: 'RC 1184206',
    },
    certificate: { name: 'approval-certificate.pdf', sizeBytes: 412 * 1024 },
    branches: [
      {
        code: 'GFA-MC',
        name: 'Main Campus',
        street: '14 Adeniyi Jones Ave',
        city: 'Ikeja',
        lga: 'Ikeja',
        state: 'Lagos',
        phone: '+2348035550142',
        email: 'main@greenfieldacademy.ng',
        head: 'GFA-ST-0001',
        sections: ALL,
        hasStore: true,
        status: 'ACTIVE',
        isOriginal: true,
      },
      {
        code: 'GFA-LK',
        name: 'Lekki Campus',
        street: '7 Admiralty Way, Lekki Phase 1',
        city: 'Lekki',
        lga: 'Eti Osa',
        state: 'Lagos',
        phone: '+2348035550150',
        email: 'lekki@greenfieldacademy.ng',
        // Mr. Femi Adebayo, when the staff seed has him.
        head: 'GFA-ST-0062',
        sections: ['Nursery', 'Primary', 'Senior Secondary'],
        hasStore: true,
        status: 'ACTIVE',
        isOriginal: true,
      },
      {
        code: 'GFA-AJ',
        name: 'Ajah Annex',
        street: 'Abraham Adesanya Estate',
        city: 'Ajah',
        lga: 'Eti Osa',
        state: 'Lagos',
        phone: null,
        email: null,
        head: null,
        sections: ['Nursery'],
        hasStore: false,
        status: 'INACTIVE',
        isOriginal: true,
      },
    ],
  },
  // New school: only what provisioning set up (its address is still to be confirmed).
  crestview: {
    sections: ['Junior Secondary', 'Senior Secondary'],
    branches: [
      {
        code: 'CCV-MC',
        name: 'Main Campus',
        street: null,
        city: 'Uyo',
        lga: null,
        state: 'Akwa Ibom',
        phone: null,
        email: null,
        head: 'CCV-ST-0001',
        sections: ['Junior Secondary', 'Senior Secondary'],
        hasStore: true,
        status: 'ACTIVE',
        isOriginal: true,
      },
    ],
  },
};

export async function seedSchoolBranches(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
  now: Date,
) {
  for (const [key, s] of Object.entries(SCHOOLS)) {
    const schoolId = schoolIds[key]!;

    const sectionIds = new Map<string, string>();
    for (const [i, section] of SECTIONS.entries()) {
      if (!s.sections.includes(section.name)) continue;
      const row = await prisma.section.upsert({
        where: { schoolId_name: { schoolId, name: section.name } },
        create: { schoolId, name: section.name, code: section.code, sortOrder: i },
        update: {},
      });
      sectionIds.set(section.name, row.id);
    }

    let certificateFileId: string | null = null;
    if (s.certificate) {
      certificateFileId = demoUuid(`${key}:approval-certificate`);
      const file = {
        schoolId,
        storageKey: `schools/${schoolId}/certificate/${certificateFileId}.pdf`,
        originalName: s.certificate.name,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(s.certificate.sizeBytes),
        sha256: '0'.repeat(64),
        deletedAt: null,
      };
      await prisma.storedFile.upsert({
        where: { id: certificateFileId },
        create: { id: certificateFileId, ...file },
        update: file,
      });
    }
    await prisma.school.update({
      where: { id: schoolId },
      data: { ...s.profile, logoFileId: null, certificateFileId },
    });

    const seeded: string[] = [];
    for (const b of s.branches) {
      const head = b.head
        ? await prisma.staff.findUnique({
            where: { schoolId_staffNumber: { schoolId, staffNumber: b.head } },
            select: { id: true },
          })
        : null;
      const data = {
        name: b.name,
        street: b.street,
        city: b.city,
        lga: b.lga,
        state: b.state,
        phone: b.phone,
        email: b.email,
        headStaffId: head?.id ?? null,
        hasStore: b.hasStore,
        status: b.status,
        isOriginal: b.isOriginal,
        deactivatedAt: b.status === 'INACTIVE' ? now : null,
      };
      const branch = await prisma.branch.upsert({
        where: { schoolId_code: { schoolId, code: b.code } },
        create: { schoolId, code: b.code, ...data },
        update: data,
      });
      seeded.push(branch.id);
      const wanted = b.sections.map((name) => sectionIds.get(name)!);
      await prisma.branchSection.deleteMany({
        where: { branchId: branch.id, sectionId: { notIn: wanted } },
      });
      for (const sectionId of wanted)
        await prisma.branchSection.upsert({
          where: { branchId_sectionId: { branchId: branch.id, sectionId } },
          create: { schoolId, branchId: branch.id, sectionId },
          update: {},
        });
    }

    // Branches added since the last seed (e.g. by tests) go, unless records point at them.
    const extra = await prisma.branch.findMany({
      where: { schoolId, id: { notIn: seeded } },
      select: { id: true },
    });
    for (const { id } of extra) {
      await prisma.membershipBranch.deleteMany({ where: { branchId: id } });
      await prisma.branch.delete({ where: { id } }).catch(() => null);
    }
  }

  // A little history for Greenfield's timelines.
  const greenfield = schoolIds.greenfield!;
  const lekki = await prisma.branch.findUniqueOrThrow({
    where: { schoolId_code: { schoolId: greenfield, code: 'GFA-LK' } },
  });
  const history = [
    {
      key: 'lekki-senior-secondary',
      entityType: 'Branch',
      entityId: lekki.id,
      action: 'branch.update',
      summary: 'Senior Secondary added',
      detail: 'sections',
      createdAt: new Date('2026-08-15T10:00:00Z'),
    },
    {
      key: 'greenfield-registration',
      entityType: 'School',
      entityId: greenfield,
      action: 'profile.update',
      summary: 'Updated school details',
      detail: 'approval number, CAC number, certificate',
      createdAt: new Date('2026-09-02T09:30:00Z'),
    },
  ];
  for (const { key, ...h } of history) {
    const id = demoUuid(`audit:school:${key}`);
    const data = {
      schoolId: greenfield,
      actorKind: 'USER' as const,
      actorName: 'Adaeze Okonkwo',
      area: h.entityType === 'Branch' ? 'Branches' : 'School',
      ...h,
    };
    await prisma.auditEvent.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
}
