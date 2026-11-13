/**
 * Result sheets and correction requests for the mock API: one sheet per teaching assignment per
 * term, seeded deterministically so every lifecycle case shows at the demo clock (Tue 8 Dec 2026).
 *
 * Status words, score maths (`@/components/results/scoring`) and the HOD routing are School
 * Admin's (`school-admin/src/api/mock/academics-db.ts` + `handlers/academics-results.ts`).
 *
 * Other features read sheets through the helpers at the bottom (`sheetsForArm`,
 * `studentTermResults`, `sheetCountsFor`), never through `SHEETS` directly.
 */
import { MockHttpError } from '@edutrack/web-core/mock';

import {
  completionOf,
  gradeOf,
  isValidScore,
  missingOf,
  scoreRow,
  statsOf,
  totalOf,
} from '@/components/results/scoring';
import { routesPath as r } from '@/router/routes-path';
import type {
  Correction,
  CorrectionStatus,
  ResultSheet,
  ResultSheetSummary,
  SaveScoresPayload,
  ScoreValue,
  SheetComponent,
  SheetLock,
  SheetRow,
  SheetStatus,
} from '@/types';

import { formatDay, nowLocal, weekdayOf } from './clock';
import { logHistory, notify, timelineOf } from './notify-db';
import { SCHEMES, TEACHING_ASSIGNMENTS, seeded, type Section } from './school-db';
import {
  armById,
  branchOf,
  departmentOfSubject,
  forbidden,
  hodDepartmentOf,
  notFound,
  reviewerFor,
  scopeSummary,
  staffById,
  studentsInArmFor,
  subjectByCode,
  termById,
  termLockReason,
} from './scope';

/** School Admin's pass mark (Settings → Assessment). */
export const PASS_MARK = 40;

export const SHEET_STATUSES: SheetStatus[] = [
  'Not started',
  'Draft',
  'Submitted',
  'Under review',
  'Returned',
  'Approved',
  'Published',
];

export interface SheetRecord {
  /** "rs-t-2627-1-mc-jss2b-MTH" (the teaching assignment id with `rs-` for `ta-`). */
  id: string;
  termId: string;
  assignmentId: string;
  armId: string;
  subject: string;
  teacherId: string;
  status: SheetStatus;
  /** studentId → one value per scheme component, in order. Absent key = nothing entered. */
  scores: Record<string, ScoreValue[]>;
  /** studentId → the teacher's remark. */
  remarks: Record<string, string>;
  /** Local "YYYY-MM-DDTHH:mm" of the last save. */
  savedAt: string | null;
  submittedAt: string | null;
  /** The HOD it was submitted to; null = straight to the academic office. Kept for resubmits. */
  reviewerId: string | null;
  returnedBy: 'hod' | 'office' | null;
  returnedAt: string | null;
  returnNote: string;
  forwardedAt: string | null;
}

export interface CorrectionRecord {
  id: string;
  sheetId: string;
  studentId: string;
  componentIndex: number;
  original: number;
  proposed: number;
  reason: string;
  requestedById: string;
  requestedAt: string;
  evidence: string | null;
  status: CorrectionStatus;
  decisionNote: string;
}

export const SHEETS: SheetRecord[] = [];
export const CORRECTIONS: CorrectionRecord[] = [];

export const sheetIdOf = (assignmentId: string) => assignmentId.replace(/^ta-/, 'rs-');
export const historyKey = (sheetId: string) => `sheet:${sheetId}`;

/* ---------- Lookups ---------- */

export const sheetById = (id: string) => SHEETS.find((s) => s.id === id) ?? notFound('That sheet');

export const sheetFor = (termId: string, armId: string, subject: string) =>
  SHEETS.find((s) => s.termId === termId && s.armId === armId && s.subject === subject) ?? null;

/** A sheet the teacher owns (404 unknown, 403 someone else's, naming what they do teach). */
export function requireOwnSheet(teacherId: string, sheetId: string) {
  const sheet = sheetById(sheetId);
  if (sheet.teacherId !== teacherId)
    forbidden(
      `You don’t have access to the ${armById(sheet.armId).name} · ${subjectByCode(sheet.subject).name} sheet. ${scopeSummary(teacherId, sheet.termId)}`,
    );
  return sheet;
}

export const sectionOf = (sheet: Pick<SheetRecord, 'armId'>): Section =>
  armById(sheet.armId).section;
export const schemeOf = (sheet: Pick<SheetRecord, 'armId'>) => SCHEMES[sectionOf(sheet)];

/** The sheet's students (those in the arm now, or at the end of a past term), in name order. */
export const studentsOf = (sheet: SheetRecord) =>
  studentsInArmFor(sheet.armId, sheet.subject, sheet.termId);

