import { createRouter, createWebHistory } from 'vue-router';

import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import { useAuthStore } from '@/stores/auth';

import { academicsRoutes } from './modules/academics';
import { authRoutes } from './modules/auth';
import { plannedRoutes } from './modules/planned';
import { schoolRoutes } from './modules/school';
import { staffRoutes } from './modules/staff';
import { studentRoutes } from './modules/students';
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
        {
          ...routesPath.setup,
          component: () => import('@/views/setup/SetupCenterView.vue'),
          meta: { title: 'Setup Center', breadcrumb: [{ label: 'Setup Center' }] },
        },
        {
          ...routesPath.setupBranches,
          component: () => import('@/views/setup/SetupBranchesView.vue'),
          meta: {
            title: 'Branches · Setup Center',
            nav: routesPath.setup.name,
            breadcrumb: [
              { label: 'Setup Center', to: routesPath.setup.name },
              { label: 'Branches' },
            ],
          },
        },
        ...academicsRoutes,
        ...schoolRoutes,
        ...studentRoutes,
        ...staffRoutes,
        ...plannedRoutes,
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

router.beforeEach((to) => {
  const auth = useAuthStore();
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
  document.title = to.meta.title ? `${to.meta.title} · School Admin` : 'EduTrack · School Admin';
});

export default router;
