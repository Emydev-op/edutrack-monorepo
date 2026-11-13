/**
 * Weekly lesson notes: one per teacher × subject × class level × week of the term.
 *
 * Statuses Draft → Submitted → Approved, or Returned (with the reviewer's comment) → Submitted
 * again to the same reviewer. A note is due on the Friday before the week it covers; a slot with
 * no note, or only a draft, after that is overdue. The reviewer is the department's HOD, else the
 * Academic Head, never the teacher themself (`lessonNoteReviewerFor`).
 *
 * Seed (First Term): weeks 1–12 approved for everyone. Mr. Ade's JSS 2 Mathematics week 12 is
 * Returned; his week 13 has a Draft (JSS 1), one Submitted to Mr. Bello (SSS 1 Mathematics) and
 * two not written (overdue). Mrs. Okafor's and Mr. Bello's week 13 notes wait on Mrs. Eze, with
 * a French and a Basic Technology note; two other Sciences notes (Chemistry, Basic Science) wait on Mr. Bello. Week 14 is
 * due Fri 11 Dec. Third Term 2025/2026 is fully approved.
 *
 * Other features read through `lessonNotesDueFor` and `notesWaitingOn`.
 */
import { MockHttpError } from '@edutrack/web-core/mock';

import { routesPath as r } from '@/router/routes-path';
import {
  LESSON_NOTE_LIMITS as LIMITS,
  type LessonNote,
  type LessonNoteRow,
  type LessonNoteSlot,
  type LessonNoteStatus,
  type LessonNoteSummary,
  type NoteAttachment,
  type TermWeek,
} from '@/types';

import {
  CLOSURES,
  PUBLIC_HOLIDAYS,
  addDays,
  formatDay,
  isoToday,
  nowLocal,
  weekdayOf,
} from './clock';
import { logHistory, notify, timelineOf } from './notify-db';
import { STAFF, TERMS, seeded } from './school-db';
import {
  armById,
  assignmentsOf,
  departmentOfSubject,
  forbidden,
  isAcademicHead,
  lessonNoteReviewerFor,
  notFound,
  requireEditableTerm,
  staffById,
  subjectByCode,
  termById,
  termLockReason,
} from './scope';

export interface NoteRecord {
  id: string;
  termId: string;
  teacherId: string;
  subject: string;
  /** "JSS 2" */
  level: string;
  week: number;
  topic: string;
  objectives: string[];
  content: string;
  attachment: NoteAttachment | null;
  schemeTopic: string;
  status: LessonNoteStatus;
  /** Who it was (or will be) sent to; null = the academic office. Kept for resubmission. */
  reviewerId: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  returnComment: string;
}

export const NOTES: NoteRecord[] = [];
let seq = 0;
export const noteHistoryKey = (id: string) => `lesson-note:${id}`;
export const noteById = (id: string) =>
  NOTES.find((n) => n.id === id) ?? notFound('That lesson note');

/* ---------- Weeks ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const short = (iso: string) => `${DAYS[weekdayOf(iso)]} ${formatDay(iso, false)}`;
function rangeLabel(from: string, to: string) {
  const sameMonth = from.slice(5, 7) === to.slice(5, 7);
  return sameMonth
    ? `${+from.slice(8, 10)}–${+to.slice(8, 10)} ${MONTHS[+to.slice(5, 7) - 1]}`
    : `${formatDay(from, false)} – ${formatDay(to, false)}`;
}

/** The term's teaching weeks, Monday to Friday, numbered from the week the term starts in. */
export function termWeeks(termId: string): TermWeek[] {
  const t = termById(termId);
  const monday = addDays(t.start, -((weekdayOf(t.start) + 6) % 7));
  const out: TermWeek[] = [];
  for (let start = monday, week = 1; start <= t.end; start = addDays(start, 7), week++) {
    const end = addDays(start, 4);
    const breakDays = CLOSURES.filter((c) => c.from <= end && c.to >= start);
    const holidays = PUBLIC_HOLIDAYS.filter(([d]) => d >= start && d <= end);
    const midterm = breakDays.some((c) => /mid-term/i.test(c.name));
    const notes = [
      ...breakDays.map((c) => {
        const from = c.from < start ? start : c.from;
        const to = c.to > end ? end : c.to;
        return from === to
          ? `${c.name} · ${short(from)}`
          : `${c.name} · ${short(from)} – ${short(to)}`;
      }),
      ...holidays.map(([d, name]) => `${name} · ${short(d)}`),
    ];
    out.push({
      week,
      start,
      end,
      label: `Week ${week} · ${rangeLabel(start, end)}`,
      due: addDays(start, -3),
      midterm,
      note: notes.length ? notes.join(' · ') : null,
    });
  }
  return out;
}

