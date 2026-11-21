/** The signed-in parent, as the API returns them at sign-in. */
export interface AuthUser {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  /** The school's record of the parent: "Funke Adeyemi". */
  displayName: string;
  email: string;
  phone: string | null;
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
  | 'PARENT_ACCESS_ENDED'
  | 'NO_ACCESS';

export interface InvitationChild {
  name: string;
  firstName: string;
  className: string;
  branch: string;
}

export interface Invitation {
  token: string;
  kind: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  phone: string | null;
  schoolName: string;
  invitedBy: string;
  expiresOn: string;
  expiresIn: string;
  status: 'pending' | 'accepted';
  /** The children the school linked to this parent. */
  children: InvitationChild[];
}

export interface AcceptInvitationPayload {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
}
