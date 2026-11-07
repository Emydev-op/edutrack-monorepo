import { mock } from '@edutrack/web-core/mock';

import type { DashboardMetric } from '@/types';

import { routesPath } from '@/router/routes-path';

import { academicsData } from '../academics-db';
import { branchFigures, dashboards } from '../db';
import { schoolData } from '../school-db';
import { currentTerm } from './academics-shared';
import { sectionFigures, termFigures, weekly } from './finance-overview';
import { financeSnapshot, millions } from './finance-shared';
import { currentUser } from './shared';

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
      metric(
        'Students',
        students.toLocaleString('en-NG'),
        '+36 since 2025/2026 Third Term',
        'success',
      ),
      metric('Teachers', String(teachers), '2 subjects without a teacher', 'warning'),
      metric('Classes', String(classes), 'SSS 1C has no class teacher', 'warning'),
      ...feeMetrics(school, branch, [collected, collectedHint, outstanding, outstandingHint]),
    ],
    attention: base.attention.flatMap((a) => liveAttention(school, branch, a)),
  };
});

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

/** Finance attention items carry live counts; they drop off once nothing is waiting. */
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
