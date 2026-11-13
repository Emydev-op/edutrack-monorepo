/** My class (class teachers only). Owned by the My class builder. */
import type { RouteRecordRaw } from 'vue-router';

import { classTeacherOnly } from '../guards';
import { routesPath } from '../routes-path';

const { classTeacher: c } = routesPath;
const owner = 'My class';
const MY_CLASS = { label: 'My class', to: c.register.name };

export const classTeacherRoutes: RouteRecordRaw[] = [
  {
    ...c.register,
    component: () => import('@/views/class-teacher/RegisterView.vue'),
    meta: {
      ...classTeacherOnly,
      title: 'Register',
      breadcrumb: [MY_CLASS, { label: 'Register' }],
      owner,
    },
  },
  {
    ...c.registerHistory,
    component: () => import('@/views/class-teacher/RegisterHistoryView.vue'),
    meta: {
      ...classTeacherOnly,
      title: 'Register history',
      nav: c.register.name,
      breadcrumb: [MY_CLASS, { label: 'Register', to: c.register.name }, { label: 'History' }],
      owner,
    },
  },
  {
    ...c.progress,
    component: () => import('@/views/class-teacher/ClassProgressView.vue'),
    meta: {
      ...classTeacherOnly,
      title: 'Class progress',
      breadcrumb: [MY_CLASS, { label: 'Class progress' }],
      owner,
    },
  },
  {
    ...c.reportCards,
    component: () => import('@/views/class-teacher/ReportCardsView.vue'),
    meta: {
      ...classTeacherOnly,
      title: 'Report cards',
      breadcrumb: [MY_CLASS, { label: 'Report cards' }],
      owner,
    },
  },
  {
    ...c.reportCard,
    component: () => import('@/views/class-teacher/ReportCardView.vue'),
    meta: {
      ...classTeacherOnly,
      title: 'Report card',
      nav: c.reportCards.name,
      breadcrumb: [MY_CLASS, { label: 'Report cards', to: c.reportCards.name }],
      owner,
    },
  },
];
