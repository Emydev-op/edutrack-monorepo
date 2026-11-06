/*
 * Academics data for the mock API, per school: sections, sessions and terms, calendar events,
 * class levels and arms, subjects and curriculum, teachers and assignments, timetables,
 * assessment schemes, result sheets, corrections and promotion. Greenfield Academy is seeded
 * from the School Admin design; Crestview College starts empty and is set up through the
 * Setup Center.
 */
import type {
  AcademicSession,
  AssessmentConfig,
  AssessmentScheme,
  AssignmentType,
  CalendarEvent,
  CorrectionStatus,
  ElectiveGroup,
  Offering,
  Period,
  PromotionDecision,
  ScoreValue,
  SheetStatus,
  SubjectCategory,
  TimelineEntry,
  TimetableStatus,
} from '@/types';
import { DAYS } from '@/types';

import { schoolData } from './school-db';
import { studentsData } from './students-db';

/* ---------------- Records ---------------- */

export interface SectionRec {
  id: string;
  name: string;
  code: string;
  description: string;
}

export interface ArmRec {
  id: string;
  arm: string;
  capacity: number;
  classTeacherId: string | null;
  room: string;
  /** Students in this arm beyond those with records (other campuses). */
  baseline: number;
}

export interface LevelRec {
  id: string;
  branchId: string;
  section: string;
  name: string;
  arms: ArmRec[];
}

export interface SubjectRec {
  code: string;
  name: string;
  category: SubjectCategory;
  status: 'Active' | 'Inactive';
  periods: number;
}

export interface TeacherRec {
  id: string;
  name: string;
  /** Branch ids. */
  branches: string[];
  qualified: string[];
  employment: 'Full-time' | 'Part-time';
  maxPeriods: number;
}

export interface AssignmentRec {
  id: string;
  teacherId: string;
  subject: string;
  armId: string;
  type: AssignmentType;
}

export interface TimetableRec {
  armId: string;
  termId: string;
  status: TimetableStatus;
  version: number;
  publishedVersion: number | null;
  grid: Record<string, string>;
  history: TimelineEntry[];
}

export interface SheetRec {
  armId: string;
  subject: string;
  termId: string;
  status: SheetStatus;
  submittedAt: string | null;
  returnNote: string;
  /** studentId → one value per assessment component. */
  scores: Record<string, ScoreValue[]>;
  history: TimelineEntry[];
}

export interface CorrectionRec {
  id: string;
  studentId: string;
  armId: string;
  subject: string;
  termId: string;
  componentIndex: number;
  original: number;
  proposed: number;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  evidence: string | null;
  status: CorrectionStatus;
  decisionNote: string;
  history: TimelineEntry[];
}

export interface PromotionStudentRec {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  average: number;
  maths: number;
  english: number;
  note: string;
  suggestion: PromotionDecision;
  decision: PromotionDecision | null;
  reason: string;
  balance: number;
}

export interface PromotionClassRec {
  id: string;
  name: string;
  level: string;
  arm: string;
  nextLevel: string | null;
  status: 'Pending' | 'Complete' | 'Graduated';
  total: number;
  students: PromotionStudentRec[];
}

export interface PromotionRec {
  fromSessionId: string;
  toSessionId: string;
  rule: string;
  classes: PromotionClassRec[];
}

export type AcadStep =
  | 'sections'
  | 'session'
  | 'terms'
  | 'classes'
  | 'subjects'
  | 'assessment'
  | 'assignments'
  | 'timetable';

export interface AcademicsData {
  sections: SectionRec[];
  confirmed: Record<AcadStep, boolean>;
  sessions: AcademicSession[];
  events: CalendarEvent[];
  levels: LevelRec[];
  subjects: SubjectRec[];
  curriculum: Record<string, Record<string, Record<string, Offering>>>;
  groups: ElectiveGroup[];
  teachers: TeacherRec[];
  assignments: AssignmentRec[];
  /** Last term's assignments, for "Copy from previous term". */
  previousAssignments: AssignmentRec[];
  timetables: TimetableRec[];
  assessment: AssessmentConfig;
  sheets: SheetRec[];
  /** Arms whose results are published, per term ("termId|armId"). */
  published: string[];
  /** Report card version per student per term ("termId|studentId"). */
  reportVersions: Record<string, number>;
  corrections: CorrectionRec[];
  promotion: PromotionRec | null;
  seq: number;
}

/* ---------------- Reference data ---------------- */

export const STANDARD_SECTIONS: Record<string, { code: string; description: string }> = {
  Nursery: { code: 'NUR', description: 'Early years · ages 2–5' },
  Primary: { code: 'PRI', description: 'Primary 1–6 · ages 6–11' },
  'Junior Secondary': { code: 'JSS', description: 'JSS 1–3 · Basic Education Certificate' },
  'Senior Secondary': { code: 'SSS', description: 'SSS 1–3 · WAEC and NECO' },
};

export const DEFAULT_LEVELS: Record<string, string[]> = {
  NUR: ['Pre-Nursery', 'Nursery 1', 'Nursery 2'],
  PRI: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'],
  JSS: ['JSS 1', 'JSS 2', 'JSS 3'],
  SSS: ['SSS 1', 'SSS 2', 'SSS 3'],
};

