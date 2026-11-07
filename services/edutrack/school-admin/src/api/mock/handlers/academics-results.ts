import { mock, MockHttpError } from '@edutrack/web-core/mock';

import type {
  AssessmentScheme,
  Correction,
  PromotionDecisionInput,
  PromotionView,
  PublishCheck,
  ReportCard,
  ResultSheet,
  ResultsMatrix,
  ScoreValue,
  SheetRow,
  SheetStatus,
} from '@/types';

import {
  academicsData,
  armLabel,
  armStudents,
  offeredSubjects,
  seeded,
  type AcademicsData,
  type PromotionClassRec,
  type SheetRec,
} from '../academics-db';
import { resultsPublished } from '../comms-events';
import { schoolData } from '../school-db';
import { studentsData, type StudentRecord } from '../students-db';
import {
  acadFor,
  activeBranches,
  allArms,
  findArm,
  nowLabel,
  plural,
  subjectName,
  teacherName,
  termFrom,
} from './academics-shared';
import { academicPolicy } from '../settings-db';
import { requireText } from './shared';

const ABILITY: Record<string, number> = {
  emmanuel: 0.72,
  favour: 0.78,
  chiamaka: 0.86,
  daniel: 0.6,
};

const fail = (msg: string, status = 422): never => {
  throw new MockHttpError(status, msg);
};

const STATUSES: SheetStatus[] = [
  'Not started',
  'Draft',
  'Submitted',
  'Under review',
  'Returned',
  'Approved',
  'Published',
];

export function schemeFor(acad: AcademicsData, section: string): AssessmentScheme | null {
  return (
    (acad.assessment.same ? acad.assessment.schemes['*'] : acad.assessment.schemes[section]) ?? null
  );
}

const nameOf = (s: StudentRecord) => `${s.firstName} ${s.surname}`.trim();
const round = (acad: AcademicsData, n: number) =>
  acad.assessment.rounding === 'Whole number' ? Math.round(n) : Math.round(n * 10) / 10;

/** Fills in plausible raw scores for students who have none yet (the Teacher Workspace's job). */
function ensureScores(schoolId: string, acad: AcademicsData, sheet: SheetRec) {
  if (sheet.status === 'Not started') return;
  const { level, arm } = findArm(acad, sheet.armId);
  const scheme = schemeFor(acad, level.section);
  if (!scheme || scheme.mode !== 'scores') return;
  for (const s of armStudents(schoolId, level, arm).records) {
    if (sheet.scores[s.id]) continue;
    // A few students from the design keep their familiar standing.
    const ability = ABILITY[s.id] ?? 0.42 + seeded(s.id) * 0.5;
    sheet.scores[s.id] = scheme.components.map((c, i): ScoreValue => {
      if (sheet.status === 'Draft' && i === scheme.components.length - 1) return null;
      if (s.id === 'daniel' && sheet.subject === 'MTH' && i === scheme.components.length - 1)
        return 'ABS';
      if (s.id === 'aisha' && sheet.subject === 'MTH' && i === 1 && scheme.components.length > 2)
        return 'EXM';
      const noise = (seeded(s.id + sheet.subject + i) - 0.5) * 0.3;
      return Math.max(0, Math.min(c.max, Math.round(c.max * Math.min(0.98, ability + noise))));
    });
  }
}

function gradeOf(scheme: AssessmentScheme, total: number) {
  return scheme.scale.find((g) => total >= g.min && total <= g.max + 0.999) ?? null;
}

function totalOf(acad: AcademicsData, scheme: AssessmentScheme, values: ScoreValue[]) {
  let total = 0;
  let counted = 0;
  // Settings → Academic: an exempt component either drops out (the rest re-weight to 100%) or scores 0.
  const reweight = academicPolicy(acad).reweightExempt;
  for (const [i, c] of scheme.components.entries()) {
    const v = values[i];
    if (v === 'EXM') {
      if (!reweight) counted += c.weight;
      continue;
    }
    if (v === null || v === undefined || v === 'ABS') return null;
    total += (v / c.max) * c.weight;
    counted += c.weight;
  }
  return counted ? round(acad, (total / counted) * 100) : null;
}

