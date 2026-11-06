/*
 * Students section data for the mock API, per school: students, guardians, admission
 * applications and class capacity. Seeded from the School Admin design (Greenfield Academy).
 */
import type { AdmissionApplication, Gender, StudentStatus, TimelineEntry } from '@/types';

export interface StudentRecord {
  id: string;
  firstName: string;
  surname: string;
  otherNames: string;
  admissionNo: string;
  gender: Gender;
  dateOfBirth: string;
  stateOfOrigin: string;
  address: string;
  medicalNotes: string;
  previousSchool: string;
  /** e.g. "JSS 2"; the arm is separate so an admitted student can await placement. */
  level: string;
  arm: string | null;
  branch: string;
  status: StudentStatus;
  admittedOn: string;
  admissionType: string;
  admittedInto: string;
  enrolledSince: string;
  religious: string;
  elective: string;
  /** Naira owed on the current invoice and earlier sessions. */
  balance: number;
  admittedToday?: boolean;
  exit?: { kind: string; date: string; reason: string; destination: string; notes: string };
  activity: TimelineEntry[];
}

export interface GuardianRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  occupation: string;
  portal: 'Active' | 'Invited' | 'No account';
  portalSince: string;
  /** studentId → relationship. */
  children: Record<string, { relationship: string; paysFees: boolean; primary: boolean }>;
}

export interface StudentsData {
  students: StudentRecord[];
  guardians: GuardianRecord[];
  applications: AdmissionApplication[];
  /** Places per arm; the design uses 35 everywhere. */
  capacity: number;
  /** Arms that exist per class level. */
  arms: Record<string, string[]>;
  /** Students already in each arm beyond the seeded records ("JSS 1A" → 31). */
  armBaseline: Record<string, number>;
  nextAdmission: number;
  importSeq: number;
}

const blankActivity = (when: string, title: string, detail: string): TimelineEntry[] => [
  { id: 'a0', title, detail, when },
];

type Seed = [
  id: string,
  name: string,
  admissionNo: string,
  gender: 'M' | 'F',
  level: string,
  arm: string | null,
  guardian: string,
  balance: number,
  status?: StudentStatus,
];