export const weekOf = (termId: string, week: number) =>
  termWeeks(termId).find((w) => w.week === week) ?? null;

/** The week today falls in (0 before the term starts, the last week after it ends). */
export function currentWeek(termId: string) {
  const weeks = termWeeks(termId);
  const today = isoToday();
  if (!weeks.length || today < weeks[0]!.start) return 0;
  const w = weeks.find((x) => today >= x.start && today <= addDays(x.start, 6));
  return w?.week ?? weeks[weeks.length - 1]!.week;
}

/* ---------- Slots: subject × class level ---------- */

const levelOf = (armId: string) => armById(armId).level;
export const slotKey = (subject: string, level: string) => `${subject}|${level}`;

const reviewerLabel = (id: string | null) => (id ? staffById(id).name : 'the academic office');

/**
 * The Academic Head's own notes have no one above them to review them: they are filed as
 * Approved on submit, with the history entry `FILED_BY_HEAD`.
 */
export const filedWithoutReview = (teacherId: string, subject: string) =>
  isAcademicHead(teacherId) && lessonNoteReviewerFor(teacherId, subject) === null;
export const FILED_BY_HEAD = 'Filed by the Academic Head — no review needed';
const NO_REVIEW = 'No review needed (Academic Head)';

/** The subjects and class levels a teacher teaches in a term. */
export function slotsOf(teacherId: string, termId: string): LessonNoteSlot[] {
  const seen = new Map<string, LessonNoteSlot>();
  for (const a of assignmentsOf(teacherId, termId)) {
    const level = levelOf(a.armId);
    const key = slotKey(a.subject, level);
    if (seen.has(key)) continue;
    const subjectName = subjectByCode(a.subject).name;
    seen.set(key, {
      key,
      subject: a.subject,
      subjectName,
      level,
      label: `${level} · ${subjectName}`,
      reviewer: filedWithoutReview(teacherId, a.subject)
        ? NO_REVIEW
        : reviewerLabel(lessonNoteReviewerFor(teacherId, a.subject)?.id ?? null),
      noReview: filedWithoutReview(teacherId, a.subject),
    });
  }
  return [...seen.values()].sort(
    (a, b) => a.level.localeCompare(b.level) || a.subjectName.localeCompare(b.subjectName),
  );
}

export const noteFor = (
  teacherId: string,
  termId: string,
  subject: string,
  level: string,
  week: number,
) =>
  NOTES.find(
    (n) =>
      n.teacherId === teacherId &&
      n.termId === termId &&
      n.subject === subject &&
      n.level === level &&
      n.week === week,
  ) ?? null;

/* ---------- Views ---------- */

const NOT_SENT: (LessonNoteStatus | 'Not written')[] = ['Not written', 'Draft'];
const isOverdue = (status: LessonNoteStatus | 'Not written', due: string) =>
  NOT_SENT.includes(status) && due < isoToday();

export function noteSummary(n: NoteRecord): LessonNoteSummary {
  const w = weekOf(n.termId, n.week)!;
  return {
    id: n.id,
    subject: n.subject,
    subjectName: subjectByCode(n.subject).name,
    level: n.level,
    week: n.week,
    weekLabel: w.label,
    topic: n.topic,
    status: n.status,
    due: w.due,
    overdue: isOverdue(n.status, w.due),
    teacher: staffById(n.teacherId).name,
    reviewer: filedWithoutReview(n.teacherId, n.subject)
      ? NO_REVIEW
      : reviewerLabel(currentReviewerId(n)),
    noReview: filedWithoutReview(n.teacherId, n.subject),
    submittedAt: n.submittedAt,
    decidedAt: n.decidedAt,
    returnComment: n.returnComment,
  };
}

