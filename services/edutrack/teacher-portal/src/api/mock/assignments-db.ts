/**
 * Assignments and student submissions for the mock API. Owned by the Assignments builder.
 *
 * Student work is seeded here until the Student Portal exists: every published or closed
 * assignment has one submission per student in the class, with a status from
 * `Not submitted · Submitted · Late · Graded · Returned · Excused`.
 *
 * Other areas read through the exported helpers (`toGradeCount`, `assignmentsForClass`,
 * `studentAssignments`, `openAssignmentFor`), never the arrays directly.
 */
import { MockHttpError } from '@edutrack/web-core/mock';

import {
  ASSIGNMENT_LIMITS,
  ATTACHMENT_LIMITS,
  type AssignmentStatus,
  type FileRef,
  type SubmissionCounts,
  type SubmissionStatus,
} from '@/types';

import { addDays, isoToday, nowLocal } from './clock';
import { logHistory } from './notify-db';
import { seeded, TEACHING_ASSIGNMENTS, type StudentRecord } from './school-db';
import { notFound, studentById, studentsInArmFor, termById } from './scope';

/* ---------- Records ---------- */

export interface AssignmentRecord {
  id: string;
  termId: string;
  teacherId: string;
  armId: string;
  subject: string;
  title: string;
  instructions: string;
  /** Local "YYYY-MM-DDTHH:mm" */
  dueAt: string | null;
  maxScore: number | null;
  allowLate: boolean;
  attachments: FileRef[];
  status: AssignmentStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  closedAt: string | null;
}

export interface SubmissionRecord {
  id: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  late: boolean;
  files: FileRef[];
  note: string | null;
  score: number | null;
  feedback: string;
  gradedAt: string | null;
  returnedAt: string | null;
  excuseReason: string | null;
}

export const ASSIGNMENTS: AssignmentRecord[] = [];
export const SUBMISSIONS: SubmissionRecord[] = [];

let assignmentSeq = 0;
let submissionSeq = 0;
export const nextAssignmentId = () => `as-${++assignmentSeq}`;
const nextSubmissionId = () => `sb-${++submissionSeq}`;

export const assignmentKey = (id: string) => `assignment:${id}`;
export const submissionKey = (id: string) => `submission:${id}`;

/* ---------- Errors ---------- */

const CLOSED_DUE_DAY = ['10', '12', '13'] as const;
/** 422 for one form field: the message comes back in `fields[field]` and as the message. */
export const fieldError = (field: string, message: string): never => {
  throw new MockHttpError(422, message, 'VALIDATION', { [field]: message });
};
export const unprocessable = (message: string): never => {
  throw new MockHttpError(422, message, 'VALIDATION');
};

/* ---------- Time helpers ---------- */

const toMinutes = (local: string) =>
  Date.UTC(
    +local.slice(0, 4),
    +local.slice(5, 7) - 1,
    +local.slice(8, 10),
    +local.slice(11, 13),
    +local.slice(14, 16),
  ) / 60_000;
const fromMinutes = (m: number) => new Date(m * 60_000).toISOString().slice(0, 16);

/** "3h 20m", "2 days" between two local times. */
export function durationLabel(from: string, to: string) {
  const mins = Math.max(0, toMinutes(to) - toMinutes(from));
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.round(mins / (24 * 60));
  return `${d} day${d === 1 ? '' : 's'}`;
}

const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const isLocalDateTime = (v: unknown): v is string =>
  typeof v === 'string' && LOCAL_RE.test(v) && !Number.isNaN(toMinutes(v));

/* ---------- Lookups ---------- */

export const assignmentById = (id: string): AssignmentRecord =>
  ASSIGNMENTS.find((a) => a.id === id) ?? notFound('That assignment');

export const HANDED_IN: SubmissionStatus[] = ['Submitted', 'Late', 'Graded', 'Returned'];
export const TO_GRADE: SubmissionStatus[] = ['Submitted', 'Late'];

/** Students the assignment is for: the class's current list for the subject. */
export const studentsFor = (a: AssignmentRecord): StudentRecord[] =>
  studentsInArmFor(a.armId, a.subject, a.termId);

