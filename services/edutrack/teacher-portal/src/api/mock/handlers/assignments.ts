/**
 * Assignments, submissions and grading. Owned by the Assignments builder.
 *
 * Every endpoint resolves the teacher from the token, keeps to their own teaching assignments
 * (403 naming what they do teach) and refuses changes outside the active term (409 TERM_LOCKED).
 * Field problems answer 422 with `fields: { <field>: message }`.
 */
import { mock, paginate, type MockRequest } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type {
  AssignmentDetail,
  AssignmentList,
  AssignmentPermissions,
  AssignmentRow,
  AssignmentStatus,
  BulkReturnResult,
  FileRef,
  StudentAssignmentRow,
  SubmissionDetail,
  SubmissionList,
  SubmissionRow,
  SubmissionStatus,
} from '@/types';
import { ASSIGNMENT_STATUSES, SUBMISSION_STATUSES } from '@/types';

import {
  ASSIGNMENTS,
  assignmentById,
  assignmentKey,
  assignmentsOfTeacher,
  countsOf,
  fieldError,
  HANDED_IN,
  highestScoreOf,
  isDueSoon,
  isPastDue,
  nextAssignmentId,
  studentsFor,
  studentAssignments,
  submissionById,
  submissionKey,
  submissionsFor,
  TO_GRADE,
  toGradeCount,
  unprocessable,
  validateAssignmentBody,
  validateScore,
  type AssignmentRecord,
  type SubmissionRecord,
} from '../assignments-db';
import { isoToday, nowLocal } from '../clock';
import { MATERIALS } from '../materials-db';
import { logHistory, timelineOf } from '../notify-db';
import {
  armById,
  assignmentsOf,
  branchOf,
  classLabel,
  currentTeacher,
  forbidden,
  requireEditableTerm,
  requireStudentInScope,
  requireTeaching,
  scopeSummary,
  studentById,
  subjectByCode,
  termById,
  termFor,
  termLockReason,
} from '../scope';
import { registerNavCount } from './shell';

/* ---------- Shapes ---------- */

function rowOf(a: AssignmentRecord): AssignmentRow {
  const arm = armById(a.armId);
  const subs = submissionsFor(a);
  return {
    id: a.id,
    termId: a.termId,
    armId: a.armId,
    armName: arm.name,
    subject: a.subject,
    subjectName: subjectByCode(a.subject).name,
    classLabel: classLabel(a.armId, a.subject),
    branchName: branchOf(arm.branchId).name,
    title: a.title,
    status: a.status,
    dueAt: a.dueAt,
    maxScore: a.maxScore,
    allowLate: a.allowLate,
    students: studentsFor(a).length,
    submitted: subs.filter((s) => HANDED_IN.includes(s.status)).length,
    toGrade: subs.filter((s) => TO_GRADE.includes(s.status)).length,
    dueSoon: isDueSoon(a),
    pastDue: isPastDue(a),
  };
}

function permissionsOf(a: AssignmentRecord): AssignmentPermissions {
  const lockReason = termLockReason(a.termId);
  const open = lockReason === null;
  const term = termById(a.termId);
  return {
    edit: open && a.status !== 'Closed',
    publish: open && a.status === 'Draft',
    close: open && a.status === 'Published',
    reopen: open && a.status === 'Closed' && isoToday() <= term.end,
    delete: open && a.status === 'Draft',
    grade: open && a.status !== 'Draft',
    lockReason,
  };
}

/** Attachments that point at an archived (or missing) material show as unavailable. */
const withAvailability = (files: FileRef[]): FileRef[] =>
  files.map((f) => {
    if (!f.materialId) return f;
    const m = MATERIALS.find((x) => x.id === f.materialId);
    return { ...f, unavailable: !m || m.status !== 'Published' };
  });

function detailOf(a: AssignmentRecord): AssignmentDetail {
  const best = highestScoreOf(a);
  return {
    ...rowOf(a),
    instructions: a.instructions,
    attachments: withAvailability(a.attachments),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    publishedAt: a.publishedAt,
    closedAt: a.closedAt,
    counts: countsOf(a),
    highestScore: best
      ? { score: best.score!, studentName: studentById(best.studentId).name }
      : null,
    permissions: permissionsOf(a),
    history: timelineOf(assignmentKey(a.id)),
  };
}

