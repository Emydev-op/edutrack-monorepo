import { createRouter, createWebHistory } from 'vue-router';

import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import { useAuthStore } from '@/stores/auth';

import { authRoutes } from './modules/auth';
import { operationsRoutes } from './modules/operations';
import { schoolRoutes } from './modules/schools';
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
        {
          ...routesPath.dashboard,
          component: () => import('@/views/dashboard/DashboardView.vue'),
          meta: { title: 'Dashboard', breadcrumb: [] },
        },
        ...schoolRoutes,
        ...operationsRoutes,
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

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // First navigation of a page load: turn the refresh cookie back into a session. Loaded lazily
  // because the API client itself imports the router.
  if (!auth.isAuthenticated) {
    const { refreshSession } = await import('@/api/client');
    await auth.restore(refreshSession);
  }
  if (to.matched.some((r) => r.meta.requiresAuth) && !auth.isAuthenticated) {
    return {
      name: routesPath.auth.login.name,
      query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
    };
  }
  // Invitations and reset links can be opened while signed in (e.g. on a shared machine);
  // only the sign-in page sends signed-in users back to work.
  if (to.name === routesPath.auth.login.name && auth.isAuthenticated)
    return { name: routesPath.dashboard.name };
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · EduTrack Platform` : 'EduTrack Platform';
});

export default router;