/** name, code, category, periods, offering per section code. */
export const SUGGESTED_SUBJECTS: [
  string,
  string,
  SubjectCategory,
  number,
  Record<string, Offering>,
][] = [
  ['Numeracy', 'NUM', 'Early years', 4, { NUR: 'C' }],
  ['Literacy', 'LIT', 'Early years', 4, { NUR: 'C' }],
  ['Phonics', 'PHO', 'Early years', 3, { NUR: 'C' }],
  ['Rhymes & Songs', 'RHY', 'Early years', 2, { NUR: 'C' }],
  ['Health Habits', 'HHB', 'Early years', 2, { NUR: 'C' }],
  ['Social Habits', 'SOH', 'Early years', 2, { NUR: 'C' }],
  ['English Language', 'ENG', 'Core', 5, { PRI: 'C', JSS: 'C', SSS: 'C' }],
  ['Mathematics', 'MTH', 'Core', 5, { PRI: 'C', JSS: 'C', SSS: 'C' }],
  ['Basic Science & Technology', 'BST', 'Science', 3, { PRI: 'C' }],
  ['Verbal Reasoning', 'VRB', 'Core', 2, { PRI: 'C' }],
  ['Quantitative Reasoning', 'QTR', 'Core', 2, { PRI: 'C' }],
  ['National Values', 'NVE', 'Arts', 2, { PRI: 'C' }],
  ['Yoruba', 'YOR', 'Language', 2, { PRI: 'C', JSS: 'E' }],
  ['Basic Science', 'BSC', 'Science', 3, { JSS: 'C' }],
  ['Basic Technology', 'BTE', 'Technical', 2, { JSS: 'C' }],
  ['Social Studies', 'SOS', 'Arts', 2, { JSS: 'C' }],
  ['Civic Education', 'CIV', 'Arts', 2, { JSS: 'C', SSS: 'C' }],
  ['Agricultural Science', 'AGR', 'Science', 2, { JSS: 'C', SSS: 'E' }],
  ['Home Economics', 'HEC', 'Technical', 2, { JSS: 'C' }],
  ['Business Studies', 'BUS', 'Commercial', 2, { JSS: 'C' }],
  ['Computer Studies', 'CMP', 'Technical', 2, { PRI: 'C', JSS: 'C', SSS: 'C' }],
  ['Cultural & Creative Arts', 'CCA', 'Arts', 2, { NUR: 'C', PRI: 'C', JSS: 'C' }],
  ['Physical & Health Education', 'PHE', 'Core', 2, { PRI: 'C', JSS: 'C' }],
  ['French', 'FRE', 'Language', 2, { JSS: 'E' }],
  ['Christian Religious Studies', 'CRS', 'Religious', 2, { PRI: 'E', JSS: 'E', SSS: 'E' }],
  ['Islamic Religious Studies', 'IRS', 'Religious', 2, { PRI: 'E', JSS: 'E', SSS: 'E' }],
  ['Biology', 'BIO', 'Science', 3, { SSS: 'E' }],
  ['Chemistry', 'CHE', 'Science', 3, { SSS: 'E' }],
  ['Physics', 'PHY', 'Science', 3, { SSS: 'E' }],
  ['Further Mathematics', 'FMT', 'Science', 2, { SSS: 'E' }],
  ['Economics', 'ECO', 'Commercial', 2, { SSS: 'E' }],
  ['Government', 'GOV', 'Arts', 2, { SSS: 'E' }],
  ['Literature in English', 'LIE', 'Arts', 2, { SSS: 'E' }],
  ['Geography', 'GEO', 'Arts', 2, { SSS: 'E' }],
  ['Commerce', 'COM', 'Commercial', 2, { SSS: 'E' }],
  ['Financial Accounting', 'ACC', 'Commercial', 2, { SSS: 'E' }],
];

/** section code → [name, subjects, min, max, note]. */
export const SUGGESTED_GROUPS: Record<string, [string, string[], number, number, string][]> = {
  PRI: [['Religious Studies', ['CRS', 'IRS'], 1, 1, '']],
  JSS: [
    ['Religious Studies', ['CRS', 'IRS'], 1, 1, ''],
    ['Languages', ['FRE', 'YOR'], 1, 1, ''],
  ],
  SSS: [
    ['Religious Studies', ['CRS', 'IRS'], 0, 1, ''],
    ['Science track', ['BIO', 'CHE', 'PHY', 'FMT', 'AGR'], 3, 4, 'Requires Academic Head approval'],
    ['Commercial & arts track', ['ECO', 'GOV', 'LIE', 'GEO', 'COM', 'ACC'], 3, 4, ''],
  ],
};

