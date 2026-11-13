/**
 * Results: my score sheets for a term, saving drafts, submitting for review, and correction
 * requests on published sheets. The data and rules live in `../results-db`.
 *
 * GET  /v1/results?term=&class=&subject=   my sheets + my correction requests
 * GET  /v1/results/:sheetId                one sheet (mine only)
 * PUT  /v1/results/:sheetId/scores         save a draft { rows: [{ studentId, scores, remark }] }
 * POST /v1/results/:sheetId/submit         submit for review (422 while scores are missing)
 * GET  /v1/corrections?term=               my correction requests
 * GET  /v1/corrections/:id                 one of them
 * POST /v1/corrections                     request a correction on a published sheet
 */
import { mock } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type { Correction, ResultsList, SaveScoresPayload } from '@/types';

import {
  CORRECTIONS,
  SHEETS,
  correctionView,
  entryClosed,
  lockOf,
  requestCorrection,
  requireOwnSheet,
  saveScores,
  sheetById,
  sheetSummary,
  sheetView,
  submitSheet,
} from '../results-db';
import { currentTeacher, forbidden, notFound, termById, termFor } from '../scope';
import { registerNavCount } from './shell';

const myCorrections = (teacherId: string, termId: string): Correction[] =>
  CORRECTIONS.filter((c) => c.requestedById === teacherId && sheetById(c.sheetId).termId === termId)
    .map(correctionView)
    .sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));

mock.get('/v1/results', (req): ResultsList => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const sheets = SHEETS.filter(
    (s) =>
      s.teacherId === t.id &&
      s.termId === term.id &&
      (!req.query.class || s.armId === req.query.class) &&
      (!req.query.subject || s.subject === req.query.subject),
  )
    .map(sheetSummary)
    .sort(
      (a, b) =>
        a.arm.localeCompare(b.arm) ||
        a.branchName.localeCompare(b.branchName) ||
        a.subjectName.localeCompare(b.subjectName),
    );
  return {
    termId: term.id,
    deadline: term.resultEntryCloses,
    entryOpen: term.status === 'Active' && !entryClosed(term.id),
    sheets,
    corrections: myCorrections(t.id, term.id),
  };
});

mock.get('/v1/results/:sheetId', (req) =>
  sheetView(requireOwnSheet(currentTeacher(req).id, req.params.sheetId!)),
);

mock.put('/v1/results/:sheetId/scores', (req) => {
  const sheet = requireOwnSheet(currentTeacher(req).id, req.params.sheetId!);
  return sheetView(saveScores(sheet, req.body as SaveScoresPayload));
});

mock.post('/v1/results/:sheetId/submit', (req) => {
  const sheet = requireOwnSheet(currentTeacher(req).id, req.params.sheetId!);
  return sheetView(submitSheet(sheet));
});

mock.get('/v1/corrections', (req) => {
  const t = currentTeacher(req);
  return myCorrections(t.id, termFor(req).id);
});

mock.get('/v1/corrections/:id', (req) => {
  const t = currentTeacher(req);
  const c = CORRECTIONS.find((x) => x.id === req.params.id) ?? notFound('That correction');
  if (c.requestedById !== t.id) forbidden('You don’t have access to that correction request.');
  return correctionView(c);
});

mock.post('/v1/corrections', (req) => {
  const t = currentTeacher(req);
  return correctionView(requestCorrection(t.id, req.body as Record<string, unknown>));
});

/**
 * Sidebar: my sheets that need me — returned to me, or still open for entry with missing scores
 * before the deadline.
 */
registerNavCount(routesPath.results.list.name, (teacherId, termId) => {
  termById(termId);
  return SHEETS.filter(
    (s) =>
      s.teacherId === teacherId &&
      s.termId === termId &&
      (s.status === 'Returned' ||
        ((s.status === 'Draft' || s.status === 'Not started') &&
          lockOf(s) === null &&
          sheetSummary(s).completion.missing > 0)),
  ).length;
});