export function rowsOf(sheet: SheetRecord): SheetRow[] {
  const { components, scale } = schemeOf(sheet);
  return studentsOf(sheet).map((s) => ({
    studentId: s.id,
    name: s.name,
    admissionNo: s.admissionNo,
    ...scoreRow(components, scale, sheet.scores[s.id] ?? components.map(() => null)),
    teacherRemark: sheet.remarks[s.id] ?? '',
  }));
}

/* ---------- Review chain ---------- */

/** "Mr. Ibrahim Bello (HOD Sciences)" */
export function hodLabel(hodId: string) {
  const dept = hodDepartmentOf(hodId);
  return `${staffById(hodId).name}${dept ? ` (HOD ${dept.name})` : ''}`;
}

/** Where a submit of this sheet goes now: its HOD, or the academic office (null). */
export function nextReviewerId(sheet: SheetRecord): string | null {
  if (sheet.status === 'Returned') return sheet.returnedBy === 'hod' ? sheet.reviewerId : null;
  return reviewerFor(sheet.teacherId, sheet.subject)?.id ?? null;
}

/** "Mr. Ibrahim Bello (HOD Sciences)" or "the academic office (Languages has no HOD)". */
export function submitToLabel(sheet: SheetRecord) {
  const hod = nextReviewerId(sheet);
  if (hod) return hodLabel(hod);
  const dept = departmentOfSubject(sheet.subject);
  if (sheet.status === 'Returned' && sheet.returnedBy === 'office') return 'the academic office';
  if (!dept.hodId) return `the academic office (${dept.name} has no HOD)`;
  if (dept.hodId === sheet.teacherId)
    return `the academic office (your own ${dept.name} sheet skips the HOD step)`;
  return 'the academic office';
}

export const isWithHod = (sheet: SheetRecord) =>
  sheet.status === 'Submitted' && sheet.reviewerId !== null;

export function withLabel(sheet: SheetRecord) {
  if (isWithHod(sheet)) return `With ${hodLabel(sheet.reviewerId!)}`;
  if (sheet.status === 'Submitted' || sheet.status === 'Under review')
    return 'With the academic office';
  return null;
}

/* ---------- Locks ---------- */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Fri 11 Dec at 23:59" */
const deadlineText = (local: string) =>
  `${DAYS[weekdayOf(local.slice(0, 10))]} ${formatDay(local.slice(0, 10), false)} at ${local.slice(11, 16)}`;
/** "8 Dec, 08:15" */
export const stamp = (local: string) =>
  `${formatDay(local.slice(0, 10), false)}, ${local.slice(11, 16)}`;

/** Result entry for the term has closed (the demo clock is past the deadline). */
export function entryClosed(termId: string) {
  const closes = termById(termId).resultEntryCloses;
  return closes !== null && nowLocal() > closes;
}

/** Why the sheet can't be edited now (term → status → deadline), or null. */
export function lockOf(sheet: SheetRecord): SheetLock | null {
  const term = termById(sheet.termId);
  const termReason = termLockReason(term.id);
  if (termReason) return { code: 'TERM_LOCKED', title: 'Read-only term', reason: termReason };
  switch (sheet.status) {
    case 'Submitted':
    case 'Under review': {
      const label = withLabel(sheet)!;
      return {
        code: 'SHEET_LOCKED',
        title: label,
        reason: `Submitted ${sheet.submittedAt ? stamp(sheet.submittedAt) : ''}. It’s locked while it’s reviewed; you can edit it again only if it’s returned to you.`,
      };
    }
    case 'Approved':
      return {
        code: 'SHEET_LOCKED',
        title: 'Approved',
        reason: 'The academic office approved this sheet. It’s locked until results are published.',
      };
    case 'Published':
      return {
        code: 'SHEET_LOCKED',
        title: 'Published',
        reason:
          'These results are published to students and guardians. To change a score, request a correction.',
      };
  }
  if (term.resultEntryCloses && entryClosed(term.id))
    return {
      code: 'TERM_LOCKED',
      title: 'Result entry closed',
      reason: `Result entry closed on ${deadlineText(term.resultEntryCloses)}. Ask the academic office to reopen it.`,
    };
  return null;
}

/** 409 with the lock's reason when the sheet can't be changed. */
export function requireEditableSheet(sheet: SheetRecord) {
  const lock = lockOf(sheet);
  if (lock) throw new MockHttpError(409, lock.reason, lock.code);
}

/* ---------- Views ---------- */

export function sheetSummary(sheet: SheetRecord): ResultSheetSummary {
  const arm = armById(sheet.armId);
  const { components, scale } = schemeOf(sheet);
  const rows = rowsOf(sheet);
  const lock = lockOf(sheet);
  return {
    id: sheet.id,
    termId: sheet.termId,
    armId: arm.id,
    arm: arm.name,
    subject: sheet.subject,
    subjectName: subjectByCode(sheet.subject).name,
    branchName: branchOf(arm.branchId).name,
    students: rows.length,
    status: sheet.status,
    withHod: isWithHod(sheet),
    withLabel: withLabel(sheet),
    completion: completionOf(components.length, rows),
    average: statsOf(components, scale, rows, PASS_MARK).average,
    deadline: termById(sheet.termId).resultEntryCloses,
    savedAt: sheet.savedAt,
    submittedAt: sheet.submittedAt,
    editable: lock === null,
    returnNote: sheet.status === 'Returned' ? sheet.returnNote : null,
  };
}

