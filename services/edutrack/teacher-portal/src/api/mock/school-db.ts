/**
 * The Teacher Workspace's seed school: Greenfield Academy (Main Campus `mc`, Lekki Campus `lk`).
 * Deterministic: generated parts use a seeded PRNG, never Math.random, so every reload and every
 * test sees the same students, assignments and timetable.
 *
 * Feature handlers read these records through the scope helpers in `scope.ts`; they should not
 * filter by teacher themselves.
 */
import { PUBLIC_HOLIDAYS, TERM_DATES, WEEKDAYS, type Weekday } from './clock';

/* ---------- PRNG ---------- */

/** mulberry32: a tiny seeded PRNG. Use `seeded(n)` in feature seeds too. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!,
    chance: (p: number) => next() < p,
    shuffle: <T>(items: readonly T[]) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

/* ---------- School and campuses ---------- */

export const SCHOOL = {
  id: 'greenfield',
  name: 'Greenfield Academy',
  initials: 'GA',
  /** Where sheets go after the HOD (or straight away, for departments with no HOD). */
  academicOffice: 'Academic office',
} as const;

export interface BranchRecord {
  id: 'mc' | 'lk';
  name: string;
  short: string;
}
export const BRANCHES: BranchRecord[] = [
  { id: 'mc', name: 'Main Campus', short: 'Main' },
  { id: 'lk', name: 'Lekki Campus', short: 'Lekki' },
];
export const branchName = (id: string) => BRANCHES.find((b) => b.id === id)?.name ?? id;

/* ---------- Sessions, terms, calendar ---------- */

export type TermStatus = 'Closed' | 'Active' | 'Upcoming';

export interface CalendarEvent {
  id: string;
  kind: 'term' | 'holiday' | 'break' | 'closure' | 'exams' | 'deadline' | 'publication';
  title: string;
  /** "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" for deadlines. */
  from: string;
  to: string;
}

export interface TermRecord {
  id: string;
  sessionId: string;
  sessionName: string;
  name: string;
  status: TermStatus;
  start: string;
  end: string;
  /** Local "YYYY-MM-DDTHH:mm" after which drafts are read-only. */
  resultEntryCloses: string | null;
  resultsPublication: string | null;
  calendar: CalendarEvent[];
}

export const SESSIONS = [
  { id: 's-2526', name: '2025/2026', status: 'Closed' as const },
  { id: 's-2627', name: '2026/2027', status: 'Active' as const },
];

const dates = (id: string) => {
  const { start, end } = TERM_DATES.find((t) => t.id === id)!;
  return { start, end };
};
const holidaysIn = (start: string, end: string): CalendarEvent[] =>
  PUBLIC_HOLIDAYS.filter(([d]) => d >= start && d <= end).map(([d, name]) => ({
    id: `hol-${d}`,
    kind: 'holiday',
    title: name,
    from: d,
    to: d,
  }));

export const TERMS: TermRecord[] = [
  {
    id: 't-2526-3',
    sessionId: 's-2526',
    sessionName: '2025/2026',
    name: 'Third Term',
    status: 'Closed',
    ...dates('t-2526-3'),
    resultEntryCloses: '2026-07-17T23:59',
    resultsPublication: '2026-07-22',
    calendar: [
      { id: 'c3-start', kind: 'term', title: 'Term begins', from: '2026-04-27', to: '2026-04-27' },
      ...holidaysIn('2026-04-27', '2026-07-24'),
      {
        id: 'c3-break',
        kind: 'break',
        title: 'Mid-term break',
        from: '2026-06-01',
        to: '2026-06-05',
      },
      {
        id: 'c3-exams',
        kind: 'exams',
        title: 'Examinations',
        from: '2026-07-06',
        to: '2026-07-14',
      },
      {
        id: 'c3-entry',
        kind: 'deadline',
        title: 'Result entry closes',
        from: '2026-07-17T23:59',
        to: '2026-07-17T23:59',
      },
      {
        id: 'c3-pub',
        kind: 'publication',
        title: 'Results publication',
        from: '2026-07-22',
        to: '2026-07-22',
      },
      { id: 'c3-end', kind: 'term', title: 'Term ends', from: '2026-07-24', to: '2026-07-24' },
    ],
  },
  {
    id: 't-2627-1',
    sessionId: 's-2627',
    sessionName: '2026/2027',
    name: 'First Term',
    status: 'Active',
    ...dates('t-2627-1'),
    resultEntryCloses: '2026-12-11T23:59',
    resultsPublication: '2026-12-14',
    calendar: [
      { id: 'c1-start', kind: 'term', title: 'Term begins', from: '2026-09-14', to: '2026-09-14' },
      ...holidaysIn('2026-09-14', '2026-12-31'),
      {
        id: 'c1-break',
        kind: 'break',
        title: 'Mid-term break',
        from: '2026-10-29',
        to: '2026-11-02',
      },
      {
        id: 'c1-staff',
        kind: 'closure',
        title: 'Staff development day (no classes)',
        from: '2026-11-20',
        to: '2026-11-20',
      },
      {
        id: 'c1-exams',
        kind: 'exams',
        title: 'Examinations',
        from: '2026-11-24',
        to: '2026-12-05',
      },
      {
        id: 'c1-entry',
        kind: 'deadline',
        title: 'Result entry closes',
        from: '2026-12-11T23:59',
        to: '2026-12-11T23:59',
      },
      {
        id: 'c1-pub',
        kind: 'publication',
        title: 'Results publication',
        from: '2026-12-14',
        to: '2026-12-14',
      },
      { id: 'c1-end', kind: 'term', title: 'Term ends', from: '2026-12-18', to: '2026-12-18' },
    ],
  },
  {
    id: 't-2627-2',
    sessionId: 's-2627',
    sessionName: '2026/2027',
    name: 'Second Term',
    status: 'Upcoming',
    ...dates('t-2627-2'),
    resultEntryCloses: null,
    resultsPublication: null,
    calendar: [
      { id: 'c2-start', kind: 'term', title: 'Term begins', from: '2027-01-12', to: '2027-01-12' },
      ...holidaysIn('2027-01-01', '2027-04-09'),
    ],
  },
];