/**
 * The submissions of a published or closed assignment, one per student in the class, in class
 * order. Students who joined after it was published get a "Not submitted" row.
 */
export function submissionsFor(a: AssignmentRecord): SubmissionRecord[] {
  if (a.status === 'Draft') return [];
  const students = studentsFor(a);
  const mine = SUBMISSIONS.filter((s) => s.assignmentId === a.id);
  const byStudent = new Map(mine.map((s) => [s.studentId, s]));
  return students.map((st) => {
    const existing = byStudent.get(st.id);
    if (existing) return existing;
    const row = blankSubmission(a.id, st.id);
    SUBMISSIONS.push(row);
    return row;
  });
}

const blankSubmission = (assignmentId: string, studentId: string): SubmissionRecord => ({
  id: nextSubmissionId(),
  assignmentId,
  studentId,
  status: 'Not submitted',
  submittedAt: null,
  late: false,
  files: [],
  note: null,
  score: null,
  feedback: '',
  gradedAt: null,
  returnedAt: null,
  excuseReason: null,
});

export const submissionById = (assignment: AssignmentRecord, id: string): SubmissionRecord =>
  submissionsFor(assignment).find((s) => s.id === id) ?? notFound('That submission');

export function countsOf(a: AssignmentRecord): SubmissionCounts {
  const counts: SubmissionCounts = {
    'Not submitted': 0,
    Submitted: 0,
    Late: 0,
    Graded: 0,
    Returned: 0,
    Excused: 0,
  };
  for (const s of submissionsFor(a)) counts[s.status]++;
  return counts;
}

/** The highest score already given on an assignment, with whose it is. */
export function highestScoreOf(a: AssignmentRecord) {
  let best: SubmissionRecord | null = null;
  for (const s of submissionsFor(a))
    if (s.score !== null && (best === null || s.score > best.score!)) best = s;
  return best;
}

/** The teacher's assignments for a term. */
export const assignmentsOfTeacher = (teacherId: string, termId: string) =>
  ASSIGNMENTS.filter((a) => a.teacherId === teacherId && a.termId === termId);

/** Submissions waiting to be graded (Submitted + Late) across a teacher's term: the sidebar count. */
export const toGradeCount = (teacherId: string, termId: string) =>
  assignmentsOfTeacher(teacherId, termId).reduce(
    (sum, a) => sum + submissionsFor(a).filter((s) => TO_GRADE.includes(s.status)).length,
    0,
  );

/** A class's assignments for a subject and term, newest due first (drafts included). */
export const assignmentsForClass = (armId: string, subject: string, termId: string) =>
  ASSIGNMENTS.filter((a) => a.armId === armId && a.subject === subject && a.termId === termId).sort(
    (x, y) => (y.dueAt ?? '9999').localeCompare(x.dueAt ?? '9999'),
  );

/** The next open (published, not past due) assignment for a class, for the lesson page. */
export const openAssignmentFor = (armId: string, subject: string, termId: string) =>
  assignmentsForClass(armId, subject, termId)
    .filter((a) => a.status === 'Published' && a.dueAt && a.dueAt >= nowLocal())
    .sort((x, y) => x.dueAt!.localeCompare(y.dueAt!))[0] ?? null;

/**
 * A student's assignments from one teacher in a term (published and closed only), with the
 * student's submission. For the student page.
 */
export function studentAssignments(studentId: string, teacherId: string, termId: string) {
  return assignmentsOfTeacher(teacherId, termId)
    .filter((a) => a.status !== 'Draft')
    .flatMap((a) => {
      const sub = submissionsFor(a).find((s) => s.studentId === studentId);
      return sub ? [{ assignment: a, submission: sub }] : [];
    })
    .sort((x, y) => (y.assignment.dueAt ?? '').localeCompare(x.assignment.dueAt ?? ''));
}

/** Due within the next 3 days and still open. */
export const isDueSoon = (a: AssignmentRecord) =>
  a.status === 'Published' &&
  !!a.dueAt &&
  a.dueAt >= nowLocal() &&
  a.dueAt.slice(0, 10) <= addDays(isoToday(), 3);