/** Who a note goes to next: the same reviewer after a return, else the review chain. */
const currentReviewerId = (n: NoteRecord) =>
  n.submittedAt ? n.reviewerId : (lessonNoteReviewerFor(n.teacherId, n.subject)?.id ?? null);

export function noteLock(n: NoteRecord): string | null {
  const term = termLockReason(n.termId);
  if (term) return term;
  if (n.status === 'Approved')
    return filedWithoutReview(n.teacherId, n.subject)
      ? 'Filed by you as Academic Head (no review needed). Filed notes are read-only.'
      : `Approved by ${reviewerLabel(n.reviewerId)}. Approved notes are read-only.`;
  if (n.status === 'Submitted')
    return `With ${reviewerLabel(n.reviewerId)} for review. You can change it if it’s returned.`;
  return null;
}

export function noteView(n: NoteRecord): LessonNote {
  const w = weekOf(n.termId, n.week)!;
  const lock = noteLock(n);
  return {
    ...noteSummary(n),
    termId: n.termId,
    weekStart: w.start,
    weekEnd: w.end,
    midterm: w.midterm,
    objectives: [...n.objectives],
    content: n.content,
    attachment: n.attachment ? { ...n.attachment } : null,
    schemeTopic: n.schemeTopic,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    editable: lock === null,
    lockReason: lock,
    history: timelineOf(noteHistoryKey(n.id)),
  };
}

/** Every expected note for a teacher (slot × week up to next week), newest week first. */
export function noteRows(teacherId: string, termId: string): LessonNoteRow[] {
  const term = termById(termId);
  const weeks = termWeeks(termId);
  const cw = currentWeek(termId);
  const last = term.status === 'Closed' ? weeks.length : Math.min(cw + 1, weeks.length);
  const slots = slotsOf(teacherId, termId);
  const out: LessonNoteRow[] = [];
  for (const w of weeks.filter((x) => x.week <= last).reverse())
    for (const s of slots) {
      const n = noteFor(teacherId, termId, s.subject, s.level, w.week);
      const status = n?.status ?? 'Not written';
      out.push({
        key: `${s.key}|${w.week}`,
        week: w.week,
        weekLabel: w.label,
        midterm: w.midterm,
        due: w.due,
        subject: s.subject,
        subjectName: s.subjectName,
        level: s.level,
        label: s.label,
        status,
        overdue: term.status === 'Active' && isOverdue(status, w.due),
        dueThisWeek:
          term.status === 'Active' &&
          w.week === cw + 1 &&
          w.due >= isoToday() &&
          NOT_SENT.includes(status),
        noteId: n?.id ?? null,
        topic: n?.topic ?? null,
        returnComment: n?.returnComment ?? '',
      });
    }
  return out;
}

/* ---------- Exports for the dashboard ---------- */

/** A teacher's lesson notes needing action: overdue (unsent after the due date), due this week, returned. */
export function lessonNotesDueFor(teacherId: string, termId: string) {
  const rows = noteRows(teacherId, termId);
  return {
    overdue: rows.filter((x) => x.overdue).length,
    dueThisWeek: rows.filter((x) => x.dueThisWeek).length,
    returned: rows.filter((x) => x.status === 'Returned').length,
  };
}

/** How many lesson notes are waiting on a reviewer (Submitted to them) in a term. */
export const notesWaitingOn = (reviewerId: string, termId: string) =>
  waitingNotes(reviewerId, termId).length;

export const waitingNotes = (reviewerId: string, termId: string) =>
  NOTES.filter(
    (n) => n.termId === termId && n.status === 'Submitted' && n.reviewerId === reviewerId,
  );

/* ---------- Validation ---------- */

const MB = 1024 * 1024;
const sizeLabel = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;

interface NoteInput {
  topic?: unknown;
  objectives?: unknown;
  content?: unknown;
  attachment?: unknown;
  schemeTopic?: unknown;
  submit?: unknown;
}

