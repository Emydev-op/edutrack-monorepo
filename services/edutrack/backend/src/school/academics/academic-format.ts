import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type {
  SessionStatus,
  SessionStructure,
  TermEventType,
  TermStatus,
} from '../../generated/prisma/enums.js';

/**
 * Formatting shared by the Academics routes and their Setup Center steps. Wording and formats
 * match the School Admin mock (`school-admin/src/api/mock/handlers/academics-shared.ts`), so the
 * screens read the same against either.
 */

/** "1 term", "3 terms", "1,248 students". */
export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n.toLocaleString('en-NG')} ${n === 1 ? word : many}`;

/** A date-only column as `YYYY-MM-DD`. */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** `YYYY-MM-DD` → a date-only value (midnight UTC). */
export const fromIso = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date in `YYYY-MM-DD` form. */
export const isIso = (value: unknown): value is string =>
  typeof value === 'string' &&
  ISO.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  isoDate(fromIso(value)) === value;

/** "14 Sept 2026" (or "14 Sept" without the year), as the portals print dates. */
export const fmtDate = (value: string | Date, year = true) =>
  (typeof value === 'string' ? fromIso(value) : value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    ...(year && { year: 'numeric' }),
  });

/** Whole days from `a` to `b` (`YYYY-MM-DD`). */
export const days = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const addDays = (iso: string, n: number) =>
  isoDate(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000));

/** "JSS 2" + "B" → "JSS 2B"; "Pre-Nursery" + "A" → "Pre-Nursery A". */
export const armLabel = (level: string, arm: string) =>
  `${level}${/\d$/.test(level) ? '' : ' '}${arm}`;

/** A business rule the request breaks: 422 (or 409) with a stable code. */
export const fail = (message: string, code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) =>
  new AppException(status, message, code);

/* ---------------- Enum labels (the portals' wording) ---------------- */

export const SESSION_STATUS: Record<SessionStatus, string> = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  CLOSING: 'Closing',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

export const TERM_STATUS: Record<TermStatus, string> = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  ENDED: 'Ended',
  CLOSED: 'Closed',
};

export const STRUCTURE_LABEL: Record<SessionStructure, string> = {
  THREE_TERMS: '3 terms',
  TWO_SEMESTERS: '2 semesters',
  CUSTOM: 'Custom',
};
export const STRUCTURE_LABELS = Object.values(STRUCTURE_LABEL);
export const structureFromLabel = (label: string) =>
  (Object.entries(STRUCTURE_LABEL).find(([, v]) => v === label)?.[0] ??
    'THREE_TERMS') as SessionStructure;

export const TERM_EVENT_TYPES = [
  'resumption',
  'midterm',
  'ca',
  'exams',
  'pta',
  'results',
  'custom',
] as const;
export type TermEventTypeLabel = (typeof TERM_EVENT_TYPES)[number];
export const eventTypeToDb = (t: TermEventTypeLabel) => t.toUpperCase() as TermEventType;
export const eventTypeFromDb = (t: TermEventType) => t.toLowerCase() as TermEventTypeLabel;

/* ---------------- Reference data ---------------- */

/** What a new session can copy from the current one. */
export const COPY_AREAS = [
  'sections',
  'classes',
  'arms',
  'subjects',
  'curriculum',
  'grading',
  'assessment',
  'assignments',
  'timetable',
  'calendar',
] as const;
export type CopyArea = (typeof COPY_AREAS)[number];

/** Standard levels per section code, offered as defaults (Classes & Arms). */
export const DEFAULT_LEVELS: Record<string, string[]> = {
  NUR: ['Pre-Nursery', 'Nursery 1', 'Nursery 2'],
  PRI: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'],
  JSS: ['JSS 1', 'JSS 2', 'JSS 3'],
  SSS: ['SSS 1', 'SSS 2', 'SSS 3'],
};

/** "Mrs. Lola Fashola". */
export const staffName = (s: { title: string | null; firstName: string; lastName: string }) =>
  [s.title, s.firstName, s.lastName].filter(Boolean).join(' ');

/** Past terms are history: their assignments and timetables can't change. */
export function requireOpenTerm(term: { name: string; status: string }) {
  if (term.status !== 'ACTIVE' && term.status !== 'UPCOMING')
    throw fail(
      `${term.name} has ended, so its assignments and timetables are read-only.`,
      'TERM_CLOSED',
      HttpStatus.CONFLICT,
    );
}
