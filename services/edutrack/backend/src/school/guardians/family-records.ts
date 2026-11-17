import type { StudentStatus } from '../../generated/prisma/enums.js';
import type { TenantTx } from '../shared/tenant-tx.js';

/*
 * Small readers shared by the guardian and student-login screens: where each student is placed
 * this session, their fee balance, and display formats matching the School Admin mock.
 */

type Db = Pick<TenantTx, 'enrollment' | 'invoice'>;

export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: 'Active',
  INCOMPLETE_PROFILE: 'Incomplete profile',
  TRANSFERRED: 'Transferred',
  WITHDRAWN: 'Withdrawn',
  GRADUATED: 'Graduated',
};

/** "JSS 2" + "B" → "JSS 2B"; "Reception" + "Gold" → "Reception Gold" (as the mock writes classes). */
export const classLabel = (level: string, arm: string | null | undefined) =>
  arm ? `${level}${/\d$/.test(level) ? '' : ' '}${arm}` : '';

/** "+2348035550193" → "0803 555 0193"; other numbers as stored. */
export function displayPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : phone;
}

export interface Placement {
  studentId: string;
  /** "JSS 2B"; empty while awaiting an arm. */
  className: string;
  levelId: string;
  levelName: string;
  sectionId: string;
  sectionName: string;
  studentLogins: boolean;
  branchName: string;
}

/**
 * Each student's class: their ACTIVE enrollment in the latest session, else their latest one
 * (a leaver's last class).
 */
export async function placements(db: Db, studentIds: string[]): Promise<Map<string, Placement>> {
  const out = new Map<string, Placement>();
  if (!studentIds.length) return out;
  const rows = await db.enrollment.findMany({
    where: { studentId: { in: studentIds } },
    include: {
      level: { include: { section: true } },
      arm: { select: { name: true } },
      branch: { select: { name: true } },
      session: { select: { startsOn: true } },
    },
    orderBy: [{ session: { startsOn: 'desc' } }, { createdAt: 'desc' }],
  });
  const rank = (status: string) => (status === 'ACTIVE' ? 0 : 1);
  const sorted = [...rows].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      b.session.startsOn.getTime() - a.session.startsOn.getTime(),
  );
  for (const e of sorted) {
    if (out.has(e.studentId)) continue;
    out.set(e.studentId, {
      studentId: e.studentId,
      className: classLabel(e.level.name, e.arm?.name),
      levelId: e.levelId,
      levelName: e.level.name,
      sectionId: e.level.sectionId,
      sectionName: e.level.section.name,
      studentLogins: e.level.section.studentLogins,
      branchName: e.branch.name,
    });
  }
  return out;
}

/** Whether a class filter ("JSS 2" for the level, "JSS 2B" for one arm) matches a placement. */
export function matchesClass(p: Placement | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  if (!p) return false;
  const want = filter.trim().toLowerCase();
  return p.className.toLowerCase() === want || p.levelName.toLowerCase() === want;
}

export interface FeeState {
  /** Naira owed on issued invoices. */
  balance: number;
  /** Something owed is past its due date. */
  overdue: boolean;
}

/** What each student owes on issued (not cancelled, not draft) invoices. */
export async function balances(
  db: Db,
  studentIds: string[],
  today: Date,
): Promise<Map<string, FeeState>> {
  const out = new Map<string, FeeState>();
  if (!studentIds.length) return out;
  const invoices = await db.invoice.findMany({
    where: { studentId: { in: studentIds }, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
    select: { studentId: true, totalKobo: true, paidKobo: true, dueOn: true },
  });
  for (const i of invoices) {
    const owed = Number(i.totalKobo - i.paidKobo) / 100;
    if (owed <= 0) continue;
    const s = out.get(i.studentId) ?? { balance: 0, overdue: false };
    s.balance += owed;
    if (i.dueOn < today) s.overdue = true;
    out.set(i.studentId, s);
  }
  return out;
}
