import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import PortalLayout from '@/components/layout/PortalLayout.vue';
import { useAuthStore } from '@/stores/auth';

import { accessRule } from './guards';
import { routesPath } from './routes-path';
import './types';

const { auth } = routesPath;

const authRoutes: RouteRecordRaw[] = [
  {
    ...auth.login,
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { title: 'Sign in' },
  },
  {
    ...auth.forgot,
    component: () => import('@/views/auth/ForgotPasswordView.vue'),
    meta: { title: 'Forgot password' },
  },
  {
    ...auth.forgotSent,
    component: () => import('@/views/auth/ForgotPasswordSentView.vue'),
    meta: { title: 'Check your email' },
  },
  {
    ...auth.reset,
    component: () => import('@/views/auth/ResetPasswordView.vue'),
    meta: { title: 'Create a new password' },
  },
  {
    ...auth.resetDone,
    component: () => import('@/views/auth/ResetPasswordDoneView.vue'),
    meta: { title: 'Password updated' },
  },
  {
    ...auth.passwordExpired,
    component: () => import('@/views/auth/PasswordExpiredView.vue'),
    meta: { title: 'Set a new password' },
  },
  {
    ...auth.acceptInvitation,
    component: () => import('@/views/auth/AcceptInvitationView.vue'),
    meta: { title: 'Your invitation' },
  },
];

const portalRoutes: RouteRecordRaw[] = [
  {
    ...routesPath.home,
    component: () => import('@/views/HomeView.vue'),
    meta: { title: 'Home', tab: 'home', perChild: true },
  },
  {
    ...routesPath.children,
    component: () => import('@/views/school/ChildView.vue'),
    meta: { title: 'My children', tab: 'more', perChild: true },
  },
  {
    ...routesPath.fees.view,
    component: () => import('@/views/fees/FeesView.vue'),
    meta: { title: 'Fees', tab: 'fees', perChild: true },
  },
  {
    ...routesPath.fees.pay,
    component: () => import('@/views/fees/PayView.vue'),
    meta: { title: 'Pay fees', tab: 'fees', perChild: true },
  },
  {
    ...routesPath.results,
    component: () => import('@/views/results/ResultsView.vue'),
    meta: { title: 'Results', tab: 'results', perChild: true },
  },
  {
    ...routesPath.assignments.list,
    component: () => import('@/views/assignments/AssignmentsView.vue'),
    meta: { title: 'Assignments', tab: 'assignments', perChild: true },
  },
  {
    ...routesPath.assignments.detail,
    component: () => import('@/views/assignments/AssignmentView.vue'),
    meta: { title: 'Assignment', tab: 'assignments', perChild: true },
  },
  {
    ...routesPath.timetable,
    component: () => import('@/views/school/TimetableView.vue'),
    meta: { title: 'Timetable', tab: 'more', perChild: true },
  },
  {
    ...routesPath.materials,
    component: () => import('@/views/school/MaterialsView.vue'),
    meta: { title: 'Materials', tab: 'more', perChild: true },
  },
  {
    ...routesPath.attendance,
    component: () => import('@/views/school/AttendanceView.vue'),
    meta: { title: 'Attendance', tab: 'more', perChild: true },
  },
  {
    ...routesPath.announcements,
    component: () => import('@/views/school/AnnouncementsView.vue'),
    meta: { title: 'Announcements', tab: 'more' },
  },
  {
    ...routesPath.notifications,
    component: () => import('@/views/account/NotificationsView.vue'),
    meta: { title: 'Notifications', tab: 'more' },
  },
  {
    ...routesPath.profile,
    component: () => import('@/views/account/ProfileView.vue'),
    meta: { title: 'Profile', tab: 'more' },
  },
  {
    ...routesPath.more,
    component: () => import('@/views/MoreView.vue'),
    meta: { title: 'More', tab: 'more' },
  },
];

export const routes: RouteRecordRaw[] = [
  ...authRoutes,
  {
    path: '/',
    component: PortalLayout,
    meta: { requiresAuth: true },
    children: [{ path: '', redirect: { name: routesPath.home.name } }, ...portalRoutes],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Page not found' },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes,
});

router.beforeEach((to) => accessRule(to, useAuthStore().isAuthenticated));

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Parent Portal` : 'EduTrack · Parent Portal';
});

export default router;
