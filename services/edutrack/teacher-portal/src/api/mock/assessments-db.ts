/**
 * Scheduled assessments: when a teacher runs one of the school scheme's components (CA 1, CA 2,
 * Examination) for a class. The scheme itself (`SCHEMES` in school-db) is read-only here. A
 * component is scheduled at most once per class per term; how many students are scored comes
 * from the class's result sheet.
 */
import { MockHttpError } from '@edutrack/web-core/mock';

import type { AssessmentStatus, SheetComponent } from '@/types';

import { addDays, closureReason, formatDay, isoToday, nowLocal } from './clock';
import { logHistory } from './notify-db';
import { schemeOf, sheetFor, studentsOf } from './results-db';
import { TEACHING_ASSIGNMENTS } from './school-db';
import { armById, subjectByCode, termById } from './scope';

export interface AssessmentRecord {
  id: string;
  termId: string;
  assignmentId: string;
  armId: string;
  subject: string;
  teacherId: string;
  componentKey: SheetComponent['key'];
  /** "YYYY-MM-DD" */
  date: string;
  topics: string;
  instructions: string;
  createdAt: string;
}

export const ASSESSMENTS: AssessmentRecord[] = [];
export const assessmentKey = (id: string) => `assessment:${id}`;
let seq = 0;

/** Scored / absent / exempt / missing for one component of a class's sheet. */
export function componentCounts(termId: string, armId: string, subject: string, key: string) {
  const sheet = sheetFor(termId, armId, subject);
  if (!sheet) return { students: 0, scored: 0, absent: 0, exempt: 0, missing: 0, sheetId: '' };
  const index = schemeOf(sheet).components.findIndex((c) => c.key === key);
  const students = studentsOf(sheet);
  let scored = 0;
  let absent = 0;
  let exempt = 0;
  for (const s of students) {
    const v = sheet.scores[s.id]?.[index] ?? null;
    if (typeof v === 'number') scored++;
    else if (v === 'ABS') absent++;
    else if (v === 'EXM') exempt++;
  }
  return {
    students: students.length,
    scored,
    absent,
    exempt,
    missing: students.length - scored - absent - exempt,
    sheetId: sheet.id,
  };
}

export function statusOf(a: AssessmentRecord): AssessmentStatus {
  if (a.date > isoToday()) return 'Scheduled';
  const c = componentCounts(a.termId, a.armId, a.subject, a.componentKey);
  return c.students > 0 && c.missing === 0 ? 'Scored' : 'Done';
}

const invalid = (field: string, message: string): never => {
  throw new MockHttpError(422, message, 'VALIDATION', { [field]: message });
};

/**
 * Date rules: a real "YYYY-MM-DD" inside the term, a school day, and (for new dates) not before
 * today. 422 with the reason under `date`.
 */
export function checkDate(termId: string, date: unknown, isNew: boolean): string {
  const term = termById(termId);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)))
    return invalid('date', 'Choose a date.');
  if (date < term.start || date > term.end)
    return invalid(
      'date',
      `Choose a date inside ${term.name} (${formatDay(term.start)} – ${formatDay(term.end)}).`,
    );
  if (isNew && date < isoToday())
    return invalid('date', `Choose today (${formatDay(isoToday())}) or a later date.`);
  const closed = closureReason(date);
  if (closed) return invalid('date', `There are no classes on ${formatDay(date)} (${closed}).`);
  return date;
}

export function checkText(body: Record<string, unknown> | undefined) {
  const topics = typeof body?.topics === 'string' ? body.topics.trim() : '';
  const instructions = typeof body?.instructions === 'string' ? body.instructions.trim() : '';
  const fields: Record<string, string> = {};
  if (topics.length < 3) fields.topics = 'List the topics it covers.';
  else if (topics.length > 300) fields.topics = 'Keep the topics under 300 characters.';
  if (instructions.length > 1000)
    fields.instructions = 'Keep the instructions under 1,000 characters.';
  if (Object.keys(fields).length)
    throw new MockHttpError(422, 'Check the highlighted fields.', 'VALIDATION', fields);
  return { topics, instructions };
}

export function scheduledFor(termId: string, armId: string, subject: string) {
  return ASSESSMENTS.filter(
    (a) => a.termId === termId && a.armId === armId && a.subject === subject,
  );
}