function submissionRowOf(s: SubmissionRecord): SubmissionRow {
  const st = studentById(s.studentId);
  return {
    id: s.id,
    assignmentId: s.assignmentId,
    studentId: s.studentId,
    studentName: st.name,
    admissionNo: st.admissionNo,
    status: s.status,
    submittedAt: s.submittedAt,
    late: s.late,
    score: s.score,
    files: s.files.length,
    gradedAt: s.gradedAt,
    returnedAt: s.returnedAt,
  };
}

function submissionDetailOf(a: AssignmentRecord, s: SubmissionRecord): SubmissionDetail {
  const list = submissionsFor(a);
  const i = list.findIndex((x) => x.id === s.id);
  return {
    ...submissionRowOf(s),
    fileList: s.files,
    note: s.note,
    feedback: s.feedback,
    excuseReason: s.excuseReason,
    history: timelineOf(submissionKey(s.id)),
    prevId: list[i - 1]?.id ?? null,
    nextId: list[i + 1]?.id ?? null,
    position: i + 1,
    of: list.length,
    assignment: { ...rowOf(a), permissions: permissionsOf(a) },
  };
}

/* ---------- Access ---------- */

type Req = Pick<MockRequest, 'headers' | 'params'>;

/** The assignment by id, if it's one of the teacher's (403 with their scope otherwise). */
function ownAssignment(req: Req) {
  const t = currentTeacher(req);
  const a = assignmentById(req.params.assignmentId!);
  // Someone else's: name the class only, never their work.
  if (a.teacherId !== t.id)
    forbidden(
      `You don’t have access to this assignment for ${classLabel(a.armId, a.subject)}. ${scopeSummary(t.id, a.termId)}`,
    );
  requireTeaching(t.id, a.termId, a.armId, a.subject);
  return { teacher: t, assignment: a };
}

const touch = (a: AssignmentRecord) => (a.updatedAt = nowLocal());

/* ---------- Assignments ---------- */

const STATUS_ORDER: Record<AssignmentStatus, number> = { Published: 0, Draft: 1, Closed: 2 };

mock.get('/v1/assignments', (req): AssignmentList => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const { class: armId, subject, status } = req.query;
  const all = assignmentsOfTeacher(t.id, term.id).filter(
    (a) => (!armId || a.armId === armId) && (!subject || a.subject === subject),
  );
  if (armId && subject) requireTeaching(t.id, term.id, armId, subject);
  const counts = Object.fromEntries(
    ASSIGNMENT_STATUSES.map((s) => [s, all.filter((a) => a.status === s).length]),
  ) as AssignmentList['counts'];
  counts.toGrade = all.reduce(
    (n, a) => n + submissionsFor(a).filter((s) => TO_GRADE.includes(s.status)).length,
    0,
  );
  const rows = all
    .filter((a) => {
      if (!status) return true;
      if (status === 'To grade') return rowOf(a).toGrade > 0;
      return a.status === status;
    })
    .sort(
      (x, y) =>
        STATUS_ORDER[x.status] - STATUS_ORDER[y.status] ||
        (x.status === 'Closed'
          ? (y.dueAt ?? '').localeCompare(x.dueAt ?? '')
          : (x.dueAt ?? '9999').localeCompare(y.dueAt ?? '9999')),
    )
    .map(rowOf);
  return {
    ...paginate(rows, req.query, (r) => `${r.title} ${r.classLabel}`),
    counts,
  };
});

mock.get('/v1/assignments/:assignmentId', (req): AssignmentDetail => {
  const { assignment } = ownAssignment(req);
  return detailOf(assignment);
});

/** Links to materials must be the teacher's own, for the same class and subject. */
function checkMaterialLinks(teacherId: string, armId: string, subject: string, files: FileRef[]) {
  for (const f of files) {
    if (!f.materialId) continue;
    const m = MATERIALS.find((x) => x.id === f.materialId);
    if (!m || m.teacherId !== teacherId)
      fieldError('attachments', `“${f.name}” isn’t one of your materials.`);
    if (m!.armId !== armId || m!.subject !== subject)
      fieldError('attachments', `“${f.name}” is shared with another class. Attach it there.`);
  }
}

