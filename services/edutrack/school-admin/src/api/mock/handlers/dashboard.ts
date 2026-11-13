import { mock } from '@edutrack/web-core/mock';

import type { DashboardMetric } from '@/types';

import { routesPath } from '@/router/routes-path';

import { academicsData } from '../academics-db';
import { smsCreditOf } from '../comms-db';
import { tickets } from '../support-db';
import { branchFigures, dashboards } from '../db';
import { schoolData } from '../school-db';
import { reviewCounts } from './academics-results';
import { currentTerm } from './academics-shared';
import { sectionFigures, termFigures, weekly } from './finance-overview';
import { financeSnapshot, millions } from './finance-shared';
import { currentUser } from './shared';
import { needsYou } from './support';

/** Collection figures for the dashboard, from Finance, for a branch name or all branches. */
function feeFigures(schoolId: string, branch: string) {
  const snap = financeSnapshot(schoolId);
  const term = currentTerm(academicsData[schoolId]!);
  const branchId =
    branch === 'All branches'
      ? null
      : (snap.fin.invoices.length && schoolBranchId(schoolId, branch)) || null;
  if (!term) return null;
  const f = termFigures(snap.fin, snap.ledger, term.id, branchId);
  const pending = snap.fin.payments.filter(
    (p) =>
      p.status === 'Pending verification' &&
      (!branchId || snap.students.get(p.studentKey)?.branchId === branchId),
  );
  return { f, pending, snap, branchId, termId: term.id };
}
const schoolBranchId = (schoolId: string, name: string) =>
  schoolData[schoolId]!.branches.find((b) => b.name === name)?.id ?? null;

const metric = (
  label: string,
  value: string,
  hint: string,
  hintTone: DashboardMetric['hintTone'],
): DashboardMetric => ({ label, value, hint, hintTone });

mock.get('/v1/dashboard', (req) => {
  const school = currentUser(req).schoolId;
  const base = dashboards[school]!;
  if (!base.hasData)
    return {
      ...base,
      metrics: [
        metric('Students', '0', 'None yet', 'neutral'),
        metric('Teachers', '0', 'None yet', 'neutral'),
        metric('Classes', '0', 'None yet', 'neutral'),
        metric('Fees collected', '₦0', 'None yet', 'neutral'),
        metric('Outstanding', '₦0', 'None yet', 'neutral'),
      ],
    };
  const branch = req.query.branch ?? 'Main Campus';
  const f = branchFigures[branch];
  // A branch added since the figures were seeded has no students, staff or fees yet.
  if (!f)
    return {
      ...base,
      metrics: [
        metric('Students', '0', 'None yet at this branch', 'neutral'),
        metric('Teachers', '0', 'None yet at this branch', 'neutral'),
        metric('Classes', '0', 'Set up classes in Academics', 'neutral'),
        metric('Fees collected', '₦0', 'Nothing billed yet', 'neutral'),
        metric('Outstanding', '₦0', 'Nothing billed yet', 'neutral'),
      ],
    };
  const [students, teachers, classes, collected, collectedHint, outstanding, outstandingHint] = f;
  return {
    ...base,
    metrics: [
      studentsMetric(school, branch, students),
      metric('Teachers', String(teachers), '2 subjects without a teacher', 'warning'),
      metric('Classes', String(classes), 'SSS 1C has no class teacher', 'warning'),
      ...feeMetrics(school, branch, [collected, collectedHint, outstanding, outstandingHint]),
    ],
    attention: [
      // Sheets waiting on the office sit next to the result-entry reminder.
      ...base.attention.flatMap((a) =>
        a.id === 'results-due'
          ? [...resultsDue(school, branch, a), ...resultsAttention(school, branch)]
          : liveAttention(school, branch, a),
      ),
      ...opsAttention(school),
    ],
  };
});

/** Enrolled students from the live roll (new admissions this session as the hint). */
function studentsMetric(school: string, branch: string, fallback: number) {
  const snap = financeSnapshot(school);
  const branchId = branch === 'All branches' ? null : schoolBranchId(school, branch);
  const roll = [...snap.students.values()].filter(
    (s) => s.active && (branchId === null || s.branchId === branchId),
  );
  if (!roll.length) return metric('Students', fallback.toLocaleString('en-NG'), '', 'neutral');
  const fresh = roll.filter((s) => s.isNew).length;
  return metric(
    'Students',
    roll.length.toLocaleString('en-NG'),
    fresh ? `${fresh.toLocaleString('en-NG')} new this session` : 'No new admissions yet',
    fresh ? 'success' : 'neutral',
  );
}

function feeMetrics(school: string, branch: string, fallback: string[]) {
  const x = feeFigures(school, branch);
  if (!x || !x.f.invoices)
    return [
      metric('Fees collected', fallback[0] ?? '₦0', fallback[1] ?? 'Nothing billed yet', 'neutral'),
      metric('Outstanding', fallback[2] ?? '₦0', fallback[3] ?? 'Nothing billed yet', 'neutral'),
    ];
  const { f } = x;
  return [
    metric(
      'Fees collected',
      millions(f.collected),
      `${f.rate}% of ${millions(f.billed)} billed`,
      'neutral',
    ),
    metric(
      'Outstanding',
      millions(f.outstanding),
      `${f.owingStudents.toLocaleString('en-NG')} students · ${millions(f.overdue)} overdue`,
      f.overdue ? 'error' : 'neutral',
    ),
  ];
}

