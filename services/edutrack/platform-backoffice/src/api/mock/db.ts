/*
 * In-memory data behind the mock API. Seeded from the Platform Back Office design so every screen
 * has realistic records. It resets on reload; nothing here ships when VITE_USE_MOCKS is off.
 */
import type {
  ActivityEntity,
  ActivityItem,
  AuditEntry,
  IssueMessage,
  Plan,
  PlanName,
  PlatformUser,
  Role,
  School,
  SchoolAdministrator,
  SupportIssue,
  TimelineEntry,
} from '@/types';
import { CORE_MODULES, PLAN_MODULES } from '@/config/plan-modules';
import { PERMISSION_AREAS, PERMISSIONS } from '@/types';

export const ME = { id: 'u1', name: 'Tolu Bamidele', email: 'tolu@edutrack.ng' };
export const DEMO_PASSWORD = 'Edutrack2026!';

export const PLAN_LIMITS: Record<
  PlanName,
  { price: string; students: number | 'Unlimited'; branches: number | 'Unlimited' }
> = {
  Starter: { price: '₦650,000', students: 500, branches: 2 },
  Growth: { price: '₦1,850,000', students: 1500, branches: 5 },
  Enterprise: { price: 'Custom', students: 'Unlimited', branches: 'Unlimited' },
};

const fullAccess = Object.fromEntries(PERMISSION_AREAS.map((area) => [area, [...PERMISSIONS]]));

export const roles: Omit<Role, 'activeUsers'>[] = [
  {
    id: 'admin',
    name: 'Platform Administrator',
    description: 'Full access to every area, including settings and roles.',
    permissions: fullAccess,
    predefined: true,
  },
  {
    id: 'ops',
    name: 'Platform Operations',
    description: 'Provision and manage schools and subscriptions.',
    permissions: {
      Schools: ['View', 'Create', 'Edit', 'Suspend'],
      Subscriptions: ['View', 'Create', 'Edit', 'Suspend'],
      Users: ['View'],
      Support: ['View', 'Create'],
      Audit: ['View'],
      Reports: ['View'],
      Settings: [],
    },
    predefined: true,
  },
  {
    id: 'support',
    name: 'Platform Support',
    description: 'Lead support: assign, resolve and approve support sessions.',
    permissions: {
      Schools: ['View'],
      Subscriptions: ['View'],
      Users: ['View'],
      Support: ['View', 'Create', 'Edit', 'Manage'],
      Audit: ['View'],
      Reports: ['View'],
      Settings: [],
    },
    predefined: true,
  },
  {
    id: 'agent',
    name: 'Support Agent',
    description: 'Work on assigned issues. No access to billing or settings.',
    permissions: {
      Schools: ['View'],
      Subscriptions: [],
      Users: [],
      Support: ['View', 'Create', 'Edit'],
      Audit: [],
      Reports: [],
      Settings: [],
    },
    predefined: true,
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Plans, platform billing and revenue reports.',
    permissions: {
      Schools: ['View'],
      Subscriptions: ['View', 'Edit', 'Manage'],
      Users: [],
      Support: ['View'],
      Audit: ['View'],
      Reports: ['View', 'Manage'],
      Settings: [],
    },
    predefined: true,
  },
];

type UserRow = Omit<PlatformUser, 'roleName'>;
const user = (
  id: string,
  firstName: string,
  lastName: string,
  email: string,
  phone: string,
  roleId: string,
  status: PlatformUser['status'],
  lastSeen: string,
  createdAt: string,
  invitation: PlatformUser['invitation'] = null,
): UserRow => ({
  id,
  firstName,
  lastName,
  email,
  phone,
  roleId,
  status,
  lastSeen,
  createdAt,
  invitation,
  invitedBy: invitation ? ME.name : null,
});

