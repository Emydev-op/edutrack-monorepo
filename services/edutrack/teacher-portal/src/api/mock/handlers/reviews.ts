/**
 * Reviews (HODs and the Academic Head).
 *
 * Result sheets — HODs only, for their own department, never their own sheets:
 * GET  /v1/reviews/sheets?term=              waiting on me + recently decided by me
 * GET  /v1/reviews/sheets/:sheetId           one sheet, read-only, with whether I can act
 * POST /v1/reviews/sheets/:sheetId/forward   Submitted → Under review (the academic office)
 * POST /v1/reviews/sheets/:sheetId/return    Submitted → Returned { comment } (10+ characters)
 *
 * Lesson notes — HODs for their department, the Academic Head for departments with no HOD and
 * HODs' own notes; never their own: see the section at the bottom.
 */
import { mock } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type {
  ReviewNote,
  ReviewNoteSummary,
  ReviewNotesList,
  ReviewSheet,
  ReviewSheetSummary,
  ReviewSheetsList,
} from '@/types';

import {
  NOTES,
  approveNote,
  noteById,
  noteDepartment,
  noteSummary,
  noteView,
  notesWaitingOn,
  returnNote,
  waitingNotes,
  type NoteRecord,
} from '../lesson-notes-db';

import {
  SHEETS,
  forwardSheet,
  isWithHod,
  returnSheet,
  sheetById,
  sheetSummary,
  sheetView,
  stamp,
  type SheetRecord,
} from '../results-db';
import {
  currentTeacher,
  departmentOfSubject,
  forbidden,
  isAcademicHead,
  isEditableTerm,
  noteReviewDepartments,
  sheetReviewDepartments,
  staffById,
  termFor,
} from '../scope';
import { registerNavCount } from './shell';

/* ---------- Result sheets ---------- */

/** The HOD's departments, or 403 for anyone who doesn't review sheets. */
function requireSheetReviewer(teacherId: string) {
  const depts = sheetReviewDepartments(teacherId);
  if (!depts.length) forbidden('Result sheet reviews are for heads of department.');
  return depts;
}

/** A sheet this HOD may open: their department, not their own, and sent to them. */
function requireReviewable(teacherId: string, sheetId: string): SheetRecord {
  const depts = requireSheetReviewer(teacherId);
  const sheet = sheetById(sheetId);
  const dept = departmentOfSubject(sheet.subject);
  if (!depts.some((d) => d.id === dept.id))
    forbidden(
      `You don’t review ${dept.name} sheets. You review ${depts.map((d) => d.name).join(', ')} sheets.`,
    );
  if (sheet.teacherId === teacherId)
    forbidden(
      'You can’t review your own sheet. It goes straight to the academic office when you submit it.',
    );
  if (sheet.reviewerId !== teacherId)
    forbidden('This sheet hasn’t been submitted to you for review.');
  return sheet;
}

function reviewSummary(sheet: SheetRecord): ReviewSheetSummary {
  const s = sheetSummary(sheet);
  const view = sheetView(sheet);
  const decision =
    sheet.status === 'Returned' && sheet.returnedAt
      ? `Returned ${stamp(sheet.returnedAt)}`
      : sheet.forwardedAt && !isWithHod(sheet)
        ? `Forwarded ${stamp(sheet.forwardedAt)}`
        : null;
  return {
    id: s.id,
    armId: s.armId,
    arm: s.arm,
    subject: s.subject,
    subjectName: s.subjectName,
    branchName: s.branchName,
    teacher: staffById(sheet.teacherId).name,
    students: s.students,
    status: s.status,
    submittedAt: s.submittedAt,
    average: view.stats.average,
    absent: view.stats.absent,
    exempt: view.stats.exempt,
    decision,
  };
}

const waitingOn = (teacherId: string, termId: string) =>
  SHEETS.filter((s) => s.termId === termId && s.reviewerId === teacherId && isWithHod(s));

mock.get('/v1/reviews/sheets', (req): ReviewSheetsList => {
  const t = currentTeacher(req);
  const depts = requireSheetReviewer(t.id);
  const term = termFor(req);
  const mine = SHEETS.filter(
    (s) => s.termId === term.id && s.reviewerId === t.id && s.teacherId !== t.id,
  );
  const latest = (s: SheetRecord) => s.returnedAt ?? s.forwardedAt ?? s.submittedAt ?? '';
  return {
    department: depts.map((d) => d.name).join(', '),
    waiting: mine
      .filter(isWithHod)
      .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
      .map(reviewSummary),
    recent: mine
      .filter((s) => !isWithHod(s))
      .sort((a, b) => latest(b).localeCompare(latest(a)))
      .map(reviewSummary),
  };
});

mock.get('/v1/reviews/sheets/:sheetId', (req): ReviewSheet => {
  const t = currentTeacher(req);
  const sheet = requireReviewable(t.id, req.params.sheetId!);
  const view = sheetView(sheet);
  const canDecide = isWithHod(sheet) && isEditableTerm(sheet.termId);
  return {
    ...view,
    canDecide,
    decisionNote: canDecide
      ? null
      : isWithHod(sheet)
        ? 'This term is closed. Its sheets are read-only.'
        : sheet.status === 'Returned'
          ? 'You returned this sheet to the teacher. It comes back to you when they resubmit.'
          : 'You forwarded this sheet. It’s with the academic office now.',
  };
});

