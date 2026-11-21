import { VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { RouterView } from 'vue-router';

/*
 * Smoke test: every portal screen renders against API-shaped data (the shapes `/v1/student/*`
 * returns), with the frame and the tabs.
 */

const today = '2026-11-20';
const result = {
  termId: 't1',
  term: 'First Term · 2026/2027',
  status: 'published',
  average: '71.4%',
  position: '7th of 14',
  plannedOn: null,
  held: null,
  previous: null,
};
const assignment = {
  id: 'a1',
  title: 'Plant parts worksheet',
  subjectName: 'Basic Science',
  classLabel: 'JSS 2B · Basic Science',
  teacherName: 'Mrs. Ronke Adeleke',
  instructions: 'Label the parts of the plant.',
  dueAt: '2026-12-15T16:00',
  maxScore: 20,
  allowLate: false,
  pastDue: false,
  assignmentStatus: 'Published',
  attachments: [],
  status: 'Not submitted',
  submittedAt: null,
  late: false,
  submittedByGuardian: null,
  note: null,
  files: [],
  score: null,
  feedback: null,
  returnedAt: null,
  excuseReason: null,
  canSubmit: true,
};
const lesson = {
  start: '08:00',
  end: '08:40',
  period: 'P1',
  isBreak: false,
  subject: 'Mathematics',
  teacher: 'Mr. Samuel Ade',
};
const announcement = {
  id: 'n1',
  title: 'PTA meeting',
  body: 'Wednesday, 10:00',
  from: 'Mrs. Adaeze Okonkwo',
  sentAt: '2026-11-19T09:00:00.000Z',
  date: '19 Nov 2026',
  audience: 'Students',
  expiresOn: null,
};

const DATA: Record<string, unknown> = {
  '/v1/student/overview': {
    student: {
      id: 'emmanuel',
      name: 'Emmanuel Adeyemi',
      firstName: 'Emmanuel',
      initials: 'EA',
      admissionNo: 'STU-2025-0042',
      className: 'JSS 2B',
      section: 'Junior Secondary',
      branch: 'Main Campus',
      access: 'full',
      leftOn: null,
    },
    school: {
      name: 'Greenfield Academy',
      initials: 'GA',
      phone: '+234 1 270 4400',
      email: 'office@greenfield.edu.ng',
      address: 'Ikeja, Lagos',
    },
    today,
    term: {
      id: 't1',
      name: 'First Term',
      session: '2026/2027',
      label: 'First Term · 2026/2027',
      endsOn: '2026-12-18',
    },
  },
  '/v1/student/home': {
    term: 'First Term · 2026/2027',
    today: { day: 'Friday', className: 'JSS 2B', lessons: [lesson] },
    homework: [
      {
        id: 'a1',
        title: assignment.title,
        subjectName: assignment.subjectName,
        teacherName: assignment.teacherName,
        dueAt: assignment.dueAt,
        status: 'Not submitted',
        pastDue: false,
        canSubmit: true,
      },
    ],
    homeworkDue: 1,
    latestResult: result,
    attendance: { present: 50, late: 2, absent: 1, excused: 0, schoolDays: 53, percent: 98.1 },
    announcements: [announcement],
  },
  '/v1/student/results': {
    termId: 't1',
    term: 'First Term · 2026/2027',
    className: 'JSS 2B',
    terms: [{ id: 't1', label: 'First Term · 2026/2027', current: true }],
    status: 'published',
    plannedOn: null,
    held: null,
    publishedOn: '14 Dec 2026',
    card: {
      school: null,
      title: 'First Term Report · 2026/2027',
      student: null,
      classTeacher: 'Mrs. Ronke Adeleke',
      components: ['CA 1 /20', 'CA 2 /20', 'Exam /60'],
      subjects: [
        {
          name: 'Mathematics',
          scores: [15, 16, 45],
          total: '76.0',
          grade: 'A',
          remark: 'Excellent',
          position: null,
        },
      ],
      average: '71.4%',
      grade: 'B',
      position: null,
      version: 1,
      nextTerm: 'Mon 11 Jan 2027',
      classTeacherRemark: 'A steady term.',
      conduct: [{ trait: 'Punctuality', rating: 5 }],
      attendance: { present: 50, late: 2, absent: 1, excused: 0, schoolDays: 53 },
      cumulative: null,
      publishedAt: '2026-12-14T10:00',
    },
  },
  '/v1/student/homework': {
    termId: 't1',
    handsInThrough: 'student',
    assignments: [assignment],
    materials: [],
  },
  '/v1/student/materials': {
    termId: 't1',
    materials: [
      {
        id: 'm1',
        title: 'Times tables',
        description: null,
        type: 'PDF',
        subjectName: 'Mathematics',
        classLabel: 'JSS 2B · Mathematics',
        file: {
          id: 'f1',
          name: 'times-tables.pdf',
          type: 'application/pdf',
          bytes: 2048,
          url: 'https://x/f1',
        },
        link: null,
        publishedAt: '2026-11-20T09:00',
      },
    ],
  },
  '/v1/student/timetable': {
    termId: 't1',
    term: 'First Term · 2026/2027',
    className: 'JSS 2B',
    published: true,
    version: 2,
    effectiveFrom: '14 Sep 2026',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({
      day,
      lessons: [
        lesson,
        { ...lesson, start: '10:00', end: '10:20', isBreak: true, subject: 'Break', teacher: null },
      ],
    })),
  },
  '/v1/student/attendance': {
    termId: 't1',
    term: 'First Term · 2026/2027',
    startsOn: '2026-09-14',
    endsOn: '2026-12-18',
    terms: [{ id: 't1', label: 'First Term · 2026/2027', current: true }],
    summary: { present: 1, late: 0, absent: 1, excused: 0, schoolDays: 2, percent: 50 },
    days: [
      { date: '2026-11-18', mark: 'Present', reason: null },
      { date: '2026-11-19', mark: 'Absent', reason: 'Unwell' },
    ],
  },
  '/v1/student/announcements': [announcement],
  '/v1/student/profile': {
    name: 'Emmanuel Adeyemi',
    firstName: 'Emmanuel',
    surname: 'Adeyemi',
    initials: 'EA',
    admissionNo: 'STU-2025-0042',
    gender: 'Male',
    dateOfBirth: '14 Mar 2013',
    admittedOn: '8 Sep 2025',
    status: 'Active',
    className: 'JSS 2B',
    section: 'Junior Secondary',
    branch: 'Main Campus',
    classTeacher: 'Mrs. Grace Okafor',
    session: '2026/2027',
    guardians: [{ name: 'Mrs. Funke Adeyemi', relationship: 'Mother' }],
  },
  '/v1/notifications': {
    rows: [
      {
        id: 'x1',
        title: 'Work returned',
        body: 'Mathematics · 17 / 20',
        category: 'assignments',
        to: '/assignments/a1',
        createdAt: '2026-11-20T09:00',
        when: '1h ago',
        read: false,
      },
    ],
    meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    unread: 1,
    total: 1,
  },
};