function sheetRows(schoolId: string, acad: AcademicsData, sheet: SheetRec): SheetRow[] {
  const { level, arm } = findArm(acad, sheet.armId);
  const scheme = schemeFor(acad, level.section)!;
  return armStudents(schoolId, level, arm).records.map((s) => {
    const scores = sheet.scores[s.id] ?? scheme.components.map(() => null);
    const total = totalOf(acad, scheme, scores);
    const band = total === null ? null : gradeOf(scheme, total);
    const absentAt = scores.findIndex((v) => v === 'ABS');
    const exemptAt = scores.findIndex((v) => v === 'EXM');
    const missing = scores.some((v) => v === null);
    return {
      studentId: s.id,
      name: nameOf(s),
      admissionNo: s.admissionNo,
      scores,
      total,
      grade: band?.grade ?? null,
      remark: band?.remark ?? '',
      flag:
        absentAt >= 0
          ? `Absent (${scheme.components[absentAt]!.name}) · make-up needed`
          : exemptAt >= 0
            ? `Exempt from ${scheme.components[exemptAt]!.name} · joined late`
            : missing
              ? 'Missing score'
              : '',
    };
  });
}

export function sheetView(schoolId: string, acad: AcademicsData, sheet: SheetRec): ResultSheet {
  ensureScores(schoolId, acad, sheet);
  const { level, arm } = findArm(acad, sheet.armId);
  const scheme = schemeFor(acad, level.section)!;
  const rows = sheetRows(schoolId, acad, sheet);
  const totals = rows.map((r) => r.total).filter((x): x is number => x !== null);
  const term = academicsData[schoolId]!.sessions.flatMap((s) => s.terms).find(
    (t) => t.id === sheet.termId,
  );
  const teacher = teacherName(
    acad,
    acad.assignments.find((a) => a.armId === arm.id && a.subject === sheet.subject)?.teacherId ??
      null,
  );
  return {
    armId: arm.id,
    arm: armLabel(level.name, arm.arm),
    subject: sheet.subject,
    subjectName: subjectName(acad, sheet.subject),
    teacher,
    term: term?.name ?? '',
    status: acad.published.includes(`${sheet.termId}|${arm.id}`) ? 'Published' : sheet.status,
    submittedAt: sheet.submittedAt,
    components: scheme.components,
    rows,
    stats: {
      average: totals.length
        ? round(acad, totals.reduce((a, b) => a + b, 0) / totals.length)
        : null,
      highest: totals.length ? Math.max(...totals) : null,
      lowest: totals.length ? Math.min(...totals) : null,
      passed: totals.filter((t) => t >= acad.assessment.passMark).length,
      count: rows.length,
      absent: rows.filter((r) => r.scores.includes('ABS')).length,
      exempt: rows.filter((r) => r.scores.includes('EXM')).length,
      missing: rows.filter((r) => r.scores.includes(null)).length,
    },
    returnNote: sheet.returnNote,
    passMark: acad.assessment.passMark,
    history: [
      ...sheet.history,
      ...(sheet.submittedAt
        ? [
            {
              id: 'sub',
              title: `Submitted by ${teacher ?? 'the teacher'}`,
              detail: plural(rows.length, 'student'),
              when: sheet.submittedAt,
              tone: 'info' as const,
            },
          ]
        : []),
      ...(sheet.status !== 'Not started'
        ? [
            {
              id: 'draft',
              title: `Draft saved by ${teacher ?? 'the teacher'}`,
              detail: 'Teacher Workspace',
              when: '7 Dec, 16:40',
            },
          ]
        : []),
    ],
  };
}

function findSheet(acad: AcademicsData, armId: string, subject: string, termId: string) {
  const { level } = findArm(acad, armId);
  if (!offeredSubjects(acad, level).some(([c]) => c === subject))
    fail(`${level.name} doesn’t offer ${subjectName(acad, subject)}.`, 404);
  let sheet = acad.sheets.find(
    (s) => s.armId === armId && s.subject === subject && s.termId === termId,
  );
  if (!sheet) {
    sheet = {
      armId,
      subject,
      termId,
      status: 'Not started',
      submittedAt: null,
      returnNote: '',
      scores: {},
      history: [],
    };
    acad.sheets.push(sheet);
  }
  return sheet;
}

/* ---------------- Matrix ---------------- */