/* ---------- Departments and subjects ---------- */

export interface DepartmentRecord {
  id: string;
  name: string;
  /** `null`: no HOD, so sheets go straight to the academic office and notes to the Academic Head. */
  hodId: string | null;
  subjects: string[];
}

export const DEPARTMENTS: DepartmentRecord[] = [
  {
    id: 'sciences',
    name: 'Sciences',
    hodId: 'bello',
    subjects: ['MTH', 'FMT', 'PHY', 'CHE', 'BIO', 'BSC', 'AGR'],
  },
  { id: 'languages', name: 'Languages', hodId: null, subjects: ['ENG', 'LIE', 'FRE', 'YOR'] },
  {
    id: 'humanities',
    name: 'Humanities',
    hodId: 'ajayi',
    subjects: ['SOS', 'CIV', 'CRS', 'IRS', 'GEO', 'GOV'],
  },
  {
    id: 'vocational',
    name: 'Vocational',
    hodId: null,
    subjects: ['BTE', 'CMP', 'HEC', 'CCA', 'PHE'],
  },
];

/** Reviews lesson notes for departments with no HOD. */
export const ACADEMIC_HEAD_ID = 'eze';

export interface SubjectRecord {
  code: string;
  name: string;
  departmentId: string;
}

const SUBJECT_NAMES: Record<string, string> = {
  MTH: 'Mathematics',
  FMT: 'Further Mathematics',
  PHY: 'Physics',
  CHE: 'Chemistry',
  BIO: 'Biology',
  BSC: 'Basic Science',
  AGR: 'Agricultural Science',
  ENG: 'English Language',
  LIE: 'Literature in English',
  FRE: 'French',
  YOR: 'Yoruba',
  SOS: 'Social Studies',
  CIV: 'Civic Education',
  CRS: 'Christian Religious Studies',
  IRS: 'Islamic Religious Studies',
  GEO: 'Geography',
  GOV: 'Government',
  BTE: 'Basic Technology',
  CMP: 'Computer Studies',
  HEC: 'Home Economics',
  CCA: 'Cultural & Creative Arts',
  PHE: 'Physical & Health Education',
};

export const SUBJECTS: SubjectRecord[] = DEPARTMENTS.flatMap((d) =>
  d.subjects.map((code) => ({ code, name: SUBJECT_NAMES[code]!, departmentId: d.id })),
);

/* ---------- Assessment scheme and grade scales ---------- */

export type Section = 'JSS' | 'SSS';

export interface SchemeComponent {
  key: 'CA1' | 'CA2' | 'EXAM';
  name: string;
  max: number;
  /** Percent of the total. */
  weight: number;
}
export interface GradeBand {
  grade: string;
  min: number;
  max: number;
  remark: string;
  points: number;
  pass: boolean;
}

/** Bands copied from School Admin (`academics-db.ts` SCALES). */
const SCALE_ROWS: Record<string, [string, number, number, string, number, boolean][]> = {
  'A–F': [
    ['A', 70, 100, 'Excellent', 5, true],
    ['B', 60, 69, 'Very good', 4, true],
    ['C', 50, 59, 'Good', 3, true],
    ['D', 45, 49, 'Fair', 2, true],
    ['E', 40, 44, 'Pass', 1, true],
    ['F', 0, 39, 'Fail', 0, false],
  ],
  'WAEC (A1–F9)': [
    ['A1', 75, 100, 'Excellent', 9, true],
    ['B2', 70, 74, 'Very good', 8, true],
    ['B3', 65, 69, 'Good', 7, true],
    ['C4', 60, 64, 'Credit', 6, true],
    ['C5', 55, 59, 'Credit', 5, true],
    ['C6', 50, 54, 'Credit', 4, true],
    ['D7', 45, 49, 'Pass', 3, true],
    ['E8', 40, 44, 'Pass', 2, true],
    ['F9', 0, 39, 'Fail', 1, false],
  ],
};
const scale = (name: string): GradeBand[] =>
  SCALE_ROWS[name]!.map(([grade, min, max, remark, points, pass]) => ({
    grade,
    min,
    max,
    remark,
    points,
    pass,
  }));

const COMPONENTS: SchemeComponent[] = [
  { key: 'CA1', name: 'CA 1', max: 20, weight: 20 },
  { key: 'CA2', name: 'CA 2', max: 20, weight: 20 },
  { key: 'EXAM', name: 'Examination', max: 100, weight: 60 },
];

/** The school's assessment scheme per section. Read-only in the Teacher Workspace. */
export const SCHEMES: Record<
  Section,
  { components: SchemeComponent[]; scaleName: string; scale: GradeBand[] }
> = {
  JSS: { components: COMPONENTS, scaleName: 'A–F', scale: scale('A–F') },
  SSS: { components: COMPONENTS, scaleName: 'WAEC (A1–F9)', scale: scale('WAEC (A1–F9)') },
};

/** The grade band for a total (0–100) in a section. */
export const gradeFor = (section: Section, total: number) =>
  SCHEMES[section].scale.find((b) => total >= b.min && total <= b.max) ?? null;

/* ---------- Periods ---------- */

export interface Period {
  id: string;
  label: string;
  start: string;
  end: string;
  isBreak: boolean;
}

