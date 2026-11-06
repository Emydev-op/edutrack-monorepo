import { mock } from '@edutrack/web-core/mock';

import type { DashboardMetric } from '@/types';

import { branchFigures, dashboards, finance } from '../db';
import { currentUser } from './shared';

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
      metric('Fees collected', collected, collectedHint, 'neutral'),
      metric('Outstanding', outstanding, outstandingHint, 'error'),
    ],
  };
});

/** Separate from the summary: the finance service can be slow or down on its own. */
mock.get('/v1/dashboard/finance', (req) => finance[currentUser(req).schoolId]);
