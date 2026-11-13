/** Dashboard: greeting, metrics, today's lessons, to-do list and announcements. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

export const dashboardRoutes: RouteRecordRaw[] = [
  {
    ...routesPath.dashboard,
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: { title: 'Dashboard', breadcrumb: [] },
  },
];
