/**
 * Students and guardians for the demo schools, mirroring School Admin's mock
 * (`school-admin/src/api/mock/students-db.ts`):
 *
 * - Greenfield Academy: the JSS 2B roster and students in other classes at Main Campus, enrolled
 *   in the seeded 2026/2027 arms (Emmanuel Adeyemi also has his 2025/2026 JSS 1B year); four
 *   admitted for 2026/2027 and awaiting an arm; leavers (Grace Akpan transferred, Ahmed Sani
 *   withdrawn, and one 2025/2026 graduate the mock doesn't have); their guardians with the
 *   primary contact, relationship and fee payer per child (Mr. Tayo Adeyemi as a second guardian,
 *   and the mock's duplicate "Ngozi Eze" record for the merge demo); document metadata.
 * - Crestview College: none (it's new).
 *
 * No portal accounts or memberships: guardian and student sign-ins are seeded elsewhere.
 *
 * Ids are stable: `demoUuid('greenfield:student:<admissionNo>')`, `…:guardian:<mock id>`,
 * `…:enrollment:<admissionNo>:<session>`, `…:student-guardian:<admissionNo>:<guardian>`,
 * `…:student-document:<admissionNo>:<key>`. Idempotent: students and guardians added since the
 * last seed (by tests or by hand) are removed with their enrollments, links and documents, and
 * the seeded rows are put back as they were. Runs after `seedSchoolAcademics` (it needs the arms).
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  DocumentStatus,
  EnrollmentStatus,
  PromotionOutcome,
  StudentExitKind,
  StudentStatus,
} from '../../src/generated/prisma/enums.js';
import { demoUuid } from './platform-data.js';

type SchoolKey = 'greenfield' | 'crestview';

type Seed = [
  key: string,
  name: string,
  admissionNo: string,
  gender: 'M' | 'F',
  level: string,
  arm: string | null,
  guardian: string,
  status?: StudentStatus,
];

/** The mock's SEEDS (balance aside: fees come from Finance), plus one graduate. */
const SEEDS: Seed[] = [
  ['emmanuel', 'Emmanuel Adeyemi', 'STU-2025-0042', 'M', 'JSS 2', 'B', 'Mrs. Funke Adeyemi'],
  ['favour', 'Favour Okeke', 'STU-2025-0047', 'F', 'JSS 2', 'B', 'Mr. Chukwudi Okeke'],
  ['chiamaka', 'Chiamaka Eze', 'STU-2025-0051', 'F', 'JSS 2', 'B', 'Mrs. Ngozi Eze'],
  ['daniel', 'Daniel Musa', 'STU-2025-0055', 'M', 'JSS 2', 'B', 'Alhaji Usman Musa'],
  ['sarah', 'Sarah Ibrahim', 'STU-2025-0058', 'F', 'JSS 2', 'B', 'Mrs. Hauwa Ibrahim'],
  ['david', 'David Nwosu', 'STU-2025-0063', 'M', 'JSS 2', 'B', 'Mr. Obinna Nwosu'],
  ['tolulope', 'Tolulope Bankole', 'STU-2025-0066', 'F', 'JSS 2', 'B', 'Mrs. Bisi Bankole'],
  ['ibrahim', 'Ibrahim Danjuma', 'STU-2025-0070', 'M', 'JSS 2', 'B', 'Mr. Ahmed Danjuma'],
  ['blessing', 'Blessing Etim', 'STU-2025-0074', 'F', 'JSS 2', 'B', 'Mrs. Grace Etim'],
  ['kelechi', 'Kelechi Obi', 'STU-2025-0079', 'M', 'JSS 2', 'B', 'Mr. Emeka Obi'],
  ['aisha', 'Aisha Lawal', 'STU-2026-1201', 'F', 'JSS 2', 'B', '', 'INCOMPLETE_PROFILE'],
  ['samuel', 'Samuel Olatunji', 'STU-2025-0083', 'M', 'JSS 2', 'B', 'Mrs. Ronke Olatunji'],
  ['precious', 'Precious Udoh', 'STU-2025-0088', 'F', 'JSS 2', 'B', 'Mr. Effiong Udoh'],
  ['yusuf', 'Yusuf Abdullahi', 'STU-2025-0091', 'M', 'JSS 2', 'B', 'Mallam Bashir Abdullahi'],
  ['michael', 'Michael Adeyemi', 'STU-2023-0311', 'M', 'Primary 5', 'B', 'Mrs. Funke Adeyemi'],
  ['seun', 'Oluwaseun Afolabi', 'STU-2021-0140', 'M', 'SSS 3', 'B', 'Mr. Kayode Afolabi'],
  ['halima', 'Halima Garba', 'STU-2023-0412', 'F', 'SSS 1', 'A', 'Mrs. Zainab Garba'],
  ['chinedu', 'Chinedu Obiora', 'STU-2026-1144', 'M', 'JSS 1', 'A', 'Mrs. Amaka Obiora'],
  ['amarachi', 'Amarachi Nnaji', 'STU-2024-0520', 'F', 'Primary 3', 'A', 'Mr. Ikenna Nnaji'],
  ['tobi', 'Tobi Adesanya', 'STU-2025-0702', 'M', 'Nursery 2', 'A', 'Mrs. Lola Adesanya'],
  ['grace', 'Grace Akpan', 'STU-2022-0233', 'F', 'SSS 1', 'A', 'Mr. Udeme Akpan', 'TRANSFERRED'],
  ['ahmed', 'Ahmed Sani', 'STU-2020-0098', 'M', 'SSS 3', 'B', 'Alhaji Sani Bello', 'WITHDRAWN'],
  // Admitted for 2026/2027 and not yet placed in an arm.
  ['ruth', 'Ruth Alabi', 'STU-2026-1240', 'F', 'JSS 1', null, 'Mr. Segun Alabi'],
  ['tunde', 'Tunde Bakare', 'STU-2026-1241', 'M', 'JSS 1', null, 'Mrs. Yemi Bakare'],
  ['ngozi', 'Ngozi Ike', 'STU-2026-1242', 'F', 'JSS 1', null, 'Mrs. Ada Ike'],
  ['bola', 'Bola Tinubu-Ade', 'STU-2026-1243', 'M', 'JSS 1', null, 'Mr. Kola Ade'],
  // Not in the mock: a 2025/2026 graduate, so the leavers rules have each exit kind.
  [
    'ifeoluwa',
    'Ifeoluwa Ogunleye',
    'STU-2020-0101',
    'F',
    'SSS 3',
    'A',
    'Mrs. Bukola Ogunleye',
    'GRADUATED',
  ],
];

