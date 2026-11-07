/*
 * The messages EduTrack sends on a school's behalf: which events exist, who gets them, the
 * channels each can use and the default wording. Schools can switch channels and events in
 * Settings → Notifications and reword templates in Delivery Logs → Templates.
 */
import { smsLength, smsSafe } from '@/lib/sms';
import type { Channel, ChannelTemplate, CommsEvent } from '@/types';

export { smsLength, smsSafe };

export interface EventDef {
  key: CommsEvent;
  label: string;
  description: string;
  who: string;
  available: Channel[];
  defaults: Channel[];
  /** Why it can't be switched off (empty = it can). */
  locked: string;
  /** Channel that must stay on when locked. */
  required?: Channel;
  trigger: string;
  /** Quiet hours hold SMS for these; transactional messages go out straight away. */
  quiet: boolean;
  variables: { name: string; description: string; sample: string }[];
  templates: Partial<Record<Channel, ChannelTemplate>>;
}

const v = (name: string, description: string, sample: string) => ({ name, description, sample });

const PARENT = v('parent_name', 'Fee payer or guardian', 'Mrs. Funke Adeyemi');
const STUDENT = v('student_name', 'Student', 'Emmanuel Adeyemi');
const SCHOOL = v('school_name', 'Your school', 'Greenfield Academy');
const ACCOUNT = v(
  'account_details',
  'Bank, account number and name parents pay into',
  'GTBank 0123456789 (Greenfield Academy)',
);
const REFERENCE = v('reference', 'Transfer narration to use', 'STU-2024-0187');

