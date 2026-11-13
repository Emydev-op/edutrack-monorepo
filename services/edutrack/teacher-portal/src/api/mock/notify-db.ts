/**
 * In-app notifications, email preferences and record history for the mock API.
 *
 * Features send a notification with `notify(teacherIds, payload)` and record what happened to a
 * record with `logHistory(key, title, detail?, tone?)`, read back as `timelineOf(key)` (the
 * app-kit ActivityTimeline's `TimelineEntry[]`).
 */
import type { RouteLocationRaw } from 'vue-router';

import { routesPath as r } from '@/router/routes-path';
import type { TimelineEntry } from '@/types';

import { nowLocal, whenLabel } from './clock';

export type NotificationCategory =
  | 'results'
  | 'reviews'
  | 'assignments'
  | 'assessments'
  | 'lesson-notes'
  | 'register'
  | 'materials'
  | 'timetable'
  | 'announcements'
  | 'account';

export interface NotificationRecord {
  id: string;
  teacherId: string;
  title: string;
  body: string;
  category: NotificationCategory;
  /** Where opening it goes. */
  to: RouteLocationRaw;
  /** Local "YYYY-MM-DDTHH:mm" */
  createdAt: string;
  read: boolean;
}

export type NotifyPayload = Pick<NotificationRecord, 'title' | 'body' | 'category' | 'to'> & {
  /** Defaults to the demo clock's now. */
  createdAt?: string;
  /** The email preference this notification follows (see EMAIL_EVENTS); omit for in-app only. */
  emailEvent?: EmailEventKey;
};

export const NOTIFICATIONS: NotificationRecord[] = [];
/** Emails the mock "sent", for tests and the delivery story. */
export const SENT_EMAILS: { teacherId: string; event: EmailEventKey; title: string }[] = [];
let seq = 0;

/**
 * Sends an in-app notification to each teacher (in-app is always on), and an email to those who
 * kept that event's email preference on. Newest first.
 */
export function notify(teacherIds: string | string[], payload: NotifyPayload) {
  const ids = Array.isArray(teacherIds) ? teacherIds : [teacherIds];
  const { emailEvent, createdAt, ...rest } = payload;
  return ids.map((teacherId) => {
    const record: NotificationRecord = {
      id: `nt-${++seq}`,
      teacherId,
      ...rest,
      createdAt: createdAt ?? nowLocal(),
      read: false,
    };
    NOTIFICATIONS.push(record);
    if (emailEvent && wantsEmail(teacherId, emailEvent))
      SENT_EMAILS.push({ teacherId, event: emailEvent, title: rest.title });
    return record;
  });
}

export const notificationsOf = (teacherId: string) =>
  NOTIFICATIONS.filter((n) => n.teacherId === teacherId).sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id, 'en', { numeric: true }),
  );

/* ---------- Email preferences ---------- */

export const EMAIL_EVENTS = [
  {
    key: 'sheet-returned',
    label: 'A result sheet is returned to me',
    description: 'With the reviewer’s comment, so you can correct and resubmit.',
    default: true,
  },
  {
    key: 'sheet-approved',
    label: 'A result sheet is approved or published',
    description: 'When the academic office approves or publishes one of your sheets.',
    default: false,
  },
  {
    key: 'deadline-reminder',
    label: 'Deadline reminders',
    description: 'Result entry and lesson note deadlines, two days before.',
    default: true,
  },
  {
    key: 'submission-received',
    label: 'Students submit work',
    description: 'A daily summary of new submissions waiting to be graded.',
    default: false,
  },
  {
    key: 'lesson-note-reviewed',
    label: 'A lesson note is approved or returned',
    description: 'The reviewer’s decision on your weekly lesson notes.',
    default: true,
  },
  {
    key: 'review-waiting',
    label: 'Something is waiting for my review',
    description: 'HODs and the Academic Head: sheets and notes sent to you.',
    default: true,
  },
  {
    key: 'class-reminder',
    label: 'A class teacher reminds me about a sheet',
    description: 'When a class teacher asks you to submit a missing subject.',
    default: false,
  },
  {
    key: 'announcement',
    label: 'New announcements for teachers',
    description: 'School announcements addressed to teachers or the whole school.',
    default: false,
  },
] as const;
export type EmailEventKey = (typeof EMAIL_EVENTS)[number]['key'];

const preferences = new Map<string, Record<string, boolean>>();