export function sheetView(sheet: SheetRecord): ResultSheet {
  const { components, scale, scaleName } = schemeOf(sheet);
  const rows = rowsOf(sheet);
  const teacher = staffById(sheet.teacherId);
  const dept = departmentOfSubject(sheet.subject);
  return {
    ...sheetSummary(sheet),
    teacherId: teacher.id,
    teacher: teacher.name,
    section: sectionOf(sheet),
    department: dept.name,
    submitTo: submitToLabel(sheet),
    submitToHod: nextReviewerId(sheet) !== null,
    components,
    scale,
    scaleName,
    passMark: PASS_MARK,
    rows,
    stats: statsOf(components, scale, rows, PASS_MARK),
    lock: lockOf(sheet),
    returned:
      sheet.status === 'Returned' && sheet.returnedAt
        ? {
            by:
              sheet.returnedBy === 'hod' && sheet.reviewerId
                ? hodLabel(sheet.reviewerId)
                : 'the academic office',
            at: sheet.returnedAt,
            note: sheet.returnNote,
          }
        : null,
    canRequestCorrection: sheet.status === 'Published',
    corrections: CORRECTIONS.filter((c) => c.sheetId === sheet.id).map(correctionView),
    history: timelineOf(historyKey(sheet.id)),
  };
}

/* ---------- Changes ---------- */

/** Saves a draft. Validates every value; a Not started sheet becomes a Draft. */
export function saveScores(sheet: SheetRecord, body: SaveScoresPayload | undefined) {
  requireEditableSheet(sheet);
  const { components } = schemeOf(sheet);
  const students = new Set(studentsOf(sheet).map((s) => s.id));
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) throw new MockHttpError(422, 'Send the rows to save.', 'VALIDATION');
  const fields: Record<string, string> = {};
  for (const row of rows) {
    if (!row || !students.has(row.studentId)) {
      fields[String(row?.studentId ?? 'row')] = 'This student isn’t on the sheet.';
      continue;
    }
    if (!Array.isArray(row.scores) || row.scores.length !== components.length) {
      fields[row.studentId] = `Send ${components.length} scores.`;
      continue;
    }
    row.scores.forEach((v, i) => {
      const c = components[i]!;
      if (!isValidScore(v, c.max))
        fields[`${row.studentId}.${c.key}`] =
          `Enter 0–${c.max} (one decimal place at most), ABS or EXM`;
    });
    if (row.remark !== undefined && (typeof row.remark !== 'string' || row.remark.length > 300))
      fields[`${row.studentId}.remark`] = 'Keep the remark under 300 characters.';
  }
  if (Object.keys(fields).length)
    throw new MockHttpError(
      422,
      'Some scores aren’t valid. Fix the highlighted cells.',
      'VALIDATION',
      fields,
    );
  for (const row of rows) {
    sheet.scores[row.studentId] = [...row.scores];
    if (row.remark !== undefined) {
      const remark = row.remark.trim();
      if (remark) sheet.remarks[row.studentId] = remark;
      else delete sheet.remarks[row.studentId];
    }
  }
  if (sheet.status === 'Not started') {
    sheet.status = 'Draft';
    logHistory(historyKey(sheet.id), 'Draft started', `By ${staffById(sheet.teacherId).name}`);
  }
  sheet.savedAt = nowLocal();
  return sheet;
}

/** Submits for review: 422 while any score is missing; to the HOD (Submitted) or the office. */
export function submitSheet(sheet: SheetRecord) {
  requireEditableSheet(sheet);
  const { components } = schemeOf(sheet);
  const rows = rowsOf(sheet);
  if (!rows.length)
    throw new MockHttpError(422, 'There are no students on this sheet to submit.', 'VALIDATION');
  const blockers = rows.filter((row) => missingOf(components, row.scores).length);
  if (blockers.length) {
    const names = blockers.slice(0, 3).map((b) => b.name);
    throw new MockHttpError(
      422,
      `${blockers.length} student${blockers.length === 1 ? ' has' : 's have'} missing scores (${names.join(', ')}${blockers.length > 3 ? ', …' : ''}). Enter every score — ABS for absent, EXM for exempt — before submitting.`,
      'VALIDATION',
      Object.fromEntries(
        blockers.map((b) => [b.studentId, `${missingOf(components, b.scores).join(', ')} missing`]),
      ),
    );
  }
  const resubmit = sheet.status === 'Returned';
  const to = submitToLabel(sheet);
  const reviewerId = nextReviewerId(sheet);
  sheet.status = reviewerId ? 'Submitted' : 'Under review';
  sheet.reviewerId = reviewerId;
  sheet.submittedAt = nowLocal();
  sheet.savedAt = sheet.savedAt ?? nowLocal();
  sheet.returnedBy = null;
  sheet.forwardedAt = null;
  const stats = statsOf(components, schemeOf(sheet).scale, rows, PASS_MARK);
  logHistory(
    historyKey(sheet.id),
    `${resubmit ? 'Resubmitted' : 'Submitted'} by ${staffById(sheet.teacherId).name} to ${to}`,
    `${rows.length} students · class average ${stats.average ?? '—'}%`,
    'info',
  );
  if (reviewerId)
    notify(reviewerId, {
      title: `${staffById(sheet.teacherId).name} ${resubmit ? 'resubmitted' : 'submitted'} a result sheet`,
      body: `${armById(sheet.armId).name} · ${subjectByCode(sheet.subject).name} is waiting for your review.`,
      category: 'reviews',
      to: { name: r.reviews.sheet.name, params: { sheetId: sheet.id } },
      emailEvent: 'review-waiting',
    });
  return sheet;
}

