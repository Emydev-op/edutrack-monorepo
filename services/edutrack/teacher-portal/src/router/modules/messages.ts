/** Messages with parents: the conversation list, a new message, and a thread. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { messages: m } = routesPath;
const owner = 'Messages';
const LIST = { label: 'Messages', to: m.list.name };
const nav = m.list.name;

export const messageRoutes: RouteRecordRaw[] = [
  {
    ...m.list,
    component: () => import('@/views/messages/MessagesView.vue'),
    meta: { title: 'Messages', breadcrumb: [LIST], owner },
  },
  {
    ...m.new,
    component: () => import('@/views/messages/NewMessageView.vue'),
    meta: { title: 'New message', nav, breadcrumb: [LIST, { label: 'New message' }], owner },
  },
  {
    ...m.thread,
    component: () => import('@/views/messages/ConversationView.vue'),
    meta: { title: 'Conversation', nav, breadcrumb: [LIST], owner },
  },
];