export function createAssessment(
  record: Omit<AssessmentRecord, 'id' | 'createdAt'>,
  by: string,
  createdAt = nowLocal(),
) {
  const existing = scheduledFor(record.termId, record.armId, record.subject).find(
    (a) => a.componentKey === record.componentKey,
  );
  const arm = armById(record.armId);
  if (existing)
    throw new MockHttpError(
      409,
      `${componentName(record)} is already scheduled for ${arm.name} · ${subjectByCode(record.subject).name} on ${formatDay(existing.date)}. Reschedule it instead.`,
      'DUPLICATE',
    );
  const a: AssessmentRecord = { ...record, id: `as-${++seq}`, createdAt };
  ASSESSMENTS.push(a);
  logHistory(
    assessmentKey(a.id),
    `Scheduled by ${by}`,
    `${formatDay(a.date)} · students see it in their portal`,
    'info',
    createdAt,
  );
  return a;
}

export const componentName = (a: Pick<AssessmentRecord, 'armId' | 'componentKey'>) =>
  schemeOf(a).components.find((c) => c.key === a.componentKey)?.name ?? a.componentKey;

/* ---------- Seed ---------- */

/** Usual dates per component in First Term: CA 1 in October, CA 2 in November, exams in the exam window. */
const FIRST_TERM_DATES: Record<SheetComponent['key'], string> = {
  CA1: '2026-10-13',
  CA2: '2026-11-17',
  EXAM: '2026-11-25',
};
const THIRD_TERM_DATES: Record<SheetComponent['key'], string> = {
  CA1: '2026-05-19',
  CA2: '2026-06-16',
  EXAM: '2026-07-07',
};
const TOPICS: Record<SheetComponent['key'], string> = {
  CA1: 'First half of the term’s scheme of work',
  CA2: 'Second half of the term’s scheme of work',
  EXAM: 'Everything covered this term',
};
/** Components left unscheduled so the demo accounts have something to schedule. */
const UNSCHEDULED = new Set([
  't-2627-1|mc-jss1a|MTH|CA2',
  't-2627-1|lk-sss1a|FMT|CA2',
  't-2627-1|mc-jss2a|ENG|EXAM',
  't-2627-1|mc-sss2a|PHY|CA2',
]);
/** Staggered so classes don't all sit an exam on the same morning. */
const nextSchoolDay = (date: string, offset: number) => {
  let d = addDays(date, offset);
  while (closureReason(d)) d = addDays(d, 1);
  return d;
};

(function seedAssessments() {
  TEACHING_ASSIGNMENTS.forEach((ta, i) => {
    const term = termById(ta.termId);
    const dates = term.status === 'Closed' ? THIRD_TERM_DATES : FIRST_TERM_DATES;
    for (const c of schemeOf(ta).components) {
      if (UNSCHEDULED.has(`${ta.termId}|${ta.armId}|${ta.subject}|${c.key}`)) continue;
      const date = nextSchoolDay(dates[c.key], i % 4);
      createAssessment(
        {
          termId: ta.termId,
          assignmentId: ta.id,
          armId: ta.armId,
          subject: ta.subject,
          teacherId: ta.teacherId,
          componentKey: c.key,
          date,
          topics: TOPICS[c.key],
          instructions: c.key === 'EXAM' ? 'Bring a pencil, ruler and calculator.' : '',
        },
        'the teacher',
        `${addDays(date, -14)}T09:00`,
      );
    }
  });
  // One still to come: Mrs. Okafor's make-up JSS 2A English test this week.
  const make = TEACHING_ASSIGNMENTS.find(
    (t) => t.termId === 't-2627-1' && t.armId === 'mc-jss2a' && t.subject === 'ENG',
  );
  if (make)
    createAssessment(
      {
        termId: make.termId,
        assignmentId: make.id,
        armId: make.armId,
        subject: make.subject,
        teacherId: make.teacherId,
        componentKey: 'EXAM',
        date: '2026-12-10',
        topics: 'Comprehension, summary writing and the term’s grammar topics',
        instructions: 'Sat in the hall at 09:00. Bring two pens.',
      },
      'Mrs. Grace Okafor',
      '2026-12-04T13:00',
    );
})();
