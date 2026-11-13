/** Results: score sheets and correction requests. Owned by the Results builder. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { results: r } = routesPath;
const owner = 'Results';
const LIST = { label: 'Results', to: r.list.name };
const nav = r.list.name;

export const resultRoutes: RouteRecordRaw[] = [
  {
    ...r.list,
    component: () => import('@/views/results/ResultsView.vue'),
    meta: { title: 'Results', breadcrumb: [LIST], owner },
  },
  {
    ...r.sheet,
    component: () => import('@/views/results/ResultSheetView.vue'),
    meta: { title: 'Score sheet', nav, breadcrumb: [LIST], owner },
  },
  {
    ...r.correctionNew,
    component: () => import('@/views/results/CorrectionNewView.vue'),
    meta: {
      title: 'Request a correction',
      nav,
      breadcrumb: [LIST, { label: 'Correction' }],
      owner,
    },
  },
];
