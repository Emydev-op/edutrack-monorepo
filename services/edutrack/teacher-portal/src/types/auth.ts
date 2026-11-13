export interface AuthUser {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  /** "Mr. Samuel Ade" */
  displayName: string;
  email: string;
  /** Job title, e.g. "Mathematics Teacher". */
  position: string;
}

export interface SchoolSummary {
  id: string;
  name: string;
  initials: string;
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
  | 'PASSWORD_EXPIRED';

export interface Invitation {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  position: string;
  department: string | null;
  schoolName: string;
  invitedBy: string;
  expiresOn: string;
  status: 'pending' | 'accepted' | 'expired';
}

export interface AcceptInvitationPayload {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
}

/** A signed-in browser or device. */
export interface DeviceSession {
  id: string;
  device: string;
  location: string;
  /** Local "YYYY-MM-DDTHH:mm" */
  signedInAt: string;
  lastActive: string;
  current: boolean;
}
