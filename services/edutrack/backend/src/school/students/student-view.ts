import type { Prisma } from '../../generated/prisma/client.js';
import type {
  AdmissionType,
  Gender,
  MembershipStatus,
  PromotionOutcome,
  StudentExitKind,
  StudentStatus,
} from '../../generated/prisma/enums.js';
import { displayPhone, formatDay } from '../../platform/shared/format.js';

/* Labels and row building shared by the students services (School Admin's `src/types/students.ts`). */

export type StudentStatusLabel =
  'Active' | 'Incomplete profile' | 'Transferred' | 'Withdrawn' | 'Graduated';

export const STATUS_LABEL: Record<StudentStatus, StudentStatusLabel> = {
  ACTIVE: 'Active',
  INCOMPLETE_PROFILE: 'Incomplete profile',
  TRANSFERRED: 'Transferred',
  WITHDRAWN: 'Withdrawn',
  GRADUATED: 'Graduated',
};
export const STATUS_BY_LABEL = Object.fromEntries(
  Object.entries(STATUS_LABEL).map(([k, v]) => [v, k]),
) as Record<StudentStatusLabel, StudentStatus>;

export const GENDER_LABEL: Record<Gender, 'Female' | 'Male'> = { FEMALE: 'Female', MALE: 'Male' };

export const ADMISSION_TYPE_LABEL: Record<AdmissionType, 'New intake' | 'Transfer in'> = {
  NEW_INTAKE: 'New intake',
  TRANSFER_IN: 'Transfer in',
};

export const EXIT_KIND_LABEL: Record<StudentExitKind, 'Transfer' | 'Withdrawal'> = {
  TRANSFER: 'Transfer',
  WITHDRAWAL: 'Withdrawal',
};

const OUTCOME_LABEL: Record<PromotionOutcome, string> = {
  PROMOTE: 'Promoted',
  REPEAT: 'Repeated',
  GRADUATE: 'Graduated',
  TRANSFER: 'Transferred',
  WITHDRAW: 'Withdrawn',
};

/** Statuses still on the roll. */
export const ON_ROLL: StudentStatus[] = ['ACTIVE', 'INCOMPLETE_PROFILE'];
/** Membership statuses that still open a portal (or will, once accepted). */
export const OPEN_ACCESS: MembershipStatus[] = ['INVITED', 'ACTIVE', 'SUSPENDED'];

/** "JSS 2B" (levels ending in a digit) or "Nursery A", as the mock writes arm labels. */
export const armLabel = (level: string, arm: string) =>
  `${level}${/\d$/.test(level) ? '' : ' '}${arm}`;

export const studentName = (s: { firstName: string; surname: string }) =>
  `${s.firstName} ${s.surname}`.trim();

/** "Mrs. Funke Adeyemi": the title is kept apart from the name on the guardian record. */
export const guardianName = (g: { title: string | null; fullName: string }) =>
  [g.title, g.fullName].filter(Boolean).join(' ');

export const day = (d: Date) => formatDay(d, { calendar: true });
export const phoneOf = (p: string | null) => (p ? displayPhone(p) : '');

/** What a student row needs: branch, enrollments (with session, level, arm), guardians. */
export const studentInclude = {
  branch: { select: { name: true } },
  enrollments: {
    include: {
      session: { select: { id: true, name: true, startsOn: true } },
      level: { select: { name: true, section: { select: { name: true } } } },
      arm: { select: { name: true } },
      branch: { select: { name: true } },
    },
  },
  guardians: {
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    include: { guardian: { select: { id: true, title: true, fullName: true } } },
  },
} satisfies Prisma.StudentInclude;

export type StudentWithLinks = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;
export type EnrollmentWithLinks = StudentWithLinks['enrollments'][number];

/** The enrollment that is "now": this session's, else the latest one. */
export function currentEnrollment(
  s: Pick<StudentWithLinks, 'enrollments'>,
  sessionId: string | null,
): EnrollmentWithLinks | null {
  const here = sessionId ? s.enrollments.find((e) => e.sessionId === sessionId) : undefined;
  if (here) return here;
  return (
    [...s.enrollments].sort(
      (a, b) => b.session.startsOn.getTime() - a.session.startsOn.getTime(),
    )[0] ?? null
  );
}

export const classOf = (e: EnrollmentWithLinks | null) =>
  e?.arm ? armLabel(e.level.name, e.arm.name) : '';

export interface StudentRowView {
  id: string;
  name: string;
  admissionNo: string;
  gender: 'Female' | 'Male';
  className: string;
  branch: string;
  guardianName: string | null;
  balance: number;
  status: StudentStatusLabel;
  awaitingEnrollment: boolean;
  admittedToday: boolean;
  /** Boards this session (false for day students and anyone not enrolled this session). */
  boarder: boolean;
}

export function toRow(
  s: StudentWithLinks,
  ctx: { sessionId: string | null; today: Date; balance: number },
): StudentRowView {
  const e = currentEnrollment(s, ctx.sessionId);
  const cls = classOf(e);
  const primary = s.guardians[0]?.guardian;
  return {
    id: s.id,
    name: studentName(s),
    admissionNo: s.admissionNo,
    gender: GENDER_LABEL[s.gender],
    className: s.leftOn && cls ? `${cls} (until ${day(s.leftOn)})` : cls,
    branch: s.branch.name,
    guardianName: primary ? guardianName(primary) : null,
    balance: ctx.balance,
    status: STATUS_LABEL[s.status],
    boarder: !!e && e.sessionId === ctx.sessionId && e.status === 'ACTIVE' && e.boarding,
    awaitingEnrollment:
      s.status === 'ACTIVE' &&
      !!e &&
      e.sessionId === ctx.sessionId &&
      e.status === 'ACTIVE' &&
      !e.armId,
    admittedToday: s.admittedOn.getTime() === ctx.today.getTime(),
  };
}

/** A row of the student page's class history. */
export function enrollmentRow(
  e: EnrollmentWithLinks,
  s: Pick<StudentWithLinks, 'status' | 'exitKind' | 'exitOn' | 'leftOn'>,
  termName: string | null,
) {
  const className = e.arm ? armLabel(e.level.name, e.arm.name) : `${e.level.name} · awaiting arm`;
  const left = e.leftOn ?? s.leftOn;
  const status: string =
    e.status === 'ACTIVE'
      ? 'Active'
      : e.status === 'LEFT'
        ? s.exitKind
          ? STATUS_LABEL[s.status]
          : 'Left'
        : e.outcome
          ? OUTCOME_LABEL[e.outcome]
          : 'Completed';
  const outcome =
    e.status === 'ACTIVE'
      ? `In progress${termName ? ` · ${termName} results pending` : ''}`
      : e.status === 'LEFT'
        ? `${s.exitKind ? EXIT_KIND_LABEL[s.exitKind] : 'Left'}${left ? ` · ${day(left)}` : ''}`
        : e.outcome === 'GRADUATE'
          ? `Graduated${left ? ` · ${day(left)}` : ''}`
          : e.outcome === 'PROMOTE'
            ? 'Promoted to the next class'
            : e.outcome === 'REPEAT'
              ? 'Repeating the class'
              : 'Session closed';
  return { session: e.session.name, className, branch: e.branch.name, status, outcome };
}

/** Whole years between a date of birth and today. */
export function ageOn(dob: Date | null, today: Date): number | null {
  if (!dob) return null;
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const md = (d: Date) => d.getUTCMonth() * 100 + d.getUTCDate();
  if (md(today) < md(dob)) age -= 1;
  return age;
}