function notifyPublished(a: AssignmentRecord, what: 'Published' | 'Updated') {
  const n = studentsFor(a).length;
  logHistory(
    assignmentKey(a.id),
    what === 'Published' ? 'Published' : 'Changed after publishing',
    `${n} students and their guardians were notified.`,
    'info',
  );
}

mock.post('/v1/assignments', (req): AssignmentDetail => {
  const t = currentTeacher(req);
  const term = termFor(req);
  requireEditableTerm(term.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const armId = typeof body.armId === 'string' ? body.armId : '';
  const subject = typeof body.subject === 'string' ? body.subject : '';
  if (!armId || !subject) fieldError('armId', 'Choose the class and subject.');
  requireTeaching(t.id, term.id, armId, subject);
  const publish = body.publish === true;
  const clean = validateAssignmentBody(body, term.id, { publish });
  checkMaterialLinks(t.id, armId, subject, clean.attachments);
  const at = nowLocal();
  const a: AssignmentRecord = {
    id: nextAssignmentId(),
    termId: term.id,
    teacherId: t.id,
    armId,
    subject,
    ...clean,
    status: publish ? 'Published' : 'Draft',
    createdAt: at,
    updatedAt: at,
    publishedAt: publish ? at : null,
    closedAt: null,
  };
  ASSIGNMENTS.push(a);
  logHistory(assignmentKey(a.id), publish ? 'Created' : 'Created as a draft', undefined, 'neutral');
  if (publish) notifyPublished(a, 'Published');
  return detailOf(a);
});

mock.patch('/v1/assignments/:assignmentId', (req): AssignmentDetail => {
  const { teacher, assignment: a } = ownAssignment(req);
  requireEditableTerm(a.termId);
  if (a.status === 'Closed')
    unprocessable('Submissions are closed. Reopen the assignment to change it.');
  const body = (req.body ?? {}) as Record<string, unknown>;
  const armId = typeof body.armId === 'string' && body.armId ? body.armId : a.armId;
  const subject = typeof body.subject === 'string' && body.subject ? body.subject : a.subject;
  const wasPublished = a.status === 'Published';
  if (wasPublished && (armId !== a.armId || subject !== a.subject))
    fieldError(
      'armId',
      'A published assignment can’t move to another class. Close it and create a new one.',
    );
  if (wasPublished && body.publish === false)
    unprocessable('A published assignment can’t go back to draft. Close submissions instead.');
  requireTeaching(teacher.id, a.termId, armId, subject);
  const publish = wasPublished || body.publish === true;
  const clean = validateAssignmentBody(body, a.termId, { publish, existing: a });
  checkMaterialLinks(teacher.id, armId, subject, clean.attachments);
  Object.assign(a, { armId, subject, ...clean });
  touch(a);
  if (wasPublished) notifyPublished(a, 'Updated');
  else if (publish) {
    a.status = 'Published';
    a.publishedAt = nowLocal();
    notifyPublished(a, 'Published');
  } else logHistory(assignmentKey(a.id), 'Draft saved', undefined, 'neutral');
  return detailOf(a);
});

mock.post('/v1/assignments/:assignmentId/close', (req): AssignmentDetail => {
  const { assignment: a } = ownAssignment(req);
  requireEditableTerm(a.termId);
  if (a.status !== 'Published') unprocessable('Only a published assignment can be closed.');
  a.status = 'Closed';
  a.closedAt = nowLocal();
  touch(a);
  const missing = countsOf(a)['Not submitted'];
  logHistory(
    assignmentKey(a.id),
    'Submissions closed early',
    missing ? `${missing} students hadn’t handed in.` : 'Everyone had handed in.',
    'neutral',
  );
  return detailOf(a);
});

mock.post('/v1/assignments/:assignmentId/reopen', (req): AssignmentDetail => {
  const { assignment: a } = ownAssignment(req);
  requireEditableTerm(a.termId);
  if (a.status !== 'Closed') unprocessable('Only a closed assignment can be reopened.');
  const term = termById(a.termId);
  if (isoToday() > term.end)
    unprocessable(`${term.name} ended on ${term.end}. Work can’t be reopened after the term ends.`);
  a.status = 'Published';
  a.closedAt = null;
  touch(a);
  const pastDue = isPastDue(a);
  if (pastDue && !a.allowLate) a.allowLate = true;
  logHistory(
    assignmentKey(a.id),
    'Reopened',
    pastDue
      ? 'The due date has passed, so new work is marked Late. Students and guardians were notified.'
      : 'Students and guardians were notified.',
    'info',
  );
  return detailOf(a);
});

mock.delete('/v1/assignments/:assignmentId', (req) => {
  const { assignment: a } = ownAssignment(req);
  requireEditableTerm(a.termId);
  if (a.status !== 'Draft')
    unprocessable('Only drafts can be deleted. Close a published assignment instead.');
  ASSIGNMENTS.splice(ASSIGNMENTS.indexOf(a), 1);
  return { deleted: a.id };
});

/* ---------- Submissions ---------- */

mock.get('/v1/assignments/:assignmentId/submissions', (req): SubmissionList => {
  const { assignment: a } = ownAssignment(req);
  const all = submissionsFor(a);
  const status = req.query.status as SubmissionStatus | undefined;
  if (status && !SUBMISSION_STATUSES.includes(status)) unprocessable('Unknown status filter.');
  const rows = all.filter((s) => !status || s.status === status).map(submissionRowOf);
  const { data, meta } = paginate(
    rows,
    { pageSize: '50', ...req.query },
    (r) => `${r.studentName} ${r.admissionNo}`,
  );
  return {
    rows: data,
    meta,
    counts: { ...countsOf(a), All: all.length },
    assignment: { ...rowOf(a), permissions: permissionsOf(a) },
  };
});

mock.get('/v1/assignments/:assignmentId/submissions/:submissionId', (req): SubmissionDetail => {
  const { assignment: a } = ownAssignment(req);
  return submissionDetailOf(a, submissionById(a, req.params.submissionId!));
});

/** Grading needs the term open, the assignment published or closed and work handed in. */
function gradable(a: AssignmentRecord, s: SubmissionRecord) {
  requireEditableTerm(a.termId);
  if (a.status === 'Draft') unprocessable('Publish the assignment before grading.');
  const name = studentById(s.studentId).name;
  if (s.status === 'Not submitted')
    unprocessable(
      `${name} hasn’t handed anything in, so there’s nothing to grade. Mark it Excused if they had a reason.`,
    );
  if (s.status === 'Excused')
    unprocessable(`${name} is excused from this assignment. Undo the excuse to grade it.`);
  return name;
}

mock.put(
  '/v1/assignments/:assignmentId/submissions/:submissionId/grade',
  (req): SubmissionDetail => {
    const { assignment: a } = ownAssignment(req);
    const s = submissionById(a, req.params.submissionId!);
    gradable(a, s);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const score = validateScore(body.score, a.maxScore ?? 100, true);
    const feedback = typeof body.feedback === 'string' ? body.feedback.trim().slice(0, 2000) : '';
    const regrade = s.status === 'Returned';
    s.score = score;
    s.feedback = feedback;
    s.gradedAt = nowLocal();
    s.status = 'Graded';
    logHistory(
      submissionKey(s.id),
      regrade ? 'Regraded' : 'Graded',
      `${score} / ${a.maxScore}${regrade ? ' · private until you return it again' : ' · private to you'}`,
      'neutral',
    );
    return submissionDetailOf(a, s);
  },
);

function returnOne(a: AssignmentRecord, s: SubmissionRecord) {
  s.status = 'Returned';
  s.returnedAt = nowLocal();
  logHistory(
    submissionKey(s.id),
    'Returned',
    `${s.score} / ${a.maxScore} · visible to the student and guardian.`,
    'success',
  );
}

mock.post(
  '/v1/assignments/:assignmentId/submissions/:submissionId/return',
  (req): SubmissionDetail => {
    const { assignment: a } = ownAssignment(req);
    const s = submissionById(a, req.params.submissionId!);
    gradable(a, s);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const given = body.score === undefined ? s.score : body.score;
    const score = validateScore(given, a.maxScore ?? 100, true);
    if (typeof body.feedback === 'string') s.feedback = body.feedback.trim().slice(0, 2000);
    if (score !== s.score || s.status !== 'Graded') {
      s.score = score;
      s.gradedAt = nowLocal();
    }
    returnOne(a, s);
    return submissionDetailOf(a, s);
  },
);

mock.post('/v1/assignments/:assignmentId/submissions/return', (req): BulkReturnResult => {
  const { assignment: a } = ownAssignment(req);
  requireEditableTerm(a.termId);
  const ids = Array.isArray((req.body as { ids?: unknown })?.ids)
    ? ((req.body as { ids: unknown[] }).ids.filter((x) => typeof x === 'string') as string[])
    : [];
  if (!ids.length) unprocessable('Choose the submissions to return.');
  const result: BulkReturnResult = { returned: 0, skipped: [] };
  for (const id of ids) {
    const s = submissionById(a, id);
    const studentName = studentById(s.studentId).name;
    if (s.status === 'Graded' && s.score !== null) {
      returnOne(a, s);
      result.returned++;
      continue;
    }
    const reason: Record<SubmissionStatus, string> = {
      'Not submitted': 'Nothing handed in',
      Submitted: 'Not graded yet',
      Late: 'Not graded yet',
      Graded: 'No score',
      Returned: 'Already returned',
      Excused: 'Excused',
    };
    result.skipped.push({ id, studentName, reason: reason[s.status] });
  }
  return result;
});

mock.post(
  '/v1/assignments/:assignmentId/submissions/:submissionId/excuse',
  (req): SubmissionDetail => {
    const { assignment: a } = ownAssignment(req);
    const s = submissionById(a, req.params.submissionId!);
    requireEditableTerm(a.termId);
    const name = studentById(s.studentId).name;
    if (s.status !== 'Not submitted')
      unprocessable(`${name} has handed in work, so they can’t be excused. Grade it instead.`);
    const reason =
      typeof (req.body as { reason?: unknown })?.reason === 'string'
        ? (req.body as { reason: string }).reason.trim()
        : '';
    if (reason.length < 3) fieldError('reason', 'Say why the student is excused.');
    s.status = 'Excused';
    s.excuseReason = reason.slice(0, 300);
    logHistory(submissionKey(s.id), 'Marked excused', s.excuseReason, 'neutral');
    return submissionDetailOf(a, s);
  },
);

mock.delete(
  '/v1/assignments/:assignmentId/submissions/:submissionId/excuse',
  (req): SubmissionDetail => {
    const { assignment: a } = ownAssignment(req);
    const s = submissionById(a, req.params.submissionId!);
    requireEditableTerm(a.termId);
    if (s.status !== 'Excused') unprocessable('This student isn’t excused.');
    s.status = 'Not submitted';
    s.excuseReason = null;
    logHistory(submissionKey(s.id), 'Excuse removed', 'Back to Not submitted.', 'neutral');
    return submissionDetailOf(a, s);
  },
);

/* ---------- For the student page ---------- */

mock.get('/v1/assignments/student/:studentId', (req): StudentAssignmentRow[] => {
  const t = currentTeacher(req);
  const term = termFor(req);
  requireStudentInScope(t.id, term.id, req.params.studentId!);
  return studentAssignments(req.params.studentId!, t.id, term.id).map(
    ({ assignment: a, submission: s }) => ({
      assignmentId: a.id,
      submissionId: s.id,
      title: a.title,
      classLabel: classLabel(a.armId, a.subject),
      dueAt: a.dueAt,
      maxScore: a.maxScore,
      assignmentStatus: a.status,
      status: s.status,
      score: s.score,
    }),
  );
});

/* ---------- Sidebar ---------- */

registerNavCount(routesPath.assignments.list.name, (teacherId, termId) =>
  assignmentsOf(teacherId, termId).length ? toGradeCount(teacherId, termId) : 0,
);