/** The HOD forwards a Submitted sheet to the academic office (Under review). */
export function forwardSheet(sheet: SheetRecord, hodId: string) {
  requireWaitingOn(sheet, hodId);
  sheet.status = 'Under review';
  sheet.forwardedAt = nowLocal();
  const dept = departmentOfSubject(sheet.subject).name;
  logHistory(
    historyKey(sheet.id),
    `Forwarded by HOD ${staffById(hodId).name}`,
    `${dept} · sent to the academic office`,
    'info',
  );
  notify(sheet.teacherId, {
    title: `${staffById(hodId).name} forwarded your result sheet`,
    body: `${armById(sheet.armId).name} · ${subjectByCode(sheet.subject).name} is now with the academic office.`,
    category: 'results',
    to: { name: r.results.sheet.name, params: { sheetId: sheet.id } },
  });
  return sheet;
}

/** The HOD returns a Submitted sheet to its teacher with a comment (10+ characters). */
export function returnSheet(sheet: SheetRecord, hodId: string, comment: unknown) {
  requireWaitingOn(sheet, hodId);
  const note = typeof comment === 'string' ? comment.trim() : '';
  if (note.length < 10)
    throw new MockHttpError(
      422,
      'Tell the teacher what to fix (10 characters or more).',
      'VALIDATION',
      { comment: 'Tell the teacher what to fix (10 characters or more).' },
    );
  sheet.status = 'Returned';
  sheet.returnedBy = 'hod';
  sheet.returnedAt = nowLocal();
  sheet.returnNote = note;
  logHistory(historyKey(sheet.id), `Returned by HOD ${staffById(hodId).name}`, note, 'error');
  notify(sheet.teacherId, {
    title: `${staffById(hodId).name} returned your result sheet`,
    body: `${armById(sheet.armId).name} · ${subjectByCode(sheet.subject).name}: “${note}”`,
    category: 'results',
    to: { name: r.results.sheet.name, params: { sheetId: sheet.id } },
    emailEvent: 'sheet-returned',
  });
  return sheet;
}

/** 409 when the sheet is no longer waiting on this HOD (already forwarded or returned). */
function requireWaitingOn(sheet: SheetRecord, hodId: string) {
  const reason = termLockReason(sheet.termId);
  if (reason) throw new MockHttpError(409, reason, 'TERM_LOCKED');
  if (isWithHod(sheet) && sheet.reviewerId === hodId) return;
  const what =
    sheet.status === 'Returned'
      ? 'already returned to the teacher'
      : sheet.status === 'Under review'
        ? 'already forwarded to the academic office'
        : sheet.status === 'Approved' || sheet.status === 'Published'
          ? `already ${sheet.status.toLowerCase()}`
          : 'not waiting for your review';
  throw new MockHttpError(409, `This sheet was ${what}.`, 'SHEET_LOCKED');
}

/* ---------- Corrections ---------- */

const fmtTotal = (sheet: SheetRecord, values: ScoreValue[]) => {
  const { components, scale } = schemeOf(sheet);
  const t = totalOf(components, values);
  return t === null ? '—' : `${t.toFixed(1)} · ${gradeOf(scale, t)?.grade ?? '—'}`;
};