/** Checks a note's fields. Drafts need a topic; submitting needs every required field. */
function cleanNote(body: unknown) {
  const input = (body ?? {}) as NoteInput;
  const submit = input.submit === true;
  const fields: Record<string, string> = {};
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  if (topic.length < LIMITS.topic.min)
    fields.topic = topic ? 'Give the topic a few more words.' : 'Enter the week’s topic.';
  else if (topic.length > LIMITS.topic.max)
    fields.topic = `Keep the topic to ${LIMITS.topic.max} characters.`;

  const objectives = (Array.isArray(input.objectives) ? input.objectives : [])
    .filter((o): o is string => typeof o === 'string')
    .map((o) => o.trim())
    .filter(Boolean);
  if (objectives.length > LIMITS.objectives.max)
    fields.objectives = `List up to ${LIMITS.objectives.max} objectives (${objectives.length} now).`;
  else if (objectives.some((o) => o.length > LIMITS.objectives.each))
    fields.objectives = `Keep each objective under ${LIMITS.objectives.each} characters.`;
  else if (submit && objectives.length < LIMITS.objectives.min)
    fields.objectives = 'List at least one objective, one per line.';

  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (content.length > LIMITS.content.max)
    fields.content = `Keep the summary to ${LIMITS.content.max} characters.`;
  else if (submit && content.length < LIMITS.content.min)
    fields.content = `Write at least ${LIMITS.content.min} characters (${content.length} so far).`;

  const schemeTopic = typeof input.schemeTopic === 'string' ? input.schemeTopic.trim() : '';
  if (schemeTopic.length > LIMITS.schemeTopic)
    fields.schemeTopic = `Keep it to ${LIMITS.schemeTopic} characters.`;

  let attachment: NoteAttachment | null = null;
  const a = input.attachment as Partial<NoteAttachment> | null | undefined;
  if (a) {
    if (typeof a.name !== 'string' || typeof a.bytes !== 'number' || a.bytes <= 0)
      fields.attachment = 'That file couldn’t be read. Choose it again.';
    else if (a.bytes > LIMITS.attachmentBytes)
      fields.attachment = `“${a.name}” is ${sizeLabel(a.bytes)}. Attach a file up to 10 MB.`;
    else
      attachment = { name: a.name, type: typeof a.type === 'string' ? a.type : '', bytes: a.bytes };
  }
  if (Object.keys(fields).length)
    throw new MockHttpError(
      422,
      submit ? 'Complete the note before submitting it.' : 'Check the highlighted fields.',
      'VALIDATION',
      fields,
    );
  return { topic, objectives, content, schemeTopic, attachment, submit };
}

/* ---------- Changes ---------- */

function sendForReview(n: NoteRecord, teacherName: string) {
  const resubmit = n.status === 'Returned';
  if (!resubmit) n.reviewerId = lessonNoteReviewerFor(n.teacherId, n.subject)?.id ?? null;
  n.submittedAt = nowLocal();
  if (filedWithoutReview(n.teacherId, n.subject)) {
    n.status = 'Approved';
    n.decidedAt = n.submittedAt;
    n.returnComment = '';
    logHistory(noteHistoryKey(n.id), FILED_BY_HEAD, `By ${teacherName}`, 'success');
    return;
  }
  n.status = 'Submitted';
  n.decidedAt = null;
  const to = reviewerLabel(n.reviewerId);
  const label = `${n.level} · ${subjectByCode(n.subject).name} · Week ${n.week}`;
  logHistory(
    noteHistoryKey(n.id),
    `${resubmit ? 'Resubmitted' : 'Submitted'} to ${to}`,
    `By ${teacherName}`,
    'info',
  );
  if (n.reviewerId)
    notify(n.reviewerId, {
      title: `${teacherName} ${resubmit ? 'resubmitted' : 'submitted'} a lesson note`,
      body: `${label} is waiting for your review.`,
      category: 'reviews',
      to: { name: r.reviews.note.name, params: { noteId: n.id } },
      emailEvent: 'review-waiting',
    });
}

