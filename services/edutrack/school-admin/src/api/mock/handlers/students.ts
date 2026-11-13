import { mock, MockHttpError, paginate, type MockRequest } from '@edutrack/web-core/mock';

import { NIGERIAN_STATES } from '@edutrack/app-kit/lib/nigeria-locations';

import type {
  AdmitPayload,
  EnrollPayload,
  GuardianPayload,
  ImportBatch,
  ImportCommitPayload,
  StudentDetail,
  StudentRow,
  TransferPayload,
} from '@/types';

import {
  studentsData,
  type GuardianRecord,
  type StudentRecord,
  type StudentsData,
} from '../students-db';
import { academicsData } from '../academics-db';
import {
  buildInvoice,
  chargedIn,
  financeData,
  recordStudents,
  structureFor,
  termsOf,
} from '../finance-db';
import { isoToday, siblingPositions, totalOf } from '../finance-ledger';
import { schoolData } from '../school-db';
import { financeSnapshot, invoiceRowFor, naira } from './finance-shared';
import { currentUser, EMAIL, isPhone, requireText } from './shared';

const SESSION = '2026/2027';

function dataFor(req: Pick<MockRequest, 'headers'>) {
  const user = currentUser(req);
  return { data: studentsData[user.schoolId]!, actor: `${user.firstName} ${user.lastName}` };
}

/** The section a class level belongs to, e.g. JSS 1 → Junior Secondary. */
const sectionOf = (level: string) =>
  level.startsWith('JSS')
    ? 'Junior Secondary'
    : level.startsWith('SSS')
      ? 'Senior Secondary'
      : level.startsWith('Primary')
        ? 'Primary'
        : 'Nursery';
const displayName = (s: StudentRecord) => `${s.firstName} ${s.surname}`.trim();
const className = (s: StudentRecord) =>
  s.arm ? `${s.level}${s.level.match(/\d$/) ? '' : ' '}${s.arm}` : '';
const guardiansOf = (data: StudentsData, id: string) =>
  data.guardians.filter((g) => g.children[id]);
const primaryGuardian = (data: StudentsData, id: string) =>
  guardiansOf(data, id).find((g) => g.children[id]!.primary) ?? guardiansOf(data, id)[0] ?? null;

/** Students placed in an arm this session. */
function armCount(data: StudentsData, level: string, arm: string) {
  const key = `${level}${arm}`;
  const seeded = data.students.filter(
    (s) =>
      s.level === level && s.arm === arm && ['Active', 'Incomplete profile'].includes(s.status),
  ).length;
  return (data.armBaseline[key] ?? 0) + seeded;
}

function toRow(data: StudentsData, s: StudentRecord): StudentRow {
  return {
    id: s.id,
    name: displayName(s),
    admissionNo: s.admissionNo,
    gender: s.gender,
    className: s.exit ? `${className(s)} (until ${s.exit.date})` : className(s),
    branch: s.branch,
    guardianName: primaryGuardian(data, s.id)?.name ?? null,
    balance: s.balance,
    status: s.status,
    awaitingEnrollment: !s.arm && s.status === 'Active',
    admittedToday: !!s.admittedToday,
  };
}

const findStudent = (data: StudentsData, id: string) => {
  const s = data.students.find((x) => x.id === id);
  if (!s) throw new MockHttpError(404, 'This student doesn’t exist');
  return s;
};

/* ---------------- Students ---------------- */

mock.get('/v1/students', (req) => {
  const { data } = dataFor(req);
  const { status, className: cls, gender } = req.query;
  const rows = data.students
    .map((s) => toRow(data, s))
    .filter(
      (r) =>
        (!status || r.status === status) &&
        (!cls || r.className.startsWith(cls)) &&
        (!gender || r.gender === gender),
    );
  return paginate(rows, req.query, (r) => `${r.name} ${r.admissionNo} ${r.guardianName ?? ''}`);
});

const SUBJECTS: [string, string, string][] = [
  ['Mathematics', 'Compulsory', 'Mr. Samuel Ade'],
  ['English Language', 'Compulsory', 'Mrs. Grace Okafor'],
  ['Basic Science', 'Compulsory', 'Mrs. Chioma Eze'],
  ['Basic Technology', 'Compulsory', 'Mr. Ibrahim Bello'],
  ['Agricultural Science', 'Compulsory', 'Mr. Yinka Oladipo'],
  ['Civic Education', 'Compulsory', 'Mrs. Rita Ndukwe'],
  ['Social Studies', 'Compulsory', 'Mr. Tayo Fadeyi'],
  ['Cultural & Creative Arts', 'Compulsory', 'Mrs. Bimpe Ajayi'],
  ['Physical & Health Education', 'Compulsory', 'Mr. Segun Alao'],
  ['Computer Studies', 'Compulsory', 'Mr. Chidi Okoro'],
];

