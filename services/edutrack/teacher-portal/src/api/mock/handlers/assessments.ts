/**
 * Assessments: the school's scheme (read-only) and the components I schedule for my classes.
 *
 * GET   /v1/assessments?term=&class=&subject=   schemes + my scheduled components
 * GET   /v1/assessments/options?term=           what I can still schedule, per class
 * POST  /v1/assessments                         schedule { armId, subject, componentKey, date, topics, instructions }
 * GET   /v1/assessments/:id                     one, with scored / absent / exempt counts
 * PATCH /v1/assessments/:id                     reschedule { date, topics, instructions }
 */
import { mock, MockHttpError } from '@edutrack/web-core/mock';

import type {
  AssessmentDetail,
  AssessmentSummary,
  AssessmentsList,
  ScheduleOptions,
  SchemeSummary,
} from '@/types';

import {
  ASSESSMENTS,
  assessmentKey,
  checkDate,
  checkText,
  componentCounts,
  createAssessment,
  scheduledFor,
  statusOf,
  type AssessmentRecord,
} from '../assessments-db';
import { formatDay, isoToday } from '../clock';
import { logHistory, timelineOf } from '../notify-db';
import { SCHEMES } from '../school-db';
import {
  armById,
  assignmentsOf,
  branchOf,
  currentTeacher,
  forbidden,
  isEditableTerm,
  notFound,
  requireEditableTerm,
  requireTeaching,
  scopeSummary,
  subjectByCode,
  termFor,
} from '../scope';

function summary(a: AssessmentRecord): AssessmentSummary {
  const arm = armById(a.armId);
  const comp = SCHEMES[arm.section].components.find((c) => c.key === a.componentKey)!;
  const counts = componentCounts(a.termId, a.armId, a.subject, a.componentKey);
  return {
    id: a.id,
    termId: a.termId,
    armId: arm.id,
    arm: arm.name,
    subject: a.subject,
    subjectName: subjectByCode(a.subject).name,
    branchName: branchOf(arm.branchId).name,
    componentKey: a.componentKey,
    component: comp.name,
    max: comp.max,
    weight: comp.weight,
    date: a.date,
    topics: a.topics,
    status: statusOf(a),
    students: counts.students,
    scored: counts.scored,
    absent: counts.absent,
    exempt: counts.exempt,
    missing: counts.missing,
    sheetId: counts.sheetId,
  };
}

function detail(a: AssessmentRecord): AssessmentDetail {
  return {
    ...summary(a),
    instructions: a.instructions,
    canReschedule: isEditableTerm(a.termId) && a.date >= isoToday(),
    history: timelineOf(assessmentKey(a.id)),
  };
}

function requireOwn(teacherId: string, id: string) {
  const a = ASSESSMENTS.find((x) => x.id === id) ?? notFound('That assessment');
  if (a.teacherId !== teacherId)
    forbidden(
      `You don’t have access to that assessment (${armById(a.armId).name} · ${subjectByCode(a.subject).name}). ${scopeSummary(teacherId, a.termId)}`,
    );
  return a;
}

mock.get('/v1/assessments', (req): AssessmentsList => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const mine = assignmentsOf(t.id, term.id);
  const sections = [...new Set(mine.map((ta) => armById(ta.armId).section))].sort();
  const schemes: SchemeSummary[] = sections.map((section) => ({
    section,
    scaleName: SCHEMES[section].scaleName,
    components: SCHEMES[section].components,
  }));
  const rows = ASSESSMENTS.filter(
    (a) =>
      a.teacherId === t.id &&
      a.termId === term.id &&
      (!req.query.class || a.armId === req.query.class) &&
      (!req.query.subject || a.subject === req.query.subject),
  )
    .map(summary)
    .sort((a, b) => b.date.localeCompare(a.date) || a.arm.localeCompare(b.arm));
  return { termId: term.id, editable: isEditableTerm(term.id), schemes, rows };
});

mock.get('/v1/assessments/options', (req): ScheduleOptions => {
  const t = currentTeacher(req);
  const term = termFor(req);
  return {
    termId: term.id,
    termStart: term.start,
    termEnd: term.end,
    today: isoToday(),
    classes: assignmentsOf(t.id, term.id).map((ta) => {
      const arm = armById(ta.armId);
      const taken = new Set(scheduledFor(term.id, ta.armId, ta.subject).map((a) => a.componentKey));
      return {
        assignmentId: ta.id,
        armId: arm.id,
        arm: arm.name,
        subject: ta.subject,
        subjectName: subjectByCode(ta.subject).name,
        branchName: branchOf(arm.branchId).name,
        section: arm.section,
        available: SCHEMES[arm.section].components.filter((c) => !taken.has(c.key)),
      };
    }),
  };
});

mock.post('/v1/assessments', (req) => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const body = req.body as Record<string, unknown> | undefined;
  requireEditableTerm(term.id);
  const armId = String(body?.armId ?? '');
  const subject = String(body?.subject ?? '');
  if (!armId || !subject)
    throw new MockHttpError(422, 'Choose one of your classes.', 'VALIDATION', {
      classKey: 'Choose one of your classes.',
    });
  const ta = requireTeaching(t.id, term.id, armId, subject);
  const comp = SCHEMES[armById(armId).section].components.find((c) => c.key === body?.componentKey);
  if (!comp)
    throw new MockHttpError(422, 'Choose a component from the school’s scheme.', 'VALIDATION', {
      componentKey: 'Choose a component from the school’s scheme.',
    });
  const date = checkDate(term.id, body?.date, true);
  const { topics, instructions } = checkText(body);
  const a = createAssessment(
    {
      termId: term.id,
      assignmentId: ta.id,
      armId,
      subject,
      teacherId: t.id,
      componentKey: comp.key,
      date,
      topics,
      instructions,
    },
    t.name,
  );
  return detail(a);
});

mock.get('/v1/assessments/:assessmentId', (req) =>
  detail(requireOwn(currentTeacher(req).id, req.params.assessmentId!)),
);

mock.patch('/v1/assessments/:assessmentId', (req) => {
  const t = currentTeacher(req);
  const a = requireOwn(t.id, req.params.assessmentId!);
  requireEditableTerm(a.termId);
  if (a.date < isoToday())
    throw new MockHttpError(
      409,
      `This assessment took place on ${formatDay(a.date)}. Enter its scores on the sheet instead.`,
      'ALREADY_TAKEN',
    );
  const body = req.body as Record<string, unknown> | undefined;
  const date = checkDate(a.termId, body?.date ?? a.date, body?.date !== a.date);
  const { topics, instructions } = checkText(body);
  const moved = date !== a.date;
  const from = a.date;
  Object.assign(a, { date, topics, instructions });
  if (moved)
    logHistory(
      assessmentKey(a.id),
      `Rescheduled by ${t.name}`,
      `${formatDay(from)} → ${formatDay(date)} · students notified`,
      'warning',
    );
  else logHistory(assessmentKey(a.id), `Details updated by ${t.name}`, 'Topics and instructions');
  return detail(a);
});