export const isPastDue = (a: AssignmentRecord) => !!a.dueAt && a.dueAt < nowLocal();

/* ---------- Validation ---------- */

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
export const fileSizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Checks assignment attachments: types, 25 MB each, 5 at most. */
export function validateAttachments(value: unknown): FileRef[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return fieldError('attachments', 'Attachments must be a list.');
  if (value.length > ATTACHMENT_LIMITS.count)
    fieldError('attachments', `Attach up to ${ATTACHMENT_LIMITS.count} files.`);
  return value.map((raw: unknown) => {
    const f = raw as Partial<FileRef>;
    if (!f || typeof f.name !== 'string' || !f.name.trim() || typeof f.bytes !== 'number')
      return fieldError('attachments', 'One of the attachments couldn’t be read. Attach it again.');
    if (!(ATTACHMENT_LIMITS.extensions as readonly string[]).includes(extOf(f.name)))
      fieldError('attachments', `“${f.name}” isn’t supported. Use ${ATTACHMENT_LIMITS.label}.`);
    if (f.bytes > ATTACHMENT_LIMITS.bytes)
      fieldError(
        'attachments',
        `“${f.name}” is ${fileSizeLabel(f.bytes)}. Each file can be up to 25 MB.`,
      );
    if (f.bytes <= 0) fieldError('attachments', `“${f.name}” is empty.`);
    return {
      name: f.name.trim(),
      type: typeof f.type === 'string' ? f.type : '',
      bytes: f.bytes,
      ...(typeof f.materialId === 'string' ? { materialId: f.materialId } : {}),
    };
  });
}

export interface CleanAssignment {
  title: string;
  instructions: string;
  dueAt: string | null;
  maxScore: number | null;
  allowLate: boolean;
  attachments: FileRef[];
}

/**
 * Validates a create / edit body for a term. Publishing needs every field; a draft needs a
 * title, and whatever else it has must still be valid. On edit, an unchanged due date isn't
 * re-checked against the clock, and the max score can't drop below a score already given.
 */
export function validateAssignmentBody(
  body: Record<string, unknown>,
  termId: string,
  options: { publish: boolean; existing?: AssignmentRecord },
): CleanAssignment {
  const { publish, existing } = options;
  const term = termById(termId);

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) fieldError('title', 'Enter a title.');
  if (title.length > ASSIGNMENT_LIMITS.title)
    fieldError('title', `Keep the title to ${ASSIGNMENT_LIMITS.title} characters.`);

  const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
  if (publish && !instructions)
    fieldError('instructions', 'Enter instructions so students know what to do.');
  if (instructions.length > ASSIGNMENT_LIMITS.instructions)
    fieldError(
      'instructions',
      `Keep the instructions to ${ASSIGNMENT_LIMITS.instructions} characters.`,
    );

  const rawDue = body.dueAt === '' ? null : (body.dueAt ?? null);
  let dueAt: string | null = null;
  if (rawDue === null) {
    if (publish) fieldError('dueAt', 'Choose a due date and time.');
  } else {
    if (!isLocalDateTime(rawDue)) fieldError('dueAt', 'Enter the due date and time.');
    dueAt = rawDue as string;
    const unchanged = existing?.dueAt === dueAt;
    if (!unchanged) {
      if (dueAt.slice(0, 10) < term.start || dueAt.slice(0, 10) > term.end)
        fieldError(
          'dueAt',
          `The due date must be inside ${term.name} (${dayLabel(term.start)} – ${dayLabel(term.end)}).`,
        );
      if (dueAt <= nowLocal())
        fieldError('dueAt', 'The due date and time has already passed. Choose a later time.');
    }
  }

  const rawMax = body.maxScore === '' ? null : (body.maxScore ?? null);
  let maxScore: number | null = null;
  if (rawMax === null) {
    if (publish) fieldError('maxScore', 'Enter the max score.');
  } else {
    const n = Number(rawMax);
    if (!Number.isInteger(n) || n < 1 || n > ASSIGNMENT_LIMITS.maxScore)
      fieldError('maxScore', 'The max score is a whole number from 1 to 100.');
    maxScore = n;
    if (existing) {
      const best = highestScoreOf(existing);
      if (best && best.score! > n) {
        const name = studentName(best.studentId);
        fieldError(
          'maxScore',
          `${name} already has ${best.score}. The max score can’t go below ${best.score}.`,
        );
      }
    }
  }

  return {
    title,
    instructions,
    dueAt,
    maxScore,
    allowLate: body.allowLate === true,
    attachments: validateAttachments(body.attachments),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`;

export const studentName = (id: string) => studentById(id).name;

/** A score for an assignment: a whole number from 0 to the max. */
export function validateScore(value: unknown, max: number, required: boolean): number | null {
  if (value === null || value === undefined || value === '') {
    if (required) fieldError('score', `Enter a score from 0 to ${max} before returning it.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max)
    fieldError('score', `The score is a whole number from 0 to ${max}.`);
  return n;
}