export const users: UserRow[] = [
  user(
    'u1',
    'Tolu',
    'Bamidele',
    'tolu@edutrack.ng',
    '0803 412 7781',
    'admin',
    'Active',
    'Today, 08:02',
    '3 Feb 2024',
  ),
  user(
    'u2',
    'Ngozi',
    'Okafor',
    'ngozi@edutrack.ng',
    '0805 555 0122',
    'support',
    'Active',
    'Today, 09:14',
    '10 Mar 2024',
  ),
  user(
    'u3',
    'Ibrahim',
    'Yusuf',
    'ibrahim@edutrack.ng',
    '0802 555 0190',
    'agent',
    'Active',
    'Today, 07:55',
    '2 Jun 2024',
  ),
  user(
    'u4',
    'Ada',
    'Eze',
    'ada@edutrack.ng',
    '0809 555 0133',
    'finance',
    'Active',
    'Yesterday, 17:40',
    '14 Aug 2024',
  ),
  user(
    'u5',
    'Femi',
    'Lawson',
    'femi@edutrack.ng',
    '0806 555 0145',
    'ops',
    'Active',
    '6 Dec, 12:10',
    '9 Jan 2025',
  ),
  user(
    'u6',
    'Dayo',
    'Ola',
    'dayo@edutrack.ng',
    '',
    'agent',
    'Invited',
    '—',
    '5 Dec 2026',
    'Pending',
  ),
  user(
    'u7',
    'Chika',
    'Obi',
    'chika@edutrack.ng',
    '',
    'agent',
    'Invited',
    '—',
    '20 Nov 2026',
    'Expired',
  ),
  user(
    'u8',
    'Kemi',
    'Adewale',
    'kemi@edutrack.ng',
    '0807 555 0177',
    'ops',
    'Suspended',
    '14 Aug 2026',
    '1 Apr 2024',
  ),
  user(
    'u9',
    'Bayo',
    'Ojo',
    'bayo@edutrack.ng',
    '0801 555 0108',
    'finance',
    'Deactivated',
    '30 Jun 2026',
    '5 May 2024',
  ),
];
/** Passwords set through invitations or resets during this session. */
export const passwords = new Map<string, string>([[ME.email, DEMO_PASSWORD]]);

const school = (
  s: Partial<School> &
    Pick<
      School,
      | 'id'
      | 'name'
      | 'type'
      | 'state'
      | 'plan'
      | 'status'
      | 'students'
      | 'branches'
      | 'renews'
      | 'admin'
      | 'createdAt'
    >,
): School => ({
  legalName: `${s.name} Ltd`,
  setupProgress: 100,
  currentStep: 'Complete',
  contactEmail: `info@${s.id}.edu.ng`,
  phone: '0803 555 0142',
  subdomain: `${s.id}.edutrack.ng`,
  brandColor: null,
  ...s,
});

export const schools: School[] = [
  school({
    id: 'greenfield',
    name: 'Greenfield Academy',
    legalName: 'Greenfield Academy Limited',
    type: 'Private · Combined',
    state: 'Lagos',
    plan: 'Growth',
    status: 'Active',
    students: 1248,
    branches: 3,
    renews: '31 Aug 2027',
    setupProgress: 81,
    currentStep: 'Fees',
    admin: 'Adaeze Okonkwo',
    createdAt: '12 Jul 2024',
    contactEmail: 'info@greenfieldacademy.ng',
  }),
  school({
    id: 'kings',
    name: 'Kingsway International School',
    type: 'Private · Combined',
    state: 'Rivers',
    plan: 'Enterprise',
    status: 'Active',
    students: 2310,
    branches: 4,
    renews: '15 Jan 2027',
    admin: 'Ifeoma Briggs',
    createdAt: '3 Mar 2024',
  }),
  school({
    id: 'hillcrest',
    name: 'Hillcrest Nursery & Primary',
    type: 'Private · Nursery, Primary',
    state: 'Oyo',
    plan: 'Starter',
    status: 'Expiring',
    students: 286,
    branches: 1,
    renews: '20 Dec 2026',
    admin: 'Bola Ajayi',
    createdAt: '19 Dec 2024',
  }),
  school({
    id: 'unity',
    name: 'Unity Model College',
    type: 'Public · Secondary',
    state: 'Kaduna',
    plan: 'Growth',
    status: 'Grace period',
    students: 940,
    branches: 1,
    renews: 'Ended 1 Dec 2026',
    admin: 'Sani Aliyu',
    createdAt: '1 Dec 2025',
  }),
  school({
    id: 'brook',
    name: 'Brookfield Schools',
    type: 'Private · Combined',
    state: 'Lagos',
    plan: 'Growth',
    status: 'Onboarding',
    students: 112,
    branches: 2,
    renews: '30 Nov 2027',
    setupProgress: 46,
    currentStep: 'Fees',
    admin: 'Toyin Bello',
    createdAt: '4 Nov 2026',
  }),
  school({
    id: 'lagoon',
    name: 'Lagoon View College',
    type: 'Private · Secondary',
    state: 'Lagos',
    plan: 'Starter',
    status: 'Onboarding',
    students: 0,
    branches: 1,
    renews: '25 Nov 2027',
    setupProgress: 12,
    currentStep: 'Accept invitation',
    admin: 'Peter Okon (invited 25 Nov)',
    createdAt: '25 Nov 2026',
  }),
  school({
    id: 'royal',
    name: 'Royal Crest Schools',
    type: 'Private · Combined',
    state: 'Ogun',
    plan: 'Growth',
    status: 'Restricted',
    students: 610,
    branches: 2,
    renews: 'Ended 10 Nov 2026',
    admin: 'Funmi Adeoye',
    createdAt: '10 Nov 2025',
  }),
  school({
    id: 'starlight',
    name: 'Starlight Academy',
    type: 'Private · Primary',
    state: 'Enugu',
    plan: 'Starter',
    status: 'Suspended',
    students: 198,
    branches: 1,
    renews: '—',
    admin: 'Obi Nnaji',
    createdAt: '6 Feb 2025',
  }),
  school({
    id: 'heritage',
    name: 'Heritage College',
    type: 'Private · Secondary',
    state: 'Ogun',
    plan: 'Starter',
    status: 'Expired',
    students: 0,
    branches: 1,
    renews: 'Ended 31 Aug 2026',
    admin: 'Tunde Ilori',
    createdAt: '28 Aug 2024',
  }),
];
/** Status a suspended school returns to when reactivated. */
export const statusBeforeSuspension = new Map<string, School['status']>([['starlight', 'Active']]);