/** Identical to School Admin's PERIODS. */
export const PERIODS: Period[] = [
  { id: 'P1', label: '1', start: '08:00', end: '08:40', isBreak: false },
  { id: 'P2', label: '2', start: '08:40', end: '09:20', isBreak: false },
  { id: 'P3', label: '3', start: '09:20', end: '10:00', isBreak: false },
  { id: 'BR', label: 'Break', start: '10:00', end: '10:20', isBreak: true },
  { id: 'P4', label: '4', start: '10:20', end: '11:00', isBreak: false },
  { id: 'P5', label: '5', start: '11:00', end: '11:40', isBreak: false },
  { id: 'P6', label: '6', start: '11:40', end: '12:20', isBreak: false },
  { id: 'LU', label: 'Lunch', start: '12:20', end: '13:00', isBreak: true },
  { id: 'P7', label: '7', start: '13:00', end: '13:40', isBreak: false },
  { id: 'P8', label: '8', start: '13:40', end: '14:20', isBreak: false },
];
const LESSON_PERIODS = PERIODS.filter((p) => !p.isBreak).map((p) => p.id);

/* ---------- Curriculum and class arms ---------- */

export interface Offering {
  code: string;
  periods: number;
  /**
   * Set for electives: students take one subject of the group (Religious Studies) or opt in
   * (Further Mathematics). Subjects of one group run in the same periods.
   */
  group?: string;
}

const CURRICULUM: Record<Section, Offering[]> = {
  JSS: [
    { code: 'MTH', periods: 5 },
    { code: 'ENG', periods: 5 },
    { code: 'BSC', periods: 3 },
    { code: 'BTE', periods: 2 },
    { code: 'SOS', periods: 2 },
    { code: 'CIV', periods: 2 },
    { code: 'CRS', periods: 2, group: 'REL' },
    { code: 'IRS', periods: 2, group: 'REL' },
    { code: 'FRE', periods: 2 },
    { code: 'YOR', periods: 2 },
    { code: 'AGR', periods: 2 },
    { code: 'CMP', periods: 2 },
    { code: 'HEC', periods: 2 },
    { code: 'CCA', periods: 2 },
    { code: 'PHE', periods: 2 },
  ],
  SSS: [
    { code: 'MTH', periods: 5 },
    { code: 'ENG', periods: 5 },
    { code: 'PHY', periods: 4 },
    { code: 'CHE', periods: 4 },
    { code: 'BIO', periods: 4 },
    { code: 'LIE', periods: 3 },
    { code: 'CIV', periods: 2 },
    { code: 'CMP', periods: 2 },
    { code: 'GEO', periods: 2 },
    { code: 'GOV', periods: 2 },
    { code: 'CRS', periods: 2, group: 'REL' },
    { code: 'IRS', periods: 2, group: 'REL' },
  ],
};

export interface ArmRecord {
  id: string;
  sessionId: string;
  branchId: BranchRecord['id'];
  /** "JSS 2" */
  level: string;
  /** "JSS 2B" */
  name: string;
  section: Section;
  room: string;
  classTeacherId: string | null;
  subjects: Offering[];
}

const arm = (
  id: string,
  sessionId: string,
  branchId: BranchRecord['id'],
  name: string,
  room: string,
  classTeacherId: string | null,
  extra: Offering[] = [],
): ArmRecord => {
  const section: Section = name.startsWith('SSS') ? 'SSS' : 'JSS';
  return {
    id,
    sessionId,
    branchId,
    level: name.slice(0, 5),
    name,
    section,
    room,
    classTeacherId,
    subjects: [...CURRICULUM[section], ...extra],
  };
};

export const ARMS: ArmRecord[] = [
  // 2026/2027
  arm('mc-jss1a', 's-2627', 'mc', 'JSS 1A', 'Block A · Room 3', 'kojo'),
  arm('mc-jss1b', 's-2627', 'mc', 'JSS 1B', 'Block A · Room 4', 'obi'),
  arm('mc-jss2a', 's-2627', 'mc', 'JSS 2A', 'Block B · Room 1', 'adeleke'),
  arm('mc-jss2b', 's-2627', 'mc', 'JSS 2B', 'Block B · Room 2', 'okafor'),
  arm('mc-jss3a', 's-2627', 'mc', 'JSS 3A', 'Block B · Room 5', 'alao'),
  arm('mc-sss1a', 's-2627', 'mc', 'SSS 1A', 'Block C · Room 2', 'bello'),
  arm('mc-sss2a', 's-2627', 'mc', 'SSS 2A', 'Block C · Room 4', 'fadeyi'),
  arm('lk-sss1a', 's-2627', 'lk', 'SSS 1A', 'Lekki · Room 6', 'eke', [
    { code: 'FMT', periods: 3, group: 'FMT' },
  ]),
  // 2025/2026, for history (their students moved up a class in September)
  arm('p-mc-jss1a', 's-2526', 'mc', 'JSS 1A', 'Block A · Room 3', 'kojo'),
  arm('p-mc-jss1b', 's-2526', 'mc', 'JSS 1B', 'Block A · Room 4', 'okafor'),
  arm('p-mc-jss2a', 's-2526', 'mc', 'JSS 2A', 'Block B · Room 1', 'adeleke'),
  arm('p-mc-sss1a', 's-2526', 'mc', 'SSS 1A', 'Block C · Room 2', 'bello'),
];

/** Lab rooms by subject; other lessons are in the arm's own room. */
const LABS: Record<string, string> = {
  PHY: 'Physics Lab',
  CHE: 'Chemistry Lab',
  BIO: 'Biology Lab',
  CMP: 'ICT Lab',
};
export const roomFor = (a: ArmRecord, subject: string) =>
  LABS[subject] ? `${a.branchId === 'lk' ? 'Lekki · ' : ''}${LABS[subject]}` : a.room;

