/**
 * Learning materials: list, upload (file or video link), archive and restore. Owned by the
 * Materials builder. Same rules as every feature: own classes only (403), active term only for
 * changes (409 TERM_LOCKED), field problems as 422 with `fields`.
 */
import { mock, paginate, type MockRequest } from '@edutrack/web-core/mock';

import type { MaterialDetail, MaterialList, MaterialRow } from '@/types';
import { MATERIAL_STATUSES } from '@/types';

import { ASSIGNMENTS, unprocessable, fieldError } from '../assignments-db';
import { nowLocal } from '../clock';
import {
  MATERIALS,
  materialById,
  materialKey,
  materialsOfTeacher,
  nextMaterialId,
  validateMaterialBody,
  type MaterialRecord,
} from '../materials-db';
import { logHistory, timelineOf } from '../notify-db';
import {
  armById,
  branchOf,
  classLabel,
  currentTeacher,
  forbidden,
  requireEditableTerm,
  requireTeaching,
  scopeSummary,
  studentsInArmFor,
  subjectByCode,
  termFor,
  termLockReason,
} from '../scope';

const rowOf = (m: MaterialRecord): MaterialRow => ({
  id: m.id,
  termId: m.termId,
  armId: m.armId,
  armName: armById(m.armId).name,
  subject: m.subject,
  subjectName: subjectByCode(m.subject).name,
  classLabel: classLabel(m.armId, m.subject),
  type: m.type,
  title: m.title,
  status: m.status,
  file: m.file,
  link: m.link,
  views: m.views,
  publishedAt: m.publishedAt,
  archivedAt: m.archivedAt,
});

/** Assignments that attach this material. */
const linkedAssignments = (m: MaterialRecord) =>
  ASSIGNMENTS.filter((a) => a.attachments.some((f) => f.materialId === m.id)).map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
  }));

function detailOf(m: MaterialRecord): MaterialDetail {
  const lockReason = termLockReason(m.termId);
  return {
    ...rowOf(m),
    description: m.description,
    branchName: branchOf(armById(m.armId).branchId).name,
    viewers: m.viewerIds.length,
    students: studentsInArmFor(m.armId, m.subject, m.termId).length,
    lastViewedAt: m.lastViewedAt,
    linkedAssignments: linkedAssignments(m),
    permissions: {
      archive: !lockReason && m.status === 'Published',
      restore: !lockReason && m.status === 'Archived',
      lockReason,
    },
    history: timelineOf(materialKey(m.id)),
  };
}

function ownMaterial(req: Pick<MockRequest, 'headers' | 'params'>) {
  const t = currentTeacher(req);
  const m = materialById(req.params.materialId!);
  if (m.teacherId !== t.id)
    forbidden(
      `You don’t have access to this material for ${classLabel(m.armId, m.subject)}. ${scopeSummary(t.id, m.termId)}`,
    );
  requireTeaching(t.id, m.termId, m.armId, m.subject);
  return m;
}

mock.get('/v1/materials', (req): MaterialList => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const { class: armId, subject, type, status } = req.query;
  if (armId && subject) requireTeaching(t.id, term.id, armId, subject);
  const mine = materialsOfTeacher(t.id, term.id).filter(
    (m) => (!armId || m.armId === armId) && (!subject || m.subject === subject),
  );
  const counts = Object.fromEntries(
    MATERIAL_STATUSES.map((s) => [s, mine.filter((m) => m.status === s).length]),
  ) as MaterialList['counts'];
  const rows = mine
    .filter((m) => (!type || m.type === type) && (!status || m.status === status))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map(rowOf);
  return {
    ...paginate(rows, req.query, (r) => `${r.title} ${r.classLabel} ${r.type}`),
    counts,
  };
});

mock.get('/v1/materials/:materialId', (req): MaterialDetail => detailOf(ownMaterial(req)));

mock.post('/v1/materials', (req): MaterialDetail => {
  const t = currentTeacher(req);
  const term = termFor(req);
  requireEditableTerm(term.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const armId = typeof body.armId === 'string' ? body.armId : '';
  const subject = typeof body.subject === 'string' ? body.subject : '';
  if (!armId || !subject) fieldError('armId', 'Choose the class and subject.');
  requireTeaching(t.id, term.id, armId, subject);
  const clean = validateMaterialBody(body);
  const m: MaterialRecord = {
    id: nextMaterialId(),
    termId: term.id,
    teacherId: t.id,
    armId,
    subject,
    ...clean,
    status: 'Published',
    publishedAt: nowLocal(),
    archivedAt: null,
    views: 0,
    viewerIds: [],
    lastViewedAt: null,
  };
  MATERIALS.push(m);
  const students = studentsInArmFor(armId, subject, term.id).length;
  logHistory(materialKey(m.id), 'Published', `Shared with ${students} students`, 'info');
  return detailOf(m);
});

mock.post('/v1/materials/:materialId/archive', (req): MaterialDetail => {
  const m = ownMaterial(req);
  requireEditableTerm(m.termId);
  if (m.status === 'Archived') unprocessable('This material is already archived.');
  m.status = 'Archived';
  m.archivedAt = nowLocal();
  const links = linkedAssignments(m).length;
  logHistory(
    materialKey(m.id),
    'Archived',
    links
      ? `Students stopped seeing it. ${links} assignment${links === 1 ? '' : 's'} now show it as unavailable.`
      : 'Students stopped seeing it.',
    'neutral',
  );
  return detailOf(m);
});

mock.post('/v1/materials/:materialId/restore', (req): MaterialDetail => {
  const m = ownMaterial(req);
  requireEditableTerm(m.termId);
  if (m.status === 'Published') unprocessable('This material is already published.');
  m.status = 'Published';
  m.archivedAt = null;
  logHistory(materialKey(m.id), 'Restored', 'Students can see it again.', 'info');
  return detailOf(m);
});
