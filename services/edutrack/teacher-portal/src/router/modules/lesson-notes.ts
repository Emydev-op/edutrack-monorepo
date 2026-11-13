/** Weekly lesson notes. Owned by the Lesson notes builder. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { lessonNotes: n } = routesPath;
const owner = 'Lesson notes';
const LIST = { label: 'Lesson notes', to: n.list.name };
const nav = n.list.name;

export const lessonNoteRoutes: RouteRecordRaw[] = [
  {
    ...n.list,
    component: () => import('@/views/lesson-notes/LessonNotesView.vue'),
    meta: { title: 'Lesson notes', breadcrumb: [LIST], owner },
  },
  {
    ...n.new,
    component: () => import('@/views/lesson-notes/LessonNoteNewView.vue'),
    meta: { title: 'New lesson note', nav, breadcrumb: [LIST, { label: 'New' }], owner },
  },
  {
    ...n.detail,
    component: () => import('@/views/lesson-notes/LessonNoteView.vue'),
    meta: { title: 'Lesson note', nav, breadcrumb: [LIST], owner },
  },
];