export function createNote(teacherId: string, termId: string, body: unknown) {
  requireEditableTerm(termId);
  const input = (body ?? {}) as { subject?: unknown; level?: unknown; week?: unknown };
  const fields: Record<string, string> = {};
  const slots = slotsOf(teacherId, termId);
  const slot = slots.find((s) => s.subject === input.subject && s.level === input.level);
  if (!slot)
    fields.slot = slots.length
      ? 'Choose one of your subjects and class levels.'
      : 'You have no classes this term, so there’s nothing to write a note for.';
  const weeks = termWeeks(termId);
  const week =
    typeof input.week === 'number' ? weeks.find((w) => w.week === input.week) : undefined;
  if (!week) fields.week = `Choose a week from 1 to ${weeks.length}.`;
  if (Object.keys(fields).length)
    throw new MockHttpError(422, 'Choose the class and week.', 'VALIDATION', fields);
  const clean = cleanNote(body);
  const existing = noteFor(teacherId, termId, slot!.subject, slot!.level, week!.week);
  if (existing)
    throw new MockHttpError(
      409,
      `You already have a lesson note for ${slot!.label}, week ${week!.week} (${existing.status}). Open it to make changes.`,
      'DUPLICATE',
    );
  const now = nowLocal();
  const teacher = staffById(teacherId);
  const n: NoteRecord = {
    id: `ln-${++seq}`,
    termId,
    teacherId,
    subject: slot!.subject,
    level: slot!.level,
    week: week!.week,
    topic: clean.topic,
    objectives: clean.objectives,
    content: clean.content,
    attachment: clean.attachment,
    schemeTopic: clean.schemeTopic,
    status: 'Draft',
    reviewerId: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    decidedAt: null,
    returnComment: '',
  };
  NOTES.push(n);
  logHistory(noteHistoryKey(n.id), 'Draft started', `By ${teacher.name}`);
  if (clean.submit) sendForReview(n, teacher.name);
  return n;
}

/** The teacher's own note (403 for anyone else's). */
export function requireOwnNote(teacherId: string, noteId: string) {
  const n = noteById(noteId);
  if (n.teacherId !== teacherId)
    forbidden(
      `You don’t have access to that lesson note. It belongs to another teacher. Your notes are under Lesson notes.`,
    );
  return n;
}

export function updateNote(n: NoteRecord, body: unknown) {
  requireEditableTerm(n.termId);
  if (n.status === 'Submitted' || n.status === 'Approved')
    throw new MockHttpError(409, noteLock(n)!, 'NOTE_LOCKED');
  const clean = cleanNote(body);
  Object.assign(n, {
    topic: clean.topic,
    objectives: clean.objectives,
    content: clean.content,
    attachment: clean.attachment,
    schemeTopic: clean.schemeTopic,
    updatedAt: nowLocal(),
  });
  const teacher = staffById(n.teacherId).name;
  if (clean.submit) sendForReview(n, teacher);
  return n;
}

/* ---------- Review ---------- */

function requireUndecided(n: NoteRecord) {
  if (n.status === 'Approved')
    throw new MockHttpError(409, 'This note was already approved.', 'ALREADY_DECIDED');
  if (n.status === 'Returned')
    throw new MockHttpError(
      409,
      'This note was already returned to the teacher. It comes back to you when they resubmit it.',
      'ALREADY_DECIDED',
    );
  if (n.status !== 'Submitted')
    throw new MockHttpError(409, 'This note hasn’t been submitted for review.', 'NOT_SUBMITTED');
}

export function approveNote(n: NoteRecord, reviewerId: string) {
  requireEditableTerm(n.termId);
  requireUndecided(n);
  const reviewer = staffById(reviewerId).name;
  n.status = 'Approved';
  n.decidedAt = nowLocal();
  n.returnComment = '';
  logHistory(noteHistoryKey(n.id), `Approved by ${reviewer}`, undefined, 'success');
  notify(n.teacherId, {
    title: `${reviewer} approved your lesson note`,
    body: `${n.level} · ${subjectByCode(n.subject).name} · Week ${n.week}: ${n.topic}`,
    category: 'lesson-notes',
    to: { name: r.lessonNotes.detail.name, params: { noteId: n.id } },
    emailEvent: 'lesson-note-reviewed',
  });
  return n;
}

export function returnNote(n: NoteRecord, reviewerId: string, comment: unknown) {
  requireEditableTerm(n.termId);
  requireUndecided(n);
  const text = typeof comment === 'string' ? comment.trim() : '';
  if (text.length < 10)
    throw new MockHttpError(
      422,
      'Tell the teacher what to change (10 characters or more).',
      'VALIDATION',
      { comment: 'Tell the teacher what to change (10 characters or more).' },
    );
  const reviewer = staffById(reviewerId).name;
  n.status = 'Returned';
  n.decidedAt = nowLocal();
  n.returnComment = text;
  logHistory(noteHistoryKey(n.id), `Returned by ${reviewer}`, text, 'error');
  notify(n.teacherId, {
    title: `${reviewer} returned a lesson note`,
    body: `${n.level} · ${subjectByCode(n.subject).name} · Week ${n.week}: “${text}”`,
    category: 'lesson-notes',
    to: { name: r.lessonNotes.detail.name, params: { noteId: n.id } },
    emailEvent: 'lesson-note-reviewed',
  });
  return n;
}

