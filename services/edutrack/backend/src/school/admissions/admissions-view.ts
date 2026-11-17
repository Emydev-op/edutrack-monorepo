import { NIGERIAN_STATES } from '@edutrack/shared';
import type {
  AdmissionType,
  ApplicationStage,
  StudentStatus,
} from '../../generated/prisma/enums.js';

/** School Admin's labels for the stored enums. */
export const STAGE_LABEL: Record<ApplicationStage, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under review',
  OFFER_ACCEPTED: 'Offer accepted',
  ADMITTED: 'Admitted',
  REJECTED: 'Rejected',
};

export type AdmissionTypeLabel = 'New intake' | 'Transfer in';
export const ADMISSION_TYPE_LABEL: Record<AdmissionType, AdmissionTypeLabel> = {
  NEW_INTAKE: 'New intake',
  TRANSFER_IN: 'Transfer in',
};
export const ADMISSION_TYPE_OF: Record<AdmissionTypeLabel, AdmissionType> = {
  'New intake': 'NEW_INTAKE',
  'Transfer in': 'TRANSFER_IN',
};

/** Students that hold a place (and count as siblings or duplicates). */
export const ON_ROLL: StudentStatus[] = ['ACTIVE', 'INCOMPLETE_PROFILE'];

/** The admission wizard's documents and when each is needed (the mock's list). */
export const REQUIRED_DOCUMENTS = [
  { key: 'birth', label: 'Birth certificate', required: 'always' },
  { key: 'photo', label: 'Passport photograph', required: 'optional' },
  { key: 'report', label: 'Previous school report', required: 'transfer' },
] as const;

/** Lower case with single spaces, for comparing names people typed. */
export const normalise = (v: string | null | undefined) =>
  (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
/** Lower case without any spaces: "JSS1" and "jss 1" are the same class. */
export const squash = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, '').toLowerCase();

/** A name without its courtesy title ("Mr. Obinna Nwosu" → "obinna nwosu"). */
export const bareName = (v: string | null | undefined) =>
  normalise(v).replace(
    /^(mr|mrs|ms|miss|dr|prof|chief|alhaji|hajia|engr|barr|rev|pastor)\.?\s+/,
    '',
  );

/** The canonical spelling of a Nigerian state, or null. */
export function stateOf(v: string): string | null {
  const key = normalise(v).replace(/\s+state$/, '');
  if (key === 'abuja') return 'FCT';
  return NIGERIAN_STATES.find((s) => normalise(s) === key) ?? null;
}

/**
 * A calendar day from `YYYY-MM-DD` (date inputs) or `DD/MM/YYYY` (the import template; `D/M/YYYY`
 * and dashes too), as a `@db.Date` value (midnight UTC). Null when it isn't a real date.
 */
export function parseDay(v: string | null | undefined): Date | null {
  const text = (v ?? '').trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (iso) [y, m, d] = [+iso[1]!, +iso[2]!, +iso[3]!];
  else if (dmy) [d, m, y] = [+dmy[1]!, +dmy[2]!, +dmy[3]!];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : null;
}

/** `12/05/2014`, as the import template writes dates. */
export const ddmmyyyy = (date: Date) =>
  `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;

/** `YYYY-MM-DD` of a `@db.Date` value. */
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Whole years between a birth date and a day. */
export function ageOn(birth: Date, day: Date): number {
  let age = day.getUTCFullYear() - birth.getUTCFullYear();
  const m = day.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && day.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

/** Why a date of birth can't be right (future, under 1, over 30), or null. */
export function birthProblem(birth: Date, today: Date): string | null {
  if (birth > today) return 'The date of birth can’t be in the future.';
  const age = ageOn(birth, today);
  if (age < 1) return 'The student must be at least a year old.';
  if (age > 30) return 'Check the date of birth: the student would be over 30.';
  return null;
}

/* ---------------- Admission numbers ---------------- */

const TOKEN = /(\[[^\]]*\])/;
const SEQ = /^\[(#{3,6})\]$/;

/** The parts of a numbering format: `STU-[YYYY]-[####]` → literal, year, literal, counter. */
function pieces(pattern: string) {
  return pattern.split(TOKEN).filter(Boolean);
}

/**
 * The admission number for running number `seq`: `[YYYY]`/`[YY]` the year, `[BR]` the branch code,
 * `[###]`–`[######]` the zero-padded counter.
 */
export function formatAdmissionNo(pattern: string, seq: number, year: number, branchCode: string) {
  return pieces(pattern)
    .map((p) => {
      if (p === '[YYYY]') return String(year);
      if (p === '[YY]') return String(year).slice(-2);
      if (p === '[BR]') return branchCode;
      const hashes = SEQ.exec(p)?.[1];
      return hashes ? String(seq).padStart(hashes.length, '0') : p;
    })
    .join('');
}

/** Matches numbers in this format for this year and branch; group 1 is the running number. */
export function admissionNoMatcher(pattern: string, year: number, branchCode: string): RegExp {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = pieces(pattern)
    .map((p) =>
      SEQ.test(p)
        ? '(\\d+)'
        : escape(
            p === '[YYYY]'
              ? String(year)
              : p === '[YY]'
                ? String(year).slice(-2)
                : p === '[BR]'
                  ? branchCode
                  : p,
          ),
    )
    .join('');
  return new RegExp(`^${source}$`);
}

/** The counter's scope: yearly when the format shows the year, per branch when it shows [BR]. */
export function admissionScope(pattern: string, year: number, branchCode: string): string {
  return [
    /\[YY(YY)?\]/.test(pattern) ? String(year) : '',
    pattern.includes('[BR]') ? branchCode : '',
  ]
    .filter(Boolean)
    .join('|');
}