/* ---------- Seed ---------- */

const TITLES: Record<string, string[]> = {
  MTH: [
    'Number bases practice',
    'Linear equations worksheet',
    'Algebraic expressions',
    'Angles in polygons',
    'Simple interest problems',
  ],
  /** Senior secondary Mathematics, so SSS classes don't get the JSS topics. */
  'MTH-SSS': [
    'Indices and logarithms',
    'Quadratic equations',
    'Surds practice set',
    'Coordinate geometry',
    'Variation problems',
  ],
  FMT: [
    'Binary operations',
    'Matrices and determinants',
    'Sequences and series',
    'Logical reasoning set',
  ],
  ENG: [
    'Essay: My most memorable day',
    'Comprehension passage 4',
    'Informal letter to a friend',
    'Parts of speech exercise',
  ],
  PHY: [
    'Motion graphs worksheet',
    'Lab report: simple pendulum',
    'Work, energy and power',
    'Heat transfer questions',
  ],
  BSC: [
    'Living and non-living things',
    'States of matter chart',
    'Energy sources project',
    'The human skeleton',
  ],
};
const INSTRUCTIONS: Record<string, string> = {
  MTH: 'Answer every question in your exercise book and show your working. Take a clear photo or scan of each page and upload it. Marks are given for method, not just the final answer.',
  FMT: 'Attempt all questions. Write out each step and state any rule you use. Upload a PDF or clear photos of your solutions.',
  ENG: 'Write in full sentences and check your spelling and punctuation. Type your answer or upload a clear photo of your handwritten work.',
  PHY: 'Use SI units throughout and show every formula you apply. Diagrams must be labelled. Upload your work as a PDF or photos.',
  BSC: 'Answer in your own words. Diagrams should be neat and labelled. Upload a photo of your work or a short document.',
};
const NOTES = [
  'I wasn’t sure about question 4, I tried two methods.',
  'Sorry the photo is a bit dark, the light went off.',
  'Please check number 3, I think I made a mistake.',
  'I did the extra question as well.',
  'My brother helped me understand the last part.',
];
const FEEDBACK = {
  high: [
    'Excellent work. Clear method throughout.',
    'Very good. Neat and well explained.',
    'Well done. Keep it up.',
  ],
  mid: [
    'Good effort. Check your working on the last two questions.',
    'Fair attempt. Revise the examples in your note.',
    'Some careless errors. Read each question twice.',
  ],
  low: [
    'See me after class so we can go through this together.',
    'Incomplete. Redo questions 2 to 5 using the worked example.',
  ],
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);

interface SeedSpec {
  title: string;
  status: AssignmentStatus;
  createdAt: string;
  publishedAt: string | null;
  dueAt: string;
  maxScore: number;
  allowLate: boolean;
  closedAt?: string;
  /** Status share for the class; the remainder is Not submitted. */
  plan: [SubmissionStatus, number][];
  /** Exact counts instead of shares (for the design's JSS 2B figures). */
  exact?: [SubmissionStatus, number][];
  attachments?: FileRef[];
  /** Puts this student first in the class order (so they get the first planned status). */
  first?: string;
  /** Adjusts a seeded submission before its history is written. */
  custom?: (student: StudentRecord, sub: SubmissionRecord) => void;
}

