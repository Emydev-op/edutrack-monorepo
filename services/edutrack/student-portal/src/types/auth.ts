/** The signed-in student, as the API returns them at sign-in. */
export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  /** "Emmanuel Adeyemi". */
  displayName: string;
  admissionNo: string;
}

export interface SchoolSummary {
  /** Signed out after this many minutes without using the page (unless remembered). */
  idleTimeoutMinutes?: number;
  id: string;
  name: string;
  initials: string;
  slug?: string;
  brandColor?: string;
  logoUrl?: string | null;
}

export interface LoginPayload {
  /** The admission number (the API's sign-in field is called `email` for every portal). */
  email: string;
  password: string;
  remember: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  school: SchoolSummary;
}

/** Why a sign-in was refused when the credentials themselves were correct. */
export type AccountBlock =
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_DEACTIVATED'
  | 'ACCOUNT_PENDING'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_EXPIRED'
  | 'SUBSCRIPTION_LAPSED'
  | 'SCHOOL_SUSPENDED'
  | 'STUDENT_LEFT'
  | 'STUDENT_LOGINS_OFF'
  | 'NO_ACCESS';
