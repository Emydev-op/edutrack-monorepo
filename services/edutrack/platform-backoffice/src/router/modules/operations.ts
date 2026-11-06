import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { users, support, activity, audit, settings } = routesPath;

export const operationsRoutes: RouteRecordRaw[] = [
  {
    ...users.list,
    component: () => import('@/views/users/UsersView.vue'),
    meta: { title: 'Users', breadcrumb: [{ label: 'Users' }] },
  },
  {
    path: users.detail.path,
    component: () => import('@/views/users/detail/UserDetailView.vue'),
    meta: {
      title: 'User',
      breadcrumb: [{ label: 'Users', to: users.list.name }],
      nav: users.list.name,
    },
    children: [
      {
        path: '',
        name: users.detail.name,
        component: () => import('@/views/users/detail/(tabs)/UserOverviewTab.vue'),
      },
      { ...users.access, component: () => import('@/views/users/detail/(tabs)/UserAccessTab.vue') },
      {
        ...users.activity,
        component: () => import('@/views/users/detail/(tabs)/UserActivityTab.vue'),
      },
      {
        ...users.security,
        component: () => import('@/views/users/detail/(tabs)/UserSecurityTab.vue'),
      },
    ],
  },
  {
    ...support.list,
    component: () => import('@/views/support/SupportView.vue'),
    meta: { title: 'Support', breadcrumb: [{ label: 'Support' }] },
  },
  {
    ...support.create,
    component: () => import('@/views/support/CreateIssueView.vue'),
    meta: {
      title: 'Create issue',
      breadcrumb: [{ label: 'Support', to: support.list.name }, { label: 'Create issue' }],
      nav: support.list.name,
    },
  },
  {
    ...support.detail,
    component: () => import('@/views/support/IssueDetailView.vue'),
    meta: {
      title: 'Issue',
      breadcrumb: [{ label: 'Support', to: support.list.name }],
      nav: support.list.name,
    },
  },
  {
    ...activity,
    component: () => import('@/views/activity/ActivityView.vue'),
    meta: { title: 'Activity', breadcrumb: [{ label: 'Activity' }] },
  },
  {
    ...audit,
    component: () => import('@/views/audit/AuditView.vue'),
    meta: { title: 'Audit log', breadcrumb: [{ label: 'Audit' }] },
  },
  {
    ...settings.createRole,
    component: () => import('@/views/settings/CreateRoleView.vue'),
    meta: {
      title: 'Create role',
      breadcrumb: [{ label: 'Settings', to: settings.access.name }, { label: 'Create role' }],
      nav: 'settings',
    },
  },
  {
    path: '/settings',
    component: () => import('@/views/settings/SettingsView.vue'),
    meta: { title: 'Settings', breadcrumb: [{ label: 'Settings' }], nav: 'settings' },
    children: [
      {
        path: '',
        name: settings.profile.name,
        component: () => import('@/views/settings/(tabs)/ProfileTab.vue'),
      },
      {
        path: 'access/:roleId?',
        name: settings.access.name,
        component: () => import('@/views/settings/(tabs)/AccessTab.vue'),
      },
      {
        path: 'notifications',
        name: settings.notifications.name,
        component: () => import('@/views/settings/(tabs)/NotificationsTab.vue'),
      },
      {
        path: 'security',
        name: settings.security.name,
        component: () => import('@/views/settings/(tabs)/SecurityTab.vue'),
      },
    ],
  },
];