function seedAssignment(
  teacherId: string,
  armId: string,
  subject: string,
  termId: string,
  spec: SeedSpec,
  rng: ReturnType<typeof seeded>,
) {
  const a: AssignmentRecord = {
    id: nextAssignmentId(),
    termId,
    teacherId,
    armId,
    subject,
    title: spec.title,
    instructions: INSTRUCTIONS[subject] ?? INSTRUCTIONS.MTH!,
    dueAt: spec.dueAt,
    maxScore: spec.maxScore,
    allowLate: spec.allowLate,
    attachments: spec.attachments ?? [],
    status: spec.status,
    createdAt: spec.createdAt,
    updatedAt: spec.closedAt ?? spec.publishedAt ?? spec.createdAt,
    publishedAt: spec.publishedAt,
    closedAt: spec.closedAt ?? null,
  };
  ASSIGNMENTS.push(a);
  const key = assignmentKey(a.id);
  logHistory(key, 'Created as a draft', undefined, 'neutral', a.createdAt);
  if (a.status === 'Draft') return a;

  const students = studentsFor(a);
  logHistory(
    key,
    'Published',
    `${students.length} students and their guardians were notified.`,
    'info',
    a.publishedAt!,
  );
  if (a.closedAt) logHistory(key, 'Submissions closed', 'Due date passed.', 'neutral', a.closedAt);

  // Decide each student's status.
  const order = rng.shuffle(students);
  const firstAt = spec.first ? order.findIndex((s) => s.name === spec.first) : -1;
  if (firstAt > 0) order.unshift(...order.splice(firstAt, 1));
  const statuses: SubmissionStatus[] = [];
  if (spec.exact) for (const [st, n] of spec.exact) for (let i = 0; i < n; i++) statuses.push(st);
  else
    for (const [st, share] of spec.plan)
      for (let i = 0; i < Math.round(order.length * share); i++) statuses.push(st);

  const now = toMinutes(nowLocal());
  const published = toMinutes(a.publishedAt!);
  const due = toMinutes(a.dueAt!);
  order.forEach((student, i) => {
    const status = statuses[i] ?? 'Not submitted';
    const sub = blankSubmission(a.id, student.id);
    sub.status = status;
    SUBMISSIONS.push(sub);
    const skey = submissionKey(sub.id);
    if (status === 'Not submitted') return;
    if (status === 'Excused') {
      sub.excuseReason = rng.pick([
        'Hospitalised that week (note from parent).',
        'Representing the school at the inter-school quiz.',
      ]);
      logHistory(
        skey,
        'Marked excused',
        sub.excuseReason,
        'neutral',
        addMinutes(a.dueAt!, 60 * 18),
      );
      return;
    }
    // When it was handed in: Late ones after the due time, the rest before it.
    const lateOne = status === 'Late' || (a.allowLate && rng.chance(0.12) && due < now);
    let at: number;
    if (lateOne && due < now) {
      at = due + rng.int(40, Math.max(41, Math.min(now - due - 5, 60 * 30)));
      sub.late = true;
    } else {
      const hi = Math.min(due, now) - 5;
      at = rng.int(Math.min(published + 60 * 6, hi), hi);
    }
    sub.submittedAt = fromMinutes(Math.min(at, now - 5));
    if (status === 'Late' && !sub.late) sub.status = 'Submitted';
    const ext = rng.chance(0.55) ? 'pdf' : 'jpg';
    const pages = ext === 'jpg' ? rng.int(1, 3) : 1;
    sub.files = Array.from({ length: pages }, (_, p) => ({
      name: `${slug(a.title)}_${student.firstName.toLowerCase()}${pages > 1 ? `_p${p + 1}` : ''}.${ext}`,
      type: ext === 'pdf' ? 'application/pdf' : 'image/jpeg',
      bytes: rng.int(180, ext === 'pdf' ? 2400 : 4200) * 1024,
    }));
    if (rng.chance(0.3)) sub.note = rng.pick(NOTES);
    spec.custom?.(student, sub);
    logHistory(
      skey,
      sub.late ? 'Submitted late' : 'Submitted',
      sub.late
        ? `${durationLabel(a.dueAt!, sub.submittedAt)} after the due time · ${sub.files.length} file${sub.files.length === 1 ? '' : 's'}`
        : `${sub.files.length} file${sub.files.length === 1 ? '' : 's'}`,
      sub.late ? 'warning' : 'info',
      sub.submittedAt,
    );
    if (status === 'Graded' || status === 'Returned') {
      const ratio = Math.min(1, Math.max(0.25, 0.45 + rng.next() * 0.55));
      sub.score = Math.round(a.maxScore! * ratio);
      const band = ratio >= 0.75 ? 'high' : ratio >= 0.5 ? 'mid' : 'low';
      sub.feedback = rng.pick(FEEDBACK[band]);
      const gradedMin = Math.min(
        Math.max(toMinutes(sub.submittedAt), due) + rng.int(60 * 10, 60 * 40),
        now - 30,
      );
      sub.gradedAt = fromMinutes(Math.max(gradedMin, toMinutes(sub.submittedAt) + 5));
      logHistory(skey, 'Graded', `${sub.score} / ${a.maxScore}`, 'neutral', sub.gradedAt);
      if (status === 'Returned') {
        sub.returnedAt = fromMinutes(Math.min(toMinutes(sub.gradedAt) + rng.int(5, 600), now - 10));
        logHistory(
          skey,
          'Returned',
          'The score and feedback are visible to the student and guardian.',
          'success',
          sub.returnedAt,
        );
      }
    }
  });
  return a;
}

