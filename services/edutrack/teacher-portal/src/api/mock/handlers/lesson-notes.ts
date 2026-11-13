/**
 * Weekly lesson notes (every teacher, for their own subjects and class levels).
 *
 * GET  /v1/lesson-notes?term=     weeks, my subjects × levels, every expected note up to next week
 * POST /v1/lesson-notes           new { subject, level, week, topic, objectives[], content,
 *                                 attachment?, schemeTopic, submit } (409 DUPLICATE for the same week)
 * GET  /v1/lesson-notes/:noteId   one of my notes, with history
 * PUT  /v1/lesson-notes/:noteId   edit a Draft / Returned note { …, submit } (resubmits to the same reviewer)
 */
import { mock } from '@edutrack/web-core/mock';

import { routesPath as r } from '@/router/routes-path';
import type { LessonNote, LessonNotesList } from '@/types';

import { isoToday } from '../clock';
import {
  createNote,
  currentWeek,
  noteRows,
  noteView,
  requireOwnNote,
  slotsOf,
  termWeeks,
  updateNote,
  lessonNotesDueFor,
  NOTES,
} from '../lesson-notes-db';
import { currentTeacher, termFor, termLockReason } from '../scope';
import { registerNavCount } from './shell';

mock.get('/v1/lesson-notes', (req): LessonNotesList => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const rows = noteRows(t.id, term.id);
  const lock = termLockReason(term.id);
  return {
    termId: term.id,
    editable: !lock,
    lockReason: lock,
    today: isoToday(),
    currentWeek: currentWeek(term.id),
    weeks: termWeeks(term.id),
    slots: slotsOf(t.id, term.id),
    rows,
    counts: {
      overdue: rows.filter((x) => x.overdue).length,
      dueThisWeek: rows.filter((x) => x.dueThisWeek).length,
      returned: rows.filter((x) => x.status === 'Returned').length,
      waiting: rows.filter((x) => x.status === 'Submitted').length,
      approved: NOTES.filter(
        (n) => n.teacherId === t.id && n.termId === term.id && n.status === 'Approved',
      ).length,
    },
  };
});

mock.post('/v1/lesson-notes', (req): LessonNote => {
  const t = currentTeacher(req);
  const term = termFor(req);
  return noteView(createNote(t.id, term.id, req.body));
});

mock.get('/v1/lesson-notes/:noteId', (req): LessonNote => {
  const t = currentTeacher(req);
  return noteView(requireOwnNote(t.id, req.params.noteId!));
});

mock.put('/v1/lesson-notes/:noteId', (req): LessonNote => {
  const t = currentTeacher(req);
  return noteView(updateNote(requireOwnNote(t.id, req.params.noteId!), req.body));
});

/** Sidebar: returned notes plus overdue ones (not sent after their due date). */
registerNavCount(r.lessonNotes.list.name, (teacherId, termId) => {
  const due = lessonNotesDueFor(teacherId, termId);
  return due.returned + due.overdue;
});