const STATE = ['Oyo', 'Anambra', 'Enugu', 'Kaduna', 'Kano', 'Lagos', 'Ogun', 'Rivers'];
const TITLE = /^(Mrs|Mr|Alhaji|Mallam|Hajia|Ms)\.?\s+/;

const PHONES = (i: number) =>
  `+23480${(i % 7) + 2}55501${String(10 + ((i * 7) % 90)).padStart(2, '0')}`;

interface GuardianSeed {
  key: string;
  title: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  address: string | null;
  occupation: string | null;
  /** student key → link. */
  children: Record<string, { relationship: string; paysFees: boolean; primary: boolean }>;
}

/** The mock's `greenfieldGuardians()`, with the title split from the name. */
function greenfieldGuardians(): GuardianSeed[] {
  const byName = new Map<string, GuardianSeed>();
  SEEDS.forEach(([sid, , , , , , gname], i) => {
    if (!gname) return;
    const relationship = /^(Mrs|Hajia|Ms)\b/.test(gname) ? 'Mother' : 'Father';
    const existing = byName.get(gname);
    if (existing) {
      existing.children[sid] = { relationship, paysFees: true, primary: true };
      return;
    }
    const key = gname
      .replace(TITLE, '')
      .toLowerCase()
      .replace(/[^a-z]+/g, '-');
    const title = TITLE.exec(gname)?.[1] ?? null;
    byName.set(gname, {
      key,
      title: title && ['Mrs', 'Mr', 'Ms'].includes(title) ? `${title}.` : title,
      fullName: gname.replace(TITLE, ''),
      phone: PHONES(i),
      email: `${key.replace(/-/g, '.')}@gmail.com`,
      address: null,
      occupation: null,
      children: { [sid]: { relationship, paysFees: true, primary: true } },
    });
  });
  Object.assign(byName.get('Mrs. Funke Adeyemi')!, {
    key: 'funke',
    phone: '+2348035550161',
    email: 'funke.adeyemi@gmail.com',
    address: '22 Opebi Road, Ikeja',
    occupation: 'Pharmacist',
  });
  Object.assign(byName.get('Mr. Obinna Nwosu')!, {
    key: 'obinna',
    phone: '+2348065550193',
    address: '9 Allen Avenue, Ikeja',
  });
  Object.assign(byName.get('Mrs. Ngozi Eze')!, {
    key: 'ngozi-eze',
    phone: '+2348035550172',
    email: 'ngozi.eze@yahoo.com',
  });
  return [
    ...byName.values(),
    {
      key: 'tayo',
      title: 'Mr.',
      fullName: 'Tayo Adeyemi',
      phone: '+2348025550188',
      email: null,
      address: '22 Opebi Road, Ikeja',
      occupation: 'Engineer',
      children: { emmanuel: { relationship: 'Father', paysFees: false, primary: false } },
    },
    // A second record for the same person, entered without an email: the design's merge case.
    {
      key: 'ngozi-eze-2',
      title: null,
      fullName: 'Ngozi Eze',
      phone: '+2348035550172',
      email: null,
      address: null,
      occupation: null,
      children: { chiamaka: { relationship: 'Mother', paysFees: false, primary: false } },
    },
  ];
}

