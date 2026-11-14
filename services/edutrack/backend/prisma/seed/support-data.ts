import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  SupportTeam,
  TicketCategory,
  TicketMessageKind,
  TicketPriority,
  TicketStatus,
  Tone,
} from '../../src/generated/prisma/enums.js';
import { AUTO_CLOSE_DAYS, TEAM_LABEL } from '../../src/platform/support/support-desk.js';
import { subtractWorkingMs } from '../../src/platform/support/working-time.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Nigerian public holidays (the support SLA clock skips them). Islamic holidays are estimates;
 * the Federal Government confirms them each year.
 */
const HOLIDAYS: [string, string][] = [
  ['2025-01-01', 'New Year’s Day'],
  ['2025-03-31', 'Eid al-Fitr'],
  ['2025-04-01', 'Eid al-Fitr holiday'],
  ['2025-04-18', 'Good Friday'],
  ['2025-04-21', 'Easter Monday'],
  ['2025-05-01', 'Workers’ Day'],
  ['2025-06-06', 'Eid al-Adha'],
  ['2025-06-12', 'Democracy Day'],
  ['2025-09-05', 'Eid-el-Maulud'],
  ['2025-10-01', 'Independence Day'],
  ['2025-12-25', 'Christmas Day'],
  ['2025-12-26', 'Boxing Day'],
  ['2026-01-01', 'New Year’s Day'],
  ['2026-03-20', 'Eid al-Fitr'],
  ['2026-04-03', 'Good Friday'],
  ['2026-04-06', 'Easter Monday'],
  ['2026-05-01', 'Workers’ Day'],
  ['2026-05-27', 'Eid al-Adha'],
  ['2026-06-12', 'Democracy Day'],
  ['2026-08-26', 'Eid-el-Maulud'],
  ['2026-10-01', 'Independence Day'],
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-28', 'Boxing Day holiday'],
  ['2027-01-01', 'New Year’s Day'],
  ['2027-03-10', 'Eid al-Fitr'],
  ['2027-03-26', 'Good Friday'],
  ['2027-03-29', 'Easter Monday'],
  ['2027-05-03', 'Workers’ Day holiday'],
  ['2027-05-17', 'Eid al-Adha'],
  ['2027-06-14', 'Democracy Day holiday'],
  ['2027-08-16', 'Eid-el-Maulud'],
  ['2027-10-01', 'Independence Day'],
  ['2027-12-27', 'Christmas Day holiday'],
  ['2027-12-28', 'Boxing Day holiday'],
];

type SchoolKey = 'kingsway' | 'brookfield' | 'unity' | 'hillcrest' | 'greenfield' | 'pinnacle';
type StaffKey = 'tolu' | 'ngozi' | 'ibrahim' | 'funmi';

interface Msg {
  /** Hours after the ticket was raised (clock time). */
  at: number;
  kind: TicketMessageKind;
  by: string;
  role: string;
  text: string;
}
interface Ev {
  at: number;
  title: string;
  by: StaffKey | null;
  tone?: Tone;
  internal?: boolean;
  to?: TicketStatus;
}
interface TicketSeed {
  number: string;
  school: SchoolKey;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  team: SupportTeam;
  assignee: StaffKey | null;
  requester: string;
  /** Raised this many working hours ago, so the SLA clocks read the same on any day. */
  ageHours: number;
  firstReplyAfter?: number;
  /** For paused tickets: paused this many hours after being raised. */
  pausedAfter?: number;
  holdReason?: string;
  escalatedTo?: string;
  escalatedFrom?: StaffKey;
  resolution?: string;
  resolutionType?: string;
  resolvedAfter?: number;
  closedAfter?: number;
  reopenCount?: number;
  rating?: [number, string];
  messages: Msg[];
  events?: Ev[];
}

const school = (role: string, name: string) => `${role} · ${name}`;

