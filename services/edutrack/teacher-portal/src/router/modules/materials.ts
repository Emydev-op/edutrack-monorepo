/** Learning materials. Owned by the Materials builder. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { materials: m } = routesPath;
const owner = 'Materials';
const LIST = { label: 'Materials', to: m.list.name };
const nav = m.list.name;

export const materialRoutes: RouteRecordRaw[] = [
  {
    ...m.list,
    component: () => import('@/views/materials/MaterialsView.vue'),
    meta: { title: 'Materials', breadcrumb: [LIST], owner },
  },
  {
    ...m.upload,
    component: () => import('@/views/materials/MaterialUploadView.vue'),
    meta: { title: 'Upload material', nav, breadcrumb: [LIST, { label: 'Upload' }], owner },
  },
  {
    ...m.detail,
    component: () => import('@/views/materials/MaterialDetailView.vue'),
    meta: { title: 'Material', nav, breadcrumb: [LIST], owner },
  },
];