interface EnrollmentSeed {
  session: string;
  level: string;
  arm: string | null;
  status: EnrollmentStatus;
  enrolledOn: string;
  leftOn?: string;
  outcome?: PromotionOutcome;
}

interface ExitSeed {
  kind: StudentExitKind | null;
  on: string;
  reason: string | null;
  destination: string | null;
}

const EXITS: Partial<Record<StudentStatus, ExitSeed>> = {
  TRANSFERRED: {
    kind: 'TRANSFER',
    on: '2026-11-14',
    reason: 'Change of school',
    destination: 'Loyola Jesuit College',
  },
  WITHDRAWN: {
    kind: 'WITHDRAWAL',
    on: '2026-07-30',
    reason: 'Family relocation',
    destination: null,
  },
  GRADUATED: { kind: null, on: '2026-07-24', reason: null, destination: null },
};

const SESSION_START: Record<string, string> = {
  '2025/2026': '2025-09-08',
  '2026/2027': '2026-09-14',
};

/** A student's sessions: this one (or last one for 2025/2026 leavers), plus Emmanuel's JSS 1B. */
function enrollmentsOf([key, , , , level, arm, , status]: Seed): EnrollmentSeed[] {
  if (status === 'WITHDRAWN' || status === 'GRADUATED')
    return [
      {
        session: '2025/2026',
        level,
        arm,
        status: status === 'GRADUATED' ? 'COMPLETED' : 'LEFT',
        enrolledOn: SESSION_START['2025/2026']!,
        leftOn: EXITS[status]!.on,
        outcome: status === 'GRADUATED' ? 'GRADUATE' : 'WITHDRAW',
      },
    ];
  const current: EnrollmentSeed = {
    session: '2026/2027',
    level,
    arm,
    status: status === 'TRANSFERRED' ? 'LEFT' : 'ACTIVE',
    enrolledOn: arm ? SESSION_START['2026/2027']! : '2026-11-09',
    ...(status === 'TRANSFERRED' && { leftOn: EXITS.TRANSFERRED!.on }),
  };
  return key === 'emmanuel'
    ? [
        current,
        {
          session: '2025/2026',
          level: 'JSS 1',
          arm: 'B',
          status: 'COMPLETED',
          enrolledOn: '2025-09-05',
          outcome: 'PROMOTE',
        },
      ]
    : [current];
}

