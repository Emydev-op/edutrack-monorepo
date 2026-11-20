import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { formatAgo, lagosToday } from '../../platform/shared/format.js';
import { PLATFORM_AREA } from '../../platform/shared/platform-audit.service.js';
import { CalendarService } from '../academics/calendar.service.js';
import { days as daysBetween, fmtDate, isoDate, plural } from '../academics/academic-format.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { FinanceOverviewService } from '../finance/overview.service.js';
import { deadlineText } from '../results/results-core.service.js';
import { mean, round1 } from '../results/scoring.js';
import { ON_ROLL } from '../students/student-view.js';
import { InsightsResultsService } from './insights-results.service.js';
import { InsightsScopeService, type BranchScope } from './insights-scope.service.js';

/** School Admin's route names (`school-admin/src/router/routes-path.ts`). */
export const ROUTE = {
  results: 'results',
  students: 'students',
  student: 'student',
  admissions: 'admissions',
  promotion: 'promotion',
  settings: 'settings',
  support: 'support',
  supportTicket: 'support-ticket',
  parent: 'parent',
  staffMember: 'staff-member',
  staff: 'staff',
  classDetail: 'class',
  subjects: 'subjects',
  attendanceArm: 'attendance-arm',
  enrollment: 'enrollment',
  sessions: 'sessions',
  classes: 'classes',
  reports: 'reports',
} as const;

type Tone = 'success' | 'warning' | 'error' | 'neutral';
type BadgeTone = Tone | 'info';

export interface DashboardMetric {
  label: string;
  value: string;
  hint: string;
  hintTone: Tone;
}

export interface AttentionItem {
  id: string;
  badge: { label: string; tone: BadgeTone };
  text: string;
  area: string;
  action: string;
  to: { name: string; query?: Record<string, string> };
}

type UpcomingType =
  'Examination' | 'Results' | 'Meeting' | 'PTA' | 'Event' | 'Term' | 'Break' | 'Holiday';

/** Calendar types as the dashboard's Upcoming card labels them. */
const UPCOMING_TYPE: Record<string, UpcomingType> = {
  Term: 'Term',
  Break: 'Break',
  Exam: 'Examination',
  Holiday: 'Holiday',
  Meeting: 'Meeting',
  Event: 'Event',
};

const metric = (label: string, value: string, hint: string, hintTone: Tone): DashboardMetric => ({
  label,
  value,
  hint,
  hintTone,
});
const count = (n: number) => n.toLocaleString('en-NG');
/** "Wed 9 Dec". */
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
/** "2026/2027" → "2026/27". */
const shortSession = (name: string) => name.replace(/^(\d{4})\/\d{2}(\d{2})$/, '$1/$2');