export function emailPreferencesOf(teacherId: string): Record<EmailEventKey, boolean> {
  const saved = preferences.get(teacherId) ?? {};
  return Object.fromEntries(EMAIL_EVENTS.map((e) => [e.key, saved[e.key] ?? e.default])) as Record<
    EmailEventKey,
    boolean
  >;
}
export function setEmailPreferences(teacherId: string, next: Partial<Record<string, boolean>>) {
  const known = new Set<string>(EMAIL_EVENTS.map((e) => e.key));
  const clean = Object.fromEntries(
    Object.entries(next).filter(([k, v]) => known.has(k) && typeof v === 'boolean'),
  ) as Record<string, boolean>;
  preferences.set(teacherId, { ...emailPreferencesOf(teacherId), ...clean });
  return emailPreferencesOf(teacherId);
}
export const wantsEmail = (teacherId: string, event: EmailEventKey) =>
  emailPreferencesOf(teacherId)[event];

/* ---------- History ---------- */

export interface HistoryRecord {
  id: string;
  /** Local "YYYY-MM-DDTHH:mm" */
  at: string;
  title: string;
  detail?: string;
  tone?: TimelineEntry['tone'];
}

const HISTORY = new Map<string, HistoryRecord[]>();
let historySeq = 0;

/** Records something that happened to a record, e.g. `logHistory(\`sheet:${id}\`, 'Submitted', 'To Mr. Ibrahim Bello')`. */
export function logHistory(
  key: string,
  title: string,
  detail?: string,
  tone?: TimelineEntry['tone'],
  at = nowLocal(),
) {
  const entry: HistoryRecord = { id: `h-${++historySeq}`, at, title, detail, tone };
  HISTORY.set(key, [...(HISTORY.get(key) ?? []), entry]);
  return entry;
}

/** A record's history as timeline entries, newest first. */
export const timelineOf = (key: string): TimelineEntry[] => toTimeline(HISTORY.get(key) ?? []);

export const toTimeline = (records: HistoryRecord[]): TimelineEntry[] =>
  [...records]
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id, 'en', { numeric: true }))
    .map(({ id, at, title, detail, tone }) => ({ id, title, detail, tone, when: whenLabel(at) }));

/* ---------- Seed ---------- */

const seed: [string[], NotifyPayload][] = [
  [
    ['ade', 'okafor', 'bello', 'eze'],
    {
      title: 'Result entry closes Friday 11 Dec, 23:59',
      body: 'Submit every First Term sheet before the deadline. Drafts become read-only after it.',
      category: 'results',
      to: { name: r.results.list.name },
      createdAt: '2026-12-07T09:00',
    },
  ],
  [
    ['ade'],
    {
      title: 'Mr. Ibrahim Bello returned a lesson note',
      body: 'JSS 2 · Mathematics · Week 12: “Add worked examples for simultaneous equations.”',
      category: 'lesson-notes',
      to: { name: r.lessonNotes.list.name },
      createdAt: '2026-12-07T15:42',
    },
  ],
  [
    ['ade'],
    {
      title: '9 new submissions to grade',
      body: 'JSS 2B · Mathematics · Linear equations worksheet',
      category: 'assignments',
      to: { name: r.assignments.list.name },
      createdAt: '2026-12-08T07:40',
    },
  ],
  [
    ['okafor'],
    {
      title: 'Take today’s register for JSS 2B',
      body: 'Tuesday 8 Dec · the register opens at 07:30 and absences notify guardians.',
      category: 'register',
      to: { name: r.classTeacher.register.name },
      createdAt: '2026-12-08T07:30',
    },
  ],
  [
    ['bello'],
    {
      title: 'Mr. Samuel Ade submitted a result sheet',
      body: 'SSS 1A · Mathematics is waiting for your review.',
      category: 'reviews',
      to: { name: r.reviews.results.name },
      createdAt: '2026-12-08T07:55',
    },
  ],
  [
    ['eze'],
    {
      title: 'Mrs. Grace Okafor submitted a lesson note',
      body: 'JSS 2 · English Language · Week 13 is waiting for your review.',
      category: 'reviews',
      to: { name: r.reviews.lessonNotes.name },
      createdAt: '2026-12-07T17:05',
    },
  ],
  [
    ['ade', 'okafor', 'bello', 'eze', 'salami'],
    {
      title: 'New announcement: Christmas carol service',
      body: 'Thursday 17 December from 10:00 in the main hall.',
      category: 'announcements',
      to: { name: r.announcements.detail.name, params: { id: 'an-5' } },
      createdAt: '2026-12-04T14:30',
    },
  ],
  [
    ['salami'],
    {
      title: 'Welcome to the Teacher Workspace',
      body: 'Add your phone number to your profile. Your classes appear here once the academic office assigns them.',
      category: 'account',
      to: { name: r.profile.edit.name },
      createdAt: '2026-11-30T09:00',
    },
  ],
];
for (const [ids, payload] of seed) notify(ids, payload);
// Older items are already read.
for (const n of NOTIFICATIONS) if (n.createdAt < '2026-12-05') n.read = true;
