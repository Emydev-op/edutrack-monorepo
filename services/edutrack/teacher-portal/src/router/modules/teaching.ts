/** Teaching: classes, subjects, students, timetable. */
import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { teaching: t } = routesPath;
const CLASSES = { label: 'My classes', to: t.classes.name };
const SUBJECTS = { label: 'My subjects', to: t.subjects.name };
const STUDENTS = { label: 'Students', to: t.students.name };
const TIMETABLE = { label: 'Timetable', to: t.timetable.name };

export const teachingRoutes: RouteRecordRaw[] = [
  {
    ...t.classes,
    component: () => import('@/views/teaching/ClassesView.vue'),
    meta: { title: 'My classes', breadcrumb: [CLASSES] },
  },
  {
    ...t.class,
    component: () => import('@/views/teaching/ClassView.vue'),
    meta: { title: 'Class', nav: t.classes.name, breadcrumb: [CLASSES] },
  },
  {
    ...t.subjects,
    component: () => import('@/views/teaching/SubjectsView.vue'),
    meta: { title: 'My subjects', breadcrumb: [SUBJECTS] },
  },
  {
    ...t.subject,
    component: () => import('@/views/teaching/SubjectView.vue'),
    meta: { title: 'Subject', nav: t.subjects.name, breadcrumb: [SUBJECTS] },
  },
  {
    ...t.students,
    component: () => import('@/views/teaching/StudentsView.vue'),
    meta: { title: 'Students', breadcrumb: [STUDENTS] },
  },
  {
    ...t.student,
    component: () => import('@/views/teaching/StudentView.vue'),
    meta: { title: 'Student', nav: t.students.name, breadcrumb: [STUDENTS] },
  },
  {
    ...t.timetable,
    component: () => import('@/views/teaching/TimetableView.vue'),
    meta: { title: 'Timetable', breadcrumb: [TIMETABLE] },
  },
  {
    ...t.lesson,
    component: () => import('@/views/teaching/LessonView.vue'),
    meta: { title: 'Lesson', nav: t.timetable.name, breadcrumb: [TIMETABLE] },
  },
];