/* ---------- Staff ---------- */

export type StaffRole = 'Teacher' | 'HOD' | 'Academic Head';

export interface StaffRecord {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  /** "Mr. Samuel Ade" */
  name: string;
  staffNo: string;
  email: string;
  gender: 'Male' | 'Female';
  phone: string;
  address: string;
  emergencyContact: { name: string; phone: string; relationship: string } | null;
  branchIds: BranchRecord['id'][];
  departmentId: string | null;
  roles: StaffRole[];
  /** Job title, e.g. "Mathematics Teacher", "VP Academics". */
  position: string;
  employment: 'Full-time' | 'Part-time';
  joinedOn: string;
}

/** id, name, staff no, branches, department, roles, position, employment, joined. */
const STAFF_ROWS: [
  string,
  string,
  string,
  BranchRecord['id'][],
  string | null,
  StaffRole[],
  string,
  'Full-time' | 'Part-time',
  string,
][] = [
  [
    'eze',
    'Mrs. Chioma Eze',
    'GFA-ST-0042',
    ['mc'],
    'languages',
    ['Teacher', 'Academic Head'],
    'VP Academics',
    'Full-time',
    '2014-09-08',
  ],
  [
    'bello',
    'Mr. Ibrahim Bello',
    'GFA-ST-0061',
    ['mc'],
    'sciences',
    ['Teacher', 'HOD'],
    'HOD Sciences · Physics',
    'Full-time',
    '2016-01-11',
  ],
  [
    'ade',
    'Mr. Samuel Ade',
    'GFA-ST-0117',
    ['mc', 'lk'],
    'sciences',
    ['Teacher'],
    'Mathematics Teacher',
    'Full-time',
    '2021-09-13',
  ],
  [
    'okafor',
    'Mrs. Grace Okafor',
    'GFA-ST-0098',
    ['mc'],
    'languages',
    ['Teacher'],
    'English Teacher',
    'Full-time',
    '2019-09-09',
  ],
  [
    'ajayi',
    'Mrs. Bimpe Ajayi',
    'GFA-ST-0055',
    ['mc'],
    'humanities',
    ['Teacher', 'HOD'],
    'HOD Humanities',
    'Full-time',
    '2015-09-14',
  ],
  [
    'kojo',
    'Mrs. Kemi Ojo',
    'GFA-ST-0073',
    ['mc'],
    'humanities',
    ['Teacher'],
    'Religious Studies Teacher',
    'Full-time',
    '2017-09-11',
  ],
  [
    'adeleke',
    'Mrs. Ronke Adeleke',
    'GFA-ST-0081',
    ['mc'],
    'vocational',
    ['Teacher'],
    'Technology Teacher',
    'Full-time',
    '2018-01-08',
  ],
  [
    'alao',
    'Mr. Segun Alao',
    'GFA-ST-0089',
    ['mc', 'lk'],
    'vocational',
    ['Teacher'],
    'PHE & Arts Teacher',
    'Full-time',
    '2018-09-10',
  ],
  [
    'kouassi',
    'Mme. Aline Kouassi',
    'GFA-ST-0104',
    ['mc'],
    'languages',
    ['Teacher'],
    'French Teacher',
    'Part-time',
    '2020-01-13',
  ],
  [
    'obi',
    'Mrs. Ifeyinwa Obi',
    'GFA-ST-0092',
    ['mc'],
    'languages',
    ['Teacher'],
    'Yoruba Teacher',
    'Full-time',
    '2019-01-07',
  ],
  [
    'oladipo',
    'Mr. Yinka Oladipo',
    'GFA-ST-0066',
    ['mc'],
    'sciences',
    ['Teacher'],
    'Biology Teacher',
    'Full-time',
    '2016-09-12',
  ],
  [
    'salami',
    'Mr. Babatunde Salami',
    'GFA-ST-0131',
    ['mc'],
    'vocational',
    ['Teacher'],
    'Teacher',
    'Full-time',
    '2026-11-30',
  ],
  [
    'fadeyi',
    'Mr. Tayo Fadeyi',
    'GFA-ST-0077',
    ['mc'],
    'humanities',
    ['Teacher'],
    'Geography Teacher',
    'Full-time',
    '2017-09-11',
  ],
  [
    'nnadi',
    'Mr. Chinedu Nnadi',
    'GFA-ST-0085',
    ['mc'],
    'sciences',
    ['Teacher'],
    'Mathematics Teacher',
    'Full-time',
    '2018-09-10',
  ],
  [
    'adeyinka',
    'Mrs. Yewande Adeyinka',
    'GFA-ST-0079',
    ['mc'],
    'languages',
    ['Teacher'],
    'English Teacher',
    'Full-time',
    '2017-09-11',
  ],
  [
    'balogun',
    'Mrs. Zainab Balogun',
    'GFA-ST-0101',
    ['mc'],
    'sciences',
    ['Teacher'],
    'Basic Science Teacher',
    'Full-time',
    '2020-09-14',
  ],
  [
    'okonjo',
    'Mr. Obinna Okonjo',
    'GFA-ST-0095',
    ['mc'],
    'sciences',
    ['Teacher'],
    'Chemistry Teacher',
    'Full-time',
    '2019-09-09',
  ],
  [
    'abdullahi',
    'Mallam Musa Abdullahi',
    'GFA-ST-0108',
    ['mc', 'lk'],
    'humanities',
    ['Teacher'],
    'IRS Teacher',
    'Part-time',
    '2020-09-14',
  ],
  [
    'danladi',
    'Mr. Musa Danladi',
    'GFA-ST-0112',
    ['lk'],
    'sciences',
    ['Teacher'],
    'Mathematics Teacher',
    'Full-time',
    '2021-01-11',
  ],
  [
    'bamidele',
    'Mrs. Funmi Bamidele',
    'GFA-ST-0110',
    ['lk'],
    'languages',
    ['Teacher'],
    'English Teacher',
    'Full-time',
    '2020-09-14',
  ],
  [
    'eke',
    'Mr. Victor Eke',
    'GFA-ST-0114',
    ['lk'],
    'sciences',
    ['Teacher'],
    'Science Teacher',
    'Full-time',
    '2021-01-11',
  ],
  [
    'yusuf',
    'Mrs. Hadiza Yusuf',
    'GFA-ST-0115',
    ['lk'],
    'humanities',
    ['Teacher'],
    'Humanities Teacher',
    'Full-time',
    '2021-01-11',
  ],
  [
    'nnamdi',
    'Mr. Chukwudi Nnamdi',
    'GFA-ST-0133',
    ['mc'],
    'sciences',
    ['Teacher'],
    'Teacher',
    'Full-time',
    '2026-12-07',
  ],
  [
    'adebayo',
    'Mrs. Funke Adebayo',
    'GFA-ST-0058',
    ['mc'],
    'languages',
    ['Teacher'],
    'English Teacher',
    'Full-time',
    '2015-09-14',
  ],
];