mock.get('/v1/academics/results', (req) => {
  const { acad, schoolId } = acadFor(req);
  const term = termFrom(acad, req.query.term) ?? fail('Create a session and its terms first.', 409);
  const branchId =
    activeBranches(schoolId).find((b) => b.name === req.query.branch)?.id ??
    activeBranches(schoolId)[0]?.id;
  // Only sections this branch runs classes for.
  const sections = acad.sections
    .filter((s) => acad.levels.some((l) => l.section === s.name && l.branchId === branchId))
    .map((s) => s.name);
  const section = sections.includes(req.query.section ?? '')
    ? req.query.section!
    : (sections.find((s) => s === 'Junior Secondary') ?? sections[0] ?? '');
  const arms = allArms(acad).filter(
    ({ level }) => level.section === section && level.branchId === branchId,
  );
  const codes = [
    ...new Set(arms.flatMap(({ level }) => offeredSubjects(acad, level).map(([c]) => c))),
  ];
  const subjects = acad.subjects
    .filter((s) => codes.includes(s.code))
    .map((s) => ({ code: s.code, name: s.name }));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<SheetStatus, number>;
  const scheme = schemeFor(acad, section);
  const rows = arms.map(({ level, arm }) => {
    const published = acad.published.includes(`${term.id}|${arm.id}`);
    const offered = offeredSubjects(acad, level).map(([c]) => c);
    const cells = Object.fromEntries(
      subjects.map((s) => {
        if (!offered.includes(s.code)) return [s.code, null];
        const st: SheetStatus = published
          ? 'Published'
          : (acad.sheets.find(
              (x) => x.armId === arm.id && x.subject === s.code && x.termId === term.id,
            )?.status ?? 'Not started');
        counts[st]++;
        return [s.code, st];
      }),
    );
    return {
      armId: arm.id,
      arm: armLabel(level.name, arm.arm),
      cells,
      ready: !published && Object.values(cells).every((v) => v === null || v === 'Approved'),
      published,
    };
  });
  const out: ResultsMatrix = {
    term: term.name,
    section,
    sections,
    subjects,
    rows,
    counts,
    schemeMissing: !scheme,
    descriptive: scheme?.mode === 'descriptive',
  };
  return out;
});

/* ---------------- Review sheet ---------------- */

mock.get('/v1/academics/results/sheets/:armId/:subject', (req) => {
  const { acad, schoolId } = acadFor(req);
  const term = termFrom(acad, req.query.term) ?? fail('No term', 409);
  const { level } = findArm(acad, req.params.armId!);
  if (!schemeFor(acad, level.section))
    fail(`Set up an assessment scheme for ${level.section} first.`, 409);
  return sheetView(
    schoolId,
    acad,
    findSheet(acad, req.params.armId!, req.params.subject!, term.id),
  );
});

mock.post('/v1/academics/results/sheets/:armId/:subject/:action', (req) => {
  const { acad, schoolId, actor, log } = acadFor(req);
  const term = termFrom(acad, (req.body as { term?: string })?.term) ?? fail('No term', 409);
  const sheet = findSheet(acad, req.params.armId!, req.params.subject!, term.id);
  const view = sheetView(schoolId, acad, sheet);
  if (view.status === 'Published')
    fail('Published results are locked. Use a correction request.', 409);
  if (!['Submitted', 'Under review'].includes(sheet.status))
    fail('Only a submitted sheet can be approved or returned.', 409);
  if (req.params.action === 'approve') {
    if (view.stats.missing)
      fail(
        `${plural(view.stats.missing, 'student')} still ${view.stats.missing === 1 ? 'has' : 'have'} missing scores. Return the sheet to the teacher.`,
      );
    sheet.status = 'Approved';
    sheet.history.unshift({
      id: `h${Date.now()}`,
      title: `Approved by ${actor}`,
      detail: 'results.approve',
      when: nowLabel(),
      tone: 'success',
    });
    log('Results', `Approved ${view.arm} ${view.subjectName}`, term.name);
  } else if (req.params.action === 'return') {
    const note = requireText((req.body as { note?: string }).note, 'Tell the teacher what to fix.');
    sheet.status = 'Returned';
    sheet.returnNote = note;
    sheet.history.unshift({
      id: `h${Date.now()}`,
      title: `Returned by ${actor}`,
      detail: note,
      when: nowLabel(),
      tone: 'error',
    });
    log(
      'Results',
      `Returned ${view.arm} ${view.subjectName} to ${view.teacher ?? 'the teacher'}`,
      note,
    );
  } else fail('Unknown action', 404);
  return sheetView(schoolId, acad, sheet);
});

/* ---------------- Publish ---------------- */

