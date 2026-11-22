import { defaultStudentLogins } from '../student-logins/student-login-rules.js';

/** The four sections every Nigerian school chooses from, in order, with their short codes. */
export const STANDARD_SECTIONS = {
  Nursery: 'NUR',
  Primary: 'PRI',
  'Junior Secondary': 'JSS',
  'Senior Secondary': 'SSS',
} as const;
export type StandardSection = keyof typeof STANDARD_SECTIONS;
export const SECTION_ORDER = Object.keys(STANDARD_SECTIONS) as StandardSection[];

export const isStandardSection = (name: string): name is StandardSection =>
  name in STANDARD_SECTIONS;

/** A new Section row's data for a standard section (its place in the order, student logins). */
export const standardSectionData = (name: StandardSection) => ({
  name,
  code: STANDARD_SECTIONS[name],
  sortOrder: SECTION_ORDER.indexOf(name),
  studentLogins: defaultStudentLogins(STANDARD_SECTIONS[name]),
});