vi.mock('@/api/helpers', () => ({
  cleanParams: (p: object) => p,
  getRequest: vi.fn<(url: string) => Promise<unknown>>(async (url: string) => {
    if (url in DATA) return structuredClone(DATA[url]);
    throw new Error(`Unexpected GET ${url}`);
  }),
  postRequest: vi.fn<() => Promise<unknown>>(async () => ({})),
  patchRequest: vi.fn<() => Promise<unknown>>(async () => ({})),
  putRequest: vi.fn<() => Promise<unknown>>(async () => ({})),
  deleteRequest: vi.fn<() => Promise<unknown>>(async () => ({})),
}));

const SCREENS: [string, string][] = [
  ['/home', 'Assignments due'],
  ['/timetable', 'Mathematics'],
  ['/assignments', 'Plant parts worksheet'],
  ['/assignments/a1', 'Hand in your work'],
  ['/results', 'Mathematics'],
  ['/materials', 'times-tables.pdf'],
  ['/attendance', 'Days not present'],
  ['/announcements', 'PTA meeting'],
  ['/notifications', 'Work returned'],
  ['/profile', 'Change password'],
  ['/more', 'Contact school'],
];

async function render(path: string) {
  const { default: router } = await import('@/router');
  const { queryClient } = await import('@/api/query-client');
  queryClient.clear();
  const errors: unknown[] = [];
  const Root = defineComponent({ render: () => h(RouterView) });
  const wrapper = mount(Root, {
    global: {
      plugins: [createPinia(), router, [VueQueryPlugin, { queryClient }]],
      config: { errorHandler: (e) => errors.push(e) },
    },
    attachTo: document.body,
  });
  await router.push(path);
  await router.isReady();
  for (let i = 0; i < 6; i++) await flushPromises();
  return { wrapper, errors, router };
}

vi.stubGlobal('scrollTo', () => undefined);
Element.prototype.scrollTo = () => undefined;

describe('sign-in screens', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
  });
  afterEach(() => vi.resetModules());

  it.each([
    ['/login', 'Admission number'],
    ['/login?reason=left', 'Your student login has closed.'],
    ['/login?reason=lapsed', 'The Student Portal is closed for now.'],
    ['/login?reason=idle', 'You were signed out after a period of inactivity.'],
    ['/password-expired?email=STU-2025-0042', 'password from your login slip'],
  ])('renders %s', async (path, text) => {
    const { wrapper, errors } = await render(path);
    expect(errors).toEqual([]);
    expect(document.body.textContent).toContain(text);
    wrapper.unmount();
  });

  it('sends a signed-out visitor to sign in', async () => {
    const { wrapper, router } = await render('/results');
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/results');
    wrapper.unmount();
  });
});

describe('Student Portal screens', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem(
      'edutrack.student-portal.session',
      JSON.stringify({
        token: 't',
        user: {
          id: 'u',
          firstName: 'Emmanuel',
          lastName: 'Adeyemi',
          displayName: 'Emmanuel Adeyemi',
          admissionNo: 'STU-2025-0042',
        },
        school: { id: 's', name: 'Greenfield Academy', initials: 'GA' },
      }),
    );
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });

  it.each(SCREENS)('renders %s', async (path, text) => {
    const { wrapper, errors } = await render(path);
    expect(errors).toEqual([]);
    expect(document.body.textContent).toContain(text);
    expect(document.body.textContent).toContain('Greenfield Academy');
    wrapper.unmount();
  });
});