const TICKETS: TicketSeed[] = [
  {
    number: 'SUP-1182',
    school: 'kingsway',
    subject: 'Unable to publish results for SSS 2C',
    category: 'ACADEMIC',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    team: 'TIER_1_SUPPORT',
    assignee: 'ngozi',
    requester: 'Mrs. Ifeoma Briggs · School Admin',
    ageHours: 2.5,
    firstReplyAfter: 0.35,
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Mrs. Ifeoma Briggs',
        role: school('School Admin', 'Kingsway International School'),
        text: 'We are unable to publish results for SSS 2C. Every subject shows Approved, but the Publish button stays disabled.',
      },
      {
        at: 0.35,
        kind: 'AGENT',
        by: 'Ngozi Okafor',
        role: 'Support',
        text: 'Thanks, Mrs. Briggs. We’re checking the result approval state for SSS 2C now.',
      },
      {
        at: 0.55,
        kind: 'NOTE',
        by: 'Ngozi Okafor',
        role: 'Internal note',
        text: 'Chemistry SSS 2 assessment scheme sums to 90% (CA 1 15 + CA 2 15 + Exam 60). Publishing is blocked by the weight check. Likely cause.',
      },
      {
        at: 0.75,
        kind: 'AGENT',
        by: 'Ngozi Okafor',
        role: 'Support',
        text: 'We’ve found the cause: the Chemistry assessment scheme for SSS 2 adds up to 90%, so totals can’t be finalised. Could your Exams Officer set CA 1 to 20% under Assessments & Grading? Publishing will then unlock.',
      },
    ],
    events: [
      {
        at: 0.2,
        title: 'Priority High → Urgent',
        by: 'ngozi',
        tone: 'WARNING',
        internal: true,
      },
      {
        at: 0.35,
        title: 'Picked up by Ngozi Okafor · first reply sent',
        by: 'ngozi',
        to: 'IN_PROGRESS',
      },
    ],
  },
  {
    number: 'SUP-1180',
    school: 'brookfield',
    subject: 'Paystack payments not reconciling to invoices',
    category: 'BILLING',
    priority: 'HIGH',
    status: 'ESCALATED',
    team: 'BILLING',
    assignee: 'funmi',
    requester: 'Mrs. Toyin Bello · School Admin',
    ageHours: 5,
    firstReplyAfter: 0.45,
    escalatedTo: 'Billing specialist',
    escalatedFrom: 'tolu',
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Mrs. Toyin Bello',
        role: school('School Admin', 'Brookfield Schools'),
        text: 'Twelve Paystack payments from last week show as received in Paystack but the invoices are still unpaid.',
      },
      {
        at: 0.45,
        kind: 'AGENT',
        by: 'Tolu Bamidele',
        role: 'Support',
        text: 'Thanks, Mrs. Bello. We can see the payments on our side; we’re checking why they didn’t match.',
      },
    ],
    events: [
      {
        at: 0.45,
        title: 'Picked up by Tolu Bamidele · first reply sent',
        by: 'tolu',
        to: 'IN_PROGRESS',
      },
      {
        at: 1.4,
        title:
          'Escalated to Billing specialist (Funmi Adebayo) by Tolu Bamidele · payments need matching by hand',
        by: 'tolu',
        tone: 'ERROR',
        to: 'ESCALATED',
      },
    ],
  },
  {
    number: 'SUP-1179',
    school: 'unity',
    subject: 'Parents not receiving SMS notifications',
    category: 'TECHNICAL',
    priority: 'HIGH',
    status: 'WAITING_FOR_SCHOOL',
    team: 'TECHNICAL',
    assignee: 'ibrahim',
    requester: 'Mr. Sani Aliyu · Bursar',
    ageHours: 12,
    firstReplyAfter: 2,
    pausedAfter: 3,
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Mr. Sani Aliyu',
        role: school('Bursar', 'Unity Model College'),
        text: 'Parents say they stopped getting SMS for fee reminders this week. Email still works.',
      },
      {
        at: 2,
        kind: 'AGENT',
        by: 'Ibrahim Yusuf',
        role: 'Support',
        text: 'Thanks, Mr. Aliyu. The gateway shows your sender ID was rejected on Monday. Could you confirm whether you changed it in Communication settings?',
      },
    ],
    events: [
      { at: 2, title: 'Work started by Ibrahim Yusuf', by: 'ibrahim', to: 'IN_PROGRESS' },
      {
        at: 3,
        title: 'Waiting for the school · SLA paused',
        by: 'ibrahim',
        to: 'WAITING_FOR_SCHOOL',
      },
    ],
  },
  {
    number: 'SUP-1176',
    school: 'brookfield',
    subject: 'Help importing 600 students from Excel',
    category: 'ACADEMIC',
    priority: 'NORMAL',
    status: 'IN_PROGRESS',
    team: 'TECHNICAL',
    assignee: 'ibrahim',
    requester: 'Mrs. Toyin Bello · School Admin',
    ageHours: 66,
    firstReplyAfter: 4,
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Mrs. Toyin Bello',
        role: school('School Admin', 'Brookfield Schools'),
        text: 'We have 600 students in an Excel sheet from our old system. Can you help us import them with their classes?',
      },
      {
        at: 4,
        kind: 'AGENT',
        by: 'Ibrahim Yusuf',
        role: 'Support',
        text: 'Happy to help. Please send the sheet; we’ll map the columns to the import template and run a test with one class first.',
      },
    ],
    events: [{ at: 4, title: 'Work started by Ibrahim Yusuf', by: 'ibrahim', to: 'IN_PROGRESS' }],
  },
  {
    number: 'SUP-1174',
    school: 'hillcrest',
    subject: 'Renewal invoice shows the wrong student count',
    category: 'BILLING',
    priority: 'NORMAL',
    status: 'OPEN',
    team: 'BILLING',
    assignee: null,
    requester: 'Mrs. Bola Ajayi · Proprietor',
    ageHours: 10,
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Mrs. Bola Ajayi',
        role: school('Proprietor', 'Hillcrest College'),
        text: 'Our renewal invoice is for 540 students but we have 498 enrolled this term.',
      },
    ],
  },
  {
    number: 'SUP-1171',
    school: 'greenfield',
    subject: 'Bursar cannot see payroll approval button',
    category: 'ACCESS',
    priority: 'LOW',
    status: 'OPEN',
    team: 'TECHNICAL',
    assignee: null,
    requester: 'Mr. Kunle Bakare · Bursar',
    ageHours: 14,
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Mr. Kunle Bakare',
        role: school('Bursar', 'Greenfield Academy'),
        text: 'I can prepare payroll but the Approve button doesn’t show for me.',
      },
    ],
  },
  {
    number: 'SUP-1170',
    school: 'greenfield',
    subject: 'Change sibling discount rule',
    category: 'FINANCE',
    priority: 'NORMAL',
    status: 'RESOLVED',
    team: 'TIER_1_SUPPORT',
    assignee: 'ngozi',
    requester: 'Mrs. Adaeze Okonkwo · Principal',
    ageHours: 30,
    firstReplyAfter: 2,
    resolvedAfter: 20,
    resolution: 'Explained how to edit the sibling rule under Finance → Fees → Discounts.',
    resolutionType: 'Guidance given',
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Mrs. Adaeze Okonkwo',
        role: school('Principal', 'Greenfield Academy'),
        text: 'We want the sibling discount to apply from the second child, not the third.',
      },
      {
        at: 20,
        kind: 'AGENT',
        by: 'Ngozi Okafor',
        role: 'Support',
        text: 'Explained how to edit the sibling rule under Finance → Fees → Discounts.',
      },
    ],
    events: [
      { at: 2, title: 'Work started by Ngozi Okafor', by: 'ngozi', to: 'IN_PROGRESS' },
      {
        at: 20,
        title:
          'Resolved · Guidance given · “Explained how to edit the sibling rule under Finance → Fees → Discounts.”',
        by: 'ngozi',
        tone: 'SUCCESS',
        to: 'RESOLVED',
      },
    ],
  },
  {
    number: 'SUP-1163',
    school: 'pinnacle',
    subject: 'Request account suspension',
    category: 'ACCOUNT',
    priority: 'NORMAL',
    status: 'CLOSED',
    team: 'TIER_1_SUPPORT',
    assignee: 'tolu',
    requester: 'Mr. Obi Nnaji · Proprietor',
    ageHours: 120,
    firstReplyAfter: 2,
    resolvedAfter: 20,
    closedAfter: 30,
    resolution: 'School suspended at the proprietor’s request. Data retained.',
    resolutionType: 'Fixed',
    rating: [5, 'Quick and clear, thank you.'],
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Mr. Obi Nnaji',
        role: school('Proprietor', 'Pinnacle Heights Academy'),
        text: 'We are pausing operations for a term. Please suspend our account but keep our data.',
      },
      {
        at: 20,
        kind: 'AGENT',
        by: 'Tolu Bamidele',
        role: 'Support',
        text: 'School suspended at the proprietor’s request. Data retained.',
      },
    ],
    events: [
      {
        at: 20,
        title: 'Resolved · Fixed · “School suspended at the proprietor’s request. Data retained.”',
        by: 'tolu',
        tone: 'SUCCESS',
        to: 'RESOLVED',
      },
      { at: 30, title: 'Closed by the school · rated 5/5', by: null, to: 'CLOSED' },
    ],
  },
  {
    number: 'SUP-1042',
    school: 'greenfield',
    subject: 'Report cards print with cut-off principal signature',
    category: 'ACADEMIC',
    priority: 'NORMAL',
    status: 'REOPENED',
    team: 'TIER_1_SUPPORT',
    assignee: 'ngozi',
    requester: 'Adaeze Okonkwo · School Admin',
    ageHours: 50,
    firstReplyAfter: 0.8,
    reopenCount: 1,
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Adaeze Okonkwo',
        role: school('School Admin', 'Greenfield Academy'),
        text: 'When we print report cards for JSS 2, the principal’s signature is cut off at the bottom.',
      },
      {
        at: 0.45,
        kind: 'NOTE',
        by: 'Ngozi Okafor',
        role: 'Internal note',
        text: 'Likely the A4 vs Letter page setting on the JSS template. Checking before asking for the PDF.',
      },
      {
        at: 0.8,
        kind: 'AGENT',
        by: 'Ngozi Okafor',
        role: 'Support',
        text: 'Thanks. Could you tell us which template you’re using and send one exported PDF?',
      },
    ],
    events: [
      {
        at: 24,
        title: 'Resolved · Fixed · “Template set to A4.”',
        by: 'ngozi',
        tone: 'SUCCESS',
        to: 'RESOLVED',
      },
      { at: 48, title: 'Reopened by the school', by: null, tone: 'WARNING', to: 'REOPENED' },
    ],
  },
  {
    number: 'SUP-1031',
    school: 'greenfield',
    subject: 'Bulk SMS to parents not delivered on MTN numbers',
    category: 'TECHNICAL',
    priority: 'HIGH',
    status: 'ON_HOLD',
    team: 'TECHNICAL',
    assignee: 'ibrahim',
    requester: 'Adaeze Okonkwo · School Admin',
    ageHours: 30,
    firstReplyAfter: 3,
    pausedAfter: 3.5,
    holdReason: 'SMS or WhatsApp provider',
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Adaeze Okonkwo',
        role: school('School Admin', 'Greenfield Academy'),
        text: 'About 40 MTN numbers show Failed in delivery logs for the PTA notice.',
      },
      {
        at: 3.5,
        kind: 'AGENT',
        by: 'Ibrahim Yusuf',
        role: 'Support',
        text: 'We’ve escalated to our SMS provider. Email and in-app copies were delivered.',
      },
    ],
    events: [
      { at: 3, title: 'Work started by Ibrahim Yusuf', by: 'ibrahim', to: 'IN_PROGRESS' },
      {
        at: 3.5,
        title: 'On hold · SMS or WhatsApp provider · SLA paused',
        by: 'ibrahim',
        to: 'ON_HOLD',
      },
    ],
  },
  {
    number: 'SUP-0998',
    school: 'greenfield',
    subject: 'Add Lekki Campus to our plan',
    category: 'BILLING',
    priority: 'NORMAL',
    status: 'CLOSED',
    team: 'BILLING',
    assignee: 'tolu',
    requester: 'Adaeze Okonkwo · School Admin',
    ageHours: 300,
    firstReplyAfter: 2,
    resolvedAfter: 24,
    closedAfter: 26,
    resolution: 'Lekki Campus added. The plan now covers 2 branches.',
    resolutionType: 'Fixed',
    rating: [4, ''],
    messages: [
      {
        at: 0,
        kind: 'SCHOOL',
        by: 'Adaeze Okonkwo',
        role: school('School Admin', 'Greenfield Academy'),
        text: 'We are opening a second campus in Lekki. Please add it to our plan.',
      },
      {
        at: 24,
        kind: 'AGENT',
        by: 'Tolu Bamidele',
        role: 'Support',
        text: 'Lekki Campus added. The plan now covers 2 branches.',
      },
    ],
    events: [
      {
        at: 24,
        title: 'Resolved · Fixed · “Lekki Campus added. The plan now covers 2 branches.”',
        by: 'tolu',
        tone: 'SUCCESS',
        to: 'RESOLVED',
      },
      { at: 26, title: 'Closed by the school · rated 4/5', by: null, to: 'CLOSED' },
    ],
  },
];

