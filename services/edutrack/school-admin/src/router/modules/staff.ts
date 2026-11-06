import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { staff: s } = routesPath;
const STAFF = { label: 'Staff', to: s.directory.name };
const DIRECTORY = { label: 'Staff Directory', to: s.directory.name };

export const staffRoutes: RouteRecordRaw[] = [
  {
    ...s.directory,
    component: () => import('@/views/staff/StaffDirectoryView.vue'),
    meta: { title: 'Staff Directory', breadcrumb: [STAFF, { label: 'Staff Directory' }] },
  },
  {
    ...s.teachers,
    component: () => import('@/views/staff/TeachersView.vue'),
    meta: { title: 'Teachers', breadcrumb: [STAFF, { label: 'Teachers' }] },
  },
  {
    ...s.new,
    component: () => import('@/views/staff/StaffFormView.vue'),
    meta: {
      title: 'Add staff member',
      nav: s.directory.name,
      breadcrumb: [STAFF, DIRECTORY, { label: 'Add staff member' }],
    },
  },
  {
    ...s.import,
    component: () => import('@/views/staff/ImportStaffView.vue'),
    meta: {
      title: 'Import staff',
      nav: s.directory.name,
      breadcrumb: [STAFF, DIRECTORY, { label: 'Import' }],
    },
  },
  {
    ...s.edit,
    component: () => import('@/views/staff/StaffFormView.vue'),
    meta: { title: 'Edit staff member', nav: s.directory.name, breadcrumb: [STAFF, DIRECTORY] },
  },
  {
    path: s.detail.path,
    component: () => import('@/views/staff/StaffDetailView.vue'),
    meta: { title: 'Staff member', nav: s.directory.name, breadcrumb: [STAFF, DIRECTORY] },
    children: [
      {
        path: '',
        name: s.detail.name,
        component: () => import('@/views/staff/tabs/StaffOverviewTab.vue'),
      },
      { ...s.teaching, component: () => import('@/views/staff/tabs/StaffTeachingTab.vue') },
      { ...s.access, component: () => import('@/views/staff/tabs/StaffAccessTab.vue') },
      { ...s.documents, component: () => import('@/views/staff/tabs/StaffDocumentsTab.vue') },
      { ...s.activity, component: () => import('@/views/staff/tabs/StaffActivityTab.vue') },
    ],
  },
];