mock.post('/v1/reviews/sheets/:sheetId/forward', (req) => {
  const t = currentTeacher(req);
  const sheet = requireReviewable(t.id, req.params.sheetId!);
  return sheetView(forwardSheet(sheet, t.id));
});

mock.post('/v1/reviews/sheets/:sheetId/return', (req) => {
  const t = currentTeacher(req);
  const sheet = requireReviewable(t.id, req.params.sheetId!);
  return sheetView(returnSheet(sheet, t.id, (req.body as { comment?: unknown })?.comment));
});

/** Sidebar: result sheets waiting on me. */
registerNavCount(
  routesPath.reviews.results.name,
  (teacherId, termId) => waitingOn(teacherId, termId).length,
);

/* ---------- Lesson notes ---------- */
// GET  /v1/reviews/notes?term=              notes waiting on me + recently decided by me
// GET  /v1/reviews/notes/:noteId            one note, with whether I can act
// POST /v1/reviews/notes/:noteId/approve    Submitted → Approved
// POST /v1/reviews/notes/:noteId/return     Submitted → Returned { comment } (10+ characters)
//
// HODs review their department's notes; the Academic Head reviews departments with no HOD and
// HODs' own notes. Scope is "sent to me" (`reviewerId`), since that's fixed at submission.

/** The departments whose notes this teacher reviews, or 403. */
function requireNoteReviewer(teacherId: string) {
  const depts = noteReviewDepartments(teacherId);
  if (!depts.length && !isAcademicHead(teacherId))
    forbidden('Lesson note reviews are for HODs and the Academic Head.');
  return depts;
}

function requireReviewableNote(teacherId: string, noteId: string): NoteRecord {
  const depts = requireNoteReviewer(teacherId);
  const note = noteById(noteId);
  if (note.teacherId === teacherId)
    forbidden(
      'You can’t review your own lesson note. It goes to the Academic Head when you submit it.',
    );
  if (note.reviewerId === teacherId && note.submittedAt) return note;
  const dept = noteDepartment(note);
  if (!depts.some((d) => d.id === dept.id))
    forbidden(
      `You don’t review ${dept.name} lesson notes. You review ${
        depts.length ? depts.map((d) => d.name).join(', ') : 'HODs’'
      } notes${isAcademicHead(teacherId) && depts.length ? ' and HODs’ own notes' : ''}.`,
    );
  return forbidden('This lesson note hasn’t been submitted to you for review.');
}

const noteDecision = (n: NoteRecord) =>
  n.status === 'Approved' && n.decidedAt
    ? `Approved ${stamp(n.decidedAt)}`
    : n.status === 'Returned' && n.decidedAt
      ? `Returned ${stamp(n.decidedAt)}`
      : null;

const reviewNoteSummary = (n: NoteRecord): ReviewNoteSummary => ({
  ...noteSummary(n),
  department: noteDepartment(n).name,
  decision: noteDecision(n),
});

mock.get('/v1/reviews/notes', (req): ReviewNotesList => {
  const t = currentTeacher(req);
  const depts = requireNoteReviewer(t.id);
  const term = termFor(req);
  const mine = NOTES.filter(
    (n) => n.termId === term.id && n.reviewerId === t.id && n.teacherId !== t.id && n.submittedAt,
  );
  return {
    scope: [...depts.map((d) => d.name), ...(isAcademicHead(t.id) ? ['HODs’ own notes'] : [])].join(
      ', ',
    ),
    waiting: waitingNotes(t.id, term.id)
      .filter((n) => n.teacherId !== t.id)
      .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
      .map(reviewNoteSummary),
    recent: mine
      .filter((n) => n.status !== 'Submitted' && n.decidedAt)
      .sort((a, b) => b.decidedAt!.localeCompare(a.decidedAt!))
      .slice(0, 12)
      .map(reviewNoteSummary),
  };
});

const reviewNote = (n: NoteRecord): ReviewNote => {
  const view = noteView(n);
  const canDecide = n.status === 'Submitted' && isEditableTerm(n.termId);
  return {
    ...view,
    department: noteDepartment(n).name,
    decision: noteDecision(n),
    canDecide,
    decisionNote: canDecide
      ? null
      : n.status === 'Submitted'
        ? 'This term is closed. Its lesson notes are read-only.'
        : n.status === 'Returned'
          ? 'You returned this note to the teacher. It comes back to you when they resubmit it.'
          : n.status === 'Approved'
            ? 'You approved this note.'
            : 'The teacher is still working on this note.',
  };
};

mock.get('/v1/reviews/notes/:noteId', (req): ReviewNote => {
  const t = currentTeacher(req);
  return reviewNote(requireReviewableNote(t.id, req.params.noteId!));
});

mock.post('/v1/reviews/notes/:noteId/approve', (req): ReviewNote => {
  const t = currentTeacher(req);
  return reviewNote(approveNote(requireReviewableNote(t.id, req.params.noteId!), t.id));
});

mock.post('/v1/reviews/notes/:noteId/return', (req): ReviewNote => {
  const t = currentTeacher(req);
  const note = requireReviewableNote(t.id, req.params.noteId!);
  return reviewNote(returnNote(note, t.id, (req.body as { comment?: unknown })?.comment));
});

/** Sidebar: lesson notes waiting on me. */
registerNavCount(routesPath.reviews.lessonNotes.name, (teacherId, termId) =>
  notesWaitingOn(teacherId, termId),
);