/** Seeded contact details; Mr. Salami has no phone yet (first sign-in: complete your profile). */
const CONTACTS: Record<string, [phone: string, address: string]> = {
  ade: ['0803 412 7781', '14 Adeniyi Jones Avenue, Ikeja, Lagos'],
  okafor: ['0805 221 9087', '3 Allen Avenue, Ikeja, Lagos'],
  bello: ['0802 556 1144', '22 Opebi Road, Ikeja, Lagos'],
  eze: ['0806 778 2290', '9 Isaac John Street, GRA Ikeja, Lagos'],
  salami: ['', ''],
};

/** Mr. Salami goes by Tunde, so his address is t.salami@. */
const EMAIL_OVERRIDES: Record<string, string> = { salami: 't.salami@greenfield.edu.ng' };

export const STAFF: StaffRecord[] = STAFF_ROWS.map(
  ([id, name, staffNo, branchIds, departmentId, roles, position, employment, joinedOn], i) => {
    const [title, firstName, ...rest] = name.split(' ');
    const lastName = rest.join(' ');
    const [phone, address] = CONTACTS[id] ?? [
      `080${(i % 3) + 3} ${String(300 + i * 7).padStart(3, '0')} ${String(1000 + i * 137).slice(-4)}`,
      'Lagos',
    ];
    return {
      id,
      title: title!,
      firstName: firstName!,
      lastName,
      name,
      staffNo,
      email:
        EMAIL_OVERRIDES[id] ??
        `${firstName![0]!.toLowerCase()}.${lastName.toLowerCase()}@greenfield.edu.ng`,
      gender: title === 'Mr.' || title === 'Mallam' ? 'Male' : 'Female',
      phone,
      address,
      emergencyContact:
        id === 'ade'
          ? { name: 'Mrs. Funke Ade', phone: '0807 993 4410', relationship: 'Spouse' }
          : null,
      branchIds,
      departmentId,
      roles,
      position,
      employment,
      joinedOn,
    };
  },
);

/* ---------- Students ---------- */

export interface StudentRecord {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  /** GFA/yyyy/nnnn */
  admissionNo: string;
  gender: 'Male' | 'Female';
  /** The arm the student is in now (or was in when they left). */
  armId: string;
  joinedOn: string;
  status: 'Active' | 'Transferred';
  /** Last day at the school, for students who left. */
  leftOn: string | null;
  /** Elective subjects taken (Religious Studies choice, Further Mathematics). */
  electives: string[];
}

/** A student's time in an arm. `to` is null while they are still in it. */
export interface Membership {
  studentId: string;
  armId: string;
  from: string;
  to: string | null;
}

const FEMALE = [
  'Adaeze',
  'Ngozi',
  'Funmilayo',
  'Aisha',
  'Ifeoma',
  'Temitope',
  'Zainab',
  'Oluchi',
  'Folake',
  'Amina',
  'Chidinma',
  'Yetunde',
  'Halima',
  'Nkechi',
  'Damilola',
  'Ruth',
  'Esther',
  'Precious',
  'Hauwa',
  'Kemi',
];
const MALE = [
  'Chinedu',
  'Oluwaseun',
  'Emeka',
  'Abdullahi',
  'Tobi',
  'Uche',
  'Segun',
  'Musa',
  'Ikenna',
  'Femi',
  'Yusuf',
  'Obinna',
  'Kunle',
  'Chukwuemeka',
  'Babajide',
  'Joseph',
  'Michael',
  'Peter',
  'Sani',
  'Gbenga',
];
const SURNAMES = [
  'Okonkwo',
  'Adebayo',
  'Nwankwo',
  'Bello',
  'Ogunleye',
  'Eze',
  'Lawal',
  'Okoro',
  'Afolabi',
  'Abubakar',
  'Okeke',
  'Oyelaran',
  'Chukwu',
  'Ibrahim',
  'Adeleke',
  'Nnaji',
  'Usman',
  'Akinwale',
  'Obi',
  'Danjuma',
  'Onyeka',
  'Salako',
  'Mohammed',
  'Ojo',
  'Uzor',
];

