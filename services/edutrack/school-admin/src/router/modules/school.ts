import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { school: s } = routesPath;
const SCHOOL = { label: 'School', to: s.profile.name };
const BRANCHES = { label: 'Branches', to: s.branches.name };
const USERS = { label: 'Users & Roles', to: s.users.name };

export const schoolRoutes: RouteRecordRaw[] = [
  {
    ...s.profile,
    component: () => import('@/views/school/profile/SchoolProfileView.vue'),
    meta: { title: 'School Profile', breadcrumb: [SCHOOL, { label: 'School Profile' }] },
  },
  {
    ...s.profileEdit,
    component: () => import('@/views/school/profile/EditSchoolProfileView.vue'),
    meta: {
      title: 'Edit school details',
      nav: s.profile.name,
      breadcrumb: [SCHOOL, { label: 'School Profile', to: s.profile.name }, { label: 'Edit' }],
    },
  },
  {
    ...s.branches,
    component: () => import('@/views/school/branches/BranchesView.vue'),
    meta: { title: 'Branches', breadcrumb: [SCHOOL, { label: 'Branches' }] },
  },
  {
    ...s.branchNew,
    component: () => import('@/views/school/branches/BranchFormView.vue'),
    meta: {
      title: 'Add branch',
      nav: s.branches.name,
      breadcrumb: [SCHOOL, BRANCHES, { label: 'Add branch' }],
    },
  },
  {
    ...s.branchEdit,
    component: () => import('@/views/school/branches/BranchFormView.vue'),
    meta: { title: 'Edit branch', nav: s.branches.name, breadcrumb: [SCHOOL, BRANCHES] },
  },
  {
    path: s.branch.path,
    component: () => import('@/views/school/branches/BranchDetailView.vue'),
    meta: { title: 'Branch', nav: s.branches.name, breadcrumb: [SCHOOL, BRANCHES] },
    children: [
      {
        path: '',
        name: s.branch.name,
        component: () => import('@/views/school/branches/tabs/BranchOverviewTab.vue'),
      },
      {
        ...s.branchClasses,
        component: () => import('@/views/school/branches/tabs/BranchClassesTab.vue'),
      },
      {
        ...s.branchStaff,
        component: () => import('@/views/school/branches/tabs/BranchStaffTab.vue'),
      },
      {
        ...s.branchFinance,
        component: () => import('@/views/school/branches/tabs/BranchFinanceTab.vue'),
      },
      {
        ...s.branchActivity,
        component: () => import('@/views/school/branches/tabs/BranchActivityTab.vue'),
      },
    ],
  },
  {
    ...s.organogram,
    component: () => import('@/views/school/organogram/OrganogramView.vue'),
    meta: { title: 'Organogram', breadcrumb: [SCHOOL, { label: 'Organogram' }] },
  },
  {
    path: s.users.path,
    component: () => import('@/views/school/users/UsersRolesView.vue'),
    meta: {
      title: 'Users & Roles',
      nav: s.users.name,
      breadcrumb: [SCHOOL, { label: 'Users & Roles' }],
    },
    children: [
      {
        path: '',
        name: s.users.name,
        component: () => import('@/views/school/users/tabs/StaffUsersTab.vue'),
      },
      { ...s.roles, component: () => import('@/views/school/users/tabs/RolesTab.vue') },
      { ...s.permissions, component: () => import('@/views/school/users/tabs/PermissionsTab.vue') },
      { ...s.invitations, component: () => import('@/views/school/users/tabs/InvitationsTab.vue') },
    ],
  },
  {
    ...s.user,
    component: () => import('@/views/school/users/UserDetailView.vue'),
    meta: { title: 'User', nav: s.users.name, breadcrumb: [SCHOOL, USERS] },
  },
  {
    ...s.roleNew,
    component: () => import('@/views/school/users/RoleEditorView.vue'),
    meta: {
      title: 'Create role',
      nav: s.users.name,
      breadcrumb: [SCHOOL, USERS, { label: 'Roles', to: s.roles.name }, { label: 'New role' }],
    },
  },
  {
    ...s.role,
    component: () => import('@/views/school/users/RoleEditorView.vue'),
    meta: {
      title: 'Role',
      nav: s.users.name,
      breadcrumb: [SCHOOL, USERS, { label: 'Roles', to: s.roles.name }],
    },
  },
];