/** Older closed tickets, so the volume and category charts have a few weeks of history. */
const HISTORY_SUBJECTS: [TicketCategory, string][] = [
  ['TECHNICAL', 'Attendance app not syncing on one tablet'],
  ['ACADEMIC', 'How do we carry over CA scores to second term?'],
  ['BILLING', 'Request a receipt for last term’s payment'],
  ['ACCESS', 'Teacher locked out after password resets'],
  ['FINANCE', 'Late fee applied to a scholarship student'],
  ['ACADEMIC', 'Timetable clash between two arms'],
  ['ACCOUNT', 'Change the school’s contact email'],
  ['TECHNICAL', 'Report card PDF takes long to generate'],
  ['SUBSCRIPTION', 'What happens to our data if we downgrade?'],
  ['ACADEMIC', 'Promote JSS 3 students to SSS 1'],
];
const HISTORY_SCHOOLS: SchoolKey[] = [
  'kingsway',
  'brookfield',
  'kingsway',
  'unity',
  'greenfield',
  'kingsway',
  'brookfield',
  'hillcrest',
];
const HISTORY_STAFF: StaffKey[] = ['ngozi', 'ibrahim', 'funmi', 'tolu'];

function historyTickets(): TicketSeed[] {
  return Array.from({ length: 36 }, (_, i) => {
    const [category, subject] = HISTORY_SUBJECTS[i % HISTORY_SUBJECTS.length]!;
    const staff = HISTORY_STAFF[i % HISTORY_STAFF.length]!;
    const rated = i % 3 !== 2;
    return {
      number: `SUP-${1101 + i}`,
      school: HISTORY_SCHOOLS[i % HISTORY_SCHOOLS.length]!,
      subject,
      category,
      priority: i % 7 === 0 ? 'HIGH' : i % 5 === 0 ? 'LOW' : 'NORMAL',
      status: 'CLOSED',
      team: category === 'BILLING' || category === 'SUBSCRIPTION' ? 'BILLING' : 'TIER_1_SUPPORT',
      assignee: staff,
      requester: 'School Admin',
      // Spread over the last ten weeks.
      ageHours: 18 + i * 9.5,
      firstReplyAfter: 1 + (i % 4),
      resolvedAfter: 6 + (i % 5) * 3,
      closedAfter: 8 + (i % 5) * 3,
      resolution: 'Answered and confirmed by the school.',
      resolutionType: i % 4 === 0 ? 'Fixed' : 'Guidance given',
      rating: rated ? [i % 5 === 0 ? 3 : i % 2 === 0 ? 5 : 4, ''] : undefined,
      messages: [
        { at: 0, kind: 'SCHOOL', by: 'School Admin', role: 'School Admin', text: subject },
      ],
    } satisfies TicketSeed;
  });
}