mock.get('/v1/students/:id', (req): StudentDetail => {
  const { data } = dataFor(req);
  const s = findStudent(data, req.params.id!);
  const isE = s.id === 'emmanuel';
  const cls = className(s);
  const age = s.dateOfBirth
    ? 2026 - +s.dateOfBirth.slice(0, 4) - (s.dateOfBirth.slice(5) > '12-08' ? 1 : 0)
    : null;
  return {
    ...toRow(data, s),
    firstName: s.firstName,
    surname: s.surname,
    otherNames: s.otherNames,
    dateOfBirth: s.dateOfBirth,
    age,
    stateOfOrigin: s.stateOfOrigin,
    address: s.address,
    medicalNotes: s.medicalNotes,
    admittedOn: s.admittedOn,
    admissionType: s.admissionType,
    admittedInto: s.admittedInto,
    previousSchool: s.previousSchool,
    section: sectionOf(s.level),
    classTeacher: cls === 'JSS 2B' ? 'Mrs. Grace Okafor' : 'Not assigned',
    enrolledSince: s.enrolledSince,
    termResults:
      cls === 'JSS 2B'
        ? '10 of 11 subjects approved · Mathematics submitted'
        : s.arm
          ? 'Results pending'
          : 'Not enrolled yet',
    assignments: isE ? '3 of 4 submitted' : '—',
    enrollments: [
      ...(s.arm || s.status === 'Active'
        ? [
            {
              session: SESSION,
              className: cls || `${s.level} · awaiting arm`,
              branch: s.branch,
              status: s.exit ? s.status : 'Active',
              outcome: s.exit
                ? `${s.exit.kind} · ${s.exit.date}`
                : 'In progress · First Term results pending',
            },
          ]
        : []),
      ...(isE
        ? [
            {
              session: '2025/2026',
              className: 'JSS 1B',
              branch: 'Main Campus',
              status: 'Promoted',
              outcome: 'Annual average 69.8% · promoted to JSS 2',
            },
          ]
        : []),
    ],
    results: isE
      ? [
          {
            session: '2026/2027',
            terms: [['First Term', '10 of 11 subjects approved · Mathematics submitted']],
          },
          {
            session: '2025/2026 · JSS 1B',
            terms: [
              ['First Term', 'Published · 69.0%'],
              ['Second Term', 'Published · 68.1%'],
              ['Third Term', 'Published · 72.3% · 6th of 32'],
              ['Annual', '69.8% · Promoted'],
            ],
          },
        ]
      : [],
    subjects: s.arm
      ? [
          ...SUBJECTS.map(([name, type, teacher]) => ({
            name,
            type,
            teacher,
            since: s.enrolledSince,
          })),
          {
            name:
              s.religious === 'IRS' ? 'Islamic Religious Studies' : 'Christian Religious Studies',
            type: `Religious group · chose ${s.religious}`,
            teacher: s.religious === 'IRS' ? 'Mallam Idris Sule' : 'Rev. John Ekanem',
            since: s.enrolledSince,
          },
          {
            name: s.elective,
            type: `Elective group A · chose ${s.elective}`,
            teacher:
              s.elective === 'French'
                ? 'Mme. Aline Kouassi'
                : s.elective === 'Music'
                  ? 'No teacher yet'
                  : 'Mr. Chidi Okoro',
            since: s.enrolledSince,
          },
        ]
      : [],
    ...studentFees(currentUser(req).schoolId, s.id),
    guardians: guardiansOf(data, s.id).map((g) => ({
      guardianId: g.id,
      name: g.name,
      relationship: g.children[s.id]!.relationship,
      primary: g.children[s.id]!.primary,
      phone: g.phone,
      email: g.email,
      paysFees: g.children[s.id]!.paysFees,
      portal: g.portal === 'No account' ? 'No account · receives SMS only' : g.portal,
      otherChildren: Object.keys(g.children)
        .filter((id) => id !== s.id)
        .map((id) => {
          const c = data.students.find((x) => x.id === id);
          return c ? `${displayName(c)} · ${className(c)}` : id;
        }),
    })),
    documents: [
      ['Birth certificate', 'Yes'],
      ['Passport photograph', 'Yes'],
      [
        'Previous school report',
        s.admissionType === 'Transfer in' ? 'Yes (transfer)' : 'Yes (new intake)',
      ],
      ['Medical form', 'Yes'],
      ['Transfer letter', 'Only for transfers'],
    ].map(([name, required], i) => ({
      name: name!,
      required: required!,
      uploaded: isE && i < 3 ? `5 Sep 2025 · ${i === 1 ? 'JPG · 96 KB' : 'PDF · 412 KB'}` : '—',
      status:
        isE && i < 3
          ? 'Verified'
          : i === 4
            ? s.exit?.kind === 'Transfer'
              ? 'Verified'
              : 'Optional'
            : 'Missing',
    })),
    activity: s.activity,
    exit: s.exit
      ? {
          kind: s.exit.kind,
          date: s.exit.date,
          reason: s.exit.reason,
          destination: s.exit.destination,
        }
      : null,
  };
});

