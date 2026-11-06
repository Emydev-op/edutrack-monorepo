import type { RouteRecordRaw } from 'vue-router';

import { routesPath } from '../routes-path';

const { academics: a } = routesPath;
const ACADEMICS = { label: 'Academics', to: a.sessions.name };
const SESSIONS = { label: 'Sessions & Terms', to: a.sessions.name };
const CLASSES = { label: 'Classes & Arms', to: a.classes.name };
const RESULTS = { label: 'Results', to: a.results.name };

export const academicsRoutes: RouteRecordRaw[] = [
  {
    ...a.sections,
    component: () => import('@/views/academics/sections/AcademicSectionsView.vue'),
    meta: {
      title: 'Academic Sections',
      nav: a.classes.name,
      breadcrumb: [ACADEMICS, CLASSES, { label: 'Academic Sections' }],
    },
  },
  {
    ...a.sessions,
    component: () => import('@/views/academics/sessions/SessionsView.vue'),
    meta: { title: 'Sessions & Terms', breadcrumb: [ACADEMICS, { label: 'Sessions & Terms' }] },
  },
  {
    ...a.sessionNew,
    component: () => import('@/views/academics/sessions/NewSessionView.vue'),
    meta: {
      title: 'New session',
      nav: a.sessions.name,
      breadcrumb: [ACADEMICS, SESSIONS, { label: 'New session' }],
    },
  },
  {
    ...a.terms,
    component: () => import('@/views/academics/sessions/TermsCalendarView.vue'),
    meta: {
      title: 'Terms & calendar',
      nav: a.sessions.name,
      breadcrumb: [ACADEMICS, SESSIONS, { label: 'Terms & calendar' }],
    },
  },
  {
    ...a.sessionClose,
    component: () => import('@/views/academics/sessions/CloseSessionView.vue'),
    meta: {
      title: 'Close session',
      nav: a.sessions.name,
      breadcrumb: [ACADEMICS, SESSIONS, { label: 'Close session' }],
    },
  },
  {
    ...a.calendar,
    component: () => import('@/views/academics/calendar/AcademicCalendarView.vue'),
    meta: { title: 'Academic Calendar', breadcrumb: [ACADEMICS, { label: 'Academic Calendar' }] },
  },
  {
    ...a.classes,
    component: () => import('@/views/academics/classes/ClassesView.vue'),
    meta: { title: 'Classes & Arms', breadcrumb: [ACADEMICS, { label: 'Classes & Arms' }] },
  },
  {
    path: a.classDetail.path,
    component: () => import('@/views/academics/classes/ClassDetailView.vue'),
    meta: { title: 'Class', nav: a.classes.name, breadcrumb: [ACADEMICS, CLASSES] },
    children: [
      {
        path: '',
        name: a.classDetail.name,
        component: () => import('@/views/academics/classes/tabs/ClassOverviewTab.vue'),
      },
      {
        ...a.classStudents,
        component: () => import('@/views/academics/classes/tabs/ClassStudentsTab.vue'),
      },
      {
        ...a.classSubjects,
        component: () => import('@/views/academics/classes/tabs/ClassSubjectsTab.vue'),
      },
      {
        ...a.classTimetable,
        component: () => import('@/views/academics/classes/tabs/ClassTimetableTab.vue'),
      },
      {
        ...a.classResults,
        component: () => import('@/views/academics/classes/tabs/ClassResultsTab.vue'),
      },
    ],
  },
  {
    path: a.subjects.path,
    component: () => import('@/views/academics/subjects/SubjectsLayout.vue'),
    meta: {
      title: 'Subjects & Curriculum',
      breadcrumb: [ACADEMICS, { label: 'Subjects & Curriculum' }],
    },
    children: [
      {
        path: '',
        name: a.subjects.name,
        component: () => import('@/views/academics/subjects/SubjectsTab.vue'),
      },
      {
        ...a.curriculum,
        component: () => import('@/views/academics/subjects/CurriculumTab.vue'),
      },
      {
        ...a.groups,
        component: () => import('@/views/academics/subjects/ElectiveGroupsTab.vue'),
      },
    ],
  },
  {
    ...a.assignments,
    component: () => import('@/views/academics/assignments/AssignmentsView.vue'),
    meta: {
      title: 'Teacher Assignments',
      breadcrumb: [ACADEMICS, { label: 'Teacher Assignments' }],
    },
  },
  {
    ...a.timetable,
    component: () => import('@/views/academics/timetable/TimetableView.vue'),
    meta: { title: 'Timetable', breadcrumb: [ACADEMICS, { label: 'Timetable' }] },
  },
  {
    path: a.assessments.path,
    component: () => import('@/views/academics/assessments/AssessmentsLayout.vue'),
    meta: {
      title: 'Assessments & Grading',
      breadcrumb: [ACADEMICS, { label: 'Assessments & Grading' }],
    },
    children: [
      {
        path: '',
        name: a.assessments.name,
        component: () => import('@/views/academics/assessments/SchemeTab.vue'),
      },
      {
        ...a.grading,
        component: () => import('@/views/academics/assessments/GradingTab.vue'),
      },
    ],
  },
  {
    ...a.results,
    component: () => import('@/views/academics/results/ResultsView.vue'),
    meta: { title: 'Results', breadcrumb: [ACADEMICS, { label: 'Results' }] },
  },
  {
    ...a.resultSheet,
    component: () => import('@/views/academics/results/ResultSheetView.vue'),
    meta: { title: 'Result sheet', nav: a.results.name, breadcrumb: [ACADEMICS, RESULTS] },
  },
  {
    ...a.reportCard,
    component: () => import('@/views/academics/results/ReportCardView.vue'),
    meta: { title: 'Report card', nav: a.results.name, breadcrumb: [ACADEMICS, RESULTS] },
  },
  {
    ...a.corrections,
    component: () => import('@/views/academics/results/CorrectionsView.vue'),
    meta: {
      title: 'Result corrections',
      nav: a.results.name,
      breadcrumb: [ACADEMICS, RESULTS, { label: 'Corrections' }],
    },
  },
  {
    ...a.promotion,
    component: () => import('@/views/academics/promotion/PromotionView.vue'),
    meta: { title: 'Promotion', breadcrumb: [ACADEMICS, { label: 'Promotion' }] },
  },
];