const STAFF_EMAIL: Record<StaffKey, string> = {
  tolu: 'tolu@edutrack.ng',
  ngozi: 'ngozi@edutrack.ng',
  ibrahim: 'ibrahim@edutrack.ng',
  funmi: 'funmi@edutrack.ng',
};

/**
 * Public holidays and the support desk's demo tickets. Re-seeding replaces every ticket (tickets
 * staff raised while trying things out go too) and restarts numbering after the demo ones.
 */
export async function seedSupportDesk(prisma: PrismaClient, now: Date) {
  for (const [day, name] of HOLIDAYS) {
    const date = new Date(`${day}T00:00:00Z`);
    await prisma.publicHoliday.upsert({
      where: { country_date_name: { country: 'NG', date, name } },
      create: { country: 'NG', date, name },
      update: {},
    });
  }
  const holidays = new Set(HOLIDAYS.map(([day]) => day));

  await prisma.supportSession.updateMany({
    where: { ticketId: { not: null } },
    data: { ticketId: null },
  });
  await prisma.supportTicketAttachment.deleteMany({});
  await prisma.supportTicketEvent.deleteMany({});
  await prisma.supportTicketMessage.deleteMany({});
  await prisma.supportTicket.updateMany({ data: { followUpOfId: null } });
  await prisma.supportTicket.deleteMany({});

  const schools = await prisma.school.findMany({
    where: {
      slug: { in: ['kingsway', 'brookfield', 'unity', 'hillcrest', 'greenfield', 'pinnacle'] },
    },
    select: { id: true, slug: true, name: true },
  });
  const schoolBy = new Map(schools.map((s) => [s.slug, s]));
  const staff = await prisma.user.findMany({
    where: { email: { in: Object.values(STAFF_EMAIL) } },
    select: { id: true, email: true },
  });
  const staffId = (key: StaffKey) => staff.find((s) => s.email === STAFF_EMAIL[key])!.id;
  const adaeze = await prisma.user.findUnique({
    where: { email: 'adaeze.okonkwo@greenfield.edu.ng' },
    select: { id: true },
  });

  for (const t of [...TICKETS, ...historyTickets()]) {
    const s = schoolBy.get(t.school)!;
    const created = subtractWorkingMs(now, t.ageHours * HOUR, holidays);
    const at = (hours: number) =>
      new Date(Math.min(now.getTime(), created.getTime() + hours * HOUR));
    const lastEvent = Math.max(
      0,
      ...t.messages.map((m) => m.at),
      ...(t.events ?? []).map((e) => e.at),
      t.closedAfter ?? 0,
    );
    const resolvedAt = t.resolvedAfter === undefined ? null : at(t.resolvedAfter);
    const ticket = await prisma.supportTicket.create({
      data: {
        schoolId: s.id,
        number: t.number,
        subject: t.subject,
        description: t.messages[0]!.text,
        category: t.category,
        priority: t.priority,
        status: t.status,
        team: t.team,
        requesterName: t.requester,
        requesterUserId:
          t.school === 'greenfield' && t.requester.startsWith('Adaeze') ? adaeze?.id : null,
        assigneeUserId: t.assignee ? staffId(t.assignee) : null,
        escalatedTo: t.escalatedTo ?? null,
        escalatedFromUserId: t.escalatedFrom ? staffId(t.escalatedFrom) : null,
        holdReason: t.holdReason ?? null,
        resolution: t.resolution ?? null,
        resolutionType: t.resolutionType ?? null,
        firstReplyAt: t.firstReplyAfter === undefined ? null : at(t.firstReplyAfter),
        resolvedAt,
        autoCloseAt:
          t.status === 'RESOLVED' && resolvedAt
            ? new Date(resolvedAt.getTime() + AUTO_CLOSE_DAYS * DAY)
            : null,
        closedAt: t.closedAfter === undefined ? null : at(t.closedAfter),
        pausedSince: t.pausedAfter === undefined ? null : at(t.pausedAfter),
        reopenCount: t.reopenCount ?? 0,
        ratingScore: t.rating?.[0] ?? null,
        ratingComment: t.rating?.[1] || null,
        createdAt: created,
        updatedAt: at(lastEvent),
      },
    });
    for (const m of t.messages)
      await prisma.supportTicketMessage.create({
        data: {
          schoolId: s.id,
          ticketId: ticket.id,
          kind: m.kind,
          authorName: m.by,
          // School messages name the school as it is now (e.g. "Bursar · Unity Model College").
          authorRole: m.kind === 'SCHOOL' ? `${m.role.split(' · ')[0]} · ${s.name}` : m.role,
          authorUserId: STAFF_EMAIL[m.by.split(' ')[0]!.toLowerCase() as StaffKey]
            ? staffId(m.by.split(' ')[0]!.toLowerCase() as StaffKey)
            : null,
          body: m.text,
          createdAt: at(m.at),
        },
      });
    const author = t.requester.split(' · ')[0];
    const events: Ev[] = [
      {
        at: 0,
        title: 'Created',
        by: null,
        to: 'OPEN',
      },
      ...(t.events ?? []),
    ];
    for (const e of events)
      await prisma.supportTicketEvent.create({
        data: {
          schoolId: s.id,
          ticketId: ticket.id,
          title: e.title,
          detail:
            e.at === 0 && e.title === 'Created'
              ? `by ${author} · routed to ${TEAM_LABEL[t.team]}`
              : null,
          tone: e.tone ?? 'INFO',
          toStatus: e.to ?? null,
          actorUserId: e.by ? staffId(e.by) : null,
          visibleToSchool: !e.internal,
          createdAt: at(e.at),
        },
      });
  }

  await prisma.platformSequence.upsert({
    where: { kind_scope: { kind: 'TICKET', scope: '' } },
    create: { kind: 'TICKET', scope: '', nextValue: 1183 },
    update: { nextValue: 1183 },
  });
}
