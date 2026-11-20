import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { TicketStatus } from '../../generated/prisma/enums.js';
import { staffName } from '../academics/academic-format.js';
import { CATEGORY_LABEL } from '../curriculum/curriculum-defaults.js';
import { STATUS_LABEL, armLabel, guardianName, studentName } from '../students/student-view.js';
import { ROUTE } from './dashboard.service.js';
import { InsightsScopeService } from './insights-scope.service.js';

export type SearchType =
  'Student' | 'Parent' | 'Teacher' | 'Staff' | 'Class' | 'Subject' | 'Ticket';

export interface SearchResult {
  id: string;
  title: string;
  type: SearchType;
  meta: string;
  to: { name: string; params?: Record<string, string> };
}

/** At most this many results, as the command menu shows them. */
export const SEARCH_LIMIT = 9;
/** Fewer characters than this find nothing (too broad to be useful). */
export const SEARCH_MIN = 2;

const TICKET_STATUS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  REOPENED: 'Open',
  ASSIGNED: 'In progress',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'In progress',
  ESCALATED: 'In progress',
  WAITING_FOR_SCHOOL: 'Waiting for School',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const like = (value: string) => ({ contains: value, mode: 'insensitive' as const });
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');
/** Rows fetched per kind before ranking (the best are kept). */
const FETCH = 25;