mock.post('/v1/students/:id/transfer', (req) => {
  const { data, actor } = dataFor(req);
  const s = findStudent(data, req.params.id!);
  if (s.exit)
    throw new MockHttpError(
      409,
      `${displayName(s)} already has a ${s.exit.kind.toLowerCase()} recorded.`,
    );
  const p = req.body as TransferPayload;
  if (!['Transfer', 'Withdrawal'].includes(p.kind))
    throw new MockHttpError(422, 'Choose transfer or withdrawal.');
  requireText(p.date, 'Choose the effective date.');
  if (p.kind === 'Transfer') {
    requireText(p.destination, 'Enter the destination school.');
    if (!p.document)
      throw new MockHttpError(422, 'Upload the transfer letter. Your school settings require it.');
  }
  const date = new Date(p.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  s.exit = {
    kind: p.kind,
    date,
    reason: p.reason,
    destination: p.destination?.trim() ?? '',
    notes: p.notes ?? '',
  };
  s.status = p.kind === 'Transfer' ? 'Transferred' : 'Withdrawn';
  s.activity.push({
    id: `x${Date.now()}`,
    title: p.kind === 'Transfer' ? `Transferred to ${s.exit.destination}` : 'Withdrawn',
    detail: `${actor} · ${p.reason} · effective ${date}`,
    when: 'Just now',
    tone: 'warning',
  });
  return toRow(data, s);
});

/** Bulk: move selected students to another arm of their class level. */
mock.post('/v1/students/assign-arm', (req) => {
  const { data, actor } = dataFor(req);
  const { studentIds, arm } = req.body as { studentIds: string[]; arm: string };
  const list = (studentIds ?? []).map((id) => findStudent(data, id));
  if (!list.length) throw new MockHttpError(422, 'Choose at least one student.');
  const levels = new Set(list.map((s) => s.level));
  if (levels.size > 1)
    throw new MockHttpError(
      422,
      'Choose students from one class level to move them to another arm.',
    );
  const level = list[0]!.level;
  if (!data.arms[level]?.includes(arm)) throw new MockHttpError(422, `${level} has no arm ${arm}.`);
  const moving = list.filter((s) => s.arm !== arm);
  const after = armCount(data, level, arm) + moving.length;
  if (after > data.capacity)
    throw new MockHttpError(
      409,
      `${level}${arm} would have ${after} of ${data.capacity} places. Move fewer students or raise capacity in Classes & Arms.`,
    );
  for (const s of moving) {
    s.activity.push({
      id: `m${Date.now()}${s.id}`,
      title: `Moved from ${className(s)} to ${level}${arm}`,
      detail: actor,
      when: 'Just now',
    });
    s.arm = arm;
  }
  return { moved: moving.length };
});

/* ---------------- Admissions ---------------- */

mock.get('/v1/admissions', (req) => dataFor(req).data.applications);

const REQUIRED_DOCS = [
  { key: 'birth', label: 'Birth certificate', required: 'always' },
  { key: 'photo', label: 'Passport photograph', required: 'optional' },
  { key: 'report', label: 'Previous school report', required: 'transfer' },
] as const;
const FEE_ITEMS: [string, number][] = [
  ['Tuition · First Term', 140000],
  ['Development levy', 15000],
  ['Examination fee', 10000],
  ['Books & learning materials', 20000],
];

mock.get('/v1/admissions/options', (req) => {
  const { data } = dataFor(req);
  return {
    session: SESSION,
    term: 'First Term',
    branches: req.headers.authorization?.includes('udo')
      ? ['Main Campus']
      : ['Main Campus', 'Lekki Campus'],
    arms: Object.fromEntries(
      Object.entries(data.arms).map(([level, arms]) => [
        level,
        arms.map((arm) => ({ arm, used: armCount(data, level, arm), capacity: data.capacity })),
      ]),
    ),
    compulsorySubjects: [
      'Mathematics',
      'English Language',
      'Basic Science',
      'Basic Technology',
      'Agricultural Science',
      'Civic Education',
      'Social Studies',
      'Cultural & Creative Arts',
      'Physical & Health Education',
    ],
    religiousSubjects: [
      ['CRS', 'Christian Religious Studies'],
      ['IRS', 'Islamic Religious Studies'],
    ],
    electives: ['French', 'Computer Studies', 'Music'],
    unstaffedElectives: ['Music'],
    states: NIGERIAN_STATES,
    feeItems: FEE_ITEMS,
    admissionFee: 25000,
    siblingDiscount: 10000,
    ...admissionFees(currentUser(req).schoolId),
    requiredDocuments: REQUIRED_DOCS,
  };
});

/** Possible duplicate student and sibling (same surname) for the name being admitted. */
mock.get('/v1/admissions/matches', (req) => {
  const { data } = dataFor(req);
  const first = (req.query.firstName ?? '').trim().toLowerCase();
  const surname = (req.query.surname ?? '').trim().toLowerCase();
  const dup = data.students.find(
    (s) => s.firstName.toLowerCase() === first && s.surname.toLowerCase() === surname && first,
  );
  const sib =
    !dup && surname
      ? data.students.find((s) => s.surname.toLowerCase() === surname && s.status === 'Active')
      : null;
  const sg = sib ? primaryGuardian(data, sib.id) : null;
  return {
    duplicate: dup
      ? {
          id: dup.id,
          name: displayName(dup),
          className: className(dup),
          admissionNo: dup.admissionNo,
        }
      : null,
    sibling:
      sib && sg
        ? {
            studentId: sib.id,
            studentName: displayName(sib),
            className: className(sib),
            guardianId: sg.id,
            guardianName: sg.name,
            guardianPhone: sg.phone,
            relationship: sg.children[sib.id]!.relationship,
          }
        : null,
  };
});

mock.post('/v1/admissions', (req) => {
  const { data, actor } = dataFor(req);
  const p = req.body as AdmitPayload;
  const surname = requireText(p.surname, 'Enter the surname');
  const firstName = requireText(p.firstName, 'Enter the first name');
  requireText(p.dateOfBirth, 'Enter the date of birth');
  const arms = data.arms[p.level];
  if (!arms?.includes(p.arm)) throw new MockHttpError(422, 'Choose a class arm.');
  if (armCount(data, p.level, p.arm) >= data.capacity)
    throw new MockHttpError(
      409,
      `${p.level}${p.arm} is at capacity (${data.capacity} of ${data.capacity}). Choose another arm.`,
    );
  if (!p.documents?.birth)
    throw new MockHttpError(422, 'Birth certificate is required by your school settings.');
  if (p.admissionType === 'Transfer in' && !p.documents?.report)
    throw new MockHttpError(422, 'Transfer-in students need their previous school report.');

  let guardian: GuardianRecord | null = null;
  if (p.guardian.mode === 'link') {
    guardian =
      data.guardians.find((g) => g.id === (p.guardian as { guardianId: string }).guardianId) ??
      null;
    if (!guardian) throw new MockHttpError(422, 'Choose the guardian to link.');
  } else if (p.guardian.mode === 'new') {
    const name = requireText(p.guardian.name, 'Enter the guardian’s full name');
    if (!isPhone(p.guardian.phone ?? ''))
      throw new MockHttpError(422, 'Enter a Nigerian phone number, e.g. 0803 555 0193');
    if (p.guardian.email && !EMAIL.test(p.guardian.email))
      throw new MockHttpError(422, 'Enter a valid email.');
    guardian = {
      id: `g${Date.now().toString(36)}`,
      name,
      phone: p.guardian.phone,
      email: p.guardian.email ?? '',
      address: '',
      occupation: '',
      portal: p.invite ? 'Invited' : 'No account',
      portalSince: '',
      children: {},
    };
    data.guardians.push(guardian);
  }

  const admissionNo = `STU-2026-${String(data.nextAdmission++).padStart(4, '0')}`;
  const id = `${firstName.toLowerCase().replace(/[^a-z]+/g, '-')}-${admissionNo.slice(-4)}`;
  let invoiceTotal = 0;
  const record: StudentRecord = {
    id,
    firstName,
    surname,
    otherNames: p.otherNames?.trim() ?? '',
    admissionNo,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth,
    stateOfOrigin: p.stateOfOrigin ?? '',
    address: '',
    medicalNotes: '',
    previousSchool: p.previousSchool?.trim() ?? '',
    level: p.level,
    arm: p.arm,
    branch: p.branch,
    status: guardian ? 'Active' : 'Incomplete profile',
    admittedOn: 'Today',
    admissionType: p.admissionType,
    admittedInto: `${SESSION} · ${p.level}${p.arm}`,
    enrolledSince: 'Today',
    religious: p.religious,
    elective: p.elective,
    balance: 0,
    admittedToday: true,
    activity: [
      {
        id: 'adm',
        title: `Admitted to ${p.level}${p.arm}`,
        detail: `by ${actor} · ${p.admissionType}`,
        when: 'Just now',
        tone: 'success',
      },
      {
        id: 'inv',
        title: 'Draft invoice created',
        detail: `₦${invoiceTotal.toLocaleString('en-NG')} · waiting for finance`,
        when: 'Just now',
      },
    ],
  };
  data.students.unshift(record);
  if (guardian) {
    guardian.children[id] = { relationship: p.relationship, paysFees: p.paysFees, primary: true };
    if (p.invite && guardian.portal === 'No account') guardian.portal = 'Invited';
  }
  invoiceTotal = draftAdmissionInvoice(
    currentUser(req).schoolId,
    id,
    p.billing === 'full',
    !!p.siblingDiscount,
    actor,
  );
  record.activity[1]!.detail = invoiceTotal
    ? `₦${invoiceTotal.toLocaleString('en-NG')} · waiting for finance to issue`
    : 'Billing starts next term';
  const app = p.applicationId ? data.applications.find((a) => a.id === p.applicationId) : null;
  if (app)
    Object.assign(app, { stage: 'Admitted', stageNote: 'Now an active student', studentId: id });
  return {
    studentId: id,
    name: `${firstName} ${surname}`,
    admissionNo,
    className: `${p.level}${p.arm}`,
    branch: p.branch,
    guardianName: guardian?.name ?? null,
    invited: !!guardian && p.invite,
    invoiceTotal,
  };
});

/* ---------------- Import ---------------- */

const SAMPLE_ROWS = 48;
const pendingImports = new Map<string, ImportBatch>();

/** Validates an uploaded class list. The mock returns the design's sample findings for any file. */
mock.post('/v1/imports', (req) => {
  const { data } = dataFor(req);
  const { fileName } = req.body as { fileName: string };
  if (!/\.(xlsx|csv)$/i.test(fileName ?? ''))
    throw new MockHttpError(422, 'Upload the .xlsx or .csv template.');
  const batch: ImportBatch = {
    id: `IMP-2026-${String(data.importSeq).padStart(3, '0')}`,
    fileName,
    rows: SAMPLE_ROWS,
    valid: 43,
    target: `${SESSION} · Main Campus · JSS 1 intake`,
    guardiansNew: 38,
    guardiansLinked: 9,
    issues: [
      {
        row: 12,
        student: 'Chukwuemeka Obi',
        kind: 'error',
        code: 'class',
        message: 'Class "JSS1 C" not found. Did you mean JSS 1C?',
        suggestion: 'JSS 1C',
      },
      {
        row: 31,
        student: 'Halima Bako',
        kind: 'error',
        code: 'dob',
        message: 'Date "31/02/2014" does not exist',
        value: '31/02/2014',
      },
      {
        row: 7,
        student: 'Tobi Adesanya',
        kind: 'warning',
        code: 'duplicate',
        message: 'Possible duplicate of STU-2025-0702 (Nursery 2, same name and date of birth)',
      },
      {
        row: 19,
        student: 'Femi Oyelaran',
        kind: 'warning',
        code: 'no-guardian',
        message: 'No guardian phone. The student will be imported without a parent invitation.',
      },
      {
        row: 40,
        student: 'Adaora Obiora',
        kind: 'warning',
        code: 'guardian-match',
        message: 'Guardian email matches existing parent Mrs. Amaka Obiora',
      },
    ],
  };
  pendingImports.set(batch.id, batch);
  return batch;
});

const validDob = (v: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v ?? '');
  if (!m) return false;
  const [d, mo, y] = [+m[1]!, +m[2]!, +m[3]!];
  const date = new Date(y, mo - 1, d);
  return date.getDate() === d && date.getMonth() === mo - 1 && y > 1990 && y <= 2026;
};

