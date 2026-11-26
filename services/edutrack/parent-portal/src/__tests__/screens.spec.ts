import { VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { RouterView } from 'vue-router';

/*
 * Smoke test: every portal screen renders against API-shaped data (the shapes `/v1/parent/*`
 * returns), with the frame, the child switcher and the tabs.
 */

const today = '2026-11-20';
const child = (id: string, name: string, className: string, extra = {}) => ({
  id,
  name,
  firstName: name.split(' ')[0],
  initials: name
    .split(' ')
    .map((w) => w[0])
    .join(''),
  admissionNo: 'STU-2025-0042',
  className,
  branch: 'Main Campus',
  status: 'Active',
  relationship: 'Mother',
  isPrimary: true,
  paysFees: true,
  access: 'full',
  leftOn: null,
  readOnlyUntil: null,
  handsInThrough: 'guardian',
  fees: { outstanding: 45000, pending: 0, overdue: true },
  boarding: null,
  ...extra,
});
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
  classLabel: 'Primary 5B · Basic Science',
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
const invoice = {
  id: 'i1',
  number: 'INV-2026-0533',
  period: 'First Term · 2026/2027',
  current: true,
  total: 142000,
  paid: 97000,
  pending: 0,
  balance: 45000,
  status: 'Overdue',
  overdue: true,
  dueOn: '2026-09-30',
  dueNote: 'Overdue since 30 Sep',
  lines: [{ label: 'Tuition', amount: 120000 }],
  discounts: [{ label: 'Sibling discount', amount: 10000 }],
  installments: [
    { label: 'Full payment', amount: 142000, due: '2026-09-30', paid: 97000, status: 'Overdue' },
  ],
};
const announcement = {
  id: 'n1',
  title: 'PTA meeting',
  body: 'Wednesday, 10:00',
  from: 'Mrs. Adaeze Okonkwo',
  sentAt: '2026-11-19T09:00:00.000Z',
  date: '19 Nov 2026',
  audience: 'Parents',
  expiresOn: null,
};

const DATA: Record<string, unknown> = {
  '/v1/parent/overview': {
    parent: { name: 'Mrs. Funke Adeyemi', firstName: 'Funke', email: 'funke.adeyemi@gmail.com' },
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
    children: [
      child('emmanuel', 'Emmanuel Adeyemi', 'JSS 2B', {
        handsInThrough: 'student',
        fees: { outstanding: 0, pending: 0, overdue: false },
      }),
      child('michael', 'Michael Adeyemi', 'Primary 5B'),
    ],
  },
  home: {
    term: 'First Term · 2026/2027',
    alerts: [
      {
        kind: 'fees-overdue',
        tone: 'error',
        title: 'Fees are overdue',
        text: '₦45,000 was due 30 Sep for Michael.',
        action: { label: 'Pay now', to: '/fees/pay' },
      },
    ],
    latestResult: result,
    homework: [assignment],
    today: { day: 'Friday', className: 'Primary 5B', lessons: [lesson] },
    announcements: [announcement],
  },
  child: {
    child: child('michael', 'Michael Adeyemi', 'Primary 5B'),
    enrolment: {
      session: '2026/2027',
      term: 'First Term',
      className: 'Primary 5B',
      branch: 'Main Campus',
      classTeacher: 'Mrs. Ronke Adeleke',
      admissionNo: 'STU-2023-0311',
      admittedOn: '5 Sep 2023',
      status: 'Active',
    },
    thisTerm: {
      term: 'First Term · 2026/2027',
      fees: { outstanding: 45000, pending: 0, overdue: true },
      results: { ...result, status: 'not-published', plannedOn: '14 Dec 2026' },
      assignmentsToDo: 1,
      attendance: { present: 40, late: 2, absent: 1, excused: 0, schoolDays: 43, percent: 97.7 },
    },
    guardians: [
      { name: 'Mrs. Funke Adeyemi', relationship: 'Mother', you: true, paysFees: true },
      { name: 'Mr. Tayo Adeyemi', relationship: 'Father', you: false },
    ],
  },
  fees: {
    term: { id: 't1', label: 'First Term · 2026/2027' },
    canPay: true,
    payBlockedReason: null,
    readOnly: false,
    totals: { outstanding: 45000, pending: 0, overdue: true, credit: 0 },
    current: invoice,
    previous: [],
    payments: [
      {
        id: 'p1',
        number: 'RCT-2026-0188',
        date: '2026-09-10',
        amount: 97000,
        method: 'Bank transfer',
        reference: '',
        status: 'Confirmed',
        byParent: false,
        payer: 'Mrs. Funke Adeyemi',
        proofName: null,
        rejectReason: null,
        invoices: ['INV-2026-0533'],
      },
    ],
    payTo: {
      accounts: [
        {
          id: 'b1',
          bank: 'GTBank',
          accountNumber: '0123456789',
          accountName: 'Greenfield Academy Ltd',
        },
      ],
      reference: 'STU-2023-0311',
      referenceKind: 'admission',
    },
    options: [
      { key: 'all', label: 'Everything outstanding · ₦45,000', detail: 'This term', amount: 45000 },
    ],
  },
  results: {
    termId: 't1',
    term: 'First Term · 2026/2027',
    className: 'Primary 5B',
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
  homework: {
    termId: 't1',
    handsInThrough: 'guardian',
    assignments: [assignment],
    materials: [],
  },
  materials: {
    termId: 't1',
    materials: [
      {
        id: 'm1',
        title: 'Times tables',
        description: null,
        type: 'PDF',
        subjectName: 'Mathematics',
        classLabel: 'Primary 5B · Mathematics',
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
  timetable: {
    termId: 't1',
    term: 'First Term · 2026/2027',
    className: 'Primary 5B',
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
  attendance: {
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
  '/v1/parent/boarding/michael': {
    boarder: true,
    pickups: [
      {
        id: 'pk1',
        name: 'Chinedu Okafor',
        relationship: 'Uncle',
        phone: '0803 555 0199',
        note: 'Grey Corolla',
      },
    ],
    exeats: [
      {
        id: 'e1',
        student: {
          id: 'michael',
          name: 'Michael Adeyemi',
          admissionNo: 'STU-2023-0311',
          className: 'Primary 5B',
          hostel: 'Unity House',
          room: '12',
        },
        campus: 'Main Campus',
        kind: 'Weekend',
        reason: null,
        leaveAt: '2026-12-04T14:00:00.000Z',
        returnBy: '2026-12-06T17:00:00.000Z',
        leaves: 'Fri 4 Dec, 15:00',
        returns: 'Sun 6 Dec, 18:00',
        pickup: null,
        collectors: [],
        status: 'Requested',
        requestedBy: 'Parent',
        requestedByName: 'Mrs. Funke Adeyemi',
        decidedBy: null,
        decisionNote: null,
        signedOutAt: null,
        collectedBy: null,
        signedInAt: null,
        overdue: false,
        lateReturn: false,
      },
    ],
    sickBay: [
      {
        id: 'sb1',
        seen: 'Tue 17 Nov, 10:20',
        seenAt: '2026-11-17T09:20:00.000Z',
        complaint: 'Headache',
        treatment: 'Rest',
        medication: 'Paracetamol',
        outcome: 'Back to class',
        inSickBay: false,
      },
    ],
    visitingDays: [
      {
        id: 'v1',
        date: '2026-12-05',
        startsAt: '10:00',
        endsAt: '14:00',
        campus: 'Main Campus',
        branchId: null,
        note: null,
      },
    ],
    incidents: [],
    property: { term: 'First Term', items: [], checkIn: null, checkOut: null },
  },
  '/v1/parent/announcements': [announcement],
  '/v1/auth/invitations/tok': {
    token: 'tok',
    kind: 'guardian',
    email: 'funke.adeyemi@gmail.com',
    firstName: 'Funke',
    lastName: 'Adeyemi',
    title: 'Mrs.',
    phone: '+2348035550161',
    schoolName: 'Greenfield Academy',
    invitedBy: 'Mrs. Adaeze Okonkwo · Principal',
    expiresOn: '27 Nov 2026',
    expiresIn: 'In 7 days',
    status: 'pending',
    children: [
      {
        name: 'Emmanuel Adeyemi',
        firstName: 'Emmanuel',
        className: 'JSS 2B',
        branch: 'Main Campus',
      },
    ],
  },
  '/v1/parent/profile': {
    name: 'Mrs. Funke Adeyemi',
    title: 'Mrs.',
    email: 'funke.adeyemi@gmail.com',
    phone: '0803 555 0161',
    address: '22 Opebi Road, Ikeja',
    occupation: 'Pharmacist',
    lastSignInAt: '2026-11-20T07:52',
  },
  '/v1/parent/notification-preferences': [
    {
      key: 'results',
      label: 'Results',
      description: 'Report cards',
      inApp: true,
      email: true,
      sms: false,
    },
  ],
  '/v1/notifications': {
    rows: [
      {
        id: 'x1',
        title: 'Results published',
        body: 'Emmanuel · tap to view',
        category: 'results',
        to: '/results',
        childId: 'emmanuel',
        createdAt: '2026-11-20T09:00',
        when: '1h ago',
        read: false,
      },
    ],
    meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    unread: 1,
    total: 1,
  },
  '/v1/parent/messages': {
    conversations: [
      {
        id: 'c1',
        kind: 'Teacher',
        subject: 'Reading at home',
        with: 'Mrs. Bisi Okafor',
        about: 'Michael Adeyemi',
        lastMessage: {
          body: 'Thank you, I’ll check.',
          at: '2026-11-20T09:00:00.000Z',
          fromMe: false,
        },
        unread: 1,
      },
    ],
    unread: 1,
  },
  '/v1/parent/messages/contacts': {
    school: 'Greenfield Academy',
    children: [
      {
        studentId: 'michael',
        name: 'Michael Adeyemi',
        onRoll: true,
        className: 'Primary 4A',
        teachers: [
          { staffId: 's1', name: 'Mrs. Bisi Okafor', roles: ['Class teacher', 'Mathematics'] },
        ],
      },
    ],
  },
  '/v1/parent/messages/c1': {
    id: 'c1',
    kind: 'Teacher',
    subject: 'Reading at home',
    with: 'Mrs. Bisi Okafor',
    about: 'Michael Adeyemi',
    canReply: true,
    messages: [
      {
        id: 'm1',
        body: 'Thank you, I’ll check.',
        at: '2026-11-20T09:00:00.000Z',
        sender: 'Teacher',
        mine: false,
        from: 'Mrs. Bisi Okafor',
      },
    ],
  },
};

vi.mock('@/api/helpers', () => ({
  cleanParams: (p: object) => p,
  getRequest: vi.fn<(url: string) => Promise<unknown>>(async (url: string) => {
    if (url in DATA) return structuredClone(DATA[url]);
    const m = /^\/v1\/parent\/children\/[^/]+(?:\/(\w+))?$/.exec(url);
    if (m) return structuredClone(DATA[m[1] ?? 'child']);
    throw new Error(`Unexpected GET ${url}`);
  }),
  postRequest: vi.fn<() => Promise<unknown>>(async () => ({})),
  patchRequest: vi.fn<() => Promise<unknown>>(async () => ({})),
  putRequest: vi.fn<() => Promise<unknown>>(async () => ({})),
  deleteRequest: vi.fn<() => Promise<unknown>>(async () => ({})),
}));

const SCREENS: [string, string][] = [
  ['/home', 'Good'],
  ['/home?first=1', 'Your account is ready'],
  ['/children', 'Guardians on record'],
  ['/fees', 'Payments & receipts'],
  ['/fees/pay', 'What would you like to pay?'],
  ['/results', 'Mathematics'],
  ['/assignments', 'Plant parts worksheet'],
  ['/assignments/a1', 'Upload on Michael’s behalf'],
  ['/timetable', 'Mathematics'],
  ['/materials', 'times-tables.pdf'],
  ['/attendance', 'Days not present'],
  ['/boarding', 'Pickup people'],
  ['/announcements', 'PTA meeting'],
  ['/notifications', 'Results published'],
  ['/profile', 'Notifications'],
  ['/more', 'Contact school'],
  ['/messages', 'Reading at home'],
  ['/messages/new', 'Class teacher · Mathematics'],
  ['/messages/c1', 'Thank you, I’ll check.'],
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
Element.prototype.scrollIntoView = () => undefined;

describe('sign-in screens', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
  });
  afterEach(() => vi.resetModules());

  it.each([
    ['/login?reason=ended', 'This parent account has closed.'],
    ['/login?reason=lapsed', 'The Parent Portal is closed for now.'],
    ['/forgot-password', 'Forgot your password?'],
    ['/accept-invitation/tok', 'Children linked to this invitation'],
  ])('renders %s', async (path, text) => {
    const { wrapper, errors } = await render(path);
    expect(errors).toEqual([]);
    expect(document.body.textContent).toContain(text);
    wrapper.unmount();
  });

  it('sends a signed-out visitor to sign in', async () => {
    const { wrapper, router } = await render('/fees');
    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/fees');
    wrapper.unmount();
  });
});

describe('Parent Portal screens', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem(
      'edutrack.parent-portal.session',
      JSON.stringify({
        token: 't',
        user: {
          id: 'u',
          title: 'Mrs.',
          firstName: 'Funke',
          lastName: 'Adeyemi',
          displayName: 'Funke Adeyemi',
          email: 'funke.adeyemi@gmail.com',
          phone: null,
        },
        school: { id: 's', name: 'Greenfield Academy', initials: 'GA' },
      }),
    );
    localStorage.setItem('edutrack.parent-portal.child', 'michael');
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