/* JSS 2B roster and other classes, from proto-data.js. */
const SEEDS: Seed[] = [
  ['emmanuel', 'Emmanuel Adeyemi', 'STU-2025-0042', 'M', 'JSS 2', 'B', 'Mrs. Funke Adeyemi', 95000],
  ['favour', 'Favour Okeke', 'STU-2025-0047', 'F', 'JSS 2', 'B', 'Mr. Chukwudi Okeke', 0],
  ['chiamaka', 'Chiamaka Eze', 'STU-2025-0051', 'F', 'JSS 2', 'B', 'Mrs. Ngozi Eze', 0],
  ['daniel', 'Daniel Musa', 'STU-2025-0055', 'M', 'JSS 2', 'B', 'Alhaji Usman Musa', 185000],
  ['sarah', 'Sarah Ibrahim', 'STU-2025-0058', 'F', 'JSS 2', 'B', 'Mrs. Hauwa Ibrahim', 45000],
  ['david', 'David Nwosu', 'STU-2025-0063', 'M', 'JSS 2', 'B', 'Mr. Obinna Nwosu', 0],
  ['tolulope', 'Tolulope Bankole', 'STU-2025-0066', 'F', 'JSS 2', 'B', 'Mrs. Bisi Bankole', 92500],
  ['ibrahim', 'Ibrahim Danjuma', 'STU-2025-0070', 'M', 'JSS 2', 'B', 'Mr. Ahmed Danjuma', 0],
  ['blessing', 'Blessing Etim', 'STU-2025-0074', 'F', 'JSS 2', 'B', 'Mrs. Grace Etim', 185000],
  ['kelechi', 'Kelechi Obi', 'STU-2025-0079', 'M', 'JSS 2', 'B', 'Mr. Emeka Obi', 0],
  ['aisha', 'Aisha Lawal', 'STU-2026-1201', 'F', 'JSS 2', 'B', '', 185000, 'Incomplete profile'],
  ['samuel', 'Samuel Olatunji', 'STU-2025-0083', 'M', 'JSS 2', 'B', 'Mrs. Ronke Olatunji', 0],
  ['precious', 'Precious Udoh', 'STU-2025-0088', 'F', 'JSS 2', 'B', 'Mr. Effiong Udoh', 20000],
  ['yusuf', 'Yusuf Abdullahi', 'STU-2025-0091', 'M', 'JSS 2', 'B', 'Mallam Bashir Abdullahi', 0],
  ['michael', 'Michael Adeyemi', 'STU-2023-0311', 'M', 'Primary 5', 'B', 'Mrs. Funke Adeyemi', 0],
  ['seun', 'Oluwaseun Afolabi', 'STU-2021-0140', 'M', 'SSS 3', 'B', 'Mr. Kayode Afolabi', 60000],
  ['halima', 'Halima Garba', 'STU-2023-0412', 'F', 'SSS 1', 'A', 'Mrs. Zainab Garba', 0],
  ['chinedu', 'Chinedu Obiora', 'STU-2026-1144', 'M', 'JSS 1', 'A', 'Mrs. Amaka Obiora', 210000],
  ['amarachi', 'Amarachi Nnaji', 'STU-2024-0520', 'F', 'Primary 3', 'A', 'Mr. Ikenna Nnaji', 0],
  ['tobi', 'Tobi Adesanya', 'STU-2025-0702', 'M', 'Nursery 2', 'A', 'Mrs. Lola Adesanya', 35000],
  ['grace', 'Grace Akpan', 'STU-2022-0233', 'F', 'SSS 1', 'A', 'Mr. Udeme Akpan', 0, 'Transferred'],
  ['ahmed', 'Ahmed Sani', 'STU-2020-0098', 'M', 'SSS 3', 'B', 'Alhaji Sani Bello', 0, 'Withdrawn'],
  // Admitted for 2026/2027 and not yet placed in an arm.
  ['ruth', 'Ruth Alabi', 'STU-2026-1240', 'F', 'JSS 1', null, 'Mr. Segun Alabi', 0],
  ['tunde', 'Tunde Bakare', 'STU-2026-1241', 'M', 'JSS 1', null, 'Mrs. Yemi Bakare', 0],
  ['ngozi', 'Ngozi Ike', 'STU-2026-1242', 'F', 'JSS 1', null, 'Mrs. Ada Ike', 0],
  ['bola', 'Bola Tinubu-Ade', 'STU-2026-1243', 'M', 'JSS 1', null, 'Mr. Kola Ade', 0],
];

const STATE = ['Oyo', 'Anambra', 'Enugu', 'Kaduna', 'Kano', 'Lagos', 'Ogun', 'Rivers'];

