import { createRouter, createWebHistory } from 'vue-router';

import DashboardLayout from '@/components/layout/DashboardLayout.vue';

import { accessGuard } from './guards';
import { accountRoutes } from './modules/account';
import { assessmentRoutes } from './modules/assessments';
import { assignmentRoutes } from './modules/assignments';
import { authRoutes } from './modules/auth';
import { classTeacherRoutes } from './modules/class-teacher';
import { dashboardRoutes } from './modules/dashboard';
import { lessonNoteRoutes } from './modules/lesson-notes';
import { materialRoutes } from './modules/materials';
import { resultRoutes } from './modules/results';
import { reviewRoutes } from './modules/reviews';
import { teachingRoutes } from './modules/teaching';
import { routesPath } from './routes-path';
import './types';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    ...authRoutes,
    {
      path: '/',
      component: DashboardLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { name: routesPath.dashboard.name } },
        ...dashboardRoutes,
        ...teachingRoutes,
        ...classTeacherRoutes,
        ...assignmentRoutes,
        ...assessmentRoutes,
        ...resultRoutes,
        ...materialRoutes,
        ...lessonNoteRoutes,
        ...reviewRoutes,
        ...accountRoutes,
        {
          ...routesPath.forbidden,
          component: () => import('@/views/ForbiddenView.vue'),
          meta: { title: 'No access', breadcrumb: [{ label: 'No access' }] },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Page not found' },
    },
  ],
});

router.beforeEach(accessGuard);

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · Teacher Workspace`
    : 'EduTrack · Teacher Workspace';
});

export default router;
