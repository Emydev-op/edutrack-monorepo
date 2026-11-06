import type { RoleId } from './roles';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: RoleId;
  roleName: string;
  avatarUrl: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
  remember: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/** Why a sign-in was refused when the credentials themselves were correct. */
export type AccountBlock = 'ACCOUNT_SUSPENDED' | 'ACCOUNT_DEACTIVATED' | 'ACCOUNT_PENDING';

export interface Invitation {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  roleName: string;
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
