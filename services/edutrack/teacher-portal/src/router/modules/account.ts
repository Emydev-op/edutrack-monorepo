/** Announcements, notifications and profile: shell screens, built with the foundation. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { announcements: a, notifications: n, profile: p } = routesPath;
const ANNOUNCEMENTS = { label: 'Announcements', to: a.list.name };
const NOTIFICATIONS = { label: 'Notifications', to: n.list.name };
const PROFILE = { label: 'Profile', to: p.view.name };

export const accountRoutes: RouteRecordRaw[] = [
  {
    ...a.list,
    component: () => import('@/views/account/AnnouncementsView.vue'),
    meta: { title: 'Announcements', breadcrumb: [ANNOUNCEMENTS] },
  },
  {
    ...a.detail,
    component: () => import('@/views/account/AnnouncementDetailView.vue'),
    meta: { title: 'Announcement', nav: a.list.name, breadcrumb: [ANNOUNCEMENTS] },
  },
  {
    ...n.list,
    component: () => import('@/views/account/NotificationsView.vue'),
    meta: { title: 'Notifications', breadcrumb: [NOTIFICATIONS] },
  },
  {
    ...n.settings,
    component: () => import('@/views/account/NotificationSettingsView.vue'),
    meta: {
      title: 'Notification settings',
      nav: n.list.name,
      breadcrumb: [NOTIFICATIONS, { label: 'Settings' }],
    },
  },
  {
    ...p.view,
    component: () => import('@/views/account/ProfileView.vue'),
    meta: { title: 'Profile', breadcrumb: [PROFILE] },
  },
  {
    ...p.edit,
    component: () => import('@/views/account/ProfileEditView.vue'),
    meta: { title: 'Edit profile', nav: p.view.name, breadcrumb: [PROFILE, { label: 'Edit' }] },
  },
  {
    ...p.password,
    component: () => import('@/views/account/ChangePasswordView.vue'),
    meta: {
      title: 'Change password',
      nav: p.view.name,
      breadcrumb: [PROFILE, { label: 'Change password' }],
    },
  },
  {
    ...p.devices,
    component: () => import('@/views/account/DevicesView.vue'),
    meta: {
      title: 'Signed-in devices',
      nav: p.view.name,
      breadcrumb: [PROFILE, { label: 'Signed-in devices' }],
    },
  },
];
