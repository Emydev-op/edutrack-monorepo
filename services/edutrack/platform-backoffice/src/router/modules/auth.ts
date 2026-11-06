import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { auth } = routesPath;

export const authRoutes: RouteRecordRaw[] = [
  {
    ...auth.login,
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { title: 'Sign in' },
  },
  {
    ...auth.forgot,
    component: () => import('@/views/auth/ForgotPasswordView.vue'),
    meta: { title: 'Reset your password' },
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
    ...auth.acceptInvitation,
    component: () => import('@/views/auth/AcceptInvitationView.vue'),
    meta: { title: 'Accept invitation' },
  },
];