mock.post('/v1/imports/:id/commit', (req) => {
  const { data } = dataFor(req);
  const batch = pendingImports.get(req.params.id!);
  if (!batch) throw new MockHttpError(404, 'This import has expired. Upload the file again.');
  const { resolutions = {}, excludeErrors } = req.body as ImportCommitPayload;
  const fixed = batch.issues.filter((i) =>
    i.code === 'class'
      ? resolutions[i.row] === i.suggestion
      : i.code === 'dob'
        ? validDob(resolutions[i.row] ?? '')
        : true,
  );
  const errorsLeft = batch.issues.filter((i) => i.kind === 'error' && !fixed.includes(i)).length;
  if (errorsLeft && !excludeErrors)
    throw new MockHttpError(
      422,
      `${errorsLeft} row${errorsLeft > 1 ? 's have' : ' has'} errors. Fix them or exclude them to continue.`,
    );
  const skipped = resolutions['7'] === 'skip' ? 1 : 0;
  const imported = SAMPLE_ROWS - errorsLeft - skipped;
  const linked = batch.guardiansLinked + (resolutions['40'] === 'new' ? 0 : 1);
  data.importSeq += 1;
  pendingImports.delete(batch.id);
  return {
    batchId: batch.id,
    imported,
    guardiansNew: batch.guardiansNew - (resolutions['40'] === 'new' ? 0 : 1),
    guardiansLinked: linked,
  };
});