export const schoolAdmins = new Map<string, SchoolAdministrator[]>(
  schools.map((s) => [
    s.id,
    s.id === 'lagoon'
      ? [
          {
            id: 'lagoon-1',
            name: 'Peter Okon',
            email: 'p.okon@lagoonview.edu.ng',
            role: 'School Admin',
            scope: 'All branches',
            invitedAt: '25 Nov',
            status: 'Invited',
            note: 'Expires in 1 day',
          },
        ]
      : [
          {
            id: `${s.id}-1`,
            name: s.admin,
            email: s.contactEmail,
            role: 'School Admin',
            scope: 'All branches',
            invitedAt: s.createdAt,
            status: 'Active',
          },
          {
            id: `${s.id}-2`,
            name: 'Chidi Okoro',
            email: `c.okoro@${s.id}.edu.ng`,
            role: 'School Admin',
            scope: 'All branches',
            invitedAt: '2024',
            status: 'Active',
          },
        ],
  ]),
);

const ACADEMIC_CORE = ['subjects', 'assign', 'timetable', 'assess', 'results', 'promotion'];
const unlimited = { students: null, branches: null, users: null, storage: null };

export const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Small single-campus schools getting started.',
    status: 'Active',
    pricing: { model: 'flat', prices: { annual: 650_000, term: 240_000 } },
    trialDays: 30,
    setupFee: 0,
    limits: { students: 500, branches: 2, users: 25, storage: 10 },
    smsCreditsPerTerm: 1000,
    modules: [...CORE_MODULES, ...ACADEMIC_CORE, 'fees', 'announce', 'email', 'teacher', 'parent'],
    support: 'Standard',
    schools: 71,
    version: 3,
    history: [{ version: 3, at: '12 Aug 2026', by: ME.name, summary: 'Added Parent Portal' }],
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'Growing schools with more than one campus.',
    status: 'Active',
    pricing: { model: 'flat', prices: { annual: 1_850_000, term: 680_000 } },
    trialDays: 30,
    setupFee: 0,
    limits: { students: 1500, branches: 5, users: 80, storage: 50 },
    smsCreditsPerTerm: 5000,
    modules: [
      ...CORE_MODULES,
      ...ACADEMIC_CORE,
      'homework',
      'fees',
      'online',
      'discounts',
      'expenses',
      'payroll',
      'inventory',
      'announce',
      'email',
      'sms',
      'teacher',
      'parent',
      'student',
      'reports',
      'export',
    ],
    support: 'Standard',
    schools: 118,
    version: 5,
    history: [
      { version: 5, at: '3 Sep 2026', by: ME.name, summary: 'Student limit 1,200 → 1,500' },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'School groups and large multi-campus schools.',
    status: 'Active',
    pricing: { model: 'custom', prices: {} },
    trialDays: 0,
    setupFee: 500_000,
    limits: { ...unlimited },
    smsCreditsPerTerm: 20_000,
    modules: PLAN_MODULES.filter((mod) => !mod.comingSoon).map((mod) => mod.id),
    support: 'Priority',
    schools: 25,
    version: 2,
    history: [],
  },
  {
    id: 'legacy',
    name: 'Legacy Basic',
    description: 'Retired. Kept for schools still renewing on it.',
    status: 'Archived',
    pricing: { model: 'flat', prices: { annual: 400_000 } },
    trialDays: 0,
    setupFee: 0,
    limits: { students: 300, branches: 1, users: 10, storage: 5 },
    smsCreditsPerTerm: 0,
    modules: [...CORE_MODULES, 'subjects', 'assess', 'results'],
    support: 'Standard',
    schools: 6,
    version: 1,
    history: [],
  },
];