/** The department a note belongs to (for reviewer scope messages). */
export const noteDepartment = (n: NoteRecord) => departmentOfSubject(n.subject);

/* ---------- Seed ---------- */

const TOPICS: Record<string, string[]> = {
  MTH: [
    'Whole numbers and place value',
    'Fractions, decimals and percentages',
    'Indices and standard form',
    'Algebraic expressions',
    'Simple equations',
    'Ratio and proportion',
    'Revision and CA 1',
    'Angles and parallel lines',
    'Plane shapes: perimeter and area',
    'Linear inequalities',
    'Graphs of linear equations',
    'Simultaneous equations',
    'Statistics: mean, median and mode',
    'Revision for examinations',
  ],
  FMT: [
    'Sets and binary operations',
    'Surds',
    'Logarithms',
    'Polynomials',
    'Partial fractions',
    'Sequences and series',
    'Revision and CA 1',
    'Matrices',
    'Determinants',
    'Coordinate geometry of the straight line',
    'Circles',
    'Permutations and combinations',
    'Binomial expansion',
    'Revision for examinations',
  ],
  ENG: [
    'Parts of speech: nouns and pronouns',
    'Comprehension: reading for main ideas',
    'Letter writing: informal letters',
    'Vowel sounds',
    'Verbs and tenses',
    'Summary writing',
    'Revision and CA 1',
    'Adjectives and adverbs',
    'Narrative essays',
    'Consonant sounds',
    'Concord: subject and verb agreement',
    'Formal letters',
    'Vocabulary: synonyms and antonyms',
    'Revision for examinations',
  ],
  PHY: [
    'Measurement and units',
    'Scalars and vectors',
    'Motion: speed, velocity and acceleration',
    'Newton’s laws of motion',
    'Work, energy and power',
    'Simple machines',
    'Revision and CA 1',
    'Heat and temperature',
    'Thermal expansion',
    'Waves',
    'Light: reflection',
    'Light: refraction',
    'Electrostatics',
    'Revision for examinations',
  ],
  BSC: [
    'Living and non-living things',
    'The cell',
    'Family health: nutrition',
    'Environmental conservation',
    'Matter and its states',
    'Energy forms',
    'Revision and CA 1',
    'Simple machines at home',
    'Drug abuse',
    'Reproductive health',
    'Magnetism',
    'Electricity in the home',
    'Ecology: habitats',
    'Revision for examinations',
  ],
};

const OBJECTIVES = [
  (t: string) => `Define the key terms in ${t.toLowerCase()}`,
  (t: string) => `Work through examples on ${t.toLowerCase()} with the class`,
  () => 'Solve the practice questions in groups and present answers',
  () => 'Relate the topic to everyday life',
];

const topicFor = (subject: string, week: number) =>
  TOPICS[subject]?.[week - 1] ?? `${subjectByCode(subject).name}: unit ${week}`;