export const SCALES: Record<string, [string, number, number, string, number, boolean][]> = {
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

export const COMPONENT_PRESETS: Record<string, [string, number, number, string][]> = {
  'CA1 20 · CA2 20 · Exam 60': [
    ['CA 1', 20, 20, 'Week 5'],
    ['CA 2', 20, 20, 'Week 9'],
    ['Examination', 100, 60, 'Weeks 11–12'],
  ],
  'CA 40 · Exam 60': [
    ['Continuous assessment', 40, 40, 'Through the term'],
    ['Examination', 100, 60, 'Weeks 11–12'],
  ],
  'Test · Project · Assignment · Exam': [
    ['Test', 20, 15, 'Week 4'],
    ['Project', 20, 15, 'Week 8'],
    ['Assignment', 10, 10, 'Through the term'],
    ['Examination', 100, 60, 'Weeks 11–12'],
  ],
};

export const RATINGS: [string, string][] = [
  ['Exceeding', 'Beyond the expected level'],
  ['Secure', 'At the expected level'],
  ['Developing', 'Working towards the expected level'],
  ['Emerging', 'Early stage'],
];

export const mkScale = (key: string) =>
  SCALES[key]!.map(([grade, min, max, remark, points, pass]) => ({
    grade,
    min,
    max,
    remark,
    points,
    pass,
  }));
export const mkComponents = (key: string) =>
  COMPONENT_PRESETS[key]!.map(([name, max, weight, when]) => ({ name, max, weight, when }));

export function defaultScheme(code: string): AssessmentScheme {
  return code === 'NUR'
    ? {
        mode: 'descriptive',
        components: mkComponents('CA 40 · Exam 60'),
        scale: mkScale('A–F'),
        ratings: RATINGS.map(([name, description]) => ({ name, description })),
      }
    : {
        mode: 'scores',
        components: mkComponents(code === 'PRI' ? 'CA 40 · Exam 60' : 'CA1 20 · CA2 20 · Exam 60'),
        scale: mkScale(code === 'SSS' ? 'WAEC (A1–F9)' : 'A–F'),
        ratings: RATINGS.map(([name, description]) => ({ name, description })),
      };
}

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
export const LESSON_SLOTS = DAYS.flatMap((d) =>
  PERIODS.filter((p) => !p.isBreak).map((p) => `${d}-${p.id}`),
);
export const MAX_CONSECUTIVE = 2;

export const PUBLIC_HOLIDAYS: [string, string][] = [
  ['2025-10-01', 'Independence Day'],
  ['2025-12-25', 'Christmas Day'],
  ['2025-12-26', 'Boxing Day'],
  ['2026-01-01', 'New Year’s Day'],
  ['2026-03-20', 'Eid al-Fitr'],
  ['2026-04-03', 'Good Friday'],
  ['2026-04-06', 'Easter Monday'],
  ['2026-05-01', 'Workers’ Day'],
  ['2026-05-27', 'Eid al-Adha'],
  ['2026-06-12', 'Democracy Day'],
  ['2026-08-26', 'Eid-el-Maulud'],
  ['2026-10-01', 'Independence Day'],
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-26', 'Boxing Day'],
  ['2027-01-01', 'New Year’s Day'],
  ['2027-03-10', 'Eid al-Fitr'],
  ['2027-03-26', 'Good Friday'],
  ['2027-03-29', 'Easter Monday'],
  ['2027-05-01', 'Workers’ Day'],
  ['2027-05-17', 'Eid al-Adha'],
  ['2027-06-12', 'Democracy Day'],
  ['2027-10-01', 'Independence Day'],
  ['2027-12-25', 'Christmas Day'],
  ['2027-12-26', 'Boxing Day'],
  ['2028-01-01', 'New Year’s Day'],
];

/* ---------------- Helpers ---------------- */

export const armLabel = (level: string, arm: string) =>
  `${level}${/\d$/.test(level) ? '' : ' '}${arm}`;

/** Deterministic 0..1 from a string, so seeded data stays stable between reloads. */
export function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const sectionCode = (data: AcademicsData, name: string) =>
  data.sections.find((s) => s.name === name)?.code ?? STANDARD_SECTIONS[name]?.code ?? '';

/** Subjects an arm's level offers, with Compulsory/Elective. */
export function offeredSubjects(data: AcademicsData, level: LevelRec) {
  return Object.entries(data.curriculum[level.section]?.[level.name] ?? {}).filter(([code]) =>
    data.subjects.some((s) => s.code === code && s.status === 'Active'),
  );
}

export function curriculumFromSuggestions(
  data: Pick<AcademicsData, 'sections'>,
  levelsBySection: Record<string, string[]>,
) {
  const subjects: SubjectRec[] = [];
  const curriculum: AcademicsData['curriculum'] = {};
  const groups: ElectiveGroup[] = [];
  for (const [name, code, category, periods, by] of SUGGESTED_SUBJECTS) {
    const secs = data.sections.filter((s) => by[s.code]);
    if (!secs.length) continue;
    subjects.push({ code, name, category, status: 'Active', periods });
    for (const s of secs)
      for (const lv of levelsBySection[s.name] ?? []) {
        curriculum[s.name] ??= {};
        curriculum[s.name]![lv] ??= {};
        curriculum[s.name]![lv]![code] = by[s.code]!;
      }
  }
  for (const s of data.sections)
    (SUGGESTED_GROUPS[s.code] ?? []).forEach(([name, subs, min, max, note], i) =>
      groups.push({
        id: `g-${s.code}-${i}`,
        name,
        section: s.name,
        subjects: subs,
        min,
        max,
        note,
      }),
    );
  return { subjects, curriculum, groups };
}

/* ---------------- Greenfield seed ---------------- */

const GF_SECTIONS: SectionRec[] = Object.entries(STANDARD_SECTIONS).map(([name, v]) => ({
  id: `sec-${v.code.toLowerCase()}`,
  name,
  ...v,
}));

/** branch → level → arms. */
const GF_STRUCTURE: Record<string, [string, string, string[]][]> = {
  mc: [
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
  lk: [
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

/** id, name, branches, qualified, employment, max periods. */
const GF_TEACHERS: [string, string, string[], string[], 'Full-time' | 'Part-time', number][] = [
  ['eze', 'Mrs. Chioma Eze', ['mc'], ['ENG', 'LIE'], 'Full-time', 12],
  ['bello', 'Mr. Ibrahim Bello', ['mc'], ['PHY', 'BSC'], 'Full-time', 24],
  ['ade', 'Mr. Samuel Ade', ['mc', 'lk'], ['MTH', 'FMT'], 'Full-time', 28],
  ['okafor', 'Mrs. Grace Okafor', ['mc'], ['ENG', 'LIE'], 'Full-time', 28],
  ['nwachukwu', 'Mrs. Ifeoma Nwachukwu', ['mc'], ['NUM', 'LIT', 'PHO'], 'Full-time', 20],
  ['adeleke', 'Mrs. Ronke Adeleke', ['mc'], ['BTE', 'CMP'], 'Full-time', 28],
  ['oladipo', 'Mr. Yinka Oladipo', ['mc'], ['BIO', 'AGR'], 'Full-time', 28],
  ['ajayi', 'Mrs. Bimpe Ajayi', ['mc'], ['SOS', 'CIV', 'NVE'], 'Full-time', 28],
  ['alao', 'Mr. Segun Alao', ['mc', 'lk'], ['PHE', 'CCA'], 'Full-time', 28],
  ['ndukwe', 'Mrs. Rita Ndukwe', ['mc'], ['ECO', 'COM', 'ACC', 'BUS'], 'Full-time', 28],
  ['fadeyi', 'Mr. Tayo Fadeyi', ['mc'], ['GEO', 'GOV'], 'Full-time', 28],
  ['kojo', 'Mrs. Kemi Ojo', ['mc'], ['CRS', 'IRS', 'HEC'], 'Full-time', 28],
  ['obi', 'Mrs. Ifeyinwa Obi', ['mc'], ['VRB', 'QTR', 'BST', 'YOR'], 'Full-time', 28],
  ['kouassi', 'Mme. Aline Kouassi', ['mc'], ['FRE'], 'Part-time', 14],
  ['bamidele', 'Mrs. Funmi Bamidele', ['lk'], ['ENG', 'VRB', 'QTR', 'NVE'], 'Full-time', 28],
  ['eke', 'Mr. Victor Eke', ['lk'], ['CHE', 'PHY', 'BIO'], 'Full-time', 28],
];

/** More staff names once the list runs out: each first name with a different surname. */
const FIRST = [
  'Mrs. Adaobi',
  'Mr. Tobi',
  'Mrs. Zainab',
  'Mr. Chinedu',
  'Mrs. Yewande',
  'Mr. Musa',
  'Mrs. Ifunanya',
  'Mr. Oluwaseun',
  'Mrs. Hadiza',
  'Mr. Obinna',
];
const LAST = [
  'Okonjo',
  'Balogun',
  'Danladi',
  'Nnadi',
  'Adeyinka',
  'Garba',
  'Ezeh',
  'Oyedepo',
  'Lawan',
  'Ikpe',
  'Fagbemi',
];
const extraName = (n: number) =>
  `${FIRST[(n - 1) % FIRST.length]} ${LAST[Math.floor((n - 1) / FIRST.length) % LAST.length]}`;

const EXTRA_NAMES = [
  'Mrs. Toyin Oyelaran',
  'Mr. Babatunde Salami',
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
];

const GF_SESSIONS: AcademicSession[] = [
  {
    id: 's-2026',
    name: '2026/2027',
    start: '2026-09-14',
    end: '2027-07-23',
    status: 'Active',
    structure: '3 terms',
    students: 0,
    note: 'Copied from 2025/2026',
    closedOn: null,
    terms: [
      {
        id: 't-2026-1',
        name: 'First Term',
        start: '2026-09-14',
        end: '2026-12-18',
        status: 'Active',
        events: [
          {
            id: 'e1',
            type: 'resumption',
            name: 'Resumption',
            start: '2026-09-14',
            end: '2026-09-14',
          },
          { id: 'e2', type: 'pta', name: 'PTA meeting', start: '2026-09-26', end: '2026-09-26' },
          { id: 'e3', type: 'ca', name: 'CA week', start: '2026-10-12', end: '2026-10-16' },
          {
            id: 'e4',
            type: 'midterm',
            name: 'Mid-term break',
            start: '2026-10-29',
            end: '2026-11-02',
          },
          { id: 'e5', type: 'exams', name: 'Examinations', start: '2026-11-24', end: '2026-12-05' },
          {
            id: 'e6',
            type: 'results',
            name: 'Results publication',
            start: '2026-12-14',
            end: '2026-12-14',
          },
        ],
      },
      {
        id: 't-2026-2',
        name: 'Second Term',
        start: '2027-01-12',
        end: '2027-04-02',
        status: 'Upcoming',
        events: [
          {
            id: 'e7',
            type: 'resumption',
            name: 'Resumption',
            start: '2027-01-12',
            end: '2027-01-12',
          },
          {
            id: 'e8',
            type: 'midterm',
            name: 'Mid-term break',
            start: '2027-02-18',
            end: '2027-02-22',
          },
          { id: 'e9', type: 'exams', name: 'Examinations', start: '2027-03-15', end: '2027-03-26' },
        ],
      },
      {
        id: 't-2026-3',
        name: 'Third Term',
        start: '2027-04-26',
        end: '2027-07-23',
        status: 'Upcoming',
        events: [
          {
            id: 'e10',
            type: 'resumption',
            name: 'Resumption',
            start: '2027-04-26',
            end: '2027-04-26',
          },
          {
            id: 'e11',
            type: 'exams',
            name: 'Promotion examinations',
            start: '2027-07-05',
            end: '2027-07-16',
          },
        ],
      },
    ],
  },
  {
    id: 's-2025',
    name: '2025/2026',
    start: '2025-09-08',
    end: '2026-07-24',
    status: 'Closing',
    structure: '3 terms',
    students: 1212,
    note: 'Copied from 2024/2025',
    closedOn: null,
    terms: [
      {
        id: 't-2025-1',
        name: 'First Term',
        start: '2025-09-08',
        end: '2025-12-12',
        status: 'Closed',
        events: [],
      },
      {
        id: 't-2025-2',
        name: 'Second Term',
        start: '2026-01-06',
        end: '2026-03-27',
        status: 'Closed',
        events: [],
      },
      {
        id: 't-2025-3',
        name: 'Third Term',
        start: '2026-04-20',
        end: '2026-07-24',
        status: 'Closed',
        events: [],
      },
    ],
  },
  {
    id: 's-2024',
    name: '2024/2025',
    start: '2024-09-09',
    end: '2025-07-25',
    status: 'Archived',
    structure: '3 terms',
    students: 1131,
    note: '',
    closedOn: '8 Aug 2025',
    terms: [
      {
        id: 't-2024-1',
        name: 'First Term',
        start: '2024-09-09',
        end: '2024-12-13',
        status: 'Closed',
        events: [],
      },
      {
        id: 't-2024-2',
        name: 'Second Term',
        start: '2025-01-07',
        end: '2025-03-28',
        status: 'Closed',
        events: [],
      },
      {
        id: 't-2024-3',
        name: 'Third Term',
        start: '2025-04-22',
        end: '2025-07-25',
        status: 'Closed',
        events: [],
      },
    ],
  },
];

const GF_EVENTS: CalendarEvent[] = [
  {
    id: 'ev1',
    title: 'Inter-house sports',
    type: 'Event',
    start: '2026-11-13',
    end: '2026-11-13',
    audience: 'Everyone',
    source: 'custom',
    notes: 'Main Campus field · parents welcome',
  },
  {
    id: 'ev2',
    title: 'Staff development day',
    type: 'Meeting',
    start: '2026-11-20',
    end: '2026-11-20',
    audience: 'Staff',
    source: 'custom',
    notes: 'No classes for students',
  },
  {
    id: 'ev3',
    title: 'Carol service',
    type: 'Event',
    start: '2026-12-16',
    end: '2026-12-16',
    audience: 'Everyone',
    source: 'custom',
    notes: '',
  },
  {
    id: 'ev4',
    title: 'Open day for 2027 admissions',
    type: 'Event',
    start: '2026-12-09',
    end: '2026-12-09',
    audience: 'Parents',
    source: 'custom',
    notes: 'Admissions office',
  },
];

const ROOMS: Record<string, string> = {
  'JSS 2B': 'Room J2B · Block C',
  'SSS 1A': 'Science Block S1',
};

function buildLevels(): LevelRec[] {
  const out: LevelRec[] = [];
  for (const [branchId, rows] of Object.entries(GF_STRUCTURE))
    for (const [section, name, arms] of rows)
      out.push({
        id: `lv-${branchId}-${name.toLowerCase().replace(/\s+/g, '')}`,
        branchId,
        section,
        name,
        arms: arms.map((arm) => {
          const label = armLabel(name, arm);
          return {
            id: `arm-${branchId}-${label.toLowerCase().replace(/\s+/g, '')}`,
            arm,
            capacity: section === 'Nursery' ? 25 : 35,
            classTeacherId: null,
            room: branchId === 'mc' ? (ROOMS[label] ?? '') : '',
            baseline: branchId === 'mc' ? 0 : 16 + Math.round(seeded(label + branchId) * 14),
          };
        }),
      });
  return out;
}

/** Fill arms with teachers who are qualified and have room, inventing staff where needed. */
function assignTeachers(data: AcademicsData) {
  const load: Record<string, number> = {};
  let extra = 0;
  const pick = (branchId: string, code: string, periods: number) => {
    const t =
      data.teachers.find(
        (x) =>
          x.branches.includes(branchId) &&
          x.qualified.includes(code) &&
          (load[x.id] ?? 0) + periods <= Math.min(x.maxPeriods, 24),
      ) ??
      (() => {
        const subject = data.subjects.find((s) => s.code === code)!;
        const kin = data.subjects
          .filter((s) => s.category === subject.category)
          .map((s) => s.code)
          .slice(0, 4);
        const rec: TeacherRec = {
          id: `t${++extra}`,
          name:
            extra <= EXTRA_NAMES.length
              ? EXTRA_NAMES[extra - 1]!
              : extraName(extra - EXTRA_NAMES.length),
          branches: [branchId],
          qualified: [...new Set([code, ...kin])],
          employment: 'Full-time',
          maxPeriods: 28,
        };
        data.teachers.push(rec);
        return rec;
      })();
    load[t.id] = (load[t.id] ?? 0) + periods;
    return t;
  };
  for (const lv of data.levels)
    for (const arm of lv.arms) {
      const name = armLabel(lv.name, arm.arm);
      for (const [code] of offeredSubjects(data, lv)) {
        // Chemistry at Main Campus has had no teacher since Mr. Tunde Ojo left in July.
        if (code === 'CHE' && lv.branchId === 'mc') continue;
        const periods = data.subjects.find((s) => s.code === code)!.periods;
        // The design's JSS 2B: Mrs. Okafor teaches English, Mr. Ade Mathematics.
        const fixed = name === 'JSS 2B' ? { ENG: 'okafor', MTH: 'ade' }[code] : undefined;
        const explicit = !!fixed;
        const t = fixed
          ? data.teachers.find((x) => x.id === fixed)!
          : pick(lv.branchId, code, periods);
        if (explicit) load[t.id] = (load[t.id] ?? 0) + periods;
        data.assignments.push({
          id: `as${data.assignments.length + 1}`,
          teacherId: t.id,
          subject: code,
          armId: arm.id,
          type: 'Subject teacher',
        });
      }
      // Class teacher: Mrs. Okafor for JSS 2B; SSS 1C has none; others the first teacher there.
      if (name === 'JSS 2B') arm.classTeacherId = 'okafor';
      else if (!(name === 'SSS 1C' && lv.branchId === 'mc')) {
        const taken = new Set(
          data.levels.flatMap((l) => l.arms.map((a) => a.classTeacherId).filter(Boolean)),
        );
        const mine = data.assignments
          .filter((a) => a.armId === arm.id)
          .map((a) => a.teacherId)
          .find((id) => !taken.has(id));
        arm.classTeacherId = mine ?? null;
      }
    }
}

/** Place every arm's lessons without clashing teachers; used to seed published timetables. */
export function autoTimetable(
  data: AcademicsData,
  armId: string,
  termId: string,
  start: Record<string, string> = {},
) {
  const grid = { ...start };
  const level = data.levels.find((l) => l.arms.some((a) => a.id === armId))!;
  const busy = teacherBusy(data, termId, armId);
  const teacherOf = (code: string) =>
    data.assignments.find((a) => a.armId === armId && a.subject === code)?.teacherId ?? null;
  const need = offeredSubjects(data, level).map(([code]) => ({
    code,
    left:
      (data.subjects.find((s) => s.code === code)?.periods ?? 2) -
      Object.values(grid).filter((c) => c === code).length,
  }));
  const lessons = PERIODS.filter((p) => !p.isBreak);
  for (const n of need)
    for (let pass = 0; pass < 2 && n.left > 0; pass++)
      for (const [di, day] of DAYS.entries()) {
        if (n.left <= 0) break;
        const today = lessons.map((p) => grid[`${day}-${p.id}`]);
        if (pass === 0 && today.includes(n.code)) continue;
        const offset = Math.floor(seeded(n.code + armId + di) * lessons.length);
        for (let k = 0; k < lessons.length && n.left > 0; k++) {
          const p = lessons[(k + offset) % lessons.length]!;
          const slot = `${day}-${p.id}`;
          const t = teacherOf(n.code);
          if (grid[slot] || (t && busy[t]?.[slot])) continue;
          grid[slot] = n.code;
          n.left--;
          if (pass === 0) break;
        }
      }
  return grid;
}

/** teacherId → slot → what they're teaching, from other arms' timetables this term. */
export function teacherBusy(data: AcademicsData, termId: string, exceptArmId: string | null) {
  const out: Record<string, Record<string, string>> = {};
  for (const tt of data.timetables) {
    if (tt.termId !== termId || tt.armId === exceptArmId) continue;
    const level = data.levels.find((l) => l.arms.some((a) => a.id === tt.armId));
    const arm = level?.arms.find((a) => a.id === tt.armId);
    if (!level || !arm) continue;
    for (const [slot, code] of Object.entries(tt.grid)) {
      const t = data.assignments.find((a) => a.armId === tt.armId && a.subject === code)?.teacherId;
      if (!t) continue;
      const subject = data.subjects.find((s) => s.code === code)?.name ?? code;
      (out[t] ??= {})[slot] = `${armLabel(level.name, arm.arm)} · ${subject}`;
    }
  }
  return out;
}

/** Most sheets are approved by now; a few are still with reviewers (as in the design). */
const SHEET_STATUSES: SheetStatus[] = [
  ...Array<SheetStatus>(14).fill('Approved'),
  'Submitted',
  'Under review',
];

function seedSheets(data: AcademicsData) {
  const term = 't-2026-1';
  for (const lv of data.levels) {
    if (lv.branchId !== 'mc' || lv.section === 'Nursery') continue;
    for (const arm of lv.arms) {
      const name = armLabel(lv.name, arm.arm);
      for (const [code] of offeredSubjects(data, lv)) {
        const r = seeded(name + code);
        let status: SheetStatus =
          name === 'JSS 1A'
            ? 'Published'
            : name === 'JSS 2B'
              ? code === 'MTH'
                ? 'Submitted'
                : 'Approved'
              : name === 'JSS 3A' && (code === 'CMP' || code === 'FRE')
                ? 'Draft'
                : code === 'CHE'
                  ? 'Not started'
                  : SHEET_STATUSES[Math.floor(r * SHEET_STATUSES.length)]!;
        if (lv.section === 'Primary' && status === 'Under review') status = 'Approved';
        if (name === 'SSS 2A' && code === 'ENG') status = 'Returned';
        data.sheets.push({
          armId: arm.id,
          subject: code,
          termId: term,
          status,
          submittedAt: ['Draft', 'Not started'].includes(status) ? null : '8 Dec, 10:14',
          returnNote:
            status === 'Returned' ? 'Two students have CA 2 above the maximum. Please check.' : '',
          scores: {},
          history: [],
        });
      }
    }
  }
  data.published.push(`${term}|arm-mc-jss1a`);
}

function greenfield(): AcademicsData {
  const data: AcademicsData = {
    sections: GF_SECTIONS.map((s) => ({ ...s })),
    confirmed: {
      sections: true,
      session: true,
      terms: true,
      classes: true,
      subjects: true,
      assessment: false,
      assignments: false,
      timetable: false,
    },
    sessions: structuredClone(GF_SESSIONS),
    events: structuredClone(GF_EVENTS),
    levels: buildLevels(),
    subjects: [],
    curriculum: {},
    groups: [],
    teachers: GF_TEACHERS.map(([id, name, branches, qualified, employment, maxPeriods]) => ({
      id,
      name,
      branches,
      qualified,
      employment,
      maxPeriods,
    })),
    assignments: [],
    previousAssignments: [],
    timetables: [],
    assessment: {
      same: false,
      schemes: {
        Nursery: null,
        Primary: defaultScheme('PRI'),
        'Junior Secondary': defaultScheme('JSS'),
        'Senior Secondary': defaultScheme('SSS'),
      },
      showPosition: true,
      rounding: '1 decimal place',
      passMark: 40,
    },
    sheets: [],
    published: [],
    reportVersions: {},
    corrections: [],
    promotion: null,
    seq: 100,
  };
  const levelsBySection: Record<string, string[]> = {};
  for (const lv of data.levels)
    if (!levelsBySection[lv.section]?.includes(lv.name))
      (levelsBySection[lv.section] ??= []).push(lv.name);
  Object.assign(data, curriculumFromSuggestions(data, levelsBySection));
  // Greenfield trims the SSS electives it doesn't run, and keeps Yoruba out of SSS.
  for (const lv of levelsBySection['Senior Secondary'] ?? [])
    delete data.curriculum['Senior Secondary']![lv]!['AGR'];
  data.groups = data.groups.map((g) =>
    g.name === 'Science track' ? { ...g, subjects: g.subjects.filter((c) => c !== 'AGR') } : g,
  );
  assignTeachers(data);
  data.previousAssignments = data.assignments.map((a) => ({ ...a }));
  // First Term timetables are published; Second Term starts as drafts copied from them.
  for (const lv of data.levels)
    for (const arm of lv.arms) {
      const grid = autoTimetable(data, arm.id, 't-2026-1');
      data.timetables.push({
        armId: arm.id,
        termId: 't-2026-1',
        status: 'Published',
        version: 2,
        publishedVersion: 2,
        grid,
        history: [
          { id: 'h1', title: 'Version 1 published', detail: 'Adaeze Okonkwo', when: '10 Sep 2026' },
          {
            id: 'h2',
            title: 'Version 2 published',
            detail: 'Adaeze Okonkwo · French moved to Thursday',
            when: '28 Sep 2026',
            tone: 'success',
          },
        ],
      });
    }
  const jss2b = 'arm-mc-jss2b';
  const first = data.timetables.find((t) => t.armId === jss2b)!;
  const draft = { ...first.grid };
  Object.keys(draft)
    .filter((k) => k.endsWith('-P1') && (k.startsWith('Monday') || k.startsWith('Friday')))
    .forEach((k) => delete draft[k]);
  data.timetables.push({
    armId: jss2b,
    termId: 't-2026-2',
    status: 'Draft',
    version: 1,
    publishedVersion: null,
    grid: draft,
    history: [
      {
        id: 'h1',
        title: 'Draft started from First Term',
        detail: 'Adaeze Okonkwo',
        when: '2 Dec 2026',
      },
    ],
  });
  seedSheets(data);
  data.corrections.push({
    id: 'cor1',
    studentId: 'chinedu',
    armId: 'arm-mc-jss1a',
    subject: 'MTH',
    termId: 't-2026-1',
    componentIndex: 2,
    original: 0,
    proposed: 0,
    reason: 'Script re-marked: question 7 (6 marks) was not added to the total.',
    requestedBy: 'Mr. Samuel Ade · Teacher',
    requestedAt: '9 Dec 10:02',
    evidence: 'exam-script-p4.jpg',
    status: 'Under review',
    decisionNote: '',
    history: [
      {
        id: 'c1',
        title: 'Correction requested by Mr. Samuel Ade',
        detail: 'Reason and evidence attached',
        when: '9 Dec 10:02',
        tone: 'warning',
      },
      {
        id: 'c2',
        title: 'Reviewed by HOD Mr. Ibrahim Bello',
        detail: 'Re-mark verified',
        when: '9 Dec 11:30',
        tone: 'info',
      },
    ],
  });
  data.promotion = {
    fromSessionId: 's-2025',
    toSessionId: 's-2026',
    rule: 'Annual average of 45% or more and a pass in Mathematics and English',
    classes: [
      {
        id: 'p-jss1b',
        name: 'JSS 1B',
        level: 'JSS 1',
        arm: 'B',
        nextLevel: 'JSS 2',
        status: 'Pending',
        total: 33,
        students: [
          [
            'uche',
            'Uche Nnamdi',
            'Male',
            41.2,
            38,
            52,
            'Passed Mathematics re-sit (61) on 4 Sep',
            'Promote',
            0,
          ],
          [
            'bolaji',
            'Bolaji Coker',
            'Male',
            38.5,
            31,
            40,
            'Below the pass mark in 6 subjects',
            'Repeat',
            0,
          ],
          [
            'esther',
            'Esther Okon',
            'Female',
            52.0,
            49,
            58,
            'Parents requested a transfer to Port Harcourt',
            'Transfer',
            0,
          ],
          [
            'musa',
            'Musa Garba',
            'Male',
            47.8,
            46,
            51,
            '₦120,000 outstanding · fees don’t block promotion',
            'Promote',
            120000,
          ],
        ].map(([id, name, gender, average, maths, english, note, suggestion, balance]) => ({
          id: id as string,
          name: name as string,
          gender: gender as 'Male' | 'Female',
          average: average as number,
          maths: maths as number,
          english: english as number,
          note: note as string,
          suggestion: suggestion as PromotionDecision,
          decision: null,
          reason: '',
          balance: balance as number,
        })),
      },
      ...(
        [
          ['p-jss1a', 'JSS 1A', 'JSS 1', 'A', 'JSS 2', 'Complete', 32],
          ['p-jss3a', 'JSS 3A', 'JSS 3', 'A', 'SSS 1', 'Complete', 30],
          ['p-pri6a', 'Primary 6A', 'Primary 6', 'A', 'JSS 1', 'Complete', 28],
          ['p-sss3b', 'SSS 3B', 'SSS 3', 'B', null, 'Graduated', 41],
        ] as [string, string, string, string, string | null, 'Complete' | 'Graduated', number][]
      ).map(([id, name, level, arm, nextLevel, status, total]) => ({
        id,
        name,
        level,
        arm,
        nextLevel,
        status,
        total,
        students: [],
      })),
    ],
  };
  return data;
}

function crestview(): AcademicsData {
  const provisioned = schoolData.crestview!.profile.sections;
  return {
    sections: provisioned.map((name, i) => ({
      id: `sec-${i}`,
      name,
      code: STANDARD_SECTIONS[name]?.code ?? '',
      description: STANDARD_SECTIONS[name]?.description ?? '',
    })),
    confirmed: {
      sections: false,
      session: false,
      terms: false,
      classes: false,
      subjects: false,
      assessment: false,
      assignments: false,
      timetable: false,
    },
    sessions: [],
    events: [],
    levels: [],
    subjects: [],
    curriculum: {},
    groups: [],
    teachers: [],
    assignments: [],
    previousAssignments: [],
    timetables: [],
    assessment: {
      same: true,
      schemes: {},
      showPosition: true,
      rounding: '1 decimal place',
      passMark: 40,
    },
    sheets: [],
    published: [],
    reportVersions: {},
    corrections: [],
    promotion: null,
    seq: 1,
  };
}

export const academicsData: Record<string, AcademicsData> = {
  greenfield: greenfield(),
  crestview: crestview(),
};

/* ---------------- Sync with the Students section ---------------- */

/** Students placed in an arm: their records plus any baseline from the Students section. */
export function armStudents(schoolId: string, level: LevelRec, arm: ArmRec) {
  const sd = studentsData[schoolId]!;
  const branch = schoolData[schoolId]!.branches.find((b) => b.id === level.branchId)?.name;
  const records = sd.students.filter(
    (s) =>
      s.level === level.name &&
      s.arm === arm.arm &&
      s.branch === branch &&
      ['Active', 'Incomplete profile'].includes(s.status),
  );
  const baseline =
    branch === schoolData[schoolId]!.branches[0]?.name
      ? (sd.armBaseline[`${level.name}${arm.arm}`] ?? 0)
      : arm.baseline;
  return { records, count: records.length + baseline };
}

/**
 * Keeps the Students section's class list in step with Classes & Arms: admissions, enrollment and
 * arm moves offer the main campus's levels and arms, at their capacity.
 */
export function syncStudentClasses(schoolId: string) {
  const data = academicsData[schoolId]!;
  const sd = studentsData[schoolId]!;
  const main = schoolData[schoolId]!.branches[0]?.id;
  const levels = data.levels.filter((l) => l.branchId === main);
  const order = (l: LevelRec) => data.sections.findIndex((s) => s.name === l.section);
  sd.arms = Object.fromEntries(
    [...levels].sort((a, b) => order(a) - order(b)).map((l) => [l.name, l.arms.map((a) => a.arm)]),
  );
  const caps = levels.flatMap((l) => l.arms.map((a) => a.capacity));
  if (caps.length) sd.capacity = Math.max(...caps);
}

export const sectionCodeOf = sectionCode;
Object.keys(academicsData).forEach(syncStudentClasses);