/**
 * Result sheets teachers haven't submitted yet for the current term (Not started, Draft or
 * Returned), counted from the sheets themselves. Drops off once every sheet is in.
 */
function resultsDue(
  school: string,
  branch: string,
  a: (typeof dashboards)[string]['attention'][number],
): (typeof dashboards)[string]['attention'] {
  const acad = academicsData[school]!;
  const term = currentTerm(acad);
  if (!term) return [];
  const branchId = branch === 'All branches' ? null : schoolBranchId(school, branch);
  const open = acad.sheets.filter((s) => {
    if (s.termId !== term.id || acad.published.includes(`${term.id}|${s.armId}`)) return false;
    if (!['Not started', 'Draft', 'Returned'].includes(s.status)) return false;
    const level = acad.levels.find((l) => l.arms.some((x) => x.id === s.armId));
    return Boolean(level) && (!branchId || level!.branchId === branchId);
  }).length;
  if (!open) return [];
  // The deadline part of the seeded text ("entry closes Fri 11 Dec") stays as it is.
  const deadline = a.text.split(' · ').slice(1).join(' · ');
  return [
    {
      ...a,
      text: `${open} result sheet${open === 1 ? '' : 's'} not yet submitted${deadline ? ` · ${deadline}` : ''}`,
    },
  ];
}

/** Result sheets the academic office can act on now; sheets still with HODs are only mentioned. */
function resultsAttention(
  school: string,
  branch: string,
): (typeof dashboards)[string]['attention'] {
  const branchId = branch === 'All branches' ? null : schoolBranchId(school, branch);
  const { office, hod } = reviewCounts(school, branchId);
  if (!office) return [];
  return [
    {
      id: 'results-review',
      badge: { label: 'Review', tone: 'info' },
      text: `${office} result sheet${office === 1 ? '' : 's'} awaiting your review${hod ? ` · ${hod} more with HODs` : ''}`,
      area: `Academics · Results · ${currentTerm(academicsData[school]!)?.name ?? ''}`,
      action: 'Review',
      to: { name: routesPath.academics.results.name },
    },
  ];
}

/** Finance attention items carry live counts; they drop off once nothing is waiting. */
/** Account-level items: SMS sender ID and support tickets waiting on the school. */
function opsAttention(school: string): (typeof dashboards)[string]['attention'] {
  const out: (typeof dashboards)[string]['attention'] = [];
  const { senderId, units } = smsCreditOf(school);
  if (senderId.status !== 'Approved')
    out.push({
      id: 'sender-id',
      badge: { label: senderId.status === 'Rejected' ? 'Rejected' : 'Pending', tone: 'warning' },
      text:
        senderId.status === 'Not requested'
          ? 'No SMS sender ID yet · SMS goes out as “EDUTRACK”'
          : `SMS sender ID “${senderId.name}” ${senderId.status === 'Rejected' ? 'was rejected' : 'awaiting approval'}`,
      area: 'Communication · Notifications',
      action: 'Review',
      to: { name: routesPath.settings.name, query: { tab: 'notifications' } },
    });
  if (units < 2000)
    out.push({
      id: 'sms-credit',
      badge: { label: 'Low', tone: 'warning' },
      text: `SMS credit is low · ${units.toLocaleString('en-NG')} units left`,
      area: 'Settings · Subscription',
      action: 'View',
      to: { name: routesPath.settings.name, query: { tab: 'subscription' } },
    });
  const waiting = tickets.filter((t) => t.schoolId === school && needsYou(t));
  if (waiting.length)
    out.push({
      id: 'support',
      badge: { label: 'Reply', tone: 'info' },
      text: `${waiting.length} support ticket${waiting.length === 1 ? ' needs' : 's need'} your reply or confirmation`,
      area: 'Support',
      action: 'Open',
      to: { name: routesPath.support.name },
    });
  return out;
}

function liveAttention(
  school: string,
  branch: string,
  a: (typeof dashboards)[string]['attention'][number],
) {
  if (a.id !== 'overdue-invoices' && a.id !== 'verify-transfers') return [a];
  const x = feeFigures(school, branch);
  if (!x) return [];
  if (a.id === 'overdue-invoices')
    return x.f.overdueCount
      ? [
          {
            ...a,
            text: `${x.f.overdueCount.toLocaleString('en-NG')} invoices are overdue · ${millions(x.f.overdue)}`,
            to: { name: routesPath.finance.invoices.name, query: { status: 'Overdue' } },
          },
        ]
      : [];
  return x.pending.length
    ? [
        {
          ...a,
          text: `${x.pending.length} bank transfer${x.pending.length === 1 ? '' : 's'} awaiting verification`,
          to: { name: routesPath.finance.payments.name, query: { tab: 'pending' } },
        },
      ]
    : [];
}

/** Separate from the summary: the finance service can be slow or down on its own. */
mock.get('/v1/dashboard/finance', (req) => {
  const school = currentUser(req).schoolId;
  const x = feeFigures(school, req.query.branch ?? 'All branches');
  if (!x || !x.f.invoices) return { weekly: [], sections: [] };
  return {
    weekly: weekly(x.snap.fin, x.branchId, x.snap.students),
    sections: sectionFigures(x.snap.fin, x.snap.ledger, x.termId, x.branchId).map((s) => ({
      label: s.section,
      percent: s.rate,
    })),
  };
});