export function correctionView(c: CorrectionRecord): Correction {
  const sheet = sheetById(c.sheetId);
  const { components } = schemeOf(sheet);
  const comp = components[c.componentIndex]!;
  const scores = sheet.scores[c.studentId] ?? components.map(() => null);
  // An applied correction is already in the sheet; show the totals before and after it.
  const base =
    c.status === 'Applied'
      ? scores.map((v, i) => (i === c.componentIndex ? c.original : v))
      : scores;
  const after = base.map((v, i) => (i === c.componentIndex ? c.proposed : v));
  const student = studentsOf(sheet).find((s) => s.id === c.studentId);
  const arm = armById(sheet.armId);
  return {
    id: c.id,
    sheetId: sheet.id,
    termId: sheet.termId,
    studentId: c.studentId,
    student: student?.name ?? 'Unknown student',
    armId: arm.id,
    arm: arm.name,
    subject: sheet.subject,
    subjectName: subjectByCode(sheet.subject).name,
    component: `${comp.name} (max ${comp.max})`,
    componentKey: comp.key,
    original: c.original,
    proposed: c.proposed,
    originalTotal: fmtTotal(sheet, base),
    proposedTotal: fmtTotal(sheet, after),
    reason: c.reason,
    requestedBy: `${staffById(c.requestedById).name} · Teacher`,
    requestedAt: stamp(c.requestedAt),
    evidence: c.evidence,
    status: c.status,
    decisionNote: c.decisionNote,
    history: [
      ...timelineOf(`correction:${c.id}`),
      {
        id: `pub-${c.id}`,
        title: 'Original score published',
        detail: `${comp.name} ${c.original} · total ${fmtTotal(sheet, base)}`,
        when: 'Term results',
        tone: 'neutral' as const,
      },
    ],
  };
}

const MAX_EVIDENCE = 10 * 1024 * 1024;
const EVIDENCE_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|heic))$/;
let correctionSeq = 0;

/** A correction request on a published sheet: validated, de-duplicated, Under review. */
export function requestCorrection(teacherId: string, body: Record<string, unknown> | undefined) {
  const sheet = requireOwnSheet(teacherId, String(body?.sheetId ?? ''));
  if (sheet.status !== 'Published')
    throw new MockHttpError(
      409,
      'Corrections are for published results. Edit the sheet instead while it’s yours to change.',
      'SHEET_LOCKED',
    );
  const { components } = schemeOf(sheet);
  const fields: Record<string, string> = {};
  const student = studentsOf(sheet).find((s) => s.id === body?.studentId);
  if (!student) fields.studentId = 'Choose a student on this sheet.';
  const index = components.findIndex((c) => c.key === body?.componentKey);
  if (index < 0) fields.componentKey = 'Choose a component.';
  const comp = components[index];
  const original = student && comp ? sheet.scores[student.id]?.[index] : undefined;
  if (student && comp && typeof original !== 'number')
    fields.componentKey = `${student.name} has ${original ?? 'no score'} for ${comp.name}. Ask the academic office about absent or exempt scores.`;
  const proposed = body?.proposed;
  if (comp) {
    if (typeof proposed !== 'number' || !isValidScore(proposed, comp.max) || proposed === null)
      fields.proposed = `Enter a score from 0 to ${comp.max} (one decimal place at most).`;
    else if (proposed === original)
      fields.proposed = 'The new score must differ from the current one.';
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 15)
    fields.reason = 'Explain the correction in 15 characters or more (e.g. what was re-marked).';
  const evidence = body?.evidence as { name?: unknown; size?: unknown; type?: unknown } | null;
  if (evidence) {
    if (typeof evidence.size !== 'number' || evidence.size > MAX_EVIDENCE)
      fields.evidence = 'The evidence file must be 10 MB or smaller.';
    else if (typeof evidence.type !== 'string' || !EVIDENCE_TYPES.test(evidence.type))
      fields.evidence = 'Attach a PDF or a photo (JPG, PNG, WebP or HEIC).';
  }
  if (Object.keys(fields).length)
    throw new MockHttpError(422, 'Check the highlighted fields.', 'VALIDATION', fields);
  const duplicate = CORRECTIONS.find(
    (c) =>
      c.sheetId === sheet.id &&
      c.studentId === student!.id &&
      c.componentIndex === index &&
      c.status === 'Under review',
  );
  if (duplicate)
    throw new MockHttpError(
      409,
      `There’s already an open correction for ${student!.name} · ${comp!.name} (requested ${stamp(duplicate.requestedAt)}). Wait for the academic office to decide it.`,
      'DUPLICATE',
    );
  const record: CorrectionRecord = {
    id: `cor-${++correctionSeq}`,
    sheetId: sheet.id,
    studentId: student!.id,
    componentIndex: index,
    original: original as number,
    proposed: proposed as number,
    reason,
    requestedById: teacherId,
    requestedAt: nowLocal(),
    evidence: evidence ? String(evidence.name) : null,
    status: 'Under review',
    decisionNote: '',
  };
  CORRECTIONS.push(record);
  const teacher = staffById(teacherId).name;
  logHistory(
    `correction:${record.id}`,
    `Correction requested by ${teacher}`,
    evidence ? 'Reason and evidence attached' : 'Reason attached',
    'warning',
  );
  logHistory(
    historyKey(sheet.id),
    `Correction requested by ${teacher}`,
    `${student!.name} · ${comp!.name} ${record.original} → ${record.proposed} · with the academic office`,
    'warning',
  );
  return record;
}

