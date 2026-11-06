import type { PageQuery } from './common';
import type { RoleId } from './roles';

export type UserStatus = 'Active' | 'Invited' | 'Suspended' | 'Deactivated';
export type InvitationState = 'Pending' | 'Accepted' | 'Expired' | 'Resent' | 'Revoked';

export interface PlatformUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleId: RoleId;
  roleName: string;
  status: UserStatus;
  invitation: InvitationState | null;
  invitedBy: string | null;
  lastSeen: string;
  createdAt: string;
}

export interface UserQuery extends PageQuery {
  view?: 'all' | 'invitations';
  role?: string;
  status?: UserStatus;
  created?: 'Last 30 days' | 'Last 12 months';
  lastActive?: 'Today' | 'Last 7 days' | 'Over 30 days ago';
}

export interface InviteUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleId: RoleId;
}

export interface UpdateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleId: RoleId;
}

export interface UserSecurity {
  lastPasswordChange: string;
  activeSessions: string;
  failedSignIns: number;
  twoFactor: string;
}

export type UserAction =
  | 'suspend'
  | 'reactivate'
  | 'deactivate'
  | 'password-reset'
  | 'sign-out'
  | 'resend-invitation'
  | 'revoke-invitation';
