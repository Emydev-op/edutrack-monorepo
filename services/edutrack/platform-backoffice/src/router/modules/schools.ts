import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { schools, plans, subscriptions } = routesPath;
const trail = [{ label: 'Schools', to: schools.list.name }];

export const schoolRoutes: RouteRecordRaw[] = [
  {
    ...schools.list,
    component: () => import('@/views/schools/SchoolsView.vue'),
    meta: { title: 'Schools', breadcrumb: [{ label: 'All Schools' }] },
  },
  {
    ...schools.provision,
    component: () => import('@/views/schools/provision/ProvisionSchoolView.vue'),
    meta: {
      title: 'Provision school',
      breadcrumb: [...trail, { label: 'Provision school' }],
      nav: 'provision-school',
    },
  },
  {
    path: schools.detail.path,
    component: () => import('@/views/schools/detail/SchoolDetailView.vue'),
    meta: { title: 'School', breadcrumb: trail, nav: schools.list.name },
    children: [
      {
        path: '',
        name: schools.detail.name,
        component: () => import('@/views/schools/detail/(tabs)/SchoolOverviewTab.vue'),
      },
      {
        ...schools.subscription,
        component: () => import('@/views/schools/detail/(tabs)/SchoolSubscriptionTab.vue'),
      },
      {
        ...schools.administrators,
        component: () => import('@/views/schools/detail/(tabs)/SchoolAdministratorsTab.vue'),
      },
      {
        ...schools.usage,
        component: () => import('@/views/schools/detail/(tabs)/SchoolUsageTab.vue'),
      },
      {
        ...schools.billing,
        component: () => import('@/views/schools/detail/(tabs)/SchoolBillingTab.vue'),
      },
      {
        ...schools.activity,
        component: () => import('@/views/schools/detail/(tabs)/SchoolActivityTab.vue'),
      },
      {
        ...schools.audit,
        component: () => import('@/views/schools/detail/(tabs)/SchoolAuditTab.vue'),
      },
    ],
  },
  {
    ...plans.list,
    component: () => import('@/views/plans/PlansView.vue'),
    meta: { title: 'Plans', breadcrumb: [{ label: 'Plans' }] },
  },
  {
    ...plans.create,
    component: () => import('@/views/plans/PlanEditorView.vue'),
    meta: {
      title: 'Create plan',
      breadcrumb: [{ label: 'Plans', to: plans.list.name }, { label: 'Create plan' }],
      nav: plans.list.name,
    },
  },
  {
    ...plans.detail,
    component: () => import('@/views/plans/PlanEditorView.vue'),
    meta: {
      title: 'Plan',
      breadcrumb: [{ label: 'Plans', to: plans.list.name }],
      nav: plans.list.name,
    },
  },
  {
    ...subscriptions,
    component: () => import('@/views/subscriptions/SubscriptionsView.vue'),
    meta: { title: 'Subscriptions', breadcrumb: [{ label: 'Subscriptions' }] },
  },
];
