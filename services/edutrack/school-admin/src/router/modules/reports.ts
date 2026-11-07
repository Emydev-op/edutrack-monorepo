import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

export const reportRoutes: RouteRecordRaw[] = [
  {
    ...routesPath.reports,
    component: () => import('@/views/reports/ReportsView.vue'),
    meta: { title: 'Reports', breadcrumb: [{ label: 'Reports' }] },
  },
  {
    ...routesPath.reportDetail,
    component: () => import('@/views/reports/ReportDetailView.vue'),
    meta: {
      title: 'Report',
      nav: routesPath.reports.name,
      breadcrumb: [{ label: 'Reports', to: routesPath.reports.name }],
    },
  },
];