function seedNote(
  plan: Partial<NoteRecord> &
    Pick<NoteRecord, 'termId' | 'teacherId' | 'subject' | 'level' | 'week' | 'status'>,
) {
  const w = weekOf(plan.termId, plan.week)!;
  const topic = plan.topic ?? topicFor(plan.subject, plan.week);
  const reviewerId = lessonNoteReviewerFor(plan.teacherId, plan.subject)?.id ?? null;
  const submittedAt = plan.status === 'Draft' ? null : (plan.submittedAt ?? `${w.due}T16:20`);
  const decidedAt =
    plan.status === 'Approved' && filedWithoutReview(plan.teacherId, plan.subject)
      ? submittedAt
      : plan.status === 'Approved' || plan.status === 'Returned'
        ? (plan.decidedAt ?? `${w.start}T09:15`)
        : null;
  const created = plan.createdAt ?? `${addDays(w.due, -1)}T18:00`;
  const n: NoteRecord = {
    id: `ln-${++seq}`,
    objectives: OBJECTIVES.slice(0, 3).map((o) => o(topic)),
    content: `Introduce ${topic.toLowerCase()} with a short starter activity, then teach the main ideas with worked examples on the board. Students practise in pairs, and the lesson ends with a five-question exit check and homework from the textbook.`,
    attachment: null,
    schemeTopic: `Scheme of work · ${topic}`,
    reviewerId,
    createdAt: created,
    updatedAt: plan.updatedAt ?? submittedAt ?? created,
    submittedAt,
    decidedAt,
    returnComment: '',
    ...plan,
    topic,
  };
  NOTES.push(n);
  const teacher = staffById(n.teacherId).name;
  const h = noteHistoryKey(n.id);
  logHistory(h, 'Draft started', `By ${teacher}`, undefined, created);
  if (submittedAt && filedWithoutReview(n.teacherId, n.subject))
    logHistory(h, FILED_BY_HEAD, `By ${teacher}`, 'success', submittedAt);
  else if (submittedAt)
    logHistory(
      h,
      `Submitted to ${reviewerLabel(reviewerId)}`,
      `By ${teacher}`,
      'info',
      submittedAt,
    );
  if (n.status === 'Approved' && !filedWithoutReview(n.teacherId, n.subject))
    logHistory(h, `Approved by ${reviewerLabel(reviewerId)}`, undefined, 'success', decidedAt!);
  if (n.status === 'Returned')
    logHistory(h, `Returned by ${reviewerLabel(reviewerId)}`, n.returnComment, 'error', decidedAt!);
  return n;
}

type Plan = (Partial<NoteRecord> & { status: LessonNoteStatus }) | 'skip';
/** First Term exceptions, "teacherId|subject|level|week". Everything else up to week 13 is Approved. */
const FIRST_TERM: Record<string, Plan> = {
  'ade|MTH|JSS 2|12': {
    status: 'Returned',
    submittedAt: '2026-11-27T15:10',
    decidedAt: '2026-12-07T15:42',
    returnComment: 'Add worked examples for simultaneous equations.',
  },
  'ade|MTH|JSS 1|13': { status: 'Draft', createdAt: '2026-12-06T19:10', objectives: [] },
  'ade|MTH|JSS 2|13': 'skip',
  'ade|MTH|SSS 1|13': { status: 'Submitted', submittedAt: '2026-12-04T17:10' },
  'ade|FMT|SSS 1|13': 'skip',
  'okafor|ENG|JSS 2|13': { status: 'Submitted', submittedAt: '2026-12-07T17:05' },
  'bello|PHY|SSS 1|13': { status: 'Submitted', submittedAt: '2026-12-04T15:00' },
  'okonjo|CHE|SSS 1|13': { status: 'Submitted', submittedAt: '2026-12-04T14:30' },
  'balogun|BSC|JSS 1|13': { status: 'Submitted', submittedAt: '2026-12-07T08:45' },
  'kouassi|FRE|JSS 2|13': { status: 'Submitted', submittedAt: '2026-12-04T16:00' },
  'adeleke|BTE|JSS 1|13': { status: 'Submitted', submittedAt: '2026-12-07T12:20' },
};

function seedNotes() {
  for (const term of TERMS) {
    if (term.status === 'Upcoming') continue;
    const weeks = termWeeks(term.id);
    const lastWeek = term.status === 'Closed' ? weeks.length : currentWeek(term.id);
    const rng = seeded(1412 + weeks.length);
    for (const staff of STAFF)
      for (const slot of slotsOf(staff.id, term.id))
        for (let week = 1; week <= lastWeek; week++) {
          const plan =
            term.status === 'Active'
              ? FIRST_TERM[`${staff.id}|${slot.subject}|${slot.level}|${week}`]
              : undefined;
          if (plan === 'skip') continue;
          // Most notes go in on the Friday they're due; a few a day late.
          const w = weeks[week - 1]!;
          const late = rng.chance(0.1);
          seedNote({
            termId: term.id,
            teacherId: staff.id,
            subject: slot.subject,
            level: slot.level,
            week,
            ...(late ? { submittedAt: `${addDays(w.due, 3)}T07:30` } : {}),
            status: 'Approved',
            ...plan,
          });
        }
  }
}

seedNotes();