function publishCheck(
  schoolId: string,
  acad: AcademicsData,
  armId: string,
  termId: string,
): PublishCheck {
  const { level, arm } = findArm(acad, armId);
  const offered = offeredSubjects(acad, level).map(([c]) => c);
  const flags: string[] = [];
  const notApproved: string[] = [];
  for (const code of offered) {
    const sheet = findSheet(acad, armId, code, termId);
    if (sheet.status !== 'Approved')
      notApproved.push(`${subjectName(acad, code)} (${sheet.status.toLowerCase()})`);
    else
      for (const r of sheetView(schoolId, acad, sheet).rows)
        if (r.flag) flags.push(`${r.name} · ${subjectName(acad, code)}: ${r.flag}`);
  }
  return {
    armId,
    arm: armLabel(level.name, arm.arm),
    students: armStudents(schoolId, level, arm).count,
    subjects: offered.length,
    notApproved,
    flags,
  };
}

mock.get('/v1/academics/results/publish/:armId', (req) => {
  const { acad, schoolId } = acadFor(req);
  const term = termFrom(acad, req.query.term) ?? fail('No term', 409);
  return publishCheck(schoolId, acad, req.params.armId!, term.id);
});

mock.post('/v1/academics/results/publish/:armId', (req) => {
  const { acad, schoolId, log, actor } = acadFor(req);
  const body = req.body as { acknowledged?: boolean; term?: string };
  const term = termFrom(acad, body.term) ?? fail('No term', 409);
  const key = `${term.id}|${req.params.armId}`;
  if (acad.published.includes(key)) fail('These results are already published.', 409);
  const check = publishCheck(schoolId, acad, req.params.armId!, term.id);
  if (check.notApproved.length)
    fail(`Approve every subject first: ${check.notApproved.join(', ')}.`, 409);
  if (check.flags.length && !body.acknowledged)
    fail('Acknowledge the absent and exempt flags before publishing.');
  acad.published.push(key);
  acad.sheets
    .filter((s) => s.armId === req.params.armId && s.termId === term.id)
    .forEach((s) => (s.status = 'Published'));
  const { level, arm } = findArm(acad, req.params.armId!);
  for (const s of armStudents(schoolId, level, arm).records)
    acad.reportVersions[`${term.id}|${s.id}`] = 1;
  log(
    'Results',
    `Published ${check.arm} results`,
    `${term.name} · ${plural(check.students, 'student')}`,
  );
  resultsPublished(
    schoolId,
    check.arm,
    term.name,
    acad.sessions.find((x) => x.terms.some((t) => t.id === term.id))?.name ?? '',
    actor,
  );
  return check;
});

/* ---------------- Report card ---------------- */