/**
 * School Admin's dashboard, from live records: the roll, staff and classes at the working branch,
 * what needs the school's attention (results, admissions, promotion, profiles, the subscription,
 * support), the calendar, enrolment by session, the term's results by subject and recent activity.
 * Fee figures, the fee card (`GET /v1/dashboard/finance`) and the finance attention items come
 * from Finance's ledger.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly scope: InsightsScopeService,
    private readonly results: InsightsResultsService,
    private readonly assignments: AssignmentsService,
    private readonly calendar: CalendarService,
    private readonly finances: FinanceOverviewService,
  ) {}

  private get db() {
    return this.scope.db;
  }

  async summary(q: { branch?: string; term?: string }) {
    const branch = await this.scope.branch(q.branch);
    const found = await this.scope.term(q.term);
    const atBranch = branch.id ? { branchId: branch.id } : {};
    const [students, armsAll, teachersAll] = await Promise.all([
      this.db.student.count({ where: { status: { in: ON_ROLL }, deletedAt: null } }),
      this.db.classArm.count({ where: { archivedAt: null, branch: { status: 'ACTIVE' } } }),
      this.db.staff.count({ where: { kind: 'TEACHING', status: 'ACTIVE' } }),
    ]);
    const hasData = students + armsAll + teachersAll > 0;
    const [metrics, attention, upcoming, enrollment, performance, activity] = await Promise.all([
      hasData ? this.metrics(branch, found) : this.emptyMetrics(),
      this.attention(branch, found, atBranch).then(async (items) => [
        ...(await this.finances.dashboardAttention(branch.id)),
        ...items,
      ]),
      this.upcoming(found),
      this.enrollment(),
      found?.term ? this.performance(branch, found.term) : [],
      this.activity(),
    ]);
    return { hasData, metrics, attention, upcoming, enrollment, performance, activity };
  }

  /** The fee card: confirmed collections per week and the term's collection rate per section. */
  async finance(q: { branch?: string }) {
    const branch = await this.scope.branch(q.branch);
    return this.finances.dashboardFinance(branch.id);
  }

  /* ---------------- Metrics ---------------- */

  private async emptyMetrics() {
    return [
      metric('Students', '0', 'None yet', 'neutral'),
      metric('Teachers', '0', 'None yet', 'neutral'),
      metric('Classes', '0', 'None yet', 'neutral'),
      ...(await this.finances.dashboardMetrics(null)),
    ];
  }

  private async metrics(
    branch: BranchScope,
    found: Awaited<ReturnType<InsightsScopeService['term']>>,
  ) {
    const roll: Prisma.StudentWhereInput = {
      status: { in: ON_ROLL },
      deletedAt: null,
      ...(branch.id && { branchId: branch.id }),
    };
    const [students, fresh, teachers, arms, plan] = await Promise.all([
      this.db.student.count({ where: roll }),
      found
        ? this.db.student.count({
            where: { ...roll, admittedOn: { gte: found.session.startsOn } },
          })
        : 0,
      this.db.staff.count({
        where: {
          kind: 'TEACHING',
          status: 'ACTIVE',
          ...(branch.id && {
            OR: [{ allBranches: true }, { branches: { some: { branchId: branch.id } } }],
          }),
        },
      }),
      this.results.arms(branch.id),
      found?.term
        ? this.assignments.view(found.term.id, branch.id ? branch.name : null).catch(() => null)
        : null,
    ]);
    const gaps = plan?.gaps.length ?? 0;
    const noCt = plan?.armsWithoutClassTeacher ?? [];
    return [
      metric(
        'Students',
        count(students),
        !students
          ? 'None yet'
          : fresh
            ? `${count(fresh)} new this session`
            : 'No new admissions yet',
        fresh ? 'success' : 'neutral',
      ),
      metric(
        'Teachers',
        count(teachers),
        !plan || !arms.length
          ? ''
          : gaps
            ? `${plural(gaps, 'subject')} without a teacher`
            : 'Every subject has a teacher',
        !plan || !arms.length ? 'neutral' : gaps ? 'warning' : 'success',
      ),
      metric(
        'Classes',
        count(arms.length),
        !arms.length
          ? 'Set up classes in Academics'
          : !plan
            ? ''
            : noCt.length === 1
              ? `${noCt[0]!.name} has no class teacher`
              : noCt.length
                ? `${noCt.length} classes have no class teacher`
                : 'Every class has a class teacher',
        !arms.length || !plan ? 'neutral' : noCt.length ? 'warning' : 'success',
      ),
      ...(await this.finances.dashboardMetrics(branch.id)),
    ];
  }

  /* ---------------- Needs your attention ---------------- */

  private async attention(
    branch: BranchScope,
    found: Awaited<ReturnType<InsightsScopeService['term']>>,
    atBranch: { branchId?: string },
  ): Promise<AttentionItem[]> {
    const term = found?.term ?? null;
    const [cells, incomplete, applications, closing, sub, onRoll, support] = await Promise.all([
      term ? this.results.arms(branch.id).then((arms) => this.results.cells(term, arms)) : [],
      this.db.student.count({
        where: { status: 'INCOMPLETE_PROFILE', deletedAt: null, ...atBranch },
      }),
      this.db.admissionApplication.count({
        where: {
          stage: { in: ['PENDING', 'UNDER_REVIEW'] },
          ...(branch.id && { OR: [{ branchId: null }, { branchId: branch.id }] }),
        },
      }),
      this.db.academicSession.findFirst({
        where: { status: 'CLOSING' },
        orderBy: { startsOn: 'asc' },
        select: { id: true, name: true },
      }),
      this.db.subscription.findFirst({ include: { plan: { select: { studentLimit: true } } } }),
      this.db.student.count({ where: { status: { in: ON_ROLL }, deletedAt: null } }),
      this.db.supportTicket.count({
        where: { status: { in: ['WAITING_FOR_SCHOOL', 'RESOLVED'] } },
      }),
    ]);
    const out: AttentionItem[] = [];

    if (term && term.status === 'ACTIVE') {
      const open = cells.filter((c) =>
        ['NOT_STARTED', 'DRAFT', 'RETURNED'].includes(c.status),
      ).length;
      if (open)
        out.push({
          id: 'results-due',
          badge: { label: 'Due', tone: 'warning' },
          text: `${plural(open, 'result sheet')} not yet submitted${term.resultEntryClosesAt ? ` · entry closes ${deadlineText(term.resultEntryClosesAt)}` : ''}`,
          area: `Academics · Results · ${term.name}`,
          action: 'View',
          to: { name: ROUTE.results },
        });
    }
    const office = cells.filter((c) => c.withOffice).length;
    const hod = cells.filter((c) => c.withHod).length;
    if (term && office)
      out.push({
        id: 'results-review',
        badge: { label: 'Review', tone: 'info' },
        text: `${plural(office, 'result sheet')} awaiting your review${hod ? ` · ${hod} more with HODs` : ''}`,
        area: `Academics · Results · ${term.name}`,
        action: 'Review',
        to: { name: ROUTE.results },
      });
    if (incomplete)
      out.push({
        id: 'incomplete-profiles',
        badge: { label: 'Incomplete', tone: 'warning' },
        text: `${plural(incomplete, 'student')} ${incomplete === 1 ? 'has an' : 'have'} incomplete profile${incomplete === 1 ? '' : 's'}`,
        area: 'Students',
        action: 'View',
        to: { name: ROUTE.students },
      });
    if (applications)
      out.push({
        id: 'admissions',
        badge: { label: 'Pending', tone: 'warning' },
        text: `${plural(applications, 'admission application')} awaiting a decision`,
        area: 'Students · Admissions',
        action: 'Review',
        to: { name: ROUTE.admissions },
      });
    if (closing) {
      const undecided = await this.db.enrollment.count({
        where: {
          sessionId: closing.id,
          status: { in: ['ACTIVE', 'COMPLETED'] },
          outcome: null,
          ...atBranch,
        },
      });
      if (undecided)
        out.push({
          id: 'promotion',
          badge: { label: 'Blocking', tone: 'error' },
          text: `${plural(undecided, 'student')} from ${closing.name} still need${undecided === 1 ? 's' : ''} a promotion decision`,
          area: `Academics · Promotion · blocks closing ${closing.name}`,
          action: 'Decide',
          to: { name: ROUTE.promotion },
        });
    }
    if (sub) out.push(...this.subscriptionItems(sub, onRoll));
    if (support)
      out.push({
        id: 'support',
        badge: { label: 'Reply', tone: 'info' },
        text: `${plural(support, 'support ticket')} need${support === 1 ? 's' : ''} your reply or confirmation`,
        area: 'Support',
        action: 'Open',
        to: { name: ROUTE.support },
      });
    return out;
  }

  /** The subscription running out, lapsed or near its student limit. */
  private subscriptionItems(
    sub: {
      status: string;
      renewsOn: Date;
      graceEndsOn: Date | null;
      plan: { studentLimit: number | null };
    },
    onRoll: number,
  ): AttentionItem[] {
    const to = { name: ROUTE.settings, query: { tab: 'subscription' } };
    const out: AttentionItem[] = [];
    const left = daysBetween(isoDate(lagosToday(this.scope.now())), isoDate(sub.renewsOn));
    const renews = fmtDate(sub.renewsOn);
    if (['RESTRICTED', 'EXPIRED'].includes(sub.status))
      out.push({
        id: 'subscription',
        badge: { label: 'Lapsed', tone: 'error' },
        text: 'Your subscription has lapsed · records are read-only until it’s renewed',
        area: 'Settings · Subscription',
        action: 'View',
        to,
      });
    else if (sub.status === 'GRACE_PERIOD')
      out.push({
        id: 'subscription',
        badge: { label: 'Grace period', tone: 'warning' },
        text: `Your subscription renewal is overdue${sub.graceEndsOn ? ` · grace period ends ${fmtDate(sub.graceEndsOn)}` : ''}`,
        area: 'Settings · Subscription',
        action: 'View',
        to,
      });
    else if (sub.status === 'EXPIRING' || (sub.status === 'ACTIVE' && left <= 30))
      out.push({
        id: 'subscription',
        badge: { label: 'Renewal', tone: 'warning' },
        text: `Your subscription renews on ${renews} · ${plural(Math.max(left, 0), 'day')} left`,
        area: 'Settings · Subscription',
        action: 'View',
        to,
      });
    const limit = sub.plan.studentLimit;
    if (limit && onRoll >= limit * 0.9)
      out.push({
        id: 'student-limit',
        badge: { label: onRoll >= limit ? 'At limit' : 'Near limit', tone: 'warning' },
        text: `${count(onRoll)} of ${count(limit)} students on your plan`,
        area: 'Settings · Subscription',
        action: 'View',
        to,
      });
    return out;
  }

  /* ---------------- Calendar, enrolment, results, activity ---------------- */

  private async upcoming(found: Awaited<ReturnType<InsightsScopeService['term']>>) {
    const today = this.scope.today();
    const cal = await this.calendar.view();
    const items = cal.events
      .filter((e) => e.end >= today)
      .map((e) => ({
        start: e.start < today ? today : e.start,
        title: e.title,
        type: UPCOMING_TYPE[e.type] ?? ('Event' as UpcomingType),
      }));
    const closes = found?.term?.resultEntryClosesAt;
    if (closes) {
      const day = isoDate(lagosToday(closes));
      if (day >= today) items.push({ start: day, title: 'Result entry deadline', type: 'Results' });
    }
    // The same day and title from two sources (a term event and a calendar entry) shows once.
    const seen = new Set<string>();
    return items
      .sort((a, b) => a.start.localeCompare(b.start))
      .filter((e) => {
        const key = `${e.start}|${e.title.toLowerCase()}`;
        return !seen.has(key) && seen.add(key);
      })
      .slice(0, 6)
      .map((e) => ({ date: dayLabel(e.start), title: e.title, type: e.type }));
  }

  /** Students enrolled per session (all branches), oldest first, the last five. */
  private async enrollment() {
    const sessions = await this.db.academicSession.findMany({
      orderBy: { startsOn: 'desc' },
      take: 5,
      select: { id: true, name: true },
    });
    if (!sessions.length) return [];
    const counts = await this.db.enrollment.groupBy({
      by: ['sessionId'],
      where: {
        sessionId: { in: sessions.map((s) => s.id) },
        status: { in: ['ACTIVE', 'COMPLETED'] },
      },
      _count: { _all: true },
    });
    const by = new Map(counts.map((c) => [c.sessionId, c._count._all]));
    return sessions
      .reverse()
      .map((s) => ({ label: shortSession(s.name), value: by.get(s.id) ?? 0 }))
      .filter((s) => s.value > 0);
  }

  /** The term's approved and published sheets: the average total per subject, best first. */
  private async performance(branch: BranchScope, term: { id: string; sessionId: string }) {
    const arms = await this.results.arms(branch.id);
    const ctxs = await this.results.approved(term, arms);
    const by = new Map<string, { label: string; totals: number[] }>();
    for (const c of ctxs) {
      const row = by.get(c.sheet.subjectId) ?? { label: c.sheet.subject.name, totals: [] };
      row.totals.push(...c.rows.map((r) => r.total).filter((x): x is number => x !== null));
      by.set(c.sheet.subjectId, row);
    }
    return [...by.values()]
      .filter((x) => x.totals.length)
      .map((x) => ({ label: x.label, percent: round1(mean(x.totals)!) }))
      .sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label))
      .slice(0, 6);
  }

  /** The latest school-side changes in the audit trail. */
  private async activity() {
    const events = await this.db.auditEvent.findMany({
      // School-side changes only: the back office's actions on the school are left out.
      where: { OR: [{ area: null }, { area: { not: PLATFORM_AREA } }] },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, summary: true, detail: true, actorName: true, createdAt: true },
    });
    const now = this.scope.now();
    return events.map((e) => ({
      id: e.id,
      title: e.summary,
      detail: [e.actorName, e.detail].filter(Boolean).join(' · '),
      when: formatAgo(e.createdAt, now),
    }));
  }
}
