import type { Offering, SubjectCategory } from '../../generated/prisma/enums.js';

/**
 * Starting points the School Admin screens offer (and the demo seed uses): Nigerian subjects per
 * section, elective groups, grading presets and a bell schedule. Same lists as the School Admin
 * mock (`school-admin/src/api/mock/academics-db.ts`).
 */

type O = 'C' | 'E';
/** name, code, category, lessons per week, offering per section code. */
export const SUGGESTED_SUBJECTS: [string, string, SubjectCategory, number, Record<string, O>][] = [
  ['Numeracy', 'NUM', 'EARLY_YEARS', 4, { NUR: 'C' }],
  ['Literacy', 'LIT', 'EARLY_YEARS', 4, { NUR: 'C' }],
  ['Phonics', 'PHO', 'EARLY_YEARS', 3, { NUR: 'C' }],
  ['Rhymes & Songs', 'RHY', 'EARLY_YEARS', 2, { NUR: 'C' }],
  ['Health Habits', 'HHB', 'EARLY_YEARS', 2, { NUR: 'C' }],
  ['Social Habits', 'SOH', 'EARLY_YEARS', 2, { NUR: 'C' }],
  ['English Language', 'ENG', 'CORE', 5, { PRI: 'C', JSS: 'C', SSS: 'C' }],
  ['Mathematics', 'MTH', 'CORE', 5, { PRI: 'C', JSS: 'C', SSS: 'C' }],
  ['Basic Science & Technology', 'BST', 'SCIENCE', 3, { PRI: 'C' }],
  ['Verbal Reasoning', 'VRB', 'CORE', 2, { PRI: 'C' }],
  ['Quantitative Reasoning', 'QTR', 'CORE', 2, { PRI: 'C' }],
  ['National Values', 'NVE', 'ARTS', 2, { PRI: 'C' }],
  ['Yoruba', 'YOR', 'LANGUAGE', 2, { PRI: 'C', JSS: 'E' }],
  ['Basic Science', 'BSC', 'SCIENCE', 3, { JSS: 'C' }],
  ['Basic Technology', 'BTE', 'TECHNICAL', 2, { JSS: 'C' }],
  ['Social Studies', 'SOS', 'ARTS', 2, { JSS: 'C' }],
  ['Civic Education', 'CIV', 'ARTS', 2, { JSS: 'C', SSS: 'C' }],
  ['Agricultural Science', 'AGR', 'SCIENCE', 2, { JSS: 'C', SSS: 'E' }],
  ['Home Economics', 'HEC', 'TECHNICAL', 2, { JSS: 'C' }],
  ['Business Studies', 'BUS', 'COMMERCIAL', 2, { JSS: 'C' }],
  ['Computer Studies', 'CMP', 'TECHNICAL', 2, { PRI: 'C', JSS: 'C', SSS: 'C' }],
  ['Cultural & Creative Arts', 'CCA', 'ARTS', 2, { NUR: 'C', PRI: 'C', JSS: 'C' }],
  ['Physical & Health Education', 'PHE', 'CORE', 2, { PRI: 'C', JSS: 'C' }],
  ['French', 'FRE', 'LANGUAGE', 2, { JSS: 'E' }],
  ['Christian Religious Studies', 'CRS', 'RELIGIOUS', 2, { PRI: 'E', JSS: 'E', SSS: 'E' }],
  ['Islamic Religious Studies', 'IRS', 'RELIGIOUS', 2, { PRI: 'E', JSS: 'E', SSS: 'E' }],
  ['Biology', 'BIO', 'SCIENCE', 3, { SSS: 'E' }],
  ['Chemistry', 'CHE', 'SCIENCE', 3, { SSS: 'E' }],
  ['Physics', 'PHY', 'SCIENCE', 3, { SSS: 'E' }],
  ['Further Mathematics', 'FMT', 'SCIENCE', 2, { SSS: 'E' }],
  ['Economics', 'ECO', 'COMMERCIAL', 2, { SSS: 'E' }],
  ['Government', 'GOV', 'ARTS', 2, { SSS: 'E' }],
  ['Literature in English', 'LIE', 'ARTS', 2, { SSS: 'E' }],
  ['Geography', 'GEO', 'ARTS', 2, { SSS: 'E' }],
  ['Commerce', 'COM', 'COMMERCIAL', 2, { SSS: 'E' }],
  ['Financial Accounting', 'ACC', 'COMMERCIAL', 2, { SSS: 'E' }],
];

/** Section code → [name, subject codes, min, max, note]. */
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

export const OFFERING: Record<O, Offering> = { C: 'COMPULSORY', E: 'ELECTIVE' };
export const OFFERING_LABEL: Record<Offering, O> = { COMPULSORY: 'C', ELECTIVE: 'E' };

export const CATEGORY_LABEL: Record<SubjectCategory, string> = {
  CORE: 'Core',
  SCIENCE: 'Science',
  ARTS: 'Arts',
  COMMERCIAL: 'Commercial',
  TECHNICAL: 'Technical',
  LANGUAGE: 'Language',
  RELIGIOUS: 'Religious',
  EARLY_YEARS: 'Early years',
};
export const CATEGORY_BY_LABEL = Object.fromEntries(
  Object.entries(CATEGORY_LABEL).map(([k, v]) => [v, k]),
) as Record<string, SubjectCategory>;

/* ---------------- Grading ---------------- */

/** "CA 1" → "CA1", "Examination" → "EXAMINATION": the stable key sheets use for a component. */
export const componentKey = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20) || 'C';

/** grade, min, max, remark, points, pass. */
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

/** name, max score, weight, typical when. */
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
};

export const RATINGS: [string, string][] = [
  ['Exceeding', 'Beyond the expected level'],
  ['Secure', 'At the expected level'],
  ['Developing', 'Working towards the expected level'],
  ['Emerging', 'Early stage'],
];

/** The default scheme for a section, by its code (the decision: 2 CAs × 20 + exam 60; WAEC for SSS). */
export function defaultScheme(code: string) {
  const ratings = RATINGS.map(([name, description]) => ({ name, description }));
  const comps = (key: string) =>
    COMPONENT_PRESETS[key]!.map(([name, max, weight, when]) => ({ name, max, weight, when }));
  const scale = (key: string) =>
    SCALES[key]!.map(([grade, min, max, remark, points, pass]) => ({
      grade,
      min,
      max,
      remark,
      points,
      pass,
    }));
  return {
    mode: code === 'NUR' ? ('descriptive' as const) : ('scores' as const),
    components: comps('CA1 20 · CA2 20 · Exam 60'),
    scale: scale(code === 'SSS' ? 'WAEC (A1–F9)' : 'A–F'),
    ratings,
    // Junior and Senior Secondary usually rank; Nursery and Primary usually don't.
    showPosition: code === 'JSS' || code === 'SSS',
  };
}

/* ---------------- Bell schedule ---------------- */

/** label, start, end, break. Every section starts with this; the screens read it per section. */
export const DEFAULT_PERIODS: [string, string, string, boolean][] = [
  ['1', '08:00', '08:40', false],
  ['2', '08:40', '09:20', false],
  ['3', '09:20', '10:00', false],
  ['Break', '10:00', '10:20', true],
  ['4', '10:20', '11:00', false],
  ['5', '11:00', '11:40', false],
  ['6', '11:40', '12:20', false],
  ['Lunch', '12:20', '13:00', true],
  ['7', '13:00', '13:40', false],
  ['8', '13:40', '14:20', false],
];

export const MAX_CONSECUTIVE = 2;