/* ---------------- Enrollment ---------------- */

mock.get('/v1/enrollment/options', (req) => {
  const { data } = dataFor(req);
  const sections = new Map<
    string,
    { level: string; arms: { arm: string; used: number; capacity: number }[] }[]
  >();
  for (const [level, arms] of Object.entries(data.arms)) {
    const list = sections.get(sectionOf(level)) ?? [];
    list.push({
      level,
      arms: arms.map((arm) => ({ arm, used: armCount(data, level, arm), capacity: data.capacity })),
    });
    sections.set(sectionOf(level), list);
  }
  return {
    session: SESSION,
    sections: [...sections].map(([name, levels]) => ({ name, levels })),
    awaiting: data.students
      .filter((s) => !s.arm && s.status === 'Active')
      .map((s) => ({ id: s.id, name: displayName(s), admissionNo: s.admissionNo, level: s.level })),
  };
});

mock.post('/v1/enrollments', (req) => {
  const { data, actor } = dataFor(req);
  const p = req.body as EnrollPayload;
  if (!data.arms[p.level]?.includes(p.arm)) throw new MockHttpError(422, 'Choose a class arm.');
  const list = (p.studentIds ?? []).map((id) => findStudent(data, id));
  if (!list.length) throw new MockHttpError(422, 'Choose at least one student.');
  if (list.some((s) => s.arm))
    throw new MockHttpError(409, 'Some of these students are already enrolled this session.');
  if (list.some((s) => s.level !== p.level))
    throw new MockHttpError(
      422,
      `Only students admitted into ${p.level} can be enrolled in ${p.level}${p.arm}.`,
    );
  const after = armCount(data, p.level, p.arm) + list.length;
  if (after > data.capacity)
    throw new MockHttpError(
      409,
      `${p.level}${p.arm} would be over capacity (${after} of ${data.capacity}). Split the group across arms, or raise capacity in Classes & Arms.`,
    );
  for (const s of list) {
    s.arm = p.arm;
    s.enrolledSince = 'Today';
    s.activity.push({
      id: `en${Date.now()}${s.id}`,
      title: `Enrolled in ${SESSION} · ${p.level}${p.arm}`,
      detail: actor,
      when: 'Just now',
      tone: 'success',
    });
  }
  return { enrolled: list.length, className: `${p.level}${p.arm}` };
});

