import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { boarding: b } = routesPath;
const BOARDING = { label: 'Boarding', to: b.hostels.name };
const HOSTELS = { label: 'Hostels', to: b.hostels.name };

export const boardingRoutes: RouteRecordRaw[] = [
  {
    ...b.boarders,
    component: () => import('@/views/boarding/BoardersView.vue'),
    meta: { title: 'Boarders', breadcrumb: [BOARDING, { label: 'Boarders' }] },
  },
  {
    ...b.setup,
    component: () => import('@/views/boarding/BoardingSetupView.vue'),
    meta: { title: 'Boarding set-up', breadcrumb: [BOARDING, { label: 'Boarding set-up' }] },
  },
  {
    ...b.hostels,
    component: () => import('@/views/boarding/HostelsView.vue'),
    meta: { title: 'Hostels', breadcrumb: [BOARDING, { label: 'Hostels' }] },
  },
  {
    ...b.hostel,
    component: () => import('@/views/boarding/HostelDetailView.vue'),
    meta: { title: 'Hostel', nav: b.hostels.name, breadcrumb: [BOARDING, HOSTELS] },
  },
];
