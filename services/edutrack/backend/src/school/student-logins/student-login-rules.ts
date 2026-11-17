/** Section codes whose students get Student Portal logins unless the school turns them off. */
export const STUDENT_LOGIN_SECTION_CODES: readonly string[] = ['JSS', 'SSS'];

/** The per-section default: on for Junior and Senior Secondary, off for Nursery, Primary and others. */
export const defaultStudentLogins = (code: string) => STUDENT_LOGIN_SECTION_CODES.includes(code);