/* ---------------- Guardians ---------------- */

function guardianRow(data: StudentsData, g: GuardianRecord) {
  const kids = Object.keys(g.children)
    .map((id) => data.students.find((s) => s.id === id))
    .filter((s): s is StudentRecord => !!s);
  const first = Object.values(g.children)[0];
  return {
    id: g.id,
    name: g.name,
    phone: g.phone,
    email: g.email,
    children: kids.map((s) => ({ id: s.id, name: displayName(s), className: className(s) })),
    relationship: first?.relationship ?? 'Guardian',
    paysFees: Object.values(g.children).some((c) => c.paysFees),
    portal: g.portal,
    balance: kids.filter((s) => g.children[s.id]!.paysFees).reduce((a, s) => a + s.balance, 0),
  };
}

const digits = (p: string) => p.replace(/\D/g, '').replace(/^234/, '0');

/** Guardian records that share a phone number: likely the same person entered twice. */
function duplicates(data: StudentsData) {
  const out = [];
  const seen = new Map<string, GuardianRecord>();
  for (const g of data.guardians) {
    const key = digits(g.phone);
    const other = key && seen.get(key);
    if (other) {
      const [keep, merge] = other.email ? [other, g] : [g, other];
      out.push({
        keepId: keep.id,
        keepLabel: `${keep.name}${keep.email ? ` · ${keep.email}` : ''}`,
        mergeId: merge.id,
        mergeLabel: `${merge.name}${merge.email ? ` · ${merge.email}` : ' · no email'}`,
        reason: `“${keep.name}” and “${merge.name}” share the phone number ${keep.phone}.`,
        children: [...new Set([...Object.keys(keep.children), ...Object.keys(merge.children)])]
          .map((id) => {
            const s = data.students.find((x) => x.id === id);
            return s ? `${displayName(s)} (${className(s)})` : id;
          })
          .join(', '),
      });
    } else if (key) seen.set(key, g);
  }
  return out;
}

