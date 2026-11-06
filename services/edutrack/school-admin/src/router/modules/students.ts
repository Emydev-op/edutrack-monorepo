import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { students: s } = routesPath;
const STUDENTS = { label: 'Students', to: s.list.name };

export const studentRoutes: RouteRecordRaw[] = [
  {
    ...s.list,
    component: () => import('@/views/students/StudentsView.vue'),
    meta: { title: 'Students', breadcrumb: [STUDENTS, { label: 'All students' }] },
  },
  {
    ...s.admissions,
    component: () => import('@/views/students/AdmissionsView.vue'),
    meta: { title: 'Admissions', breadcrumb: [STUDENTS, { label: 'Admissions' }] },
  },
  {
    ...s.admit,
    component: () => import('@/views/students/AdmitStudentView.vue'),
    meta: {
      title: 'Admit a student',
      nav: s.admissions.name,
      breadcrumb: [
        STUDENTS,
        { label: 'Admissions', to: s.admissions.name },
        { label: 'New admission' },
      ],
    },
  },
  {
    ...s.import,
    component: () => import('@/views/students/ImportStudentsView.vue'),
    meta: {
      title: 'Import students',
      nav: s.list.name,
      breadcrumb: [STUDENTS, { label: 'Import' }],
    },
  },
  {
    ...s.enrollment,
    component: () => import('@/views/students/EnrollmentView.vue'),
    meta: { title: 'Enrollment', breadcrumb: [STUDENTS, { label: 'Enrollment' }] },
  },
  {
    ...s.parents,
    component: () => import('@/views/students/ParentsView.vue'),
    meta: {
      title: 'Parents / Guardians',
      breadcrumb: [STUDENTS, { label: 'Parents / Guardians' }],
    },
  },
  {
    ...s.parent,
    component: () => import('@/views/students/ParentDetailView.vue'),
    meta: {
      title: 'Guardian',
      nav: s.parents.name,
      breadcrumb: [STUDENTS, { label: 'Parents / Guardians', to: s.parents.name }],
    },
  },
  {
    ...s.transfer,
    component: () => import('@/views/students/TransferStudentView.vue'),
    meta: { title: 'Transfer or withdraw', nav: s.list.name, breadcrumb: [STUDENTS] },
  },
  {
    path: s.detail.path,
    component: () => import('@/views/students/StudentDetailView.vue'),
    meta: { title: 'Student', nav: s.list.name, breadcrumb: [STUDENTS] },
    children: [
      {
        path: '',
        name: s.detail.name,
        component: () => import('@/views/students/tabs/StudentOverviewTab.vue'),
      },
      { ...s.academics, component: () => import('@/views/students/tabs/StudentAcademicsTab.vue') },
      { ...s.subjects, component: () => import('@/views/students/tabs/StudentSubjectsTab.vue') },
      { ...s.fees, component: () => import('@/views/students/tabs/StudentFeesTab.vue') },
      { ...s.guardians, component: () => import('@/views/students/tabs/StudentGuardiansTab.vue') },
      { ...s.documents, component: () => import('@/views/students/tabs/StudentDocumentsTab.vue') },
      { ...s.activity, component: () => import('@/views/students/tabs/StudentActivityTab.vue') },
    ],
  },
];