const addMinutes = (local: string, m: number) => fromMinutes(toMinutes(local) + m);

const pdf = (name: string, kb: number): FileRef => ({
  name,
  type: 'application/pdf',
  bytes: kb * 1024,
});

const DEMO_TEACHERS = ['ade', 'okafor', 'bello', 'eze'];

/**
 * Work waiting to be graded per class (outside Mr. Ade's JSS 2B, which follows the design):
 * [Submitted, Late] on the assignment due yesterday and [Submitted] on the one due this week.
 * Keeps each demo teacher's "to grade" between 5 and 20, as a real teacher's would be:
 * Mr. Ade 18 (JSS 2B's 12 + 2 × 3 classes), Mrs. Okafor 12, Mr. Bello 12, Mrs. Eze 8.
 */
const WAITING: Record<string, [submitted: number, late: number, thisWeek: number]> = {
  ade: [1, 0, 1],
  okafor: [3, 1, 2],
  bello: [2, 1, 1],
  eze: [4, 2, 2],
};

(function seedAssignments() {
  const rng = seeded(5_062_027);
  const active = 't-2627-1';
  const past = 't-2526-3';
  for (const ta of TEACHING_ASSIGNMENTS) {
    if (!DEMO_TEACHERS.includes(ta.teacherId)) continue;
    const level = ta.armId.includes('-sss') ? 'SSS' : 'JSS';
    const titles = TITLES[`${ta.subject}-${level}`] ?? TITLES[ta.subject] ?? TITLES.MTH!;
    const isDesignClass = ta.teacherId === 'ade' && ta.armId === 'mc-jss2b' && ta.subject === 'MTH';
    if (ta.termId === past) {
      // A past term: two closed assignments, all marked and returned.
      for (const [i, due] of ['2026-05-22T16:00', '2026-06-26T16:00'].entries()) {
        seedAssignment(
          ta.teacherId,
          ta.armId,
          ta.subject,
          ta.termId,
          {
            title: titles[(i + 3) % titles.length]!,
            status: 'Closed',
            createdAt: addMinutes(due, -60 * 24 * 8),
            publishedAt: addMinutes(due, -60 * 24 * 7),
            dueAt: due,
            closedAt: due,
            maxScore: 20,
            allowLate: false,
            plan: [
              ['Returned', 0.85],
              ['Excused', 0.04],
            ],
          },
          rng,
        );
      }
      continue;
    }
    if (ta.termId !== active) continue;
    const shift = rng.int(0, 2) as 0 | 1 | 2;
    const size = studentsInArmFor(ta.armId, ta.subject, ta.termId).length;
    const [waiting, waitingLate, waitingThisWeek] = WAITING[ta.teacherId]!;
    // 1. Closed: due mid-November, mostly marked.
    seedAssignment(
      ta.teacherId,
      ta.armId,
      ta.subject,
      ta.termId,
      {
        title: titles[0]!,
        status: 'Closed',
        createdAt: `2026-11-0${3 + shift}T17:30`,
        publishedAt: `2026-11-0${4 + shift}T08:10`,
        // Due on a school day: Tue 10, Thu 12 or Fri 13 Nov.
        dueAt: `2026-11-${CLOSED_DUE_DAY[shift]}T16:00`,
        closedAt: `2026-11-${CLOSED_DUE_DAY[shift]}T16:00`,
        maxScore: 20,
        allowLate: false,
        plan: [
          ['Returned', 0.7],
          ['Graded', 0.1],
          ['Excused', 0.04],
        ],
        attachments: [pdf(`${slug(titles[0]!)}.pdf`, 312)],
      },
      rng,
    );
    // 2. Published, due yesterday, late work allowed: some waiting to be graded.
    seedAssignment(
      ta.teacherId,
      ta.armId,
      ta.subject,
      ta.termId,
      {
        title: titles[1]!,
        status: 'Published',
        createdAt: '2026-11-27T16:00',
        publishedAt: '2026-11-30T09:05',
        dueAt: '2026-12-07T16:00',
        maxScore: isDesignClass ? 30 : 25,
        allowLate: true,
        plan: [],
        exact: isDesignClass
          ? [
              ['Submitted', 7],
              ['Late', 2],
              ['Graded', 3],
            ]
          : [
              ['Submitted', waiting],
              ['Late', waitingLate],
              ['Graded', Math.round(size * 0.55)],
            ],
        attachments: [pdf(`${slug(titles[1]!)}.pdf`, 245)],
      },
      rng,
    );
    // 3. Published, due this week.
    seedAssignment(
      ta.teacherId,
      ta.armId,
      ta.subject,
      ta.termId,
      {
        title: titles[2]!,
        status: 'Published',
        createdAt: '2026-12-02T18:20',
        publishedAt: '2026-12-03T07:45',
        dueAt: isDesignClass
          ? '2026-12-10T16:00'
          : `2026-12-${String(9 + shift).padStart(2, '0')}T16:00`,
        maxScore: 20,
        allowLate: false,
        plan: [],
        exact: [['Submitted', isDesignClass ? 3 : waitingThisWeek]],
        // The design's example: Emmanuel Adeyemi has handed in his work.
        first: isDesignClass ? 'Emmanuel Adeyemi' : undefined,
        custom: (student, sub) => {
          if (!isDesignClass || student.name !== 'Emmanuel Adeyemi') return;
          sub.submittedAt = '2026-12-07T19:42';
          sub.late = false;
          sub.files = [
            {
              name: 'algebraic_expressions_emmanuel.pdf',
              type: 'application/pdf',
              bytes: 1_342_177,
            },
          ];
          sub.note = 'I simplified question 6 two ways. The second one is my final answer.';
        },
        attachments: isDesignClass
          ? [pdf('algebraic_expressions_exercise_3.pdf', 412)]
          : [pdf(`${slug(titles[2]!)}.pdf`, 198)],
      },
      rng,
    );
    // 4. A draft for next week.
    seedAssignment(
      ta.teacherId,
      ta.armId,
      ta.subject,
      ta.termId,
      {
        title: titles[3]!,
        status: 'Draft',
        createdAt: '2026-12-07T19:10',
        publishedAt: null,
        dueAt: '2026-12-15T16:00',
        maxScore: 20,
        allowLate: false,
        plan: [],
      },
      rng,
    );
  }
})();
