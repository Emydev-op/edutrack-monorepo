import { createRouter, createWebHistory } from 'vue-router';

import { queryKeys } from '@/api/query-keys';
import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth';
import type { SetupProgress } from '@/types';

import { academicsRoutes } from './modules/academics';
import { authRoutes } from './modules/auth';
import { boardingRoutes } from './modules/boarding';
import { plannedRoutes } from './modules/planned';
import { schoolRoutes } from './modules/school';
import { foundationRedirect } from './guards/foundation';
import { communicationRoutes } from './modules/communication';
import { financeRoutes } from './modules/finance';
import { reportRoutes } from './modules/reports';
import { settingsRoutes } from './modules/settings';
import { supportRoutes } from './modules/support';
import { staffRoutes } from './modules/staff';
import { studentRoutes } from './modules/students';
import { routesPath } from './routes-path';
import './types';

/** Every built screen under the app layout. */
const builtRoutes = [
  ...academicsRoutes,
  ...schoolRoutes,
  ...studentRoutes,
  ...boardingRoutes,
  ...staffRoutes,
  ...financeRoutes,
  ...communicationRoutes,
  ...reportRoutes,
  ...settingsRoutes,
  ...supportRoutes,
];

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
          ...routesPath.groupOverview,
          component: () => import('@/views/group/GroupOverviewView.vue'),
          meta: { title: 'Group overview', breadcrumb: [{ label: 'Group overview' }] },
        },
        {
          ...routesPath.groupTemplates,
          component: () => import('@/views/group/GroupTemplatesView.vue'),
          meta: {
            title: 'Group templates',
            nav: routesPath.groupOverview.name,
            breadcrumb: [
              { label: 'Group overview', to: routesPath.groupOverview.name },
              { label: 'Templates' },
            ],
          },
        },
        {
          ...routesPath.groupAnnouncement,
          component: () => import('@/views/group/GroupAnnouncementView.vue'),
          meta: {
            title: 'Group announcement',
            nav: routesPath.groupOverview.name,
            breadcrumb: [
              { label: 'Group overview', to: routesPath.groupOverview.name },
              { label: 'Announcement' },
            ],
          },
        },
        {
          ...routesPath.groupReports,
          component: () => import('@/views/group/GroupReportsView.vue'),
          meta: {
            title: 'Group reports',
            nav: routesPath.groupOverview.name,
            breadcrumb: [
              { label: 'Group overview', to: routesPath.groupOverview.name },
              { label: 'Reports' },
            ],
          },
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
        ...builtRoutes,
        // A placeholder never replaces a built screen of the same name.
        ...plannedRoutes.filter((r) => !builtRoutes.some((b) => b.name === r.name)),
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
  // A new school finishes its foundation in the Setup Center first (cached per school; setup
  // changes invalidate `queryKeys.setup.all`, so the guard sees them on the next navigation).
  if (auth.isAuthenticated)
    return foundationRedirect(to, () =>
      queryClient.fetchQuery({
        queryKey: [...queryKeys.setup.all, 'foundation', auth.school?.id],
        queryFn: async () => (await import('@/api/helpers')).getRequest<SetupProgress>('/v1/setup'),
      }),
    );
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · School Admin` : 'EduTrack · School Admin';
});

export default router;