/**
 * A ticket as the mock stores it. The SLA clocks are worked out from these timestamps (ms) on
 * every read, so they keep ticking while the app is open.
 */
export interface IssueRow extends Omit<SupportIssue, 'schoolName' | 'sla'> {
  description?: string;
  createdMs: number;
  firstReplyMs: number | null;
  /** When the resolution clock was paused (waiting for school, on hold). */
  pausedSince: number | null;
  /** Total time spent paused before `pausedSince`. */
  pausedMs: number;
  /** Set when a ticket is resolved after its resolution target. */
  slaMissed: boolean;
}

const HOUR = 3600e3;
const ago = (hours: number) => Date.now() - hours * HOUR;
const issue = (
  row: Pick<
    IssueRow,
    | 'id'
    | 'schoolId'
    | 'subject'
    | 'category'
    | 'priority'
    | 'status'
    | 'assignee'
    | 'team'
    | 'requester'
    | 'createdAt'
    | 'updatedAt'
  > &
    Partial<IssueRow> & { ageHours: number },
): IssueRow => {
  const { ageHours, ...rest } = row;
  return {
    resolution: null,
    resolutionType: null,
    escalatedTo: null,
    escalatedFrom: null,
    holdReason: null,
    reopenCount: 0,
    rating: null,
    firstReplyMs: null,
    pausedSince: null,
    pausedMs: 0,
    slaMissed: false,
    ...rest,
    createdMs: ago(ageHours),
  };
};