function student(s: Seed, i: number): StudentRecord {
  const [id, name, admissionNo, g, level, arm, , balance, status] = s;
  const [firstName = name, ...rest] = name.split(' ');
  const surname = rest.join(' ');
  const year = admissionNo.slice(4, 8);
  const exit =
    status === 'Transferred'
      ? {
          kind: 'Transfer',
          date: '14 Nov 2026',
          reason: 'Change of school',
          destination: 'Loyola Jesuit College',
          notes: '',
        }
      : status === 'Withdrawn'
        ? {
            kind: 'Withdrawal',
            date: '30 Jul 2026',
            reason: 'Family relocation',
            destination: '',
            notes: '',
          }
        : undefined;
  return {
    id,
    firstName,
    surname,
    otherNames: '',
    admissionNo,
    gender: g === 'F' ? 'Female' : 'Male',
    dateOfBirth: id === 'emmanuel' ? '2013-03-14' : '',
    stateOfOrigin: id === 'emmanuel' ? 'Oyo' : STATE[i % STATE.length]!,
    address: id === 'emmanuel' ? '22 Opebi Road, Ikeja, Lagos' : '',
    medicalNotes: id === 'emmanuel' ? 'Mild asthma · inhaler with nurse' : '',
    previousSchool: id === 'emmanuel' ? 'Corona School, Ikeja' : '',
    level,
    arm,
    branch: 'Main Campus',
    status: status ?? 'Active',
    admittedOn: id === 'emmanuel' ? '5 Sep 2025' : arm ? `Sep ${year}` : 'Today',
    admissionType: 'New intake',
    admittedInto: id === 'emmanuel' ? '2025/2026 · JSS 1B' : `${year}/${+year + 1}`,
    enrolledSince: arm ? '14 Sep 2026' : '',
    religious: 'CRS',
    elective: 'French',
    balance,
    ...(exit && { exit }),
    activity:
      id === 'emmanuel'
        ? [
            {
              id: 'e1',
              title: 'Admitted to JSS 1B',
              detail: 'by Adaeze Okonkwo',
              when: '5 Sep 2025',
            },
            {
              id: 'e2',
              title: 'Guardian invited: Mrs. Funke Adeyemi',
              detail: 'Invitation accepted 6 Sep 2025',
              when: '5 Sep 2025',
            },
            {
              id: 'e3',
              title: 'Subject enrollment changed',
              detail: 'Elective: Music → French · approved by Mrs. Chioma Eze',
              when: '20 Sep 2025',
            },
            {
              id: 'e4',
              title: 'Result published · Third Term',
              detail: '2025/2026 · 72.3%',
              when: '22 Jul 2026',
              tone: 'success',
            },
            {
              id: 'e5',
              title: 'Promoted to JSS 2',
              detail: 'Enrolled in 2026/2027 · JSS 2B',
              when: '31 Jul 2026',
              tone: 'success',
            },
          ]
        : blankActivity(
            arm ? '14 Sep 2026' : 'Today',
            arm ? `Enrolled in 2026/2027 · ${level}${arm}` : 'Admitted for 2026/2027',
            'Main Campus',
          ),
  };
}

const PHONES = (i: number) =>
  `+234 80${(i % 7) + 2} 555 01${String(10 + ((i * 7) % 90)).padStart(2, '0')}`;

function greenfieldGuardians(): GuardianRecord[] {
  const byName = new Map<string, GuardianRecord>();
  SEEDS.forEach(([sid, , , , , , gname], i) => {
    if (!gname) return;
    const existing = byName.get(gname);
    const relationship = /^(Mrs|Hajia|Ms)\b/.test(gname) ? 'Mother' : 'Father';
    if (existing) {
      existing.children[sid] = { relationship, paysFees: true, primary: true };
      return;
    }
    const id = gname
      .replace(/^(Mrs|Mr|Alhaji|Mallam|Hajia)\.?\s+/, '')
      .toLowerCase()
      .replace(/[^a-z]+/g, '-');
    byName.set(gname, {
      id,
      name: gname,
      phone: PHONES(i),
      email: `${id.replace(/-/g, '.')}@gmail.com`,
      address: '',
      occupation: '',
      portal: sid === 'yusuf' ? 'No account' : sid === 'daniel' ? 'Invited' : 'Active',
      portalSince: 'Sep 2025',
      children: { [sid]: { relationship, paysFees: true, primary: true } },
    });
  });
  const funke = byName.get('Mrs. Funke Adeyemi')!;
  Object.assign(funke, {
    id: 'funke',
    phone: '+234 803 555 0161',
    email: 'funke.adeyemi@gmail.com',
    address: '22 Opebi Road, Ikeja',
    occupation: 'Pharmacist',
    portalSince: 'Sep 2023',
  });
  const nwosu = byName.get('Mr. Obinna Nwosu')!;
  Object.assign(nwosu, {
    id: 'obinna',
    phone: '+234 806 555 0193',
    address: '9 Allen Avenue, Ikeja',
  });
  const ngozi = byName.get('Mrs. Ngozi Eze')!;
  Object.assign(ngozi, {
    id: 'ngozi-eze',
    phone: '+234 803 555 0172',
    email: 'ngozi.eze@yahoo.com',
  });
  return [
    ...byName.values(),
    {
      id: 'tayo',
      name: 'Mr. Tayo Adeyemi',
      phone: '+234 802 555 0188',
      email: '',
      address: '22 Opebi Road, Ikeja',
      occupation: 'Engineer',
      portal: 'No account',
      portalSince: '',
      children: { emmanuel: { relationship: 'Father', paysFees: false, primary: false } },
    },
    // A second record for the same person, entered without an email: the design's merge case.
    {
      id: 'ngozi-eze-2',
      name: 'Ngozi Eze',
      phone: '+234 803 555 0172',
      email: '',
      address: '',
      occupation: '',
      portal: 'No account',
      portalSince: '',
      children: { chiamaka: { relationship: 'Mother', paysFees: false, primary: false } },
    },
  ];
}

