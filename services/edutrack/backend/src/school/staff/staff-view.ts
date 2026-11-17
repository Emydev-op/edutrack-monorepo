import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type {
  Employment,
  Gender,
  MembershipStatus,
  StaffGroup,
  StaffKind,
} from '../../generated/prisma/enums.js';

/**
 * Labels, lists and pure rules shared by the staff services. They mirror the School Admin mock
 * (`school-admin/src/api/mock/handlers/staff.ts` and `school-db.ts`) so the screens read the same
 * strings from the real API.
 */

export const POSITIONS = [
  'Principal',
  'Vice Principal (Academics)',
  'Vice Principal (Administration)',
  'Head of Department',
  'Teacher',
  'Nursery Coordinator',
  'Head of Campus',
  'Bursar',
  'Accountant',
  'Secretary',
  'Admissions Officer',
  'ICT Officer',
  'Librarian',
  'Lab Attendant',
  'Store Keeper',
  'Nurse',
  'Security',
  'Driver',
  'Cleaner',
  'Other',
] as const;

export const DEPARTMENTS = [
  'Academics',
  'Sciences',
  'Languages',
  'Arts & Humanities',
  'Early Years',
  'Administration',
  'Finance',
  'ICT',
  'Operations',
] as const;

/** Departments that don't own subjects (results and lesson notes never route to them). */
const NON_ACADEMIC_DEPARTMENTS = new Set(['Administration', 'Finance', 'ICT', 'Operations']);
export const isAcademicDepartment = (name: string) => !NON_ACADEMIC_DEPARTMENTS.has(name);

/** The system role a new hire in this position usually gets. */
export const ROLE_FOR: Record<string, string> = {
  Principal: 'Principal',
  'Vice Principal (Academics)': 'Academic Head',
  'Head of Department': 'HOD',
  'Nursery Coordinator': 'Academic Head',
  Teacher: 'Teacher',
  'Head of Campus': 'Branch Admin',
  Bursar: 'Bursar',
  Accountant: 'Accountant',
  'Store Keeper': 'Inventory Officer',
  'ICT Officer': 'School Admin',
};

export type KindLabel = 'Teaching' | 'Non-teaching';
export type GroupLabel = 'Teaching' | 'Administrative' | 'Finance' | 'Operations';
export type EmploymentLabel = 'Full-time' | 'Part-time' | 'Contract';
export type AccountLabel = 'Active' | 'Invited' | 'Suspended' | 'Deactivated' | 'No account';

export const defaultRole = (position: string, kind: KindLabel | '') =>
  ROLE_FOR[position] ?? (kind === 'Teaching' ? 'Teacher' : null);

/** Department group for the directory tabs, from the job title. */
export function groupOf(kind: KindLabel, position: string): GroupLabel {
  if (kind === 'Teaching') return 'Teaching';
  if (/bursar|account|finance|payroll/i.test(position)) return 'Finance';
  if (/driver|store|security|clean|nurse|lab|librar|cook|gardener|maintenance/i.test(position))
    return 'Operations';
  return 'Administrative';
}

export const KIND_LABEL: Record<StaffKind, KindLabel> = {
  TEACHING: 'Teaching',
  NON_TEACHING: 'Non-teaching',
};
export const KIND_OF: Record<KindLabel, StaffKind> = {
  Teaching: 'TEACHING',
  'Non-teaching': 'NON_TEACHING',
};

export const GROUP_LABEL: Record<StaffGroup, GroupLabel> = {
  TEACHING: 'Teaching',
  ADMINISTRATIVE: 'Administrative',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
};
export const GROUP_OF: Record<GroupLabel, StaffGroup> = {
  Teaching: 'TEACHING',
  Administrative: 'ADMINISTRATIVE',
  Finance: 'FINANCE',
  Operations: 'OPERATIONS',
};

export const EMPLOYMENT_LABEL: Record<Employment, EmploymentLabel> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
};
export const EMPLOYMENT_OF: Record<EmploymentLabel, Employment> = {
  'Full-time': 'FULL_TIME',
  'Part-time': 'PART_TIME',
  Contract: 'CONTRACT',
};

export const GENDER_LABEL: Record<Gender, 'Female' | 'Male'> = { FEMALE: 'Female', MALE: 'Male' };
export const GENDER_OF = { Female: 'FEMALE', Male: 'MALE' } as const;

