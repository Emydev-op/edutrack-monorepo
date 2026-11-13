/**
 * The dashboard: one resilient endpoint whose blocks (metrics, today's lessons, to-do) are each
 * computed on their own. A block that throws comes back as `{ ok: false, error }` and the rest of
 * the page still renders.
 *
 * GET /v1/dashboard?term=   greeting context, metrics, today's lessons, to-do list
 *
 * Mock only: `?simulate=lessons,todo` makes those blocks fail, to show the partial-failure state.
 *
 * Every figure is derived from the other areas' state through their exported helpers, so the
 * dashboard recomputes after any change (the UI invalidates `queryKeys.dashboard.all`).
 */
import { mock } from '@edutrack/web-core/mock';

import { routesPath as r } from '@/router/routes-path';
import type {
  Dashboard,
  DashboardBlock,
  DashboardLessons,
  DashboardMetrics,
  DashboardTodo,
} from '@/types';

import { TO_GRADE, assignmentsOfTeacher, submissionsFor, toGradeCount } from '../assignments-db';
import { formatDay, isoToday, nowLocal, weekdayOf } from '../clock';
import { noteRows, notesWaitingOn } from '../lesson-notes-db';
import { registerLock, registerTakenToday } from '../register-db';
import { remarksProgress, reportCardLock } from '../report-cards-db';
import {
  SHEETS,
  entryClosed,
  hodLabel,
  isWithHod,
  lockOf,
  rowsOf,
  schemeOf,
  sheetCountsFor,
  sheetSummary,
  type SheetRecord,
} from '../results-db';
import { BRANCHES } from '../school-db';
import {
  assignmentsOf,
  classArmOf,
  classLabel,
  currentTeacher,
  noteReviewDepartments,
  sheetReviewDepartments,
  termFor,
  termLockReason,
} from '../scope';
import { isPublished, todayNoteFor, todaysLessons } from '../teaching-db';

/* ---------- Helpers ---------- */