/** Documents on file (the rest show as missing). No files: metadata only. */
const DOCUMENTS: Record<
  string,
  [key: string, label: string, status: DocumentStatus, on: string][]
> = {
  emmanuel: [
    ['birth_certificate', 'Birth certificate', 'VERIFIED', '2025-09-05'],
    ['passport_photo', 'Passport photograph', 'VERIFIED', '2025-09-05'],
    ['previous_school_report', 'Previous school report', 'VERIFIED', '2025-09-05'],
  ],
  aisha: [['birth_certificate', 'Birth certificate', 'PENDING', '2026-09-14']],
  ruth: [['birth_certificate', 'Birth certificate', 'VERIFIED', '2026-11-09']],
  grace: [['transfer_letter', 'Transfer letter', 'VERIFIED', '2026-11-14']],
};

/** Emmanuel's timeline from the mock; everyone else gets their enrollment line. */
const EMMANUEL_HISTORY: [string, string, string | null, string][] = [
  ['student.admit', 'Admitted to JSS 1B', null, '2025-09-05T09:00:00Z'],
  [
    'guardian.invite',
    'Guardian invited: Mrs. Funke Adeyemi',
    'Invitation accepted 6 Sep 2025',
    '2025-09-05T09:05:00Z',
  ],
  [
    'student.subjects',
    'Subject enrollment changed',
    'Elective: Music → French · approved by Mrs. Chioma Eze',
    '2025-09-20T10:00:00Z',
  ],
  ['result.publish', 'Result published · Third Term', '2025/2026 · 72.3%', '2026-07-22T12:00:00Z'],
  [
    'student.promote',
    'Promoted to JSS 2',
    'Enrolled in 2026/2027 · JSS 2B',
    '2026-07-31T12:00:00Z',
  ],
];

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const armLabel = (level: string, arm: string) => `${level}${/\d$/.test(level) ? '' : ' '}${arm}`;