mock.get('/v1/academics/results/report-card/:studentId', (req): ReportCard => {
  const { acad, schoolId } = acadFor(req);
  const term = termFrom(acad, req.query.term) ?? fail('No term', 409);
  const sd = studentsData[schoolId]!;
  const student =
    sd.students.find((s) => s.id === req.params.studentId) ?? fail('Student not found', 404);
  const found = allArms(acad).find(
    ({ level, arm }) =>
      level.name === student.level &&
      arm.arm === student.arm &&
      armStudents(schoolId, level, arm).records.includes(student),
  );
  if (!found) fail(`${nameOf(student)} isn’t placed in a class arm.`, 409);
  const { level, arm } = found!;
  const scheme =
    schemeFor(acad, level.section) ??
    fail(`Set up an assessment scheme for ${level.section} first.`, 409);
  const profile = schoolData[schoolId]!.profile;
  const subjects = offeredSubjects(acad, level).map(([code]) => {
    const sheet = findSheet(acad, arm.id, code, term.id);
    ensureScores(schoolId, acad, sheet);
    const scores = sheet.scores[student.id] ?? scheme.components.map(() => null);
    const total = totalOf(acad, scheme, scores);
    const band = total === null ? null : gradeOf(scheme, total);
    return {
      name: subjectName(acad, code),
      scores: scores.map((v) => (v === null ? '—' : v)),
      total: total === null ? '—' : total.toFixed(1),
      grade: band?.grade ?? '—',
      remark: band?.remark ?? (scores.includes('ABS') ? 'Absent' : 'Pending'),
      value: total,
    };
  });
  const valid = subjects.map((s) => s.value).filter((v): v is number => v !== null);
  const average = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  // Position among classmates with records, by average.
  const classmates = armStudents(schoolId, level, arm).records;
  const avgOf = (id: string) => {
    const vals = offeredSubjects(acad, level)
      .map(([code]) => {
        const sh = acad.sheets.find(
          (x) => x.armId === arm.id && x.subject === code && x.termId === term.id,
        );
        return sh?.scores[id] ? totalOf(acad, scheme, sh.scores[id]!) : null;
      })
      .filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : -1;
  };
  const ranked = [...classmates].sort((a, b) => avgOf(b.id) - avgOf(a.id));
  const pos = ranked.findIndex((s) => s.id === student.id) + 1;
  const ord = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
  };
  const session = acad.sessions.find((s) => s.terms.some((t) => t.id === term.id))!;
  const next = session.terms[session.terms.findIndex((t) => t.id === term.id) + 1];
  return {
    school: {
      name: profile.name,
      motto: profile.motto,
      address:
        [profile.street, profile.city, profile.state].filter(Boolean).join(', ') +
        (profile.email ? ` · ${profile.email}` : ''),
      logoUrl: profile.logo?.dataUrl ?? null,
    },
    title: `${term.name} Report · ${session.name}`,
    student: {
      id: student.id,
      name: nameOf(student),
      admissionNo: student.admissionNo,
      gender: student.gender,
      className: armLabel(level.name, arm.arm),
    },
    classTeacher: teacherName(acad, arm.classTeacherId),
    components: scheme.components.map((c) => `${c.name} /${c.max}`),
    subjects: subjects.map(({ value: _v, ...s }) => s),
    average: average === null ? '—' : `${average.toFixed(1)}%`,
    grade: average === null ? '—' : (gradeOf(scheme, average)?.grade ?? '—'),
    position:
      acad.assessment.showPosition && average !== null
        ? `${ord(pos)} of ${classmates.length}`
        : null,
    published: acad.published.includes(`${term.id}|${arm.id}`),
    version: acad.reportVersions[`${term.id}|${student.id}`] ?? 0,
    nextTerm: next
      ? `${next.name} begins ${new Date(`${next.start}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : 'End of session',
    classmates: classmates.map((s) => ({ id: s.id, name: nameOf(s) })),
  };
});

/* ---------------- Corrections ---------------- */

function correctionView(
  schoolId: string,
  acad: AcademicsData,
  c: (typeof acad.corrections)[number],
): Correction {
  const { level, arm } = findArm(acad, c.armId);
  const scheme = schemeFor(acad, level.section)!;
  const sheet = findSheet(acad, c.armId, c.subject, c.termId);
  ensureScores(schoolId, acad, sheet);
  const scores = sheet.scores[c.studentId] ?? [];
  if (!c.original && !c.proposed) {
    const v = scores[c.componentIndex];
    c.original = typeof v === 'number' ? v : 0;
    c.proposed = Math.min(scheme.components[c.componentIndex]!.max, c.original + 6);
  }
  const base =
    c.status === 'Applied'
      ? scores.map((v, i) => (i === c.componentIndex ? c.original : v))
      : scores;
  const after = base.map((v, i) => (i === c.componentIndex ? c.proposed : v));
  const fmt = (vals: ScoreValue[]) => {
    const t = totalOf(acad, scheme, vals);
    return t === null ? '—' : `${t.toFixed(1)} · ${gradeOf(scheme, t)?.grade ?? '—'}`;
  };
  const student = studentsData[schoolId]!.students.find((s) => s.id === c.studentId);
  return {
    id: c.id,
    studentId: c.studentId,
    student: student ? nameOf(student) : 'Unknown student',
    armId: c.armId,
    arm: armLabel(level.name, arm.arm),
    subject: c.subject,
    subjectName: subjectName(acad, c.subject),
    component: `${scheme.components[c.componentIndex]!.name} (max ${scheme.components[c.componentIndex]!.max})`,
    original: c.original,
    proposed: c.proposed,
    originalTotal: fmt(base),
    proposedTotal: fmt(after),
    reason: c.reason,
    requestedBy: c.requestedBy,
    requestedAt: c.requestedAt,
    evidence: c.evidence,
    status: c.status,
    decisionNote: c.decisionNote,
    history: [
      ...c.history,
      {
        id: 'pub',
        title: 'Original score published',
        detail: `${scheme.components[c.componentIndex]!.name} ${c.original} · total ${fmt(base)}`,
        when: 'Term results',
        tone: 'neutral' as const,
      },
    ],
  };
}