export const issues: IssueRow[] = [
  issue({
    id: 'SUP-1182',
    schoolId: 'kings',
    subject: 'Unable to publish results for SSS 2C',
    category: 'Academic',
    priority: 'Urgent',
    status: 'In Progress',
    assignee: 'Ngozi Okafor',
    team: 'Tier 1 Support',
    requester: 'Mrs. Ifeoma Briggs · School Admin',
    createdAt: 'Today, 10:42',
    updatedAt: '11:26',
    ageHours: 2.5,
    firstReplyMs: ago(2.1),
  }),
  issue({
    id: 'SUP-1180',
    schoolId: 'brook',
    subject: 'Paystack payments not reconciling to invoices',
    category: 'Billing',
    priority: 'High',
    status: 'Escalated',
    assignee: 'Funmi Adebayo',
    team: 'Billing',
    requester: 'Mrs. Toyin Bello · School Admin',
    createdAt: 'Today, 08:15',
    updatedAt: 'Today, 09:40',
    ageHours: 5,
    firstReplyMs: ago(4.5),
    escalatedTo: 'Billing specialist',
    escalatedFrom: 'Tolu Bamidele',
  }),
  issue({
    id: 'SUP-1179',
    schoolId: 'unity',
    subject: 'Parents not receiving SMS notifications',
    category: 'Technical',
    priority: 'High',
    status: 'Waiting for School',
    assignee: 'Ibrahim Yusuf',
    team: 'Technical',
    requester: 'Mr. Sani Aliyu · Bursar',
    createdAt: 'Yesterday',
    updatedAt: 'Yesterday',
    ageHours: 26,
    firstReplyMs: ago(24),
    pausedSince: ago(20),
    pausedMs: 0,
  }),
  issue({
    id: 'SUP-1176',
    schoolId: 'brook',
    subject: 'Help importing 600 students from Excel',
    category: 'Academic',
    priority: 'Normal',
    status: 'In Progress',
    assignee: 'Ibrahim Yusuf',
    team: 'Technical',
    requester: 'Mrs. Toyin Bello · School Admin',
    createdAt: '5 Dec',
    updatedAt: '7 Dec',
    ageHours: 68,
    firstReplyMs: ago(64),
  }),
  issue({
    id: 'SUP-1174',
    schoolId: 'hillcrest',
    subject: 'Renewal invoice shows the wrong student count',
    category: 'Billing',
    priority: 'Normal',
    status: 'Open',
    assignee: null,
    team: 'Billing',
    requester: 'Mrs. Bola Ajayi · Proprietor',
    createdAt: '4 Dec',
    updatedAt: '4 Dec',
    ageHours: 30,
  }),
  issue({
    id: 'SUP-1171',
    schoolId: 'greenfield',
    subject: 'Bursar cannot see payroll approval button',
    category: 'Access',
    priority: 'Low',
    status: 'Open',
    assignee: null,
    team: 'Technical',
    requester: 'Mr. Kunle Bakare · Bursar',
    createdAt: '3 Dec',
    updatedAt: '3 Dec',
    ageHours: 14,
  }),
  issue({
    id: 'SUP-1170',
    schoolId: 'greenfield',
    subject: 'Change sibling discount rule',
    category: 'Finance',
    priority: 'Normal',
    status: 'Resolved',
    assignee: 'Ngozi Okafor',
    team: 'Tier 1 Support',
    requester: 'Mrs. Adaeze Okonkwo · Principal',
    createdAt: '2 Dec',
    updatedAt: '3 Dec',
    ageHours: 40,
    firstReplyMs: ago(38),
    resolution: 'Explained how to edit the sibling rule under Finance → Fees → Discounts.',
    resolutionType: 'Guidance given',
  }),
  issue({
    id: 'SUP-1163',
    schoolId: 'starlight',
    subject: 'Request account suspension',
    category: 'Account',
    priority: 'Normal',
    status: 'Closed',
    assignee: 'Tolu Bamidele',
    team: 'Tier 1 Support',
    requester: 'Mr. Obi Nnaji · Proprietor',
    createdAt: '1 Dec',
    updatedAt: '2 Dec',
    ageHours: 120,
    firstReplyMs: ago(118),
    resolution: "School suspended at the proprietor's request. Data retained.",
    resolutionType: 'Fixed',
    rating: { score: 5, comment: 'Quick and clear, thank you.' },
  }),
  issue({
    id: 'SUP-1042',
    schoolId: 'greenfield',
    subject: 'Report cards print with cut-off principal signature',
    category: 'Academic',
    priority: 'Normal',
    status: 'Reopened',
    assignee: 'Ngozi Okafor',
    team: 'Tier 1 Support',
    requester: 'Adaeze Okonkwo · School Admin',
    createdAt: '3 Dec',
    updatedAt: 'Today, 08:02',
    ageHours: 50,
    firstReplyMs: ago(49),
    reopenCount: 1,
  }),
  issue({
    id: 'SUP-1031',
    schoolId: 'greenfield',
    subject: 'Bulk SMS to parents not delivered on MTN numbers',
    category: 'Technical',
    priority: 'High',
    status: 'On Hold',
    assignee: 'Ibrahim Yusuf',
    team: 'Technical',
    requester: 'Adaeze Okonkwo · School Admin',
    createdAt: '28 Nov',
    updatedAt: '28 Nov',
    ageHours: 30,
    firstReplyMs: ago(27),
    pausedSince: ago(26),
    holdReason: 'SMS or WhatsApp provider',
  }),
  issue({
    id: 'SUP-0998',
    schoolId: 'greenfield',
    subject: 'Add Lekki Campus to our plan',
    category: 'Billing',
    priority: 'Normal',
    status: 'Closed',
    assignee: 'Tolu Bamidele',
    team: 'Billing',
    requester: 'Adaeze Okonkwo · School Admin',
    createdAt: '12 Oct',
    updatedAt: '13 Oct',
    ageHours: 600,
    firstReplyMs: ago(598),
    resolution: 'Lekki Campus added. The plan now covers 2 branches.',
    resolutionType: 'Fixed',
    rating: { score: 4, comment: '' },
  }),
];

let messageSeq = 0;
const msg = (
  author: string,
  authorRole: string,
  when: string,
  text: string,
  kind: IssueMessage['kind'],
): IssueMessage => ({ id: `m${++messageSeq}`, author, authorRole, when, text, kind });

