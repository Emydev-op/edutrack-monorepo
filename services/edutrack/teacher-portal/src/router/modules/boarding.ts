/**
 * Boarding for staff: house staff, matrons, gate officers and nurses (some also teach). Each page
 * needs the matching `me.boarding` flag (see `guards.ts`).
 */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { boarding: b } = routesPath;
const owner = 'Boarding';
const parent = { label: 'Boarding', to: b.overview.name };

export const boardingRoutes: RouteRecordRaw[] = [
  {
    ...b.overview,
    component: () => import('@/views/boarding/BoardingOverviewView.vue'),
    meta: { title: 'Boarding', breadcrumb: [{ label: 'Boarding' }], owner, requires: 'boarding' },
  },
  {
    ...b.myHostel,
    component: () => import('@/views/boarding/MyHostelView.vue'),
    meta: {
      title: 'My hostel',
      breadcrumb: [parent, { label: 'My hostel' }],
      owner,
      requires: 'houseStaff',
    },
  },
  {
    ...b.rollCalls,
    component: () => import('@/views/boarding/RollCallsView.vue'),
    meta: {
      title: 'Roll call',
      breadcrumb: [parent, { label: 'Roll call' }],
      owner,
      requires: 'rollcall',
    },
  },
  {
    ...b.rollCall,
    component: () => import('@/views/boarding/RollCallSheetView.vue'),
    meta: {
      title: 'Roll call',
      breadcrumb: [parent, { label: 'Roll call', to: b.rollCalls.name }],
      nav: b.rollCalls.name,
      owner,
      requires: 'rollcall',
    },
  },
  {
    ...b.exeats,
    component: () => import('@/views/boarding/ExeatsView.vue'),
    meta: { title: 'Exeats', breadcrumb: [parent, { label: 'Exeats' }], owner, requires: 'exeats' },
  },
  {
    ...b.exeat,
    component: () => import('@/views/boarding/ExeatView.vue'),
    meta: {
      title: 'Exeat',
      breadcrumb: [parent, { label: 'Exeats', to: b.exeats.name }],
      nav: b.exeats.name,
      owner,
      requires: 'boarding',
    },
  },
  {
    ...b.gate,
    component: () => import('@/views/boarding/GateView.vue'),
    meta: { title: 'Gate', breadcrumb: [parent, { label: 'Gate' }], owner, requires: 'gate' },
  },
  {
    ...b.sickBay,
    component: () => import('@/views/boarding/SickBayView.vue'),
    meta: {
      title: 'Sick bay',
      breadcrumb: [parent, { label: 'Sick bay' }],
      owner,
      requires: 'health',
    },
  },
  {
    ...b.incidents,
    component: () => import('@/views/boarding/IncidentsView.vue'),
    meta: {
      title: 'Incidents',
      breadcrumb: [parent, { label: 'Incidents' }],
      owner,
      requires: 'rollcall',
    },
  },
];
