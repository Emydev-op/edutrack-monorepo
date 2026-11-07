import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const SUPPORT = { label: 'Support', to: routesPath.support.name };

export const supportRoutes: RouteRecordRaw[] = [
  {
    ...routesPath.support,
    component: () => import('@/views/support/SupportView.vue'),
    meta: { title: 'Support', breadcrumb: [{ label: 'Support' }] },
  },
  {
    ...routesPath.supportNew,
    component: () => import('@/views/support/NewTicketView.vue'),
    meta: {
      title: 'New support ticket',
      nav: routesPath.support.name,
      breadcrumb: [SUPPORT, { label: 'New ticket' }],
    },
  },
  {
    ...routesPath.supportTicket,
    component: () => import('@/views/support/TicketDetailView.vue'),
    meta: { title: 'Support ticket', nav: routesPath.support.name, breadcrumb: [SUPPORT] },
  },
];