export const conversations = new Map<string, IssueMessage[]>([
  [
    'SUP-1182',
    [
      msg(
        'Mrs. Ifeoma Briggs',
        'School Admin · Kingsway',
        '10:42',
        'We are unable to publish results for SSS 2C. Every subject shows Approved, but the Publish button stays disabled.',
        'school',
      ),
      msg(
        'Ngozi Okafor',
        'Support',
        '11:03',
        "Thanks, Mrs. Briggs. We're checking the result approval state for SSS 2C now.",
        'agent',
      ),
      msg(
        'Ngozi Okafor',
        'Internal note',
        '11:15',
        'Chemistry SSS 2 assessment scheme sums to 90% (CA 1 15 + CA 2 15 + Exam 60). Publishing is blocked by the weight check. Likely cause.',
        'note',
      ),
      msg(
        'Ngozi Okafor',
        'Support',
        '11:26',
        "We've found the cause: the Chemistry assessment scheme for SSS 2 adds up to 90%, so totals can't be finalised. Could your Exams Officer set CA 1 to 20% under Assessments & Grading? Publishing will then unlock.",
        'agent',
      ),
    ],
  ],
  [
    'SUP-1042',
    [
      msg(
        'Adaeze Okonkwo',
        'School Admin · Greenfield Academy',
        '3 Dec 10:14',
        'When we print report cards for JSS 2, the principal’s signature is cut off at the bottom.',
        'school',
      ),
      msg(
        'Ngozi Okafor',
        'Internal note',
        '3 Dec 10:40',
        'Likely the A4 vs Letter page setting on the JSS template. Checking before asking for the PDF.',
        'note',
      ),
      msg(
        'Ngozi Okafor',
        'Support',
        '3 Dec 11:02',
        'Thanks. Could you tell us which template you’re using and send one exported PDF?',
        'agent',
      ),
    ],
  ],
  [
    'SUP-1031',
    [
      msg(
        'Adaeze Okonkwo',
        'School Admin · Greenfield Academy',
        '28 Nov 09:20',
        'About 40 MTN numbers show Failed in delivery logs for the PTA notice.',
        'school',
      ),
      msg(
        'Ibrahim Yusuf',
        'Support',
        '28 Nov 12:45',
        'We’ve escalated to our SMS provider. Email and in-app copies were delivered.',
        'agent',
      ),
    ],
  ],
  [
    'SUP-1180',
    [
      msg(
        'Mrs. Toyin Bello',
        'School Admin · Brookfield Schools',
        'Today, 08:15',
        'Twelve Paystack payments from last week show as received in Paystack but the invoices are still unpaid.',
        'school',
      ),
      msg(
        'Tolu Bamidele',
        'Support',
        'Today, 08:42',
        'Thanks, Mrs. Bello. We can see the payments on our side; we’re checking why they didn’t match.',
        'agent',
      ),
    ],
  ],
]);

let eventSeq = 0;
/** A ticket history entry. `internal` entries are hidden from the school. */
const ev = (
  title: string,
  who: string,
  when: string,
  tone: TimelineEntry['tone'] = 'info',
  internal = false,
): TimelineEntry => ({
  id: `e${++eventSeq}`,
  title,
  detail: `${who} · ${internal ? 'internal' : 'school can see'}`,
  when,
  tone,
});

export const issueEvents = new Map<string, TimelineEntry[]>([
  [
    'SUP-1182',
    [
      ev('Priority High → Urgent', 'Ngozi Okafor', '10:55', 'warning', true),
      ev('Picked up by Ngozi Okafor · first reply sent', 'Ngozi Okafor', '11:03'),
    ],
  ],
  [
    'SUP-1180',
    [
      ev('Picked up by Tolu Bamidele · first reply sent', 'Tolu Bamidele', 'Today, 08:42'),
      ev(
        'Escalated to Billing specialist (Funmi Adebayo) by Tolu Bamidele · payments need matching by hand',
        'Tolu Bamidele',
        'Today, 09:40',
        'error',
      ),
    ],
  ],
  [
    'SUP-1042',
    [
      ev('Resolved · Fixed · “Template set to A4.”', 'Ngozi Okafor', '4 Dec', 'success'),
      ev('Reopened by the school', 'Adaeze Okonkwo', 'Today, 08:02', 'warning'),
    ],
  ],
  [
    'SUP-1031',
    [ev('On hold · SMS or WhatsApp provider · SLA paused', 'Ibrahim Yusuf', '28 Nov 12:45')],
  ],
]);