/** JSS 2B's students, as in the design. */
const JSS2B: [string, 'Male' | 'Female', ('IRS' | 'CRS')?][] = [
  ['Favour Okeke', 'Female'],
  ['Chiamaka Eze', 'Female'],
  ['Samuel Olatunji', 'Male'],
  ['Tolulope Bankole', 'Female'],
  ['Kelechi Obi', 'Male'],
  ['Emmanuel Adeyemi', 'Male'],
  ['Blessing Etim', 'Female'],
  ['Daniel Musa', 'Male'],
  ['Ibrahim Danjuma', 'Male', 'IRS'],
  ['David Nwosu', 'Male'],
  ['Sarah Ibrahim', 'Female', 'IRS'],
  ['Adaeze Nnamdi', 'Female'],
  ['Tunde Bakare', 'Male'],
  ['Grace Achebe', 'Female'],
];

/** Current arm, size, the 2025/2026 arm its students were in, the year they first joined. */
const INTAKE: [armId: string, size: number, pastArmId: string | null, joined: string][] = [
  ['mc-jss1a', 30, null, '2026-09-14'],
  ['mc-jss1b', 30, null, '2026-09-14'],
  ['mc-jss2a', 29, 'p-mc-jss1a', '2025-09-15'],
  ['mc-jss2b', 14, 'p-mc-jss1b', '2025-09-15'],
  ['mc-jss3a', 27, 'p-mc-jss2a', '2024-09-16'],
  ['mc-sss1a', 28, null, '2026-09-14'],
  ['mc-sss2a', 24, 'p-mc-sss1a', '2025-09-15'],
  ['lk-sss1a', 20, null, '2026-09-14'],
];
const PAST_SESSION = { from: '2025-09-15', to: '2026-07-24' };
const CURRENT_FROM = '2026-09-14';

export const STUDENTS: StudentRecord[] = [];
export const MEMBERSHIPS: Membership[] = [];

(function seedStudents() {
  const rng = seeded(20262027);
  const serial: Record<string, number> = { '2024': 211, '2025': 318, '2026': 402 };
  const used = new Set<string>();
  const add = (
    first: string,
    last: string,
    gender: 'Male' | 'Female',
    armId: string,
    joinedOn: string,
    electives: string[],
    pastArmId: string | null,
  ) => {
    const year = joinedOn.slice(0, 4);
    serial[year] = (serial[year] ?? 100) + 1;
    const id = `st-${String(STUDENTS.length + 1).padStart(3, '0')}`;
    STUDENTS.push({
      id,
      firstName: first,
      lastName: last,
      name: `${first} ${last}`,
      admissionNo: `GFA/${year}/${String(serial[year]).padStart(4, '0')}`,
      gender,
      armId,
      joinedOn,
      status: 'Active',
      leftOn: null,
      electives,
    });
    if (pastArmId) MEMBERSHIPS.push({ studentId: id, armId: pastArmId, ...PAST_SESSION });
    MEMBERSHIPS.push({
      studentId: id,
      armId,
      from: joinedOn > CURRENT_FROM ? joinedOn : CURRENT_FROM,
      to: null,
    });
    return STUDENTS[STUDENTS.length - 1]!;
  };
  const generatedName = (): [string, string, 'Male' | 'Female'] => {
    for (;;) {
      const gender = rng.chance(0.5) ? 'Female' : 'Male';
      const first = rng.pick(gender === 'Female' ? FEMALE : MALE);
      const last = rng.pick(SURNAMES);
      if (!used.has(`${first} ${last}`)) {
        used.add(`${first} ${last}`);
        return [first, last, gender];
      }
    }
  };

  for (const [armId, size, pastArmId, joined] of INTAKE) {
    if (armId === 'mc-jss2b') {
      for (const [name, gender, rel] of JSS2B) {
        const [first, ...rest] = name.split(' ');
        used.add(name);
        add(first!, rest.join(' '), gender, armId, joined, [rel ?? 'CRS'], pastArmId);
      }
      continue;
    }
    for (let i = 0; i < size; i++) {
      const [first, last, gender] = generatedName();
      add(first, last, gender, armId, joined, [rng.chance(0.2) ? 'IRS' : 'CRS'], pastArmId);
    }
  }

  // Lekki SSS 1A: 12 of the 20 take Further Mathematics.
  const lekki = STUDENTS.filter((s) => s.armId === 'lk-sss1a');
  for (const s of rng.shuffle(lekki).slice(0, 12)) s.electives.push('FMT');

  // Joined JSS 1A after the mid-term break (2 Nov): 31 students now.
  add('Oreoluwa', 'Fashola', 'Female', 'mc-jss1a', '2026-11-02', ['CRS'], null);

  // Left JSS 2B on 16 Nov (transferred to another school): kept for history only.
  const left = add('Chinonso', 'Afolabi', 'Male', 'mc-jss2b', '2025-09-15', ['CRS'], 'p-mc-jss1b');
  left.status = 'Transferred';
  left.leftOn = '2026-11-16';
  MEMBERSHIPS.find((m) => m.studentId === left.id && m.armId === 'mc-jss2b')!.to = '2026-11-16';
})();

/* ---------- Teaching assignments ---------- */

export interface TeachingAssignmentRecord {
  /** "ta-t-2627-1-mc-jss2b-MTH" */
  id: string;
  termId: string;
  teacherId: string;
  armId: string;
  subject: string;
  branchId: BranchRecord['id'];
  periodsPerWeek: number;
  type: 'Full-time' | 'Part-time';
}

