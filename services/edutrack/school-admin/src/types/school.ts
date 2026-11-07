import type { TimelineEntry } from './common';

/** An uploaded file. `dataUrl` is kept for images so they can be previewed. */
export interface FileRef {
  name: string;
  size: string;
  dataUrl?: string | null;
}

/** A section name, e.g. "Junior Secondary". The list is set in Academics → Academic Sections. */
export type SchoolSection = string;

/** School-wide details. Address, head and sections per campus live on branches. */
export interface SchoolProfile {
  name: string;
  /** Set by Edutrack at provisioning; changed through support. */
  legalName: string;
  ownership: string;
  sections: SchoolSection[];
  brandColor: string;
  motto: string;
  founded: string;
  logo: FileRef | null;
  email: string;
  phone: string;
  website: string;
  street: string;
  city: string;
  lga: string;
  state: string;
  approvingBody: string;
  approvalNumber: string;
  cacNumber: string;
  certificate: FileRef | null;
  plan: {
    name: string;
    students: number;
    studentLimit: number;
    branchLimit: number;
    renews: string;
  };
  updatedAt: string;
  history: TimelineEntry[];
}

export type SchoolProfilePayload = Pick<
  SchoolProfile,
  | 'name'
  | 'motto'
  | 'founded'
  | 'logo'
  | 'email'
  | 'phone'
  | 'website'
  | 'street'
  | 'city'
  | 'lga'
  | 'state'
  | 'approvingBody'
  | 'approvalNumber'
  | 'cacNumber'
  | 'certificate'
>;

export interface Branch {
  id: string;
  name: string;
  /** Used on admission numbers and receipts, e.g. GFA-MC. */
  code: string;
  street: string;
  city: string;
  lga: string;
  state: string;
  phone: string;
  email: string;
  headId: string | null;
  headName: string | null;
  sections: SchoolSection[];
  hasStore: boolean;
  status: 'Active' | 'Inactive';
  students: number;
  staff: number;
  classArms: number;
  /** Branches with records, or created at provisioning, can only be deactivated. */
  canDelete: boolean;
}

export interface BranchList {
  branches: Branch[];
  planName: string;
  branchLimit: number;
  /** The school's sections; a branch offers a subset. */
  offering: SchoolSection[];
  codePrefix: string;
}

export interface BranchDetail extends Branch {
  /** Users whose only scope is this branch; they lose access if it's deactivated. */
  scopedUsers: { name: string; roles: string[] }[];
  classes: { section: string; level: string; arms: string; students: number }[];
  staffList: { id: string; name: string; position: string; scope: string; account: string }[];
  finance: {
    term: string;
    billed: string;
    collected: string;
    outstanding: string;
    expenses: string;
  } | null;
  history: TimelineEntry[];
}

export interface BranchPayload {
  name: string;
  code: string;
  street: string;
  city: string;
  lga: string;
  state: string;
  phone: string;
  email: string;
  headId: string | null;
  sections: SchoolSection[];
  hasStore: boolean;
  /** Give the head Branch Admin access for this branch when they don't have it. */
  grantBranchAdmin?: boolean;
}

/** A person in the staff directory, for pickers (head of campus, position holders, invites). */
export interface StaffOption {
  id: string;
  name: string;
  position: string;
  account: 'Active' | 'Invited' | 'Suspended' | 'Deactivated' | 'No account';
  hasSchoolWideAccess: boolean;
  roles: string[];
}

export type UserStatus = 'Active' | 'Invited' | 'Suspended' | 'Deactivated' | 'Revoked';
export type AccessScope = 'School' | 'Branch';

export interface SchoolUserRow {
  id: string;
  staffId: string | null;
  name: string;
  email: string;
  position: string;
  roles: string[];
  scope: AccessScope;
  branches: string[];
  status: UserStatus;
  lastActive: string;
  created: string;
  invited: string | null;
}

export interface SchoolUserDetail extends SchoolUserRow {
  isYou: boolean;
  staffNumber: string | null;
  /** What their roles allow, by area: [area, "View, Create, …"]. */
  can: [string, string][];
  history: TimelineEntry[];
}

export interface InvitePayload {
  staffId: string | null;
  name: string;
  email: string;
  roles: string[];
  scope: AccessScope;
  branches: string[];
}

export interface AccessPayload {
  roles: string[];
  scope: AccessScope;
  branches: string[];
}

export type RoleScope =
  'School' | 'Branch' | 'Section' | 'Department' | 'Assigned classes' | 'Store';

export interface Role {
  id: string;
  name: string;
  type: 'Predefined' | 'Custom';
  scope: RoleScope;
  description: string;
  /** Module key → allowed action keys. */
  permissions: Record<string, string[]>;
  users: number;
}

export type RolePayload = Pick<Role, 'name' | 'scope' | 'description' | 'permissions'>;

export interface Position {
  id: string;
  title: string;
  parentId: string | null;
  holderIds: string[];
  holderNames: string[];
  suggestedRoles: string[];
  responsibilities: string;
  approvals: string[];
}

export interface Organogram {
  positions: Position[];
  history: TimelineEntry[];
}

export type PositionPayload = Pick<
  Position,
  'title' | 'parentId' | 'holderIds' | 'suggestedRoles' | 'responsibilities' | 'approvals'
>;
