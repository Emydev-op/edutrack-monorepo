/** Reviews (HOD / Academic Head only). Owned by the Reviews builder. */
import type { RouteRecordRaw } from 'vue-router';

import { noteReviewerOnly, sheetReviewerOnly } from '../guards';
import { routesPath } from '../routes-path';

const { reviews: r } = routesPath;
const owner = 'Reviews';
const SHEETS = { label: 'Reviews · Result sheets', to: r.results.name };
const NOTES = { label: 'Reviews · Lesson notes', to: r.lessonNotes.name };

export const reviewRoutes: RouteRecordRaw[] = [
  {
    ...r.results,
    component: () => import('@/views/reviews/ReviewSheetsView.vue'),
    meta: { ...sheetReviewerOnly, title: 'Result sheets to review', breadcrumb: [SHEETS], owner },
  },
  {
    ...r.sheet,
    component: () => import('@/views/reviews/ReviewSheetView.vue'),
    meta: {
      ...sheetReviewerOnly,
      title: 'Review sheet',
      nav: r.results.name,
      breadcrumb: [SHEETS],
      owner,
    },
  },
  {
    ...r.lessonNotes,
    component: () => import('@/views/reviews/ReviewNotesView.vue'),
    meta: { ...noteReviewerOnly, title: 'Lesson notes to review', breadcrumb: [NOTES], owner },
  },
  {
    ...r.note,
    component: () => import('@/views/reviews/ReviewNoteView.vue'),
    meta: {
      ...noteReviewerOnly,
      title: 'Review note',
      nav: r.lessonNotes.name,
      breadcrumb: [NOTES],
      owner,
    },
  },
];