/** Who teaches each subject unless an override says otherwise. */
const DEFAULT_TEACHER: Record<BranchRecord['id'], Record<string, string>> = {
  mc: {
    MTH: 'nnadi',
    ENG: 'adeyinka',
    LIE: 'adeyinka',
    BSC: 'balogun',
    BTE: 'adeleke',
    CMP: 'adeleke',
    SOS: 'ajayi',
    CIV: 'ajayi',
    CRS: 'kojo',
    IRS: 'abdullahi',
    HEC: 'kojo',
    FRE: 'kouassi',
    YOR: 'obi',
    AGR: 'oladipo',
    BIO: 'oladipo',
    CCA: 'alao',
    PHE: 'alao',
    PHY: 'okonjo',
    CHE: 'okonjo',
    GEO: 'fadeyi',
    GOV: 'fadeyi',
  },
  lk: {
    MTH: 'danladi',
    ENG: 'bamidele',
    LIE: 'bamidele',
    PHY: 'eke',
    CHE: 'eke',
    BIO: 'eke',
    CIV: 'yusuf',
    GEO: 'yusuf',
    GOV: 'yusuf',
    CMP: 'yusuf',
    CRS: 'yusuf',
    IRS: 'abdullahi',
    FMT: 'ade',
  },
};

/** "termId|armId|subject" → teacher, for the demo accounts' classes. */
const OVERRIDES: Record<string, string> = {
  't-2627-1|mc-jss1a|MTH': 'ade',
  't-2627-1|mc-jss2b|MTH': 'ade',
  't-2627-1|mc-sss1a|MTH': 'ade',
  't-2627-1|lk-sss1a|FMT': 'ade',
  't-2627-1|mc-jss2b|ENG': 'okafor',
  't-2627-1|mc-jss2a|ENG': 'okafor',
  't-2627-1|mc-sss1a|PHY': 'bello',
  't-2627-1|mc-sss2a|PHY': 'bello',
  't-2627-1|mc-jss2b|BSC': 'bello',
  't-2627-1|mc-jss1a|ENG': 'eze',
  't-2526-3|p-mc-jss1b|MTH': 'ade',
  't-2526-3|p-mc-jss2a|MTH': 'ade',
  't-2526-3|p-mc-jss1b|ENG': 'okafor',
  't-2526-3|p-mc-sss1a|PHY': 'bello',
};
/** Assignments that differ from the teacher's normal employment type. */
const PART_TIME = new Set(['t-2627-1|lk-sss1a|FMT']);

/** The terms that have teaching assignments (the upcoming term isn't assigned yet). */
const ASSIGNED_TERMS = ['t-2526-3', 't-2627-1'];

export const TEACHING_ASSIGNMENTS: TeachingAssignmentRecord[] = ASSIGNED_TERMS.flatMap((termId) => {
  const sessionId = TERMS.find((t) => t.id === termId)!.sessionId;
  return ARMS.filter((a) => a.sessionId === sessionId).flatMap((a) =>
    a.subjects.map((o) => {
      const key = `${termId}|${a.id}|${o.code}`;
      const teacherId = OVERRIDES[key] ?? DEFAULT_TEACHER[a.branchId][o.code]!;
      const staff = STAFF.find((s) => s.id === teacherId)!;
      return {
        id: `ta-${termId}-${a.id}-${o.code}`,
        termId,
        teacherId,
        armId: a.id,
        subject: o.code,
        branchId: a.branchId,
        periodsPerWeek: o.periods,
        type: PART_TIME.has(key) ? 'Part-time' : staff.employment,
      };
    }),
  );
});

/* ---------- Published timetable ---------- */

export interface LessonRecord {
  id: string;
  termId: string;
  assignmentId: string;
  armId: string;
  subject: string;
  teacherId: string;
  branchId: BranchRecord['id'];
  day: Weekday;
  periodId: string;
  room: string;
}

export const TIMETABLES: Record<string, { published: boolean; publishedOn: string | null }> = {
  't-2526-3': { published: true, publishedOn: '2026-04-20' },
  't-2627-1': { published: true, publishedOn: '2026-09-09' },
  't-2627-2': { published: false, publishedOn: null },
};

/**
 * Lessons placed before the generator runs: Mr. Ade's Further Maths at Lekki on Tuesday and
 * Thursday afternoons.
 */
const FIXED: Record<string, [Weekday, string][]> = {
  't-2627-1|lk-sss1a|FMT': [
    ['Tue', 'P7'],
    ['Tue', 'P8'],
    ['Thu', 'P7'],
  ],
};
/**
 * Teacher slots the generator must not use. On his Lekki days Mr. Ade only teaches at Main
 * before 11:00, so he is never in back-to-back lessons on different campuses.
 */
const BLOCKED: Record<string, Set<string>> = {
  't-2627-1': new Set(
    ['Tue', 'Thu'].flatMap((d) => ['P5', 'P6', 'P7', 'P8'].map((p) => `ade|mc|${d}|${p}`)),
  ),
};

export const LESSONS: LessonRecord[] = [];