/* ---------- Helpers for other features ---------- */

/** Every subject's sheet for an arm and term (class progress, class pages). */
export function sheetsForArm(armId: string, termId: string) {
  return SHEETS.filter((s) => s.armId === armId && s.termId === termId).map((s) => {
    const summary = sheetSummary(s);
    return {
      sheetId: s.id,
      subject: s.subject,
      subjectName: summary.subjectName,
      teacherId: s.teacherId,
      teacherName: staffById(s.teacherId).name,
      status: s.status,
      withHod: summary.withHod,
      completion: summary.completion,
      average: summary.average,
    };
  });
}

const FINAL: SheetStatus[] = ['Approved', 'Published'];

/**
 * A student's results for a term, one per subject sheet they are on. `total` and `grade` are
 * only given for final sheets (Approved / Published); otherwise they are null.
 */
export function studentTermResults(studentId: string, termId: string) {
  const out: {
    subject: string;
    subjectName: string;
    total: number | null;
    grade: string | null;
    status: SheetStatus;
  }[] = [];
  for (const s of SHEETS) {
    if (s.termId !== termId) continue;
    const row = rowsOf(s).find((x) => x.studentId === studentId);
    if (!row) continue;
    const final = FINAL.includes(s.status);
    out.push({
      subject: s.subject,
      subjectName: subjectByCode(s.subject).name,
      total: final ? row.total : null,
      grade: final ? row.grade : null,
      status: s.status,
    });
  }
  return out.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

/** A teacher's sheets for a term by status (dashboard metrics and to-dos). */
export function sheetCountsFor(teacherId: string, termId: string) {
  const mine = SHEETS.filter((s) => s.teacherId === teacherId && s.termId === termId);
  const byStatus = Object.fromEntries(SHEET_STATUSES.map((s) => [s, 0])) as Record<
    SheetStatus,
    number
  >;
  for (const s of mine) byStatus[s.status]++;
  return {
    total: mine.length,
    byStatus,
    /** Sent for review or beyond: Submitted, Under review, Approved, Published. */
    submitted:
      byStatus.Submitted + byStatus['Under review'] + byStatus.Approved + byStatus.Published,
    /** Still editable with missing scores (Not started, Draft, Returned). */
    missingScores: mine.filter((s) => lockOf(s) === null && sheetSummary(s).completion.missing > 0)
      .length,
    returned: byStatus.Returned,
    deadline: termById(termId).resultEntryCloses,
  };
}

/* ---------- Seed ---------- */

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Plausible raw scores for one student in one subject (same every reload). */
function seedScores(studentId: string, subject: string, components: SheetComponent[]) {
  const rng = seeded(hash(`${studentId}|${subject}`));
  const ability = 0.36 + rng.next() * 0.58;
  return components.map((c): ScoreValue => {
    const noise = (rng.next() - 0.5) * 0.3;
    return Math.max(0, Math.min(c.max, Math.round(c.max * Math.min(0.98, ability + noise))));
  });
}

interface SeedPlan {
  status: SheetStatus;
  /** Draft: leave the last component blank for about this share of students. */
  blank?: number;
  savedAt?: string;
  submittedAt?: string;
  forwardedAt?: string;
  returnedAt?: string;
}

/** First Term 2026/2027, "armId|subject" → plan. The demo accounts' sheets show every case. */
const FIRST_TERM: Record<string, SeedPlan> = {
  // Mr. Ade (Sciences, HOD Mr. Bello)
  'mc-jss2b|MTH': { status: 'Draft', savedAt: '2026-12-07T16:40' },
  'mc-jss1a|MTH': { status: 'Submitted', submittedAt: '2026-12-07T14:20' },
  'mc-sss1a|MTH': {
    status: 'Returned',
    submittedAt: '2026-12-04T11:05',
    returnedAt: '2026-12-07T15:20',
  },
  'lk-sss1a|FMT': {
    status: 'Under review',
    submittedAt: '2026-12-03T10:30',
    forwardedAt: '2026-12-04T09:10',
  },
  // Mrs. Okafor (Languages: no HOD)
  'mc-jss2b|ENG': { status: 'Draft', blank: 0, savedAt: '2026-12-07T19:05' },
  'mc-jss2a|ENG': { status: 'Not started' },
  // Mr. Bello (HOD Sciences)
  'mc-sss1a|PHY': { status: 'Draft', blank: 0, savedAt: '2026-12-07T17:30' },
  'mc-sss2a|PHY': { status: 'Draft', blank: 0.2, savedAt: '2026-12-05T12:10' },
  'mc-jss2b|BSC': {
    status: 'Approved',
    submittedAt: '2026-12-02T09:00',
    forwardedAt: '2026-12-02T15:30',
  },
  // Mrs. Eze
  'mc-jss1a|ENG': { status: 'Draft', blank: 0.3, savedAt: '2026-12-06T18:00' },
  // The rest of JSS 2B, in mixed states (for class progress)
  'mc-jss2b|BTE': { status: 'Approved', submittedAt: '2026-12-01T10:00' },
  'mc-jss2b|SOS': { status: 'Under review', submittedAt: '2026-12-04T13:00' },
  'mc-jss2b|CIV': { status: 'Approved', submittedAt: '2026-12-01T12:00' },
  'mc-jss2b|CRS': { status: 'Submitted', submittedAt: '2026-12-07T10:45' },
  'mc-jss2b|IRS': { status: 'Not started' },
  'mc-jss2b|FRE': { status: 'Under review', submittedAt: '2026-12-05T08:40' },
  'mc-jss2b|YOR': { status: 'Draft', blank: 0.4, savedAt: '2026-12-04T16:20' },
  'mc-jss2b|AGR': { status: 'Submitted', submittedAt: '2026-12-07T11:30' },
  'mc-jss2b|CMP': { status: 'Approved', submittedAt: '2026-12-02T14:15' },
  'mc-jss2b|HEC': { status: 'Draft', blank: 0.25, savedAt: '2026-12-06T10:05' },
  'mc-jss2b|CCA': { status: 'Under review', submittedAt: '2026-12-03T15:00' },
  'mc-jss2b|PHE': { status: 'Not started' },
  // Waiting on Mr. Bello
  'mc-sss1a|CHE': { status: 'Submitted', submittedAt: '2026-12-08T07:50' },
};

const OTHER_STATES: SheetStatus[] = [
  'Draft',
  'Draft',
  'Submitted',
  'Under review',
  'Approved',
  'Approved',
  'Not started',
];

function seedSheets() {
  const rng = seeded(8122026);
  for (const ta of TEACHING_ASSIGNMENTS) {
    const term = termById(ta.termId);
    const key = `${ta.armId}|${ta.subject}`;
    let plan: SeedPlan;
    if (term.status === 'Closed')
      plan = {
        status: 'Published',
        submittedAt: '2026-07-15T10:00',
        forwardedAt: '2026-07-16T09:00',
      };
    else if (FIRST_TERM[key]) plan = FIRST_TERM[key]!;
    else {
      let status = rng.pick(OTHER_STATES);
      const hod = reviewerFor(ta.teacherId, ta.subject);
      // Keep Mr. Bello's queue to the sheets above: other Sciences sheets are already forwarded.
      if (status === 'Submitted' && (!hod || hod.id === 'bello')) status = 'Under review';
      plan = {
        status,
        blank: 0.35,
        savedAt: '2026-12-05T15:00',
        submittedAt: '2026-12-04T09:30',
        forwardedAt: hod ? '2026-12-04T16:00' : undefined,
      };
    }
    const sheet: SheetRecord = {
      id: sheetIdOf(ta.id),
      termId: ta.termId,
      assignmentId: ta.id,
      armId: ta.armId,
      subject: ta.subject,
      teacherId: ta.teacherId,
      status: plan.status,
      scores: {},
      remarks: {},
      savedAt: null,
      submittedAt: null,
      reviewerId: null,
      returnedBy: null,
      returnedAt: null,
      returnNote: '',
      forwardedAt: null,
    };
    SHEETS.push(sheet);
    if (plan.status === 'Not started') continue;

    const { components } = schemeOf(sheet);
    const students = studentsOf(sheet);
    const blankRng = seeded(hash(sheet.id));
    for (const s of students) {
      const values = seedScores(s.id, sheet.subject, components);
      if (plan.status === 'Draft' && plan.blank && blankRng.chance(plan.blank))
        values[components.length - 1] = null;
      sheet.scores[s.id] = values;
    }
    seedSpecialCases(sheet, students);

    const teacher = staffById(sheet.teacherId).name;
    const h = historyKey(sheet.id);
    const started = plan.savedAt ?? plan.submittedAt ?? '2026-12-01T10:00';
    const firstDay = `${started.slice(0, 8)}${String(Math.max(1, +started.slice(8, 10) - 3)).padStart(2, '0')}T15:10`;
    logHistory(h, 'Draft started', `By ${teacher}`, undefined, firstDay);
    sheet.savedAt = plan.savedAt ?? plan.submittedAt ?? firstDay;
    if (plan.status === 'Draft') continue;

    const hod = reviewerFor(sheet.teacherId, sheet.subject);
    const dept = departmentOfSubject(sheet.subject);
    sheet.submittedAt = plan.submittedAt ?? '2026-12-04T09:30';
    sheet.reviewerId = hod?.id ?? null;
    if (plan.status === 'Submitted' && !hod) sheet.status = 'Under review';
    logHistory(
      h,
      `Submitted by ${teacher} to ${submitToLabelFor(sheet.teacherId, sheet.subject)}`,
      `${students.length} students`,
      'info',
      sheet.submittedAt,
    );
    if (plan.status === 'Returned' && hod) {
      const s = students[3] ?? students[0]!;
      const ca2 = sheet.scores[s.id]![1];
      sheet.returnedBy = 'hod';
      sheet.returnedAt = plan.returnedAt ?? '2026-12-07T15:20';
      sheet.returnNote = `CA 2 for ${s.name} (${ca2}/20) doesn’t match the mark book. Please check it against the script before I forward the sheet.`;
      logHistory(h, `Returned by HOD ${hod.name}`, sheet.returnNote, 'error', sheet.returnedAt);
      continue;
    }
    if (['Under review', 'Approved', 'Published'].includes(sheet.status) && hod) {
      sheet.forwardedAt = plan.forwardedAt ?? '2026-12-04T16:00';
      logHistory(
        h,
        `Forwarded by HOD ${hod.name}`,
        `${dept.name} · sent to the academic office`,
        'info',
        sheet.forwardedAt,
      );
    }
    if (sheet.status === 'Approved' || sheet.status === 'Published')
      logHistory(
        h,
        'Approved by the academic office',
        undefined,
        'success',
        sheet.status === 'Published' ? '2026-07-20T11:00' : '2026-12-07T12:00',
      );
    if (sheet.status === 'Published')
      logHistory(
        h,
        'Published',
        'Results released to students and guardians',
        'success',
        '2026-07-22T09:00',
      );
  }
  seedCorrections();
}

/** Submit label from the teacher's point of view, before the sheet has a status. */
function submitToLabelFor(teacherId: string, subject: string) {
  const hod = reviewerFor(teacherId, subject);
  if (hod) return hodLabel(hod.id);
  return 'the academic office';
}

const byName = (students: { id: string; name: string }[], name: string) =>
  students.find((s) => s.name === name);

/** The design's familiar cases. */
function seedSpecialCases(sheet: SheetRecord, students: { id: string; name: string }[]) {
  if (sheet.termId !== 't-2627-1') return;
  const key = `${sheet.armId}|${sheet.subject}`;
  if (key === 'mc-jss2b|MTH') {
    // Every score in except Blessing's CA 2; Daniel was absent for the exam; Tolulope is exempt
    // from CA 1 (medical).
    const blessing = byName(students, 'Blessing Etim')!;
    const daniel = byName(students, 'Daniel Musa')!;
    const tolu = byName(students, 'Tolulope Bankole')!;
    sheet.scores[blessing.id]![1] = null;
    sheet.scores[daniel.id]![2] = 'ABS';
    sheet.scores[tolu.id]![0] = 'EXM';
    sheet.remarks[daniel.id] = 'Make-up exam booked for Thu 10 Dec.';
    sheet.remarks[tolu.id] = 'Exempt from CA 1 on medical advice.';
  }
  if (key === 'mc-jss1a|MTH') {
    // Joined after the mid-term break, after CA 1.
    const late = byName(students, 'Oreoluwa Fashola');
    if (late) {
      sheet.scores[late.id]![0] = 'EXM';
      sheet.remarks[late.id] = 'Joined on 2 Nov, after CA 1.';
    }
  }
}

function seedCorrections() {
  // One applied correction on Mr. Ade's published Third Term JSS 2A sheet.
  const sheet = SHEETS.find((s) => s.id === 'rs-t-2526-3-p-mc-jss2a-MTH');
  if (!sheet) return;
  const student = studentsOf(sheet)[0];
  if (!student) return;
  const now = sheet.scores[student.id]![2] as number;
  const original = Math.max(0, now - 6);
  const record: CorrectionRecord = {
    id: `cor-${++correctionSeq}`,
    sheetId: sheet.id,
    studentId: student.id,
    componentIndex: 2,
    original,
    proposed: now,
    reason: 'Script re-marked: question 7 (6 marks) was not added to the total.',
    requestedById: 'ade',
    requestedAt: '2026-07-23T10:02',
    evidence: 'exam-script-p4.jpg',
    status: 'Applied',
    decisionNote: 'Re-mark verified.',
  };
  CORRECTIONS.push(record);
  logHistory(
    `correction:${record.id}`,
    'Correction requested by Mr. Samuel Ade',
    'Reason and evidence attached',
    'warning',
    '2026-07-23T10:02',
  );
  logHistory(
    `correction:${record.id}`,
    'Approved and applied by the academic office',
    `Examination ${original} → ${now}`,
    'success',
    '2026-07-24T09:15',
  );
  logHistory(
    historyKey(sheet.id),
    'Correction requested by Mr. Samuel Ade',
    `${student.name} · Examination ${original} → ${now}`,
    'warning',
    '2026-07-23T10:02',
  );
  logHistory(
    historyKey(sheet.id),
    'Correction applied by the academic office',
    `${student.name} · Examination ${original} → ${now}`,
    'success',
    '2026-07-24T09:15',
  );
}

seedSheets();
