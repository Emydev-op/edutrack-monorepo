import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { boarding: b } = routesPath;
const BOARDING = { label: 'Boarding', to: b.home.name };
const HOSTELS = { label: 'Hostels', to: b.hostels.name };
const ROLL_CALLS = { label: 'Roll calls', to: b.rollCalls.name };

export const boardingRoutes: RouteRecordRaw[] = [
  {
    ...b.home,
    component: () => import('@/views/boarding/BoardingHomeView.vue'),
    meta: { title: 'Boarding', breadcrumb: [{ label: 'Boarding' }, { label: 'Overview' }] },
  },
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
  {
    ...b.exeats,
    component: () => import('@/views/boarding/ExeatsView.vue'),
    meta: { title: 'Exeats', breadcrumb: [BOARDING, { label: 'Exeats' }] },
  },
  {
    ...b.gate,
    component: () => import('@/views/boarding/GateView.vue'),
    meta: { title: 'Gate', breadcrumb: [BOARDING, { label: 'Gate' }] },
  },
  {
    ...b.rollCalls,
    component: () => import('@/views/boarding/RollCallsView.vue'),
    meta: { title: 'Roll calls', breadcrumb: [BOARDING, { label: 'Roll calls' }] },
  },
  {
    ...b.rollCall,
    component: () => import('@/views/boarding/RollCallSheetView.vue'),
    meta: {
      title: 'Roll call',
      nav: b.rollCalls.name,
      breadcrumb: [BOARDING, ROLL_CALLS],
    },
  },
  {
    ...b.sickBay,
    component: () => import('@/views/boarding/SickBayView.vue'),
    meta: { title: 'Sick bay', breadcrumb: [BOARDING, { label: 'Sick bay' }] },
  },
  {
    ...b.house,
    component: () => import('@/views/boarding/HouseView.vue'),
    meta: {
      title: 'House',
      breadcrumb: [BOARDING, { label: 'Visiting days, incidents and property' }],
    },
  },
];