const APPLICATIONS: AdmissionApplication[] = [
  {
    id: 'app-kamsi',
    applicant: 'Kamsi Nwosu',
    note: 'Sister of David Nwosu (JSS 2B)',
    applyingFor: 'JSS 1 · Main Campus',
    type: 'Transfer in',
    applied: '28 Nov 2026',
    guardian: 'Mr. Obinna Nwosu',
    stage: 'Offer accepted',
    stageNote: '',
    studentId: null,
  },
  {
    id: 'app-toluwani',
    applicant: 'Toluwani Ajayi',
    note: '',
    applyingFor: 'Nursery 1 · Lekki Campus',
    type: 'New intake',
    applied: '2 Dec 2026',
    guardian: 'Mrs. Bimpe Ajayi',
    stage: 'Pending',
    stageNote: 'Assessment 10 Dec',
    studentId: null,
  },
  {
    id: 'app-ifeanyi',
    applicant: 'Ifeanyi Okonkwo',
    note: '',
    applyingFor: 'SSS 1 · Main Campus',
    type: 'Transfer in',
    applied: '1 Dec 2026',
    guardian: 'Mr. Chuka Okonkwo',
    stage: 'Under review',
    stageNote: 'Awaiting transcript',
    studentId: null,
  },
  {
    id: 'app-zainab',
    applicant: 'Zainab Bello',
    note: '',
    applyingFor: 'Primary 1 · Main Campus',
    type: 'New intake',
    applied: '30 Nov 2026',
    guardian: 'Hajia Fatima Bello',
    stage: 'Pending',
    stageNote: 'Interview 11 Dec',
    studentId: null,
  },
  {
    id: 'app-ogheneka',
    applicant: 'Oghenekaro Edewor',
    note: '',
    applyingFor: 'JSS 1 · Main Campus',
    type: 'New intake',
    applied: '26 Nov 2026',
    guardian: 'Mrs. Ruth Edewor',
    stage: 'Rejected',
    stageNote: 'No space in JSS 1 for Second Term',
    studentId: null,
  },
];

const ARMS: Record<string, string[]> = {
  'Nursery 1': ['A'],
  'Nursery 2': ['A', 'B'],
  'Primary 1': ['A', 'B'],
  'Primary 2': ['A', 'B'],
  'Primary 3': ['A', 'B'],
  'Primary 4': ['A', 'B'],
  'Primary 5': ['A', 'B'],
  'Primary 6': ['A'],
  'JSS 1': ['A', 'B', 'C'],
  'JSS 2': ['A', 'B'],
  'JSS 3': ['A', 'B', 'C'],
  'SSS 1': ['A', 'B', 'C'],
  'SSS 2': ['A', 'B'],
  'SSS 3': ['A', 'B'],
};

/** Places used beyond the seeded records, so capacity matches the design (JSS 1B is full). */
const BASELINE: Record<string, number> = {
  'JSS 1A': 30,
  'JSS 1B': 35,
  'JSS 1C': 28,
  'JSS 2A': 33,
  'JSS 2B': 0,
  'JSS 3A': 33,
  'JSS 3B': 29,
  'JSS 3C': 35,
};

export const studentsData: Record<string, StudentsData> = {
  greenfield: {
    students: SEEDS.map(student),
    guardians: greenfieldGuardians(),
    applications: APPLICATIONS,
    capacity: 35,
    arms: ARMS,
    armBaseline: BASELINE,
    nextAdmission: 1249,
    importSeq: 14,
  },
  crestview: {
    students: [],
    guardians: [],
    applications: [],
    capacity: 35,
    arms: {
      'JSS 1': ['A'],
      'JSS 2': ['A'],
      'JSS 3': ['A'],
      'SSS 1': ['A'],
      'SSS 2': ['A'],
      'SSS 3': ['A'],
    },
    armBaseline: {},
    nextAdmission: 1,
    importSeq: 1,
  },
};
