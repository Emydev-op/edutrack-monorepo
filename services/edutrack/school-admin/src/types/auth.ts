export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Job title at the school, e.g. "Principal". */
  position: string;
  roleName: string;
  avatarUrl: string | null;
}

/** The school (tenant) the signed-in user works in. */
export interface SchoolSummary {
  id: string;
  name: string;
  initials: string;
  plan: string;
  /** The brand colour set in the platform back office; the portal is themed with it after sign-in. */
  brandColor: string;
  /** Uploaded in School Profile; the sidebar shows initials until there is one. */
  logoUrl: string | null;
  /** Restricted: the renewal is overdue, so creating records is paused. */
  subscriptionStatus: 'Active' | 'Restricted';
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
  position: string;
  schoolName: string;
  invitedBy: string;
  expiresIn: string;
  status: 'pending' | 'accepted' | 'expired';
}

export interface AcceptInvitationPayload {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
}
