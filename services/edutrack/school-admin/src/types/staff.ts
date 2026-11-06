import type { TimelineEntry } from './common';

export type StaffKind = 'Teaching' | 'Non-teaching';
export type StaffGroup = 'Teaching' | 'Administrative' | 'Finance' | 'Operations';
export type Employment = 'Full-time' | 'Part-time' | 'Contract';
export type StaffAccount = 'Active' | 'Invited' | 'Suspended' | 'Deactivated' | 'No account';

export interface StaffListRow {
  id: string;
  name: string;
  staffNumber: string;
  position: string;
  department: string;
  group: StaffGroup;
  kind: StaffKind;
  /** Branch names, or "All branches". */
  branch: string;
  branchIds: string[];
  employment: Employment;
  email: string;
  phone: string;
  account: StaffAccount;
  status: 'Active' | 'Deactivated';
  leftOn: string | null;
  /** Teaching load this session; null for non-teaching staff. */
  load: { periods: number; max: number; subjects: number; classes: number } | null;
  classTeacherOf: string[];
  /** The signed-in admin, who can't deactivate themself. */
  isYou: boolean;
}

export interface StaffQuery {
  search?: string;
  group?: StaffGroup | 'All' | 'No access';
  branch?: string;
  account?: StaffAccount | '';
  status?: 'Active' | 'Deactivated' | '';
}

export interface StaffList {
  rows: StaffListRow[];
  counts: Record<StaffGroup | 'All' | 'No access', number>;
  total: number;
  withAccounts: number;
  pendingInvites: number;
  deactivated: number;
  /** Teachers with no subjects and no class this session. */
  unassignedTeachers: { id: string; name: string }[];
  /** Active branches no teacher works at. */
  branchesWithoutTeachers: string[];
}

export interface StaffDocumentRow {
  id: string;
  name: string;
  kind: string;
  uploaded: string;
  status: 'Verified' | 'Pending' | 'Missing' | 'Optional';
}

export interface StaffDetail extends StaffListRow {
  title: string;
  firstName: string;
  lastName: string;
  gender: 'Female' | 'Male' | '';
  address: string;
  emergencyContact: string;
  since: string;
  qualified: string[];
  qualifiedNames: string[];
  maxPeriods: number;
  documents: StaffDocumentRow[];
  user: {
    id: string;
    email: string;
    status: StaffAccount;
    roles: string[];
    scope: string;
    lastActive: string;
    invited: string | null;
  } | null;
  teaching: {
    term: string;
    assignments: {
      id: string;
      subject: string;
      subjectName: string;
      armId: string;
      arm: string;
      branch: string;
      type: string;
      periods: number;
    }[];
    classTeacherOf: { id: string; name: string }[];
  } | null;
  history: TimelineEntry[];
}

export interface StaffPayload {
  title: string;
  firstName: string;
  lastName: string;
  gender: 'Female' | 'Male' | '';
  phone: string;
  email: string;
  address: string;
  emergencyContact: string;
  kind: StaffKind;
  position: string;
  department: string;
  employment: Employment;
  /** ISO date they start; optional. */
  since: string;
  branchIds: string[];
  qualified: string[];
  maxPeriods: number;
  /** Give them an Edutrack account (sends an invitation). */
  access: boolean;
  role: string;
}

export interface StaffFormOptions {
  branches: { id: string; name: string }[];
  positions: string[];
  departments: string[];
  roles: { name: string; description: string }[];
  subjects: { code: string; name: string }[];
  /** Suggested role for a position, e.g. Bursar → Bursar. */
  roleForPosition: Record<string, string>;
}

export interface StaffImportRow {
  line: number;
  name: string;
  email: string;
  phone: string;
  kind: StaffKind | '';
  position: string;
  branch: string;
  access: boolean;
  role: string;
  errors: string[];
  warnings: string[];
}

export interface StaffImportBatch {
  id: string;
  fileName: string;
  rows: StaffImportRow[];
}

export interface TeacherRow {
  id: string;
  name: string;
  staffNumber: string;
  branch: string;
  employment: Employment;
  qualified: string[];
  periods: number;
  max: number;
  subjects: { code: string; name: string; arms: string[] }[];
  classTeacherOf: string[];
  account: StaffAccount;
}