export const activity: ActivityItem[] = [
  {
    id: 'a1',
    when: 'Today 09:02',
    actor: 'Ngozi Okafor',
    summary: 'Support session approved',
    schoolName: 'Kingsway International School',
    entity: 'Support session',
  },
  {
    id: 'a2',
    when: 'Today 08:40',
    actor: 'System',
    summary: 'Payment recorded · ₦1,850,000',
    schoolName: 'Greenfield Academy',
    entity: 'Subscription',
  },
  {
    id: 'a3',
    when: '7 Dec',
    actor: 'Ibrahim Yusuf',
    summary: 'Support issue resolved · SUP-1168',
    schoolName: 'Brookfield Schools',
    entity: 'Issue',
  },
  {
    id: 'a4',
    when: '6 Dec',
    actor: 'Ada Eze',
    summary: 'Subscription updated · Kingsway renewed Enterprise',
    schoolName: 'Kingsway International School',
    entity: 'Subscription',
  },
  {
    id: 'a5',
    when: '5 Dec',
    actor: ME.name,
    summary: 'User invited · Dayo Ola',
    schoolName: '—',
    entity: 'User',
  },
  {
    id: 'a6',
    when: '4 Dec',
    actor: 'System',
    summary: 'Support issue created · SUP-1174',
    schoolName: 'Hillcrest Nursery & Primary',
    entity: 'Issue',
  },
  {
    id: 'a7',
    when: '2 Dec',
    actor: ME.name,
    summary: 'School suspended · Starlight Academy',
    schoolName: 'Starlight Academy',
    entity: 'School',
  },
  {
    id: 'a8',
    when: '28 Nov',
    actor: ME.name,
    summary: 'Role changed · Femi Lawson to Platform Operations',
    schoolName: '—',
    entity: 'User',
  },
  {
    id: 'a9',
    when: '25 Nov',
    actor: 'Femi Lawson',
    summary: 'School created · Lagoon View College',
    schoolName: 'Lagoon View College',
    entity: 'School',
  },
];

const ip = {
  tolu: '102.89.34.12 · Chrome, macOS',
  ngozi: '102.89.11.7 · Chrome, Windows',
  ada: '41.58.200.3 · Safari, macOS',
};
export const auditLog: AuditEntry[] = [
  {
    id: '1',
    timestamp: '8 Dec 2026 · 09:02:14',
    actor: 'Ngozi Okafor',
    action: 'support_session.approve',
    entity: 'Support session',
    entityId: 'SS-0412',
    previousValue: '—',
    newValue: 'Kingsway · read-only · 30 min',
    ipDevice: ip.ngozi,
    requestId: 'req_1ywm',
  },
  {
    id: '2',
    timestamp: '6 Dec 2026 · 15:40:02',
    actor: 'Ada Eze',
    action: 'plan.update_price',
    entity: 'Plan',
    entityId: 'plan_growth',
    previousValue: '₦1,650,000',
    newValue: '₦1,850,000',
    ipDevice: ip.ada,
    requestId: 'req_1ywn',
  },
  {
    id: '3',
    timestamp: '5 Dec 2026 · 10:11:47',
    actor: ME.name,
    action: 'user.invite',
    entity: 'User',
    entityId: 'u6',
    previousValue: '—',
    newValue: 'dayo@edutrack.ng · Support Agent',
    ipDevice: ip.tolu,
    requestId: 'req_1ywo',
  },
  {
    id: '4',
    timestamp: '2 Dec 2026 · 11:15:30',
    actor: ME.name,
    action: 'school.suspend',
    entity: 'School',
    entityId: 'starlight',
    previousValue: 'Active',
    newValue: 'Suspended',
    ipDevice: ip.tolu,
    requestId: 'req_1ywp',
  },
  {
    id: '5',
    timestamp: '1 Dec 2026 · 00:00:00',
    actor: 'System',
    action: 'subscription.enter_grace',
    entity: 'Subscription',
    entityId: 'unity',
    previousValue: 'Active',
    newValue: 'Grace period',
    ipDevice: '—',
    requestId: 'req_1ywq',
  },
  {
    id: '6',
    timestamp: '28 Nov 2026 · 16:02:09',
    actor: ME.name,
    action: 'user.change_role',
    entity: 'User',
    entityId: 'u5',
    previousValue: 'Support Agent',
    newValue: 'Platform Operations',
    ipDevice: ip.tolu,
    requestId: 'req_1ywr',
  },
  {
    id: '7',
    timestamp: '20 Nov 2026 · 09:30:55',
    actor: 'Ngozi Okafor',
    action: 'auth.failed_login_lockout',
    entity: 'User',
    entityId: 'u8',
    previousValue: '5 failed attempts',
    newValue: 'Locked 15 min',
    ipDevice: '197.210.x.x · Unknown',
    requestId: 'req_1yws',
  },
];

/*
 * Older history so lists have several pages: one entry every ~1.5 days from 24 Nov back to
 * mid-September 2026, cycling through realistic actions, actors and schools.
 */