mock.get('/v1/academics/results/corrections', (req) => {
  const { acad, schoolId } = acadFor(req);
  return acad.corrections.map((c) => correctionView(schoolId, acad, c));
});

mock.post('/v1/academics/results/corrections/:id/:action', (req) => {
  const { acad, schoolId, actor, log } = acadFor(req);
  const c =
    acad.corrections.find((x) => x.id === req.params.id) ?? fail('Correction not found', 404);
  if (c.status !== 'Under review') fail('This correction has already been decided.', 409);
  const view = correctionView(schoolId, acad, c);
  const note = ((req.body as { note?: string })?.note ?? '').trim();
  if (req.params.action === 'approve') {
    const sheet = findSheet(acad, c.armId, c.subject, c.termId);
    const scores = [...(sheet.scores[c.studentId] ?? [])];
    scores[c.componentIndex] = c.proposed;
    sheet.scores[c.studentId] = scores;
    const key = `${c.termId}|${c.studentId}`;
    acad.reportVersions[key] = (acad.reportVersions[key] ?? 1) + 1;
    c.status = 'Applied';
    c.decisionNote = note;
    c.history.unshift({
      id: `h${Date.now()}`,
      title: `Approved and applied by ${actor}`,
      detail: `${view.component.split(' (')[0]} ${c.original} → ${c.proposed} · report card version ${acad.reportVersions[key]}`,
      when: nowLabel(),
      tone: 'success',
    });
    log(
      'Results',
      `Correction applied for ${view.student}`,
      `${view.subjectName} · ${c.original} → ${c.proposed}`,
    );
  } else if (req.params.action === 'reject') {
    if (!note) fail('Give a reason so the teacher knows why.');
    c.status = 'Rejected';
    c.decisionNote = note;
    c.history.unshift({
      id: `h${Date.now()}`,
      title: `Rejected by ${actor}`,
      detail: note,
      when: nowLabel(),
      tone: 'error',
    });
    log('Results', `Correction rejected for ${view.student}`, note);
  } else fail('Unknown action', 404);
  return correctionView(schoolId, acad, c);
});

/* ---------------- Promotion ---------------- */

const eligibleOf = (acad: AcademicsData, s: { average: number; maths: number; english: number }) =>
  s.average >= 45 && s.maths >= acad.assessment.passMark && s.english >= acad.assessment.passMark;

function nextFor(c: PromotionClassRec, d: string | null) {
  switch (d) {
    case 'Promote':
      return c.nextLevel ? `${c.nextLevel} · arm ${c.arm}` : 'Graduates';
    case 'Repeat':
      return `${c.level} · arm ${c.arm} (repeat)`;
    case 'Graduate':
      return 'Graduates';
    case 'Transfer':
    case 'Withdraw':
      return 'Leaves school';
    default:
      return '—';
  }
}

/** The fee note on a student, in line with the school's fees-block setting. */
function feeNote(note: string, balance: number, block: boolean) {
  if (!balance || !/outstanding/.test(note)) return note;
  return note.replace(
    /·.*$/,
    block ? '· must be cleared before promotion' : '· fees don’t block promotion',
  );
}

function promotionView(acad: AcademicsData, classId?: string): PromotionView {
  const p = acad.promotion;
  const policy = academicPolicy(acad);
  if (!p)
    return {
      from: '',
      to: '',
      rule: '',
      classes: [],
      classId: '',
      className: '',
      nextLevel: null,
      arm: '',
      students: [],
      applied: false,
      empty: true,
      suggestions: policy.promotionSuggestions,
      feesBlock: policy.blockPromotionOnFees,
    };
  const cls =
    p.classes.find((c) => c.id === classId) ??
    p.classes.find((c) => c.status === 'Pending') ??
    p.classes[0]!;
  const name = (id: string) => acad.sessions.find((s) => s.id === id)?.name ?? '';
  return {
    from: name(p.fromSessionId),
    to: name(p.toSessionId),
    rule: p.rule,
    classes: p.classes.map((c) => ({
      id: c.id,
      name: c.name,
      pending: c.students.filter((s) => c.status === 'Pending' && !s.decision).length,
      total: c.total,
      status: c.status,
    })),
    classId: cls.id,
    className: cls.name,
    nextLevel: cls.nextLevel,
    arm: cls.arm,
    students: cls.students.map((s) => ({
      ...s,
      note: feeNote(s.note, s.balance, policy.blockPromotionOnFees),
      eligible: eligibleOf(acad, s),
      next: nextFor(cls, s.decision ?? (cls.status !== 'Pending' ? s.suggestion : null)),
    })),
    applied: cls.status !== 'Pending',
    empty: false,
    suggestions: policy.promotionSuggestions,
    feesBlock: policy.blockPromotionOnFees,
  };
}