function block<T>(name: string, simulate: string[], build: () => T): DashboardBlock<T> {
  try {
    if (simulate.includes(name)) throw new Error('simulated');
    return { ok: true, data: build() };
  } catch {
    return {
      ok: false,
      error: 'Something went wrong on our side. The rest of your dashboard is up to date.',
    };
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Up to this many grading items on the to-do list; beyond it the rest are summed in one. */
const GRADE_ITEMS = 3;
/** "Fri 11 Dec, 23:59" */
const deadlineLabel = (local: string) =>
  `${DAYS[weekdayOf(local.slice(0, 10))]} ${formatDay(local.slice(0, 10), false)}, ${local.slice(11, 16)}`;

/** "3 days left" / "14 hours left" to a local deadline from the demo clock. */
function timeLeft(deadline: string) {
  const minutes = (local: string) =>
    Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10)) / 60_000 +
    +local.slice(11, 13) * 60 +
    +local.slice(14, 16);
  const left = minutes(deadline) - minutes(nowLocal());
  const days = Math.floor(left / 1440);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.max(1, Math.floor(left / 60));
  return `${hours} hour${hours === 1 ? '' : 's'} left`;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** The first blank cell of a sheet, for a link that opens the sheet on it. */
function firstMissing(sheet: SheetRecord) {
  const keys = schemeOf(sheet).components.map((c) => c.key);
  for (const row of rowsOf(sheet)) {
    const i = row.scores.findIndex((v) => v === null);
    if (i >= 0) return { focus: keys[i]!, student: row.studentId };
  }
  return null;
}

const sheetLink = (sheet: SheetRecord, focus?: { focus: string; student: string } | null) => ({
  name: r.results.sheet.name,
  params: { sheetId: sheet.id },
  ...(focus ? { query: { focus: focus.focus, student: focus.student } } : {}),
});

/** Sheets waiting on an HOD's decision. */
const sheetsWaitingOn = (reviewerId: string, termId: string) =>
  SHEETS.filter((s) => s.termId === termId && s.reviewerId === reviewerId && isWithHod(s));

/* ---------- Blocks ---------- */

function metricsFor(teacherId: string, termId: string): DashboardMetrics {
  const lessons = todaysLessons(teacherId, termId);
  const next = lessons.find((l) => l.status === 'Now' || l.status === 'Next') ?? null;
  const counts = sheetCountsFor(teacherId, termId);
  const assignments = assignmentsOfTeacher(teacherId, termId);
  const arm = classArmOf(teacherId, termId);
  const sheetDepts = sheetReviewDepartments(teacherId).length > 0;
  const noteDepts = noteReviewDepartments(teacherId).length > 0;
  const lock = arm ? registerLock(termId, isoToday()) : null;
  return {
    classesToday: lessons.length,
    nextLesson: next
      ? {
          armName: next.armName,
          subjectName: next.subjectName,
          start: next.start,
          end: next.end,
          now: next.status === 'Now',
        }
      : null,
    noLessonsReason: lessons.length ? null : todayNoteFor(termId),
    toGrade: assignmentsOf(teacherId, termId).length ? toGradeCount(teacherId, termId) : 0,
    toGradeAssignments: assignments.filter((a) =>
      submissionsFor(a).some((s) => TO_GRADE.includes(s.status)),
    ).length,
    sheets: {
      submitted: counts.submitted,
      total: counts.total,
      deadline: counts.deadline,
      entryOpen: termLockReason(termId) === null && !entryClosed(termId),
    },
    register: arm
      ? {
          armName: arm.name,
          taken: registerTakenToday(arm.id) && !lock,
          closedReason: lock?.reason ?? null,
        }
      : null,
    reviews:
      sheetDepts || noteDepts
        ? {
            sheets: sheetDepts ? sheetsWaitingOn(teacherId, termId).length : null,
            notes: noteDepts ? notesWaitingOn(teacherId, termId) : null,
          }
        : null,
  };
}

function lessonsBlock(teacherId: string, termId: string): DashboardLessons {
  return {
    lessons: todaysLessons(teacherId, termId),
    note: todayNoteFor(termId),
    multiCampus: new Set(assignmentsOf(teacherId, termId).map((a) => a.branchId)).size > 1,
    published: isPublished(termId),
  };
}

/** Everything that needs the teacher, most urgent first. Empty for read-only terms. */
function todoFor(teacherId: string, termId: string): DashboardTodo[] {
  if (termLockReason(termId)) return [];
  const out: DashboardTodo[] = [];
  const mine = SHEETS.filter((s) => s.teacherId === teacherId && s.termId === termId);

  // 1. Sheets returned to me, with the reviewer's comment.
  for (const s of mine.filter((x) => x.status === 'Returned')) {
    const by =
      s.returnedBy === 'hod' && s.reviewerId ? hodLabel(s.reviewerId) : 'The academic office';
    const missing = sheetSummary(s).completion.missing;
    out.push({
      id: `sheet-returned:${s.id}`,
      kind: 'sheet-returned',
      badge: { label: 'Returned', tone: 'error' },
      title: `${classLabel(s.armId, s.subject)} result sheet was returned`,
      detail: `${by}: “${s.returnNote}”${missing ? ` · ${plural(missing, 'student')} with missing scores` : ''}`,
      action: 'Open sheet',
      to: sheetLink(s, missing ? firstMissing(s) : null),
    });
  }

  // 2. Sheets still open for entry with missing scores, and the deadline.
  for (const s of mine.filter((x) => x.status === 'Draft' || x.status === 'Not started')) {
    if (lockOf(s)) continue;
    const summary = sheetSummary(s);
    const deadline = summary.deadline;
    if (!summary.completion.missing) {
      // Every score is in but the sheet hasn't gone for review yet: nudge before the deadline.
      if (s.status === 'Draft' && summary.completion.total > 0)
        out.push({
          id: `sheet-ready:${s.id}`,
          kind: 'sheet-ready',
          badge: { label: 'Ready to submit', tone: 'success' },
          title: `${classLabel(s.armId, s.subject)} is complete: submit it for review`,
          detail: deadline
            ? `Result entry closes ${deadlineLabel(deadline)} · ${timeLeft(deadline)}`
            : 'Check the totals on the Review tab, then submit.',
          action: 'Review and submit',
          to: { ...sheetLink(s, null), query: { tab: 'review' } },
        });
      continue;
    }
    out.push({
      id: `sheet-missing:${s.id}`,
      kind: 'sheet-missing',
      badge: { label: 'Missing scores', tone: 'warning' },
      title: `${classLabel(s.armId, s.subject)}: ${plural(summary.completion.missing, 'student')} with missing scores`,
      detail: deadline
        ? `Result entry closes ${deadlineLabel(deadline)} · ${timeLeft(deadline)}`
        : 'Enter every score, then submit the sheet for review.',
      action: s.status === 'Not started' ? 'Start sheet' : 'Enter scores',
      to: sheetLink(s, firstMissing(s)),
    });
  }

  // 3. Register not taken today (class teachers).
  const arm = classArmOf(teacherId, termId);
  if (arm && !registerLock(termId, isoToday()) && !registerTakenToday(arm.id))
    out.push({
      id: `register:${arm.id}:${isoToday()}`,
      kind: 'register',
      badge: { label: 'Register', tone: 'warning' },
      title: `Take today’s register for ${arm.name}`,
      detail: `${formatDay(isoToday())} · guardians of absent students are notified when you save`,
      action: 'Take register',
      to: { name: r.classTeacher.register.name },
    });

  // 4. Submissions to grade: the assignments with the most waiting, then one line for the rest, so
  // a teacher with many open assignments isn't handed a wall of near-identical items.
  const grading = assignmentsOfTeacher(teacherId, termId)
    .map((a) => ({
      a,
      waiting: submissionsFor(a).filter((s) => TO_GRADE.includes(s.status)).length,
    }))
    .filter((x) => x.waiting > 0)
    .sort((x, y) => y.waiting - x.waiting || x.a.title.localeCompare(y.a.title));
  const shown = grading.length > GRADE_ITEMS ? grading.slice(0, GRADE_ITEMS - 1) : grading;
  for (const { a, waiting } of shown)
    out.push({
      id: `grade:${a.id}`,
      kind: 'grade',
      badge: { label: 'To grade', tone: 'info' },
      title: `${a.title}: ${plural(waiting, 'submission')} to grade`,
      detail: classLabel(a.armId, a.subject),
      action: 'Grade',
      to: { name: r.assignments.submissions.name, params: { assignmentId: a.id } },
    });
  const rest = grading.slice(shown.length);
  if (rest.length) {
    const waiting = rest.reduce((n, x) => n + x.waiting, 0);
    out.push({
      id: 'grade:more',
      kind: 'grade',
      badge: { label: 'To grade', tone: 'info' },
      title: `${plural(waiting, 'more submission')} to grade across ${plural(rest.length, 'assignment')}`,
      detail:
        rest
          .slice(0, 3)
          .map((x) => `${x.a.title} (${classLabel(x.a.armId, x.a.subject)})`)
          .join(' · ') + (rest.length > 3 ? ' · …' : ''),
      action: 'See all',
      to: { name: r.assignments.list.name, query: { status: 'To grade' } },
    });
  }

  // 5. Lesson notes: returned, then overdue (oldest first), then due this week.
  const notes = noteRows(teacherId, termId);
  const due = notes.filter((x) => x.status !== 'Returned' && !x.overdue && x.dueThisWeek);
  for (const row of [
    ...notes.filter((x) => x.status === 'Returned'),
    ...notes.filter((x) => x.status !== 'Returned' && x.overdue).reverse(),
    ...(due.length === 1 ? due : []),
  ]) {
    const link = row.noteId
      ? { name: r.lessonNotes.detail.name, params: { noteId: row.noteId } }
      : {
          name: r.lessonNotes.new.name,
          query: { slot: `${row.subject}|${row.level}`, week: String(row.week) },
        };
    const what = `${row.label} · ${row.weekLabel}`;
    if (row.status === 'Returned')
      out.push({
        id: `note-returned:${row.key}`,
        kind: 'note-returned',
        badge: { label: 'Returned', tone: 'error' },
        title: `Lesson note returned: ${what}`,
        detail: `“${row.returnComment}”`,
        action: 'Revise',
        to: link,
      });
    else if (row.overdue)
      out.push({
        id: `note-overdue:${row.key}`,
        kind: 'note-overdue',
        badge: { label: 'Overdue', tone: 'error' },
        title: `Lesson note overdue: ${what}`,
        detail: `Was due ${formatDay(row.due, false)} · ${row.status === 'Draft' ? 'draft not submitted' : 'not written yet'}`,
        action: row.noteId ? 'Finish' : 'Write',
        to: link,
      });
    else if (row.dueThisWeek)
      out.push({
        id: `note-due:${row.key}`,
        kind: 'note-due',
        badge: { label: 'Due this week', tone: 'neutral' },
        title: `Lesson note due: ${what}`,
        detail: `Due ${DAYS[weekdayOf(row.due)]} ${formatDay(row.due, false)}`,
        action: row.noteId ? 'Finish' : 'Write',
        to: link,
      });
  }

  if (due.length > 1)
    out.push({
      id: `note-due:week-${due[0]!.week}`,
      kind: 'note-due',
      badge: { label: 'Due this week', tone: 'neutral' },
      title: `${due.length} lesson notes due ${DAYS[weekdayOf(due[0]!.due)]} ${formatDay(due[0]!.due, false)}`,
      detail: `${due[0]!.weekLabel} · ${due.map((x) => x.label).join(', ')}`,
      action: 'Open',
      to: { name: r.lessonNotes.list.name },
    });

  // 6. Report-card remarks (class teachers).
  if (arm && !reportCardLock(arm.id, termId)) {
    const { done, total } = remarksProgress(arm.id, termId);
    if (done < total)
      out.push({
        id: `remarks:${arm.id}`,
        kind: 'remarks',
        badge: { label: 'Report cards', tone: 'warning' },
        title: `Report-card remarks: ${plural(total - done, 'student')} still to do`,
        detail: `${arm.name} · ${done} of ${total} done · needed before results are published`,
        action: 'Write remarks',
        to: { name: r.classTeacher.reportCards.name },
      });
  }

  // 7. Reviews waiting on me.
  if (sheetReviewDepartments(teacherId).length) {
    const n = sheetsWaitingOn(teacherId, termId).length;
    if (n)
      out.push({
        id: 'review-sheets',
        kind: 'review-sheets',
        badge: { label: 'Review', tone: 'info' },
        title: `${plural(n, 'result sheet')} waiting for your review`,
        detail: 'Forward to the academic office or return to the teacher',
        action: 'Review',
        to: { name: r.reviews.results.name },
      });
  }
  if (noteReviewDepartments(teacherId).length) {
    const n = notesWaitingOn(teacherId, termId);
    if (n)
      out.push({
        id: 'review-notes',
        kind: 'review-notes',
        badge: { label: 'Review', tone: 'info' },
        title: `${plural(n, 'lesson note')} waiting for your review`,
        detail: 'Approve or return with a comment',
        action: 'Review',
        to: { name: r.reviews.lessonNotes.name },
      });
  }
  return out;
}

/* ---------- Endpoint ---------- */

mock.get('/v1/dashboard', (req): Dashboard => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const simulate = (req.query.simulate ?? '').split(',').filter(Boolean);
  const mine = assignmentsOf(t.id, term.id);
  const branchIds = new Set(mine.length ? mine.map((a) => a.branchId) : t.branchIds);
  return {
    termId: term.id,
    termLabel: `${term.sessionName} · ${term.name}`,
    termStatus: term.status,
    lockReason: termLockReason(term.id),
    today: isoToday(),
    now: nowLocal(),
    campuses: BRANCHES.filter((b) => branchIds.has(b.id)).map((b) => b.name),
    hasAssignments: mine.length > 0,
    profileComplete: Boolean(t.phone.trim()),
    metrics: block('metrics', simulate, () => metricsFor(t.id, term.id)),
    lessons: block('lessons', simulate, () => lessonsBlock(t.id, term.id)),
    todo: block('todo', simulate, () => todoFor(t.id, term.id)),
  };
});