(() => {
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const actors = ['Ngozi Okafor', 'Ada Eze', 'Femi Lawson', 'Ibrahim Yusuf', ME.name, 'System'];
  const events: [ActivityEntity, string, string, string, string][] = [
    ['Subscription', 'Subscription renewed', 'subscription.renew', 'Expiring', 'Active'],
    ['Issue', 'Support issue resolved', 'issue.transition', 'In Progress', 'Resolved'],
    ['User', 'Password reset sent', 'user.password-reset', '—', 'Link sent'],
    ['School', 'School details edited', 'school.update', 'Contact updated', 'Saved'],
    [
      'Support session',
      'Support session approved',
      'support_session.approve',
      '—',
      'Read-only · 30 min',
    ],
    ['Subscription', 'Grace period started', 'subscription.enter_grace', 'Active', 'Grace period'],
    ['Issue', 'Support issue created', 'issue.create', '—', 'Open'],
    ['Plan', 'Plan limits reviewed', 'plan.update', '1,400 students', '1,500 students'],
  ];
  const schoolNames = schools.map((s) => s.name);
  const start = new Date(2026, 10, 24);
  for (let i = 0; i < 48; i++) {
    const day = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() - Math.round(i * 1.5),
    );
    const date = `${day.getDate()} ${MONTHS[day.getMonth()]}`;
    const [entity, summary, action, previousValue, newValue] = events[i % events.length]!;
    const actor = actors[i % actors.length]!;
    const schoolName =
      entity === 'User' || entity === 'Plan' ? '—' : schoolNames[i % schoolNames.length]!;
    const time = `${String(8 + (i % 9)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}`;
    activity.push({
      id: `h${i}`,
      when: date,
      actor,
      summary: `${summary}${schoolName === '—' ? '' : ` · ${schoolName}`}`,
      schoolName,
      entity,
    });
    auditLog.push({
      id: `h${i}`,
      timestamp: `${date} ${day.getFullYear()} · ${time}:${String((i * 7) % 60).padStart(2, '0')}`,
      actor,
      action,
      entity,
      entityId: schoolName === '—' ? `u${(i % 9) + 1}` : schools[i % schools.length]!.id,
      previousValue,
      newValue,
      ipDevice:
        actor === 'System'
          ? '—'
          : [
              '102.89.34.12 · Chrome, macOS',
              '41.58.200.3 · Safari, macOS',
              '102.89.11.7 · Chrome, Windows',
            ][i % 3]!,
      requestId: `req_${(90000 + i * 13).toString(36)}`,
    });
  }
})();

let auditSeq = auditLog.length;
/**
 * Records a privileged action the way the API will: a plain-language activity item plus an
 * append-only audit entry with the before and after values.
 */
export function audit(entry: {
  summary: string;
  action: string;
  entity: ActivityEntity;
  entityId: string;
  schoolName?: string;
  previous?: string;
  next?: string;
}) {
  auditSeq += 1;
  activity.unshift({
    id: `a${auditSeq}-new`,
    when: 'Just now',
    actor: ME.name,
    summary: entry.summary,
    schoolName: entry.schoolName ?? '—',
    entity: entry.entity,
  });
  auditLog.unshift({
    id: String(auditSeq),
    timestamp: '8 Dec 2026 · just now',
    actor: ME.name,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    previousValue: entry.previous ?? '—',
    newValue: entry.next ?? '—',
    ipDevice: ip.tolu,
    requestId: `req_${(91520 + auditSeq).toString(36)}`,
  });
}

export const profile = {
  firstName: 'Tolu',
  lastName: 'Bamidele',
  phone: '0803 412 7781',
  avatarUrl: null as string | null,
};

export const notificationPreferences = [
  ['User invitation', [true, true, false]],
  ['Subscription expiring', [true, true, true]],
  ['Subscription overdue', [true, true, true]],
  ['School provisioned', [true, true, false]],
  ['Support issue created', [true, false, false]],
  ['Support issue urgent', [true, true, true]],
  ['Security alert', [true, true, true]],
] as [string, [boolean, boolean, boolean]][];

export const securityToggles = { newDeviceAlerts: true, ipRestriction: false };

export const notifications = [
  {
    id: 'n1',
    title: 'Urgent issue SUP-1182 from Kingsway',
    detail: 'Support · assigned to Ngozi Okafor',
    when: '10:42',
    unread: true,
    to: '/support/SUP-1182',
  },
  {
    id: 'n2',
    title: 'Unity Model College grace period ends 15 Dec',
    detail: 'Subscriptions',
    when: '1 Dec',
    unread: true,
    to: '/schools/unity/subscription',
  },
  {
    id: 'n3',
    title: "Chika Obi's invitation expired",
    detail: 'Users',
    when: '27 Nov',
    unread: false,
    to: '/users/u7',
  },
];