mock.get('/v1/guardians', (req) => {
  const { data } = dataFor(req);
  const rows = data.guardians.map((g) => guardianRow(data, g));
  return {
    ...paginate(
      rows,
      req.query,
      (r) => `${r.name} ${r.phone} ${r.email} ${r.children.map((c) => c.name).join(' ')}`,
    ),
    duplicates: duplicates(data),
    studentsWithoutGuardian: data.students.filter(
      (s) => ['Active', 'Incomplete profile'].includes(s.status) && !guardiansOf(data, s.id).length,
    ).length,
  };
});

mock.get('/v1/guardians/:id', (req) => {
  const { data } = dataFor(req);
  const g = data.guardians.find((x) => x.id === req.params.id);
  if (!g) throw new MockHttpError(404, 'This guardian doesn’t exist');
  return {
    ...guardianRow(data, g),
    address: g.address,
    occupation: g.occupation,
    portalSince: g.portalSince,
    childrenDetail: Object.entries(g.children)
      .map(([id, link]) => {
        const s = data.students.find((x) => x.id === id);
        if (!s) return null;
        return {
          id,
          name: displayName(s),
          className: className(s),
          branch: s.branch,
          balance: s.balance,
          status: s.balance ? (s.balance >= 185000 ? 'Overdue' : 'Partially paid') : 'Paid',
          relationship: `${link.relationship}${link.paysFees ? ' · pays fees' : ''}`,
          note:
            id === 'michael'
              ? 'Sibling discount applied (rule)'
              : id === 'emmanuel'
                ? '3 installments'
                : '',
        };
      })
      .filter((x) => !!x),
    paymentPlan: g.children.emmanuel ? 'Emmanuel: 3 installments' : 'Full payment each term',
    preferredMethod: 'Bank transfer',
    notifications: [
      ['Results', 'In-app · Email'],
      ['Fees & receipts', 'In-app · Email · SMS'],
      ['Announcements', g.portal === 'Active' ? 'In-app · WhatsApp' : 'SMS'],
      ['Quiet hours', '21:00 – 07:00'],
    ],
  };
});

mock.post('/v1/guardians', (req) => {
  const { data } = dataFor(req);
  const p = req.body as GuardianPayload;
  const name = requireText(p.name, 'Enter the guardian’s full name.');
  if (!isPhone(p.phone ?? ''))
    throw new MockHttpError(422, 'Enter a Nigerian phone number, e.g. 0803 555 0193');
  if (p.email && !EMAIL.test(p.email)) throw new MockHttpError(422, 'Enter a valid email.');
  const clash = data.guardians.find(
    (g) =>
      digits(g.phone) === digits(p.phone) ||
      (p.email && g.email.toLowerCase() === p.email.toLowerCase()),
  );
  if (clash)
    throw new MockHttpError(
      409,
      `${clash.name} already uses this phone number or email. Open their record and link the child there.`,
    );
  if (!p.studentIds?.length) throw new MockHttpError(422, 'Choose at least one child.');
  const g: GuardianRecord = {
    id: `g${Date.now().toString(36)}`,
    name,
    phone: p.phone,
    email: p.email ?? '',
    address: '',
    occupation: '',
    portal: p.invite ? 'Invited' : 'No account',
    portalSince: '',
    children: Object.fromEntries(
      p.studentIds.map((id) => [
        id,
        {
          relationship: p.relationship,
          paysFees: p.paysFees,
          primary: !guardiansOf(data, id).length,
        },
      ]),
    ),
  };
  data.guardians.push(g);
  for (const id of p.studentIds) {
    const s = data.students.find((x) => x.id === id);
    if (s?.status === 'Incomplete profile') s.status = 'Active';
  }
  return guardianRow(data, g);
});

mock.post('/v1/guardians/merge', (req) => {
  const { data } = dataFor(req);
  const { keepId, mergeId } = req.body as { keepId: string; mergeId: string };
  const keep = data.guardians.find((g) => g.id === keepId);
  const merge = data.guardians.find((g) => g.id === mergeId);
  if (!keep || !merge || keep === merge)
    throw new MockHttpError(422, 'Choose two different guardian records.');
  for (const [id, link] of Object.entries(merge.children))
    keep.children[id] = keep.children[id] ?? link;
  if (!keep.email) keep.email = merge.email;
  data.guardians = data.guardians.filter((g) => g !== merge);
  return guardianRow(data, keep);
});