export const EVENTS: EventDef[] = [
  {
    key: 'admission',
    label: 'Admission',
    description: 'Welcomes the guardian when a student is admitted.',
    who: 'Guardian',
    available: ['Email', 'SMS'],
    defaults: ['Email', 'SMS'],
    locked: '',
    trigger: 'Students → Admissions',
    quiet: false,
    variables: [
      PARENT,
      STUDENT,
      v('admission_no', 'Admission number', 'STU-2026-0412'),
      v('class', 'Class', 'JSS 1A'),
      SCHOOL,
    ],
    templates: {
      Email: {
        subject: '[student_name] has been admitted to [school_name]',
        body: 'Dear [parent_name],\n\n[student_name] has been admitted into [class] at [school_name]. Their admission number is [admission_no].\n\nWe look forward to working with you.',
      },
      SMS: {
        subject: '',
        body: '[school_name]: [student_name] is admitted into [class]. Admission no: [admission_no]. Welcome!',
      },
    },
  },
  {
    key: 'parent.invitation',
    label: 'Parent invitation',
    description: 'Invites a guardian to set up their Parent Portal account.',
    who: 'Guardian',
    available: ['Email', 'SMS'],
    defaults: ['Email', 'SMS'],
    locked: 'Guardians need this to sign in to the Parent Portal.',
    required: 'Email',
    trigger: 'Students → Parents / Guardians',
    quiet: false,
    variables: [
      PARENT,
      SCHOOL,
      v('children', 'Children linked to them', 'Emmanuel and Michael'),
      v('invite_link', 'Link to set up their account', 'https://parents.edutrack.ng/i/8KQ2'),
    ],
    templates: {
      Email: {
        subject: 'Your [school_name] Parent Portal invitation',
        body: 'Dear [parent_name],\n\n[school_name] has invited you to the Parent Portal, where you can follow [children]’s results, fees and announcements.\n\nSet up your account: [invite_link]\n\nThe link expires in 7 days.',
      },
      SMS: {
        subject: '',
        body: '[school_name] invites you to the Parent Portal. Set up your account: [invite_link]',
      },
    },
  },
  {
    key: 'staff.invitation',
    label: 'Staff invitation',
    description: 'Invites a staff member to set up their account.',
    who: 'Staff member',
    available: ['Email', 'SMS'],
    defaults: ['Email'],
    locked: 'Staff need this to sign in.',
    required: 'Email',
    trigger: 'Staff · Users & Roles',
    quiet: false,
    variables: [
      v('staff_name', 'Staff member', 'Mr. Tunde Nwankwo'),
      SCHOOL,
      v('role', 'Role they’re invited as', 'Teacher'),
      v('invite_link', 'Link to set up their account', 'https://app.edutrack.ng/i/R2LM'),
    ],
    templates: {
      Email: {
        subject: 'You’re invited to [school_name] on EduTrack',
        body: 'Dear [staff_name],\n\n[school_name] has invited you to EduTrack as [role].\n\nSet up your account: [invite_link]\n\nThe link expires in 7 days.',
      },
      SMS: {
        subject: '',
        body: '[school_name] invited you to EduTrack as [role]. Check your email to set up your account.',
      },
    },
  },
  {
    key: 'invoice.issued',
    label: 'Invoice issued',
    description: 'Sends a new invoice and how to pay it.',
    who: 'Fee payers',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['In-app', 'Email', 'SMS'],
    locked: '',
    trigger: 'Finance → Invoices',
    quiet: false,
    variables: [
      PARENT,
      STUDENT,
      v('invoice_no', 'Invoice number', 'INV-2026-0418'),
      v('amount', 'Invoice total', '₦185,000'),
      v('due_date', 'Due date', '15 Sep 2026'),
      v('term', 'Session and term', '2026/2027 First Term'),
      ACCOUNT,
      REFERENCE,
    ],
    templates: {
      'In-app': {
        subject: 'Invoice [invoice_no] · [amount]',
        body: '[term] fees for [student_name]: [amount], due [due_date]. Pay by transfer to [account_details] with reference [reference], then tap “I’ve made payment”.',
      },
      Email: {
        subject: '[student_name]: [term] invoice [invoice_no]',
        body: 'Dear [parent_name],\n\nInvoice [invoice_no] for [student_name] is ready: [amount], due [due_date].\n\nPay by bank transfer to [account_details]. Use [reference] as the narration so we can match your payment.\n\nAfter paying, tap “I’ve made payment” in the Parent Portal.',
      },
      SMS: {
        subject: '',
        body: '[school_name]: [term] fees for [student_name] are [amount], due [due_date]. Pay to [account_details], ref [reference].',
      },
    },
  },
  {
    key: 'fee.reminder',
    label: 'Fee reminder',
    description: 'Reminds fee payers of a balance before it’s overdue.',
    who: 'Fee payers',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['In-app', 'Email', 'SMS'],
    locked: '',
    trigger: 'Finance → Invoices → Send reminder',
    quiet: true,
    variables: [
      PARENT,
      STUDENT,
      v('balance', 'Amount owed', '₦40,000'),
      v('due_date', 'Due date', '15 Sep 2026'),
      ACCOUNT,
      REFERENCE,
    ],
    templates: {
      'In-app': {
        subject: 'Reminder: [balance] due [due_date]',
        body: '[student_name] has [balance] to pay by [due_date]. Pay to [account_details] with reference [reference].',
      },
      Email: {
        subject: 'Fee reminder for [student_name]',
        body: 'Dear [parent_name],\n\nThis is a reminder that [balance] is due for [student_name] by [due_date].\n\nPay by bank transfer to [account_details] using [reference] as the narration.',
      },
      SMS: {
        subject: '',
        body: '[school_name]: reminder, [balance] for [student_name] is due [due_date]. Pay to [account_details], ref [reference].',
      },
    },
  },
  {
    key: 'fee.overdue',
    label: 'Overdue fee',
    description: 'Tells fee payers a balance is past its due date.',
    who: 'Fee payers',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['In-app', 'SMS'],
    locked: '',
    trigger: 'Finance → Invoices → Send reminder',
    quiet: true,
    variables: [
      PARENT,
      STUDENT,
      v('balance', 'Amount owed', '₦185,000'),
      v('days_overdue', 'Days past due', '12'),
      ACCOUNT,
      REFERENCE,
    ],
    templates: {
      'In-app': {
        subject: '[balance] overdue',
        body: '[student_name]’s fees of [balance] are [days_overdue] days overdue. Pay to [account_details] with reference [reference].',
      },
      Email: {
        subject: 'Overdue fees for [student_name]',
        body: 'Dear [parent_name],\n\n[balance] for [student_name] is now [days_overdue] days overdue. Please pay by bank transfer to [account_details] using [reference] as the narration, or contact the bursary to agree a plan.',
      },
      SMS: {
        subject: '',
        body: '[school_name]: [balance] for [student_name] is [days_overdue] days overdue. Pay to [account_details], ref [reference].',
      },
    },
  },
  {
    key: 'installment.due',
    label: 'Installment due',
    description: 'Sent 3 days before an installment on a payment plan is due.',
    who: 'Fee payers',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['SMS'],
    locked: '',
    trigger: 'Automatic, from payment plans',
    quiet: true,
    variables: [
      PARENT,
      STUDENT,
      v('amount', 'Installment amount', '₦40,000'),
      v('due_date', 'Due date', '28 Nov 2026'),
      ACCOUNT,
      REFERENCE,
    ],
    templates: {
      'In-app': {
        subject: 'Installment of [amount] due [due_date]',
        body: 'The next installment for [student_name] is [amount], due [due_date].',
      },
      Email: {
        subject: 'Installment due for [student_name]',
        body: 'Dear [parent_name],\n\nThe next installment for [student_name], [amount], is due on [due_date]. Pay to [account_details] using [reference].',
      },
      SMS: {
        subject: '',
        body: '[school_name]: installment of [amount] for [student_name] is due [due_date]. Pay to [account_details], ref [reference].',
      },
    },
  },
  {
    key: 'payment.details',
    label: 'Payment details sent',
    description: 'Sends the school’s account and transfer reference on request.',
    who: 'Fee payer',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['Email', 'SMS'],
    locked: '',
    trigger: 'Finance → Student account → Send payment details',
    quiet: false,
    variables: [PARENT, STUDENT, v('balance', 'Amount owed', '₦40,000'), ACCOUNT, REFERENCE],
    templates: {
      'In-app': {
        subject: 'How to pay [balance]',
        body: 'Pay [balance] for [student_name] to [account_details] with reference [reference].',
      },
      Email: {
        subject: 'How to pay [student_name]’s fees',
        body: 'Dear [parent_name],\n\n[student_name] owes [balance]. Pay by bank transfer to [account_details] using [reference] as the narration, then tap “I’ve made payment” in the Parent Portal.',
      },
      SMS: {
        subject: '',
        body: '[school_name]: pay [balance] for [student_name] to [account_details], ref [reference].',
      },
    },
  },
  {
    key: 'payment.confirmed',
    label: 'Payment received',
    description: 'Confirms a payment once finance has verified it, with the receipt.',
    who: 'Payer',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['In-app', 'Email', 'SMS'],
    locked: '',
    trigger: 'Finance → Payments',
    quiet: false,
    variables: [
      PARENT,
      STUDENT,
      v('amount', 'Amount paid', '₦50,000'),
      v('receipt_no', 'Receipt number', 'RCP-2026-1042'),
      v('balance', 'Balance left', '₦0'),
    ],
    templates: {
      'In-app': {
        subject: 'Payment of [amount] received',
        body: 'We’ve received [amount] for [student_name]. Receipt [receipt_no]. Balance: [balance].',
      },
      Email: {
        subject: 'Receipt [receipt_no] for [student_name]',
        body: 'Dear [parent_name],\n\nThank you. We’ve received [amount] for [student_name]. Your receipt number is [receipt_no].\n\nBalance left: [balance].',
      },
      SMS: {
        subject: '',
        body: '[school_name]: [amount] received for [student_name]. Receipt [receipt_no]. Balance [balance].',
      },
    },
  },
  {
    key: 'payment.rejected',
    label: 'Payment not confirmed',
    description: 'Tells the payer a claimed transfer couldn’t be found, and why.',
    who: 'Payer',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['In-app', 'Email', 'SMS'],
    locked: '',
    trigger: 'Finance → Payments → Reject',
    quiet: false,
    variables: [
      PARENT,
      STUDENT,
      v('amount', 'Amount claimed', '₦50,000'),
      v('reason', 'Why it wasn’t confirmed', 'No matching transfer on the statement'),
    ],
    templates: {
      'In-app': {
        subject: 'We couldn’t confirm your [amount] payment',
        body: 'Your payment of [amount] for [student_name] wasn’t confirmed: [reason]. Please send proof or contact the bursary.',
      },
      Email: {
        subject: 'Payment for [student_name] not confirmed',
        body: 'Dear [parent_name],\n\nWe couldn’t confirm the [amount] payment you told us about for [student_name]: [reason].\n\nPlease send proof of payment or contact the bursary.',
      },
      SMS: {
        subject: '',
        body: '[school_name]: we couldn’t confirm your [amount] payment for [student_name]. Reason: [reason].',
      },
    },
  },
  {
    key: 'refund.paid',
    label: 'Refund processed',
    description: 'Tells the payer a refund has been paid out.',
    who: 'Payer',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['Email'],
    locked: '',
    trigger: 'Finance → Payments → Refunds',
    quiet: false,
    variables: [
      PARENT,
      STUDENT,
      v('amount', 'Refund amount', '₦10,000'),
      v('refund_no', 'Refund number', 'RF-2026-0004'),
    ],
    templates: {
      'In-app': {
        subject: 'Refund of [amount] paid',
        body: 'Refund [refund_no] of [amount] for [student_name] has been paid to you.',
      },
      Email: {
        subject: 'Refund [refund_no] paid',
        body: 'Dear [parent_name],\n\nWe’ve paid your refund [refund_no] of [amount] for [student_name]. It may take a day to reach your account.',
      },
      SMS: {
        subject: '',
        body: '[school_name]: refund [refund_no] of [amount] for [student_name] has been paid.',
      },
    },
  },
  {
    key: 'assignment.published',
    label: 'Assignment published',
    description: 'Teachers’ homework and assignments, from the Teacher Workspace.',
    who: 'Students · guardians',
    available: ['In-app', 'Email'],
    defaults: ['In-app'],
    locked: '',
    trigger: 'Teacher Workspace',
    quiet: true,
    variables: [
      STUDENT,
      v('subject', 'Subject', 'Mathematics'),
      v('title', 'Assignment', 'Algebra revision'),
      v('due_date', 'Due date', '20 Nov 2026'),
    ],
    templates: {
      'In-app': { subject: 'New [subject] assignment', body: '[title] is due [due_date].' },
      Email: {
        subject: 'New [subject] assignment for [student_name]',
        body: '[title] has been set for [student_name], due [due_date].',
      },
    },
  },
  {
    key: 'result.published',
    label: 'Result published',
    description: 'Tells families a term’s report card is ready.',
    who: 'Students · guardians',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['In-app', 'Email'],
    locked: '',
    trigger: 'Academics → Results → Publish',
    quiet: false,
    variables: [
      PARENT,
      STUDENT,
      v('term', 'Term', 'First Term'),
      v('session', 'Session', '2026/2027'),
      v('class', 'Class', 'JSS 2B'),
    ],
    templates: {
      'In-app': {
        subject: '[term] report card ready',
        body: '[student_name]’s [term] [session] report card is ready to view.',
      },
      Email: {
        subject: '[student_name]’s [term] report card',
        body: 'Dear [parent_name],\n\n[student_name]’s [term] [session] report card ([class]) is ready. Sign in to the Parent Portal to view and download it.',
      },
      SMS: {
        subject: '',
        body: '[school_name]: [student_name]’s [term] report card is ready in the Parent Portal.',
      },
    },
  },
  {
    key: 'student.exit',
    label: 'Transfer / withdrawal',
    description: 'Confirms a transfer or withdrawal to the guardian.',
    who: 'Guardian',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['Email'],
    locked: '',
    trigger: 'Students → Transfer or withdraw',
    quiet: false,
    variables: [
      PARENT,
      STUDENT,
      v('kind', 'Transfer or withdrawal', 'transfer'),
      v('effective_date', 'Effective date', '14 Nov 2026'),
    ],
    templates: {
      'In-app': {
        subject: '[student_name]’s [kind] recorded',
        body: '[student_name]’s [kind] takes effect on [effective_date].',
      },
      Email: {
        subject: '[student_name]: [kind] recorded',
        body: 'Dear [parent_name],\n\nWe’ve recorded [student_name]’s [kind], effective [effective_date]. Records and receipts stay available on request.',
      },
      SMS: {
        subject: '',
        body: '[school_name]: [student_name]’s [kind] is recorded, effective [effective_date].',
      },
    },
  },
  {
    key: 'graduation',
    label: 'Graduation',
    description: 'Congratulates the guardian when a student graduates.',
    who: 'Guardian',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['Email'],
    locked: '',
    trigger: 'Academics → Promotion',
    quiet: false,
    variables: [PARENT, STUDENT, v('session', 'Session', '2026/2027')],
    templates: {
      'In-app': {
        subject: 'Congratulations, [student_name]!',
        body: '[student_name] graduated at the end of [session].',
      },
      Email: {
        subject: 'Congratulations to [student_name]',
        body: 'Dear [parent_name],\n\n[student_name] has graduated from [school_name] at the end of [session]. Congratulations!',
      },
      SMS: { subject: '', body: '[school_name]: congratulations! [student_name] has graduated.' },
    },
  },
  {
    key: 'timetable.published',
    label: 'Timetable published',
    description: 'Tells a class’s teachers, students and guardians the timetable changed.',
    who: 'Teachers · students · guardians',
    available: ['In-app', 'Email'],
    defaults: ['In-app'],
    locked: '',
    trigger: 'Academics → Timetable → Publish',
    quiet: true,
    variables: [
      v('class', 'Class', 'JSS 2B'),
      v('term', 'Term', 'First Term'),
      v('effective_date', 'From', '14 Sep 2026'),
    ],
    templates: {
      'In-app': {
        subject: '[class] timetable updated',
        body: 'The [term] timetable for [class] is published, effective [effective_date].',
      },
      Email: {
        subject: 'New [class] timetable',
        body: 'The [term] timetable for [class] has been published and takes effect on [effective_date].',
      },
    },
  },
  {
    key: 'announcement',
    label: 'Announcement',
    description: 'Written by staff. Channels are chosen on each announcement.',
    who: 'Selected audience',
    available: ['In-app', 'Email', 'SMS'],
    defaults: ['In-app', 'Email', 'SMS'],
    locked: 'Announcements always go out on the channels picked when writing them.',
    trigger: 'Communication → Announcements',
    quiet: true,
    variables: [],
    templates: {},
  },
];

export const eventDef = (key: string) => EVENTS.find((e) => e.key === key);

/** Variables every template can use. */
export const GLOBAL_VARS = [SCHOOL];

const VAR = /\[([a-z_]+)\]/g;

export const variablesIn = (text: string) => [...text.matchAll(VAR)].map((m) => m[1]!);

export function render(text: string, vars: Record<string, string>) {
  return text.replace(VAR, (_m, name: string) => vars[name] ?? '');
}
