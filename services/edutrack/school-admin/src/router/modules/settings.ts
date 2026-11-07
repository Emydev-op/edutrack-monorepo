import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

/** Settings is one page; its tabs live in ?tab= so they can be linked (e.g. ?tab=security). */
export const settingsRoutes: RouteRecordRaw[] = [
  {
    ...routesPath.settings,
    component: () => import('@/views/settings/SettingsView.vue'),
    meta: { title: 'Settings', breadcrumb: [{ label: 'Settings' }] },
  },
];