(function seedTimetable() {
  for (const termId of ASSIGNED_TERMS) {
    const term = TERMS.find((t) => t.id === termId)!;
    const teacherBusy = new Set<string>();
    const armBusy = new Set<string>();
    const blocked = BLOCKED[termId] ?? new Set<string>();
    const arms = ARMS.filter((a) => a.sessionId === term.sessionId);
    const assignment = (armId: string, subject: string) =>
      TEACHING_ASSIGNMENTS.find(
        (t) => t.termId === termId && t.armId === armId && t.subject === subject,
      )!;
    const place = (a: ArmRecord, subjects: string[], day: Weekday, periodId: string) => {
      armBusy.add(`${a.id}|${day}|${periodId}`);
      for (const subject of subjects) {
        const ta = assignment(a.id, subject);
        teacherBusy.add(`${ta.teacherId}|${day}|${periodId}`);
        LESSONS.push({
          id: `ls-${termId}-${a.id}-${subject}-${day}-${periodId}`,
          termId,
          assignmentId: ta.id,
          armId: a.id,
          subject,
          teacherId: ta.teacherId,
          branchId: a.branchId,
          day,
          periodId,
          room: roomFor(a, subject),
        });
      }
    };
    const free = (a: ArmRecord, subjects: string[], day: Weekday, periodId: string) =>
      !armBusy.has(`${a.id}|${day}|${periodId}`) &&
      subjects.every((s) => {
        const t = assignment(a.id, s).teacherId;
        return (
          !teacherBusy.has(`${t}|${day}|${periodId}`) &&
          !blocked.has(`${t}|${a.branchId}|${day}|${periodId}`)
        );
      });

    // Fixed lessons first.
    for (const [key, slots] of Object.entries(FIXED)) {
      const [t, armId, subject] = key.split('|');
      if (t !== termId) continue;
      const a = ARMS.find((x) => x.id === armId)!;
      for (const [day, p] of slots) place(a, [subject!], day, p);
    }

    arms.forEach((a, ai) => {
      // Electives of one group share periods; everything else is its own unit.
      const units = new Map<string, { subjects: string[]; periods: number }>();
      for (const o of a.subjects) {
        if (FIXED[`${termId}|${a.id}|${o.code}`]) continue;
        const key = o.group && o.group !== o.code ? o.group : o.code;
        const unit = units.get(key) ?? { subjects: [], periods: o.periods };
        unit.subjects.push(o.code);
        units.set(key, unit);
      }
      [...units.values()]
        .sort((x, y) => y.periods - x.periods || x.subjects[0]!.localeCompare(y.subjects[0]!))
        .forEach((unit, ui) => {
          let left = unit.periods;
          const perDay: Partial<Record<Weekday, number>> = {};
          const offset = (ai * 3 + ui * 5) % LESSON_PERIODS.length;
          const periods = [...LESSON_PERIODS.slice(offset), ...LESSON_PERIODS.slice(0, offset)];
          // Spread over the week first (one a day), then allow doubles, then anything free.
          for (const cap of [1, 2, 8]) {
            for (let di = 0; di < 5 && left > 0; di++) {
              const day = WEEKDAYS[(di + ai + ui) % 5]!;
              for (const p of periods) {
                if (left === 0 || (perDay[day] ?? 0) >= cap) break;
                if (!free(a, unit.subjects, day, p)) continue;
                place(a, unit.subjects, day, p);
                perDay[day] = (perDay[day] ?? 0) + 1;
                left--;
              }
            }
            if (left === 0) break;
          }
          if (left > 0)
            throw new Error(
              `Timetable seed: ${left} lesson(s) of ${unit.subjects.join('/')} in ${a.id} for ${termId} couldn't be placed`,
            );
        });
    });
  }
})();

/* ---------- Announcements ---------- */

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  audience: 'Teachers' | 'Whole school';
  /** `null`: every campus. */
  branchIds: BranchRecord['id'][] | null;
  author: string;
  authorRole: string;
  /** Local "YYYY-MM-DDTHH:mm" */
  publishedAt: string;
  pinned: boolean;
}

export const ANNOUNCEMENTS: AnnouncementRecord[] = [
  {
    id: 'an-6',
    title: 'Result entry closes Friday 11 December, 23:59',
    body: 'All First Term score sheets must be submitted by Friday 11 December at 23:59. After that, drafts become read-only and only the academic office can reopen a sheet.\n\nSheets in departments with a HOD go to the HOD first; please leave time for review. Results are published on Monday 14 December.',
    audience: 'Teachers',
    branchIds: null,
    author: 'Mrs. Chioma Eze',
    authorRole: 'VP Academics',
    publishedAt: '2026-12-07T09:00',
    pinned: true,
  },
  {
    id: 'an-5',
    title: 'Christmas carol service: Thursday 17 December',
    body: 'Our end-of-term carol service holds in the main hall on Thursday 17 December from 10:00. Class teachers, please bring your classes down at 09:45. Parents are welcome.',
    audience: 'Whole school',
    branchIds: null,
    author: 'Mrs. Adaeze Okonkwo',
    authorRole: 'Principal',
    publishedAt: '2026-12-04T14:30',
    pinned: false,
  },
  {
    id: 'an-4',
    title: 'Lekki Campus: generator maintenance on Saturday',
    body: 'The Lekki Campus generator will be serviced on Saturday 12 December. The ICT Lab will be closed that day.',
    audience: 'Teachers',
    branchIds: ['lk'],
    author: 'Mr. Kunle Bakare',
    authorRole: 'Facilities Manager',
    publishedAt: '2026-12-03T11:10',
    pinned: false,
  },
  {
    id: 'an-3',
    title: 'Weekly lesson notes are now submitted in the Teacher Workspace',
    body: 'From this week, lesson notes are submitted in the Teacher Workspace instead of on paper. Notes are due on the Friday before the week they cover and go to your HOD (or the Academic Head where a department has no HOD).',
    audience: 'Teachers',
    branchIds: null,
    author: 'Mrs. Chioma Eze',
    authorRole: 'VP Academics',
    publishedAt: '2026-11-23T08:00',
    pinned: false,
  },
  {
    id: 'an-2',
    title: 'Staff development day: Friday 20 November',
    body: 'There are no classes on Friday 20 November. All teaching staff attend the training on assessment for learning in the main hall from 09:00 to 15:00.',
    audience: 'Teachers',
    branchIds: null,
    author: 'Mrs. Adaeze Okonkwo',
    authorRole: 'Principal',
    publishedAt: '2026-11-13T16:00',
    pinned: false,
  },
  {
    id: 'an-1',
    title: 'Welcome back: First Term 2026/2027',
    body: 'Welcome to the new session. The First Term timetable is published and your classes are in the Teacher Workspace. Speak to the academic office if any of your assignments look wrong.',
    audience: 'Whole school',
    branchIds: null,
    author: 'Mrs. Adaeze Okonkwo',
    authorRole: 'Principal',
    publishedAt: '2026-09-11T10:00',
    pinned: false,
  },
];