export async function seedSchoolStudents(
  prisma: PrismaClient,
  schoolIds: Record<string, string>,
): Promise<void> {
  for (const key of ['greenfield', 'crestview'] as SchoolKey[]) {
    const schoolId = schoolIds[key]!;
    const seeds = key === 'greenfield' ? SEEDS : [];
    const guardians = key === 'greenfield' ? greenfieldGuardians() : [];
    const id = (name: string) => demoUuid(`${key}:${name}`);
    const studentId = (admissionNo: string) => id(`student:${admissionNo}`);
    const byKey = new Map(seeds.map((s) => [s[0], s]));

    const studentIds = seeds.map((s) => studentId(s[2]));
    const guardianIds = guardians.map((g) => id(`guardian:${g.key}`));

    /* ---------- Remove what isn't seeded ---------- */

    const extraStudents = (
      await prisma.student.findMany({
        where: { schoolId, id: { notIn: studentIds } },
        select: { id: true },
      })
    ).map((s) => s.id);
    const extraGuardians = (
      await prisma.guardian.findMany({
        where: { schoolId, id: { notIn: guardianIds } },
        select: { id: true },
      })
    ).map((g) => g.id);
    const extraMemberships = (
      await prisma.schoolMembership.findMany({
        where: {
          schoolId,
          OR: [{ studentId: { in: extraStudents } }, { guardianId: { in: extraGuardians } }],
        },
        select: { id: true },
      })
    ).map((m) => m.id);
    await prisma.invitation.deleteMany({ where: { membershipId: { in: extraMemberships } } });
    await prisma.membershipRole.deleteMany({ where: { membershipId: { in: extraMemberships } } });
    await prisma.membershipBranch.deleteMany({ where: { membershipId: { in: extraMemberships } } });
    await prisma.schoolMembership.deleteMany({ where: { id: { in: extraMemberships } } });
    await prisma.admissionApplication.updateMany({
      where: { schoolId, studentId: { in: extraStudents } },
      data: { studentId: null },
    });
    await prisma.studentGuardian.deleteMany({
      where: {
        schoolId,
        OR: [{ studentId: { in: extraStudents } }, { guardianId: { in: extraGuardians } }],
      },
    });
    await prisma.studentDocument.deleteMany({
      where: { schoolId, studentId: { in: extraStudents } },
    });
    await prisma.enrollment.deleteMany({ where: { schoolId, studentId: { in: extraStudents } } });
    await prisma.student.deleteMany({ where: { id: { in: extraStudents } } });
    await prisma.guardian.updateMany({
      where: { schoolId, mergedIntoId: { not: null } },
      data: { mergedIntoId: null },
    });
    await prisma.guardian.deleteMany({ where: { id: { in: extraGuardians } } });
    if (!seeds.length) continue;

    /* ---------- Look-ups ---------- */

    const branch = await prisma.branch.findUniqueOrThrow({
      where: { schoolId_code: { schoolId, code: 'GFA-MC' } },
    });
    const sessionId = (name: string) => demoUuid(`${key}:academics:session:${name}`);
    const levelId = (name: string) => demoUuid(`${key}:academics:level:${name}`);
    const armId = (level: string, arm: string) =>
      demoUuid(`${key}:academics:arm:GFA-MC:${armLabel(level, arm)}`);

    /* ---------- Guardians ---------- */

    for (const [i, g] of guardians.entries()) {
      const data = {
        title: g.title,
        fullName: g.fullName,
        phone: g.phone,
        email: g.email,
        address: g.address,
        occupation: g.occupation,
        contactConsentAt: day('2025-09-05'),
        contactConsentSource: 'admission_form',
        smsFeeRemindersOptedOutAt: null,
        emailOptedOutAt: null,
        mergedIntoId: null,
        deletedAt: null,
      };
      await prisma.guardian.upsert({
        where: { id: guardianIds[i]! },
        create: { id: guardianIds[i]!, schoolId, ...data },
        update: data,
      });
    }

    /* ---------- Students ---------- */

    for (const [i, s] of seeds.entries()) {
      const [sk, name, admissionNo, g, , arm, , status] = s;
      const [firstName = name, ...rest] = name.split(' ');
      const year = admissionNo.slice(4, 8);
      const isE = sk === 'emmanuel';
      const exit = status ? EXITS[status] : undefined;
      const enrollments = enrollmentsOf(s);
      const first = enrollments.at(-1)!;
      const data = {
        admissionNo,
        firstName,
        surname: rest.join(' '),
        otherNames: null,
        gender: g === 'F' ? ('FEMALE' as const) : ('MALE' as const),
        dateOfBirth: isE ? day('2013-03-14') : null,
        stateOfOrigin: isE ? 'Oyo' : STATE[i % STATE.length]!,
        address: isE ? '22 Opebi Road, Ikeja, Lagos' : null,
        medicalNotes: isE ? 'Mild asthma · inhaler with nurse' : null,
        previousSchool: isE ? 'Corona School, Ikeja' : null,
        photoFileId: null,
        status: status ?? 'ACTIVE',
        admissionType: 'NEW_INTAKE' as const,
        admittedOn: isE ? day('2025-09-05') : arm ? day(`${year}-09-08`) : day('2026-11-09'),
        admittedLevelId: levelId(first.level),
        branchId: branch.id,
        paymentPlanId: null,
        exitKind: exit?.kind ?? null,
        exitOn: exit?.kind ? day(exit.on) : null,
        exitReason: exit?.reason ?? null,
        exitDestination: exit?.destination ?? null,
        exitNotes: null,
        exitDocumentFileId: null,
        graduatedOn: status === 'GRADUATED' ? day(exit!.on) : null,
        leftOn: exit ? day(exit.on) : null,
        deletedAt: null,
      };
      const sid = studentIds[i]!;
      await prisma.student.upsert({
        where: { id: sid },
        create: { id: sid, schoolId, ...data },
        update: data,
      });

      // Enrollments: drop any others (tests), then put the seeded ones back.
      const enrollmentIds = enrollments.map((e) => id(`enrollment:${admissionNo}:${e.session}`));
      await prisma.enrollment.deleteMany({
        where: { studentId: sid, id: { notIn: enrollmentIds } },
      });
      for (const [j, e] of enrollments.entries()) {
        const row = {
          studentId: sid,
          sessionId: sessionId(e.session),
          branchId: branch.id,
          levelId: levelId(e.level),
          armId: e.arm ? armId(e.level, e.arm) : null,
          status: e.status,
          enrolledOn: day(e.enrolledOn),
          leftOn: e.leftOn ? day(e.leftOn) : null,
          outcome: e.outcome ?? null,
        };
        await prisma.enrollment.upsert({
          where: { id: enrollmentIds[j]! },
          create: { id: enrollmentIds[j]!, schoolId, ...row },
          update: row,
        });
      }

      // Documents.
      const docs = DOCUMENTS[sk] ?? [];
      const docIds = docs.map(([dk]) => id(`student-document:${admissionNo}:${dk}`));
      await prisma.studentDocument.deleteMany({ where: { studentId: sid, id: { notIn: docIds } } });
      for (const [j, [dk, label, docStatus, on]] of docs.entries()) {
        const row = {
          studentId: sid,
          key: dk,
          label,
          status: docStatus,
          fileId: null,
          verifiedById: null,
          verifiedAt: docStatus === 'VERIFIED' ? day(on) : null,
          createdAt: day(on),
          deletedAt: null,
        };
        await prisma.studentDocument.upsert({
          where: { id: docIds[j]! },
          create: { id: docIds[j]!, schoolId, ...row },
          update: row,
        });
      }

      // Timeline.
      const history: [string, string, string | null, string][] = isE
        ? EMMANUEL_HISTORY
        : [
            arm
              ? [
                  'enrollment.create',
                  `Enrolled in ${first.session} · ${armLabel(first.level, arm)}`,
                  'Main Campus',
                  `${first.enrolledOn}T09:00:00Z`,
                ]
              : ['student.admit', 'Admitted for 2026/2027', 'Main Campus', '2026-11-09T09:00:00Z'],
            ...(exit
              ? [
                  [
                    `student.${status === 'GRADUATED' ? 'graduate' : 'exit'}`,
                    status === 'GRADUATED'
                      ? 'Graduated'
                      : exit.kind === 'TRANSFER'
                        ? `Transferred to ${exit.destination}`
                        : 'Withdrawn',
                    exit.reason ? `${exit.reason} · effective ${exit.on}` : null,
                    `${exit.on}T12:00:00Z`,
                  ] as [string, string, string | null, string],
                ]
              : []),
          ];
      for (const [j, [action, summary, detail, at]] of history.entries()) {
        const auditId = demoUuid(`audit:${key}:student:${admissionNo}:${j}`);
        const row = {
          schoolId,
          actorKind: 'USER' as const,
          actorName: 'Adaeze Okonkwo',
          action,
          area: 'Students',
          entityType: 'Student',
          entityId: sid,
          summary,
          detail,
          createdAt: new Date(at),
        };
        await prisma.auditEvent.upsert({
          where: { id: auditId },
          create: { id: auditId, ...row },
          update: row,
        });
      }
    }

    /* ---------- Links ---------- */

    const links = guardians.flatMap((g, gi) =>
      Object.entries(g.children).map(([sk, link]) => {
        const s = byKey.get(sk)!;
        return {
          id: id(`student-guardian:${s[2]}:${g.key}`),
          studentId: studentId(s[2]),
          guardianId: guardianIds[gi]!,
          relationship: link.relationship,
          isPrimary: link.primary,
          paysFees: link.paysFees,
        };
      }),
    );
    await prisma.studentGuardian.deleteMany({
      where: { schoolId, id: { notIn: links.map((l) => l.id) } },
    });
    // Primary flags off first: one primary per student, so restoring can't collide.
    await prisma.studentGuardian.updateMany({ where: { schoolId }, data: { isPrimary: false } });
    for (const { id: linkId, ...row } of [...links].sort(
      (a, b) => Number(a.isPrimary) - Number(b.isPrimary),
    ))
      await prisma.studentGuardian.upsert({
        where: { id: linkId },
        create: { id: linkId, schoolId, ...row },
        update: row,
      });
  }
}
