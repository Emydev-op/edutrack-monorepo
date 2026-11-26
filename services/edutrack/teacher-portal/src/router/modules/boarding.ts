/** My hostel (house staff): the hostels a teacher looks after, their rooms and boarders. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { boarding: b } = routesPath;
const owner = 'Boarding';

export const boardingRoutes: RouteRecordRaw[] = [
  {
    ...b.myHostel,
    component: () => import('@/views/boarding/MyHostelView.vue'),
    meta: { title: 'My hostel', breadcrumb: [{ label: 'My hostel' }], owner },
  },
];