/** A membership as School Admin's account column shows it (a withdrawn invitation is none). */
export function accountLabel(status: MembershipStatus | null | undefined): AccountLabel {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'INVITED':
      return 'Invited';
    case 'SUSPENDED':
      return 'Suspended';
    case 'DEACTIVATED':
      return 'Deactivated';
    default:
      return 'No account';
  }
}

/** Accounts that still count as access (the Setup step and "with accounts"). */
export const HOLDS_ACCESS: MembershipStatus[] = ['ACTIVE', 'INVITED', 'SUSPENDED'];

export const displayName = (title: string | null | undefined, first: string, last: string) =>
  [title, first, last].filter(Boolean).join(' ');

/** "JSS 2B" (levels ending in a digit) or "Nursery 1 A"… as the mock writes arm labels. */
export const armLabel = (level: string, arm: string) =>
  `${level}${/\d$/.test(level) ? '' : ' '}${arm}`;

/** "Main Campus + Lekki Campus", or "All branches" when they cover every active branch. */
export function branchLabel(
  ids: string[],
  branches: { id: string; name: string; active: boolean }[],
): string {
  const active = branches.filter((b) => b.active);
  if (active.length > 1 && active.every((b) => ids.includes(b.id))) return 'All branches';
  return branches
    .filter((b) => ids.includes(b.id))
    .map((b) => b.name)
    .join(' + ');
}

export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NG_PHONE = /^(\+234|0)[789][01]\d{8}$/;
const compactPhone = (v: string) => v.replace(/[\s-]/g, '');
export const isPhone = (v: string) => NG_PHONE.test(compactPhone(v));
/** Nigerian mobile number in E.164 (+2348031234567), or null. */
export function toE164(v: string): string | null {
  const c = compactPhone(v);
  if (!NG_PHONE.test(c)) return null;
  return c.startsWith('+234') ? c : `+234${c.slice(1)}`;
}

/** A 422 the screens show as is (mock: `MockHttpError(422, message)`). */
export const unprocessable = (message: string, code = 'VALIDATION', field?: string) =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    message,
    code,
    field ? { [field]: message } : undefined,
  );

/* ---------------- Staff numbers ---------------- */

const SEQ = /\[(#{3,6})\]/g;

/** The school's staff ID format with a running number, e.g. `GFA-ST-[####]` → `GFA-ST-0152`. */
export const formatNumber = (pattern: string, seq: number, year: number) =>
  pattern
    .replace('[YYYY]', String(year))
    .replace('[YY]', String(year).slice(-2))
    .replace(SEQ, (_m, hashes: string) => String(seq).padStart(hashes.length, '0'));

/** The running number at the end of a staff ID ("GFA-ST-0117" → 117), 0 when there is none. */
export const numberOf = (staffNumber: string) => Number(/(\d+)$/.exec(staffNumber)?.[1] ?? 0);

/* ---------------- Uploads ---------------- */

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const FILE_TYPES = {
  pdf: { mime: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  png: { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  jpeg: { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
} as const;

export interface ParsedUpload {
  bytes: Buffer;
  mime: string;
  ext: string;
}

/**
 * Reads a `data:<type>;base64,…` upload and checks it by its first bytes, not its label, and by
 * size. Documents may be PDF, JPG or PNG (5 MB); photos JPG or PNG (2 MB).
 */
export function parseUpload(dataUrl: string, kind: 'document' | 'photo'): ParsedUpload {
  const allowed = kind === 'document' ? ['pdf', 'png', 'jpeg'] : ['png', 'jpeg'];
  const typeMessage =
    kind === 'document' ? 'Use a PDF, JPG or PNG file.' : 'Use a JPG or PNG image.';
  const max = kind === 'document' ? DOCUMENT_MAX_BYTES : PHOTO_MAX_BYTES;
  const field = kind === 'document' ? 'file' : 'photo';
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw unprocessable(typeMessage, 'FILE_TYPE', field);
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length > max)
    throw unprocessable(
      kind === 'document' ? 'The file is larger than 5 MB.' : 'The photo is larger than 2 MB.',
      'FILE_TOO_LARGE',
      field,
    );
  const type = allowed
    .map((k) => FILE_TYPES[k as keyof typeof FILE_TYPES])
    .find(({ magic }) => bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b));
  if (!type) throw unprocessable(typeMessage, 'FILE_TYPE', field);
  return { bytes, mime: type.mime, ext: type.ext };
}

/* ---------------- CSV ---------------- */

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF or LF. Blank rows are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}
