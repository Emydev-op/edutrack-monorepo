/** Assessments: the school's scheme and scheduled components. Owned by the Assessments builder. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { assessments: a } = routesPath;
const owner = 'Assessments';
const LIST = { label: 'Assessments', to: a.list.name };
const nav = a.list.name;

export const assessmentRoutes: RouteRecordRaw[] = [
  {
    ...a.list,
    component: () => import('@/views/assessments/AssessmentsView.vue'),
    meta: { title: 'Assessments', breadcrumb: [LIST], owner },
  },
  {
    ...a.schedule,
    component: () => import('@/views/assessments/AssessmentScheduleView.vue'),
    meta: {
      title: 'Schedule an assessment',
      nav,
      breadcrumb: [LIST, { label: 'Schedule' }],
      owner,
    },
  },
  {
    ...a.detail,
    component: () => import('@/views/assessments/AssessmentDetailView.vue'),
    meta: { title: 'Assessment', nav, breadcrumb: [LIST], owner },
  },
];
