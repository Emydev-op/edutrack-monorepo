import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { communication: c } = routesPath;
const COMMS = { label: 'Communication', to: c.announcements.name };
const ANNOUNCEMENTS = { label: 'Announcements', to: c.announcements.name };
const DELIVERY = { label: 'Delivery Logs', to: c.delivery.name };

export const communicationRoutes: RouteRecordRaw[] = [
  {
    ...c.announcements,
    component: () => import('@/views/communication/AnnouncementsView.vue'),
    meta: { title: 'Announcements', breadcrumb: [COMMS, { label: 'Announcements' }] },
  },
  {
    ...c.announcementNew,
    component: () => import('@/views/communication/AnnouncementFormView.vue'),
    meta: {
      title: 'New announcement',
      nav: c.announcements.name,
      breadcrumb: [COMMS, ANNOUNCEMENTS, { label: 'New announcement' }],
    },
  },
  {
    ...c.announcementEdit,
    component: () => import('@/views/communication/AnnouncementFormView.vue'),
    meta: {
      title: 'Edit announcement',
      nav: c.announcements.name,
      breadcrumb: [COMMS, ANNOUNCEMENTS, { label: 'Edit' }],
    },
  },
  {
    ...c.announcementDetail,
    component: () => import('@/views/communication/AnnouncementDetailView.vue'),
    meta: {
      title: 'Announcement',
      nav: c.announcements.name,
      breadcrumb: [COMMS, ANNOUNCEMENTS, { label: 'Announcement' }],
    },
  },
  {
    ...c.notifications,
    component: () => import('@/views/communication/NotificationsView.vue'),
    meta: { title: 'Notifications', breadcrumb: [COMMS, { label: 'Notifications' }] },
  },
  {
    ...c.delivery,
    component: () => import('@/views/communication/DeliveryLogsView.vue'),
    meta: { title: 'Delivery Logs', breadcrumb: [COMMS, { label: 'Delivery Logs' }] },
  },
  {
    ...c.deliveryDetail,
    component: () => import('@/views/communication/DeliveryDetailView.vue'),
    meta: {
      title: 'Message delivery',
      nav: c.delivery.name,
      breadcrumb: [COMMS, DELIVERY, { label: 'Message' }],
    },
  },
  {
    ...c.templateDetail,
    component: () => import('@/views/communication/TemplateDetailView.vue'),
    meta: {
      title: 'Message template',
      nav: c.delivery.name,
      breadcrumb: [
        COMMS,
        DELIVERY,
        { label: 'Templates', to: c.delivery.name },
        { label: 'Template' },
      ],
    },
  },
];
