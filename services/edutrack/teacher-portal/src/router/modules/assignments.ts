/** Assignments and submissions. Owned by the Assignments builder. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { assignments: a } = routesPath;
const owner = 'Assignments';
const LIST = { label: 'Assignments', to: a.list.name };
const nav = a.list.name;

export const assignmentRoutes: RouteRecordRaw[] = [
  {
    ...a.list,
    component: () => import('@/views/assignments/AssignmentsView.vue'),
    meta: { title: 'Assignments', breadcrumb: [LIST], owner },
  },
  {
    ...a.new,
    component: () => import('@/views/assignments/AssignmentFormView.vue'),
    meta: { title: 'New assignment', nav, breadcrumb: [LIST, { label: 'New assignment' }], owner },
  },
  {
    ...a.detail,
    component: () => import('@/views/assignments/AssignmentDetailView.vue'),
    meta: { title: 'Assignment', nav, breadcrumb: [LIST], owner },
  },
  {
    ...a.edit,
    component: () => import('@/views/assignments/AssignmentFormView.vue'),
    meta: { title: 'Edit assignment', nav, breadcrumb: [LIST, { label: 'Edit' }], owner },
  },
  {
    ...a.submissions,
    component: () => import('@/views/assignments/SubmissionsView.vue'),
    meta: { title: 'Submissions', nav, breadcrumb: [LIST, { label: 'Submissions' }], owner },
  },
  {
    ...a.submission,
    component: () => import('@/views/assignments/SubmissionView.vue'),
    meta: { title: 'Submission', nav, breadcrumb: [LIST, { label: 'Submission' }], owner },
  },
];