/** 0: a word of the title is the search, 1: a word starts with it, 2: anything else. */
function rank(title: string, q: string) {
  const needle = q.toLowerCase();
  const words = title.toLowerCase().split(/[\s.,·()-]+/);
  if (title.toLowerCase() === needle || words.includes(needle)) return 0;
  return words.some((w) => w.startsWith(needle)) ? 1 : 2;
}
/** Best matches first, keeping the database's order among equals. */
const best = (rows: SearchResult[], q: string) =>
  rows
    .map((r, i) => ({ r, i, k: rank(r.title, q) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.r)
    .slice(0, SEARCH_LIMIT);

/**
 * The header's command menu in School Admin: students (name, admission number), parents and
 * guardians (name, phone, email), staff (name, staff number), class arms, subjects and the
 * school's support tickets. Everything is read through the tenant client, so only the signed-in
 * school's records are found.
 */
@Injectable()
export class SearchService {
  constructor(private readonly scope: InsightsScopeService) {}

  private get db() {
    return this.scope.db;
  }

  async search(raw?: string): Promise<SearchResult[]> {
    const q = (raw ?? '').trim().replace(/\s+/g, ' ');
    if (q.length < SEARCH_MIN) return [];
    const words = q.split(' ').slice(0, 4);
    const session = await this.scope.catalog.currentSession();
    const [students, guardians, staff, classes, subjects, tickets] = await Promise.all([
      this.students(q, words, session?.id ?? null),
      this.guardians(q, words, session?.id ?? null),
      this.staff(q, words),
      this.classes(q, session?.id ?? null),
      this.subjects(q),
      this.tickets(q),
    ]);
    // Each kind gets a fair share before the list is cut to the limit.
    const kinds = [students, guardians, staff, classes, subjects, tickets].map((k) => best(k, q));
    const out: SearchResult[] = [];
    for (let i = 0; out.length < SEARCH_LIMIT && kinds.some((k) => k.length > i); i++)
      for (const k of kinds) if (k[i] && out.length < SEARCH_LIMIT) out.push(k[i]!);
    return this.ordered(out, kinds);
  }

  /** Back in kind order (students first), keeping what the round-robin picked. */
  private ordered(picked: SearchResult[], kinds: SearchResult[][]) {
    const keep = new Set(picked);
    return kinds.flat().filter((r) => keep.has(r));
  }

  private async students(q: string, words: string[], sessionId: string | null) {
    const rows = await this.db.student.findMany({
      where: {
        deletedAt: null,
        OR: [
          { admissionNo: like(q) },
          {
            AND: words.map((w) => ({
              OR: [{ firstName: like(w) }, { surname: like(w) }, { otherNames: like(w) }],
            })),
          },
        ],
      },
      include: {
        branch: { select: { name: true } },
        enrollments: {
          orderBy: { session: { startsOn: 'desc' } },
          take: 1,
          select: {
            sessionId: true,
            level: { select: { name: true } },
            arm: { select: { name: true } },
          },
        },
      },
      orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
      take: FETCH,
    });
    return rows.map((s): SearchResult => {
      const e = s.enrollments[0];
      const cls = e ? (e.arm ? armLabel(e.level.name, e.arm.name) : e.level.name) : '';
      const onRoll = s.status === 'ACTIVE' || s.status === 'INCOMPLETE_PROFILE';
      return {
        id: s.id,
        title: studentName(s),
        type: 'Student',
        meta: [
          onRoll ? (e?.sessionId === sessionId ? cls : '') : STATUS_LABEL[s.status],
          s.admissionNo,
          s.branch.name,
        ]
          .filter(Boolean)
          .join(' · '),
        to: { name: ROUTE.student, params: { id: s.id } },
      };
    });
  }

  private async guardians(q: string, words: string[], sessionId: string | null) {
    const digits = q.replace(/\D/g, '');
    const rows = await this.db.guardian.findMany({
      where: {
        deletedAt: null,
        mergedIntoId: null,
        OR: [
          { AND: words.map((w) => ({ fullName: like(w) })) },
          { email: like(q) },
          ...(digits.length >= 4 ? [{ phone: like(digits.replace(/^0/, '')) }] : []),
        ],
      },
      include: {
        students: {
          where: { student: { deletedAt: null } },
          select: {
            student: {
              select: {
                firstName: true,
                enrollments: {
                  where: sessionId ? { sessionId } : undefined,
                  orderBy: { session: { startsOn: 'desc' } },
                  take: 1,
                  select: { level: { select: { name: true } }, arm: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { fullName: 'asc' },
      take: FETCH,
    });
    return rows.map((g): SearchResult => {
      const children = g.students.map(({ student: s }) => {
        const e = s.enrollments[0];
        const cls = e ? (e.arm ? armLabel(e.level.name, e.arm.name) : e.level.name) : '';
        return cls ? `${s.firstName} (${cls})` : s.firstName;
      });
      return {
        id: g.id,
        title: guardianName(g),
        type: 'Parent',
        meta: children.length
          ? `Guardian of ${children.slice(0, -1).join(', ')}${children.length > 1 ? ' & ' : ''}${children.at(-1)}`
          : 'No children linked',
        to: { name: ROUTE.parent, params: { id: g.id } },
      };
    });
  }

  private async staff(q: string, words: string[]) {
    const rows = await this.db.staff.findMany({
      where: {
        OR: [
          { staffNumber: like(q) },
          { AND: words.map((w) => ({ OR: [{ firstName: like(w) }, { lastName: like(w) }] })) },
        ],
      },
      include: { department: { select: { name: true } } },
      orderBy: [{ status: 'asc' }, { firstName: 'asc' }, { lastName: 'asc' }],
      take: FETCH,
    });
    return rows.map((s): SearchResult => ({
      id: s.id,
      title: staffName(s),
      type: s.kind === 'TEACHING' ? 'Teacher' : 'Staff',
      meta: [
        s.positionTitle ?? s.department?.name ?? '',
        s.staffNumber,
        s.status === 'DEACTIVATED' ? 'Deactivated' : '',
      ]
        .filter(Boolean)
        .join(' · '),
      to: { name: ROUTE.staffMember, params: { id: s.id } },
    }));
  }

  /** Class arms by their label ("JSS 2B", "jss2b"), with the roll and class teacher. */
  private async classes(q: string, sessionId: string | null) {
    const needle = squash(q);
    const arms = (await this.scope.catalog.arms()).filter(
      (a) => squash(a.label).includes(needle) || squash(a.level).includes(needle),
    );
    const mine = arms.slice(0, FETCH);
    if (!mine.length) return [];
    const ids = mine.map((a) => a.id);
    const [roll, teachers] = await Promise.all([
      sessionId
        ? this.db.enrollment.groupBy({
            by: ['armId'],
            where: { sessionId, armId: { in: ids }, status: 'ACTIVE' },
            _count: { _all: true },
          })
        : [],
      sessionId
        ? this.db.classTeacherAssignment.findMany({
            where: { sessionId, armId: { in: ids }, endsOn: null },
            include: { staff: { select: { title: true, firstName: true, lastName: true } } },
          })
        : [],
    ]);
    const branches = new Set(arms.map((a) => a.branchId)).size;
    return mine.map((a): SearchResult => {
      const n = roll.find((r) => r.armId === a.id)?._count._all ?? 0;
      const ct = teachers.find((t) => t.armId === a.id);
      return {
        id: a.id,
        title: a.label,
        type: 'Class',
        meta: [
          `${n} student${n === 1 ? '' : 's'}`,
          ct ? `Class teacher ${staffName(ct.staff)}` : 'No class teacher',
          branches > 1 ? a.branch : '',
        ]
          .filter(Boolean)
          .join(' · '),
        to: { name: ROUTE.classDetail, params: { id: a.id } },
      };
    });
  }

  private async subjects(q: string) {
    const rows = await this.db.subject.findMany({
      where: { status: 'ACTIVE', OR: [{ name: like(q) }, { code: like(q) }] },
      include: { section: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: FETCH,
    });
    return rows.map((s): SearchResult => ({
      id: s.id,
      title: s.name,
      type: 'Subject',
      meta: [s.code, CATEGORY_LABEL[s.category], s.section?.name ?? 'All sections'].join(' · '),
      to: { name: ROUTE.subjects },
    }));
  }

  private async tickets(q: string) {
    const where: Prisma.SupportTicketWhereInput = {
      OR: [{ number: like(q) }, { subject: like(q) }],
    };
    const rows = await this.db.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: FETCH,
      select: { number: true, subject: true, status: true },
    });
    return rows.map((t): SearchResult => ({
      id: t.number,
      title: t.subject,
      type: 'Ticket',
      meta: `${t.number} · ${TICKET_STATUS[t.status]}`,
      to: { name: ROUTE.supportTicket, params: { id: t.number } },
    }));
  }
}