mock.get('/v1/academics/promotion', (req) => promotionView(acadFor(req).acad, req.query.class));

mock.put('/v1/academics/promotion/:classId', (req) => {
  const { acad } = acadFor(req);
  const cls =
    acad.promotion?.classes.find((c) => c.id === req.params.classId) ??
    fail('Class not found', 404);
  if (cls.status !== 'Pending') fail('Decisions for this class are already applied.', 409);
  for (const d of (req.body as { decisions: PromotionDecisionInput[] }).decisions ?? []) {
    const s = cls.students.find((x) => x.id === d.studentId);
    if (!s) continue;
    s.decision = d.decision;
    s.reason = d.reason ?? '';
  }
  return promotionView(acad, cls.id);
});

mock.post('/v1/academics/promotion/:classId/apply', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  const cls =
    acad.promotion?.classes.find((c) => c.id === req.params.classId) ??
    fail('Class not found', 404);
  if (cls.status !== 'Pending') fail('Decisions for this class are already applied.', 409);
  const undecided = cls.students.filter((s) => !s.decision);
  if (undecided.length) fail(`Decide for ${undecided.map((s) => s.name).join(', ')} first.`);
  const policy = academicPolicy(acad);
  if (policy.blockPromotionOnFees) {
    const owing = cls.students.filter((s) => s.decision === 'Promote' && s.balance > 0);
    if (owing.length)
      fail(
        `Your school blocks promotion while fees are outstanding: ${owing.map((s) => s.name).join(', ')}. Clear the balance or choose another decision.`,
      );
  }
  // With suggestions off there is no rule to go against, so no exception reasons are needed.
  const noReason = cls.students.filter((s) => {
    if (!policy.promotionSuggestions) return false;
    const ok = eligibleOf(acad, s);
    return (
      ((ok && s.decision === 'Repeat') || (!ok && s.decision === 'Promote')) && !s.reason.trim()
    );
  });
  if (noReason.length)
    fail(`Give a reason for each exception: ${noReason.map((s) => s.name).join(', ')}.`);
  const sd = studentsData[schoolId]!;
  const branch = schoolData[schoolId]!.branches[0]!.name;
  let created = 0;
  for (const s of cls.students) {
    if (s.decision !== 'Promote' && s.decision !== 'Repeat') continue;
    if (sd.students.some((x) => x.id === `promo-${s.id}`)) continue;
    const level = s.decision === 'Promote' ? cls.nextLevel : cls.level;
    if (!level) continue;
    const arm = sd.arms[level]?.includes(cls.arm) ? cls.arm : (sd.arms[level]?.[0] ?? null);
    const [firstName = s.name, ...rest] = s.name.split(' ');
    sd.students.push({
      id: `promo-${s.id}`,
      firstName,
      surname: rest.join(' '),
      otherNames: '',
      admissionNo: `STU-2025-${String(900 + created).padStart(4, '0')}`,
      gender: s.gender,
      dateOfBirth: '',
      stateOfOrigin: '',
      address: '',
      medicalNotes: '',
      previousSchool: '',
      level,
      arm,
      branch,
      status: 'Active',
      admittedOn: 'Sep 2025',
      admissionType: 'New intake',
      admittedInto: `2025/2026 · ${cls.name}`,
      enrolledSince: 'Today',
      religious: 'CRS',
      elective: 'French',
      balance: s.balance,
      activity: [
        {
          id: 'p1',
          title: s.decision === 'Promote' ? `Promoted to ${level}` : `Repeating ${level}`,
          detail: s.reason || 'Promotion decision applied',
          when: 'Today',
          tone: 'success',
        },
      ],
    });
    created++;
  }
  cls.status = 'Complete';
  const counts = ['Promote', 'Repeat', 'Graduate', 'Transfer', 'Withdraw']
    .map((k) => [k, cls.students.filter((s) => s.decision === k).length] as const)
    .filter(([, n]) => n)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ');
  log('Academics', `Promotion decisions applied for ${cls.name}`, counts);
  return { ...promotionView(acad, cls.id), created };
});