/** A student's invoices and payment history, from Finance. */
function studentFees(schoolId: string, studentId: string) {
  const snap = financeSnapshot(schoolId);
  const invoices = snap.fin.invoices
    .filter((i) => i.studentKey === studentId && i.status !== 'Cancelled')
    .sort((a, b) => (b.issuedOn ?? b.createdOn).localeCompare(a.issuedOn ?? a.createdOn))
    .map((i) => {
      const row = invoiceRowFor(snap, i);
      return {
        id: i.id,
        number: row.no,
        period: `${row.session} · ${row.term}`,
        total: row.total,
        paid: row.paid,
        pending: row.pending,
        balance: row.balance,
        status: row.status,
      };
    });
  const payments = snap.fin.payments
    .filter((p) => p.studentKey === studentId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => ({
      id: p.id,
      title: `${naira(p.amount)} · ${p.method} · ${p.no}`,
      detail: `${p.allocations.map((a) => `${snap.fin.invoices.find((i) => i.id === a.invoiceId)?.no} ${naira(a.amount)}`).join(' + ') || 'Credit on account'} · ${p.status}`,
      when: new Date(`${p.date}T00:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      tone: (p.status === 'Confirmed'
        ? 'success'
        : p.status === 'Rejected'
          ? 'error'
          : 'warning') as 'success' | 'error' | 'warning',
    }));
  return { invoices, payments, financeKey: studentId, credit: snap.ledger.credit(studentId) };
}

/** Fee lines the admission wizard shows, per "branch|level", from the current term's structure. */
function admissionFees(schoolId: string) {
  const fin = financeData[schoolId]!;
  const term = currentFinanceTerm(schoolId);
  const branches = schoolData[schoolId]!.branches;
  const sib = fin.discounts.find((d) => d.basis === 'Sibling' && d.status === 'Active');
  const feeLines: Record<
    string,
    { items: [string, number][]; once: [string, number][]; sibling: number }
  > = {};
  if (!term) return { feeLines, feesReady: false };
  for (const st of fin.structures.filter((x) => x.termId === term.id && x.status === 'Published')) {
    const branch = branches.find((b) => b.id === st.branchId)?.name ?? '';
    for (const [level, amounts] of Object.entries(st.amounts)) {
      const pick = (once: boolean) =>
        fin.items
          .filter(
            (i) =>
              i.status === 'Active' &&
              i.type === 'Compulsory' &&
              (once ? i.charged === 'New students only' : chargedIn(i, term.index, false)),
          )
          .filter((i) => amounts[i.id])
          .map((i): [string, number] => [`${i.name}${once ? ' (one-time)' : ''}`, amounts[i.id]!]);
      const tuition = fin.items
        .filter((i) => i.category === 'Tuition')
        .reduce((n, i) => n + (amounts[i.id] ?? 0), 0);
      feeLines[`${branch}|${level}`] = {
        items: pick(false),
        once: pick(true),
        sibling: !sib
          ? 0
          : sib.kind === 'Percentage'
            ? Math.round((tuition * sib.value) / 100)
            : Math.min(sib.value, tuition),
      };
    }
  }
  return { feeLines, feesReady: Object.keys(feeLines).length > 0 };
}

function currentFinanceTerm(schoolId: string) {
  const acad = academicsData[schoolId]!;
  const session =
    acad.sessions.find((s) => s.status === 'Active') ??
    acad.sessions.find((s) => s.status === 'Upcoming');
  const term = session?.terms.find((t) => t.status === 'Active') ?? session?.terms[0];
  return termsOf(schoolId).find((t) => t.id === term?.id) ?? null;
}

/** Creates the new student's first invoice as a draft for finance to review and issue. */
function draftAdmissionInvoice(
  schoolId: string,
  studentId: string,
  billNow: boolean,
  sibling: boolean,
  actor: string,
) {
  if (!billNow) return 0;
  const fin = financeData[schoolId]!;
  const term = currentFinanceTerm(schoolId);
  const all = recordStudents(schoolId);
  const student = all.find((s) => s.key === studentId);
  if (!term || !student) return 0;
  student.isNew = true;
  if (!structureFor(fin, term.id, student.branchId)) return 0;
  const siblings = siblingPositions([...fin.studentIndex().values()].filter((s) => s.active));
  const inv = buildInvoice(fin, student, term, { siblings, on: isoToday(), by: actor });
  if (!inv) return 0;
  if (!sibling) inv.discounts = inv.discounts.filter((d) => !d.by.startsWith('Automatic'));
  inv.history[0]!.title = 'Draft invoice created at admission';
  fin.invoices.push(inv);
  return totalOf(inv);
}
