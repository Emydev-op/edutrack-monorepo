import { MockHttpError, type MockRequest } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type { ClassArm, SetupStep } from '@/types';

import {
  academicsData,
  armLabel,
  armStudents,
  offeredSubjects,
  type AcadStep,
  type AcademicsData,
  type ArmRec,
  type LevelRec,
} from '../academics-db';
import { schoolData } from '../school-db';
import { schoolDataFor } from './shared';

export const plural = (n: number, word: string, many = `${word}s`) =>
  `${n.toLocaleString('en-NG')} ${n === 1 ? word : many}`;

export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (iso: string, year = true) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(year && { year: 'numeric' }),
  });
export const nowLabel = () =>
  new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** The signed-in school's academics data with its School-section data and audit logger. */
export function acadFor(req: Pick<MockRequest, 'headers'>) {
  const ctx = schoolDataFor(req);
  return { ...ctx, acad: academicsData[ctx.schoolId]! };
}

export const nextId = (acad: AcademicsData, prefix: string) => `${prefix}${++acad.seq}`;

export const currentSession = (acad: AcademicsData) =>
  acad.sessions.find((s) => s.status === 'Active') ??
  acad.sessions.find((s) => s.status === 'Upcoming') ??
  null;

export function currentTerm(acad: AcademicsData) {
  const s = currentSession(acad);
  return s?.terms.find((t) => t.status === 'Active') ?? s?.terms[0] ?? null;
}

/** The term a request names (`term` query = id or name), else the current term. */
export function termFrom(acad: AcademicsData, value?: string) {
  const s = currentSession(acad);
  return s?.terms.find((t) => t.id === value || t.name === value) ?? currentTerm(acad);
}

export const activeBranches = (schoolId: string) =>
  schoolData[schoolId]!.branches.filter((b) => b.status === 'Active');

export const branchName = (schoolId: string, id: string) =>
  schoolData[schoolId]!.branches.find((b) => b.id === id)?.name ?? 'Removed branch';

export function findArm(acad: AcademicsData, armId: string) {
  for (const level of acad.levels) {
    const arm = level.arms.find((a) => a.id === armId);
    if (arm) return { level, arm };
  }
  throw new MockHttpError(404, 'Class not found');
}

export const teacherName = (acad: AcademicsData, id: string | null) =>
  (id && acad.teachers.find((t) => t.id === id)?.name) || null;

export const subjectName = (acad: AcademicsData, code: string) =>
  acad.subjects.find((s) => s.code === code)?.name ?? code;

export const subjectPeriods = (acad: AcademicsData, code: string) =>
  acad.subjects.find((s) => s.code === code)?.periods ?? 2;

export function teacherLoad(acad: AcademicsData, teacherId: string) {
  return acad.assignments
    .filter((a) => a.teacherId === teacherId)
    .reduce((n, a) => n + subjectPeriods(acad, a.subject), 0);
}

export function toArm(
  schoolId: string,
  acad: AcademicsData,
  level: LevelRec,
  arm: ArmRec,
): ClassArm {
  return {
    id: arm.id,
    levelId: level.id,
    branchId: level.branchId,
    branch: branchName(schoolId, level.branchId),
    section: level.section,
    level: level.name,
    arm: arm.arm,
    name: armLabel(level.name, arm.arm),
    capacity: arm.capacity,
    students: armStudents(schoolId, level, arm).count,
    classTeacherId: arm.classTeacherId,
    classTeacher: teacherName(acad, arm.classTeacherId),
    room: arm.room,
  };
}

/** Levels in section order, then as entered. */
export function orderedLevels(acad: AcademicsData) {
  const idx = (l: LevelRec) => acad.sections.findIndex((s) => s.name === l.section);
  return [...acad.levels].sort((a, b) => idx(a) - idx(b));
}

export const allArms = (acad: AcademicsData) =>
  orderedLevels(acad).flatMap((level) => level.arms.map((arm) => ({ level, arm })));

/** Distinct level names per section, in order. */
export function levelsBySection(acad: AcademicsData) {
  return acad.sections.map((s) => ({
    section: s.name,
    levels: [...new Set(acad.levels.filter((l) => l.section === s.name).map((l) => l.name))],
  }));
}

/* ---------------- Setup Center integration ---------------- */

export type AcademicSetupStep =
  | 'academic-sections'
  | 'academic-session'
  | 'terms'
  | 'classes-arms'
  | 'subjects-curriculum'
  | 'assessment-grading'
  | 'teacher-assignments'
  | 'timetable';

export const STEP_KEY: Record<AcademicSetupStep, AcadStep> = {
  'academic-sections': 'sections',
  'academic-session': 'session',
  terms: 'terms',
  'classes-arms': 'classes',
  'subjects-curriculum': 'subjects',
  'assessment-grading': 'assessment',
  'teacher-assignments': 'assignments',
  timetable: 'timetable',
};

const fromSetup = { from: 'setup' };
const r = routesPath.academics;

/** Live description, link and state of each academic setup step. */
export function academicSteps(
  schoolId: string,
): Record<AcademicSetupStep, Pick<SetupStep, 'description' | 'to' | 'done'>> {
  const acad = academicsData[schoolId]!;
  const c = acad.confirmed;
  const session = currentSession(acad);
  const arms = acad.levels.reduce((n, l) => n + l.arms.length, 0);
  const levelNames = new Set(acad.levels.map((l) => `${l.branchId}|${l.name}`)).size;
  const schemes = schemeGaps(acad);
  const slots = assignmentSlots(acad);
  const noCT = allArms(acad).filter(({ arm }) => !arm.classTeacherId).length;
  const published = acad.timetables.filter(
    (t) => t.termId === currentTerm(acad)?.id && t.status === 'Published',
  ).length;
  const drafts = acad.timetables.filter((t) => t.status !== 'Published').length;
  return {
    'academic-sections': {
      done: c.sections,
      description: acad.sections.length
        ? acad.sections.map((s) => `${s.name} (${s.code || '—'})`).join(', ')
        : 'Choose the sections you run',
      to: { name: r.sections.name, query: fromSetup },
    },
    'academic-session': {
      done: c.session,
      description: session
        ? `${session.name} is ${session.status.toLowerCase()} · ${fmtDate(session.start)} – ${fmtDate(session.end)}`
        : 'Create your first session and its dates',
      to: session ? { name: r.sessions.name } : { name: r.sessionNew.name, query: fromSetup },
    },
    terms: {
      done: c.terms,
      description: session
        ? `${plural(session.terms.length, 'term')} in ${session.name} · ${plural(
            session.terms.reduce((n, t) => n + t.events.length, 0),
            'calendar event',
          )}`
        : 'Create the session first',
      to: session
        ? { name: r.terms.name, params: { id: session.id }, query: fromSetup }
        : { name: r.sessionNew.name, query: fromSetup },
    },
    'classes-arms': {
      done: c.classes,
      description: arms
        ? `${plural(arms, 'arm')} across ${plural(levelNames, 'class level')}`
        : 'Add class levels and their arms',
      to: { name: r.classes.name, query: fromSetup },
    },
    'subjects-curriculum': {
      done: c.subjects,
      description: acad.subjects.length
        ? `${plural(acad.subjects.filter((s) => s.status === 'Active').length, 'subject')} · ${plural(acad.groups.length, 'elective group')}`
        : 'Choose compulsory and elective subjects',
      to: { name: r.subjects.name, query: fromSetup },
    },
    'assessment-grading': {
      done: c.assessment,
      description: schemes.length
        ? `${schemes.join(', ')} ${schemes.length === 1 ? 'needs' : 'need'} a scheme`
        : acad.sections.length
          ? 'Weights and grade scales set for every section'
          : 'Set CA and exam weights and your grading scale',
      to: { name: r.assessments.name, query: fromSetup },
    },
    'teacher-assignments': {
      done: c.assignments,
      description: slots.total
        ? `${slots.filled} of ${slots.total} subject slots assigned${noCT ? ` · ${plural(noCT, 'arm')} without a class teacher` : ''}`
        : 'Who teaches which subject in which class',
      to: { name: r.assignments.name, query: fromSetup },
    },
    timetable: {
      done: c.timetable,
      description: acad.timetables.length
        ? `${plural(published, 'class', 'classes')} published this term${drafts ? ` · ${plural(drafts, 'draft')} in progress` : ''}`
        : 'Periods and lessons for each class',
      to: { name: r.timetable.name, query: fromSetup },
    },
  };
}

export function schemeGaps(acad: AcademicsData) {
  if (acad.assessment.same)
    return acad.assessment.schemes['*'] || !acad.sections.length ? [] : ['All sections'];
  return acad.sections.filter((s) => !acad.assessment.schemes[s.name]).map((s) => s.name);
}

export function assignmentSlots(acad: AcademicsData) {
  let total = 0;
  let filled = 0;
  for (const { level, arm } of allArms(acad))
    for (const [code] of offeredSubjects(acad, level)) {
      total++;
      if (acad.assignments.some((a) => a.armId === arm.id && a.subject === code)) filled++;
    }
  return { total, filled };
}

/** Checks an academic step can be marked complete; throws with what's missing. */
export function completeAcademicStep(schoolId: string, step: AcademicSetupStep) {
  const acad = academicsData[schoolId]!;
  const fail = (msg: string) => {
    throw new MockHttpError(422, msg);
  };
  const session = currentSession(acad);
  switch (step) {
    case 'academic-sections':
      if (!acad.sections.length) fail('Add at least one section.');
      if (acad.sections.some((s) => !/^[A-Z]{2,5}$/.test(s.code)))
        fail('Give every section a 2–5 letter code.');
      break;
    case 'academic-session':
      if (!session) fail('Create the session first.');
      break;
    case 'terms':
      if (!session) fail('Create the session first.');
      if (session!.terms.some((t) => !t.start || !t.end))
        fail('Give every term its start and end dates.');
      break;
    case 'classes-arms': {
      if (!acad.confirmed.sections) fail('Finish Academic Sections first.');
      for (const b of activeBranches(schoolId))
        for (const sec of b.sections)
          if (!acad.levels.some((l) => l.branchId === b.id && l.section === sec))
            fail(
              `Add at least one class level for ${sec} at ${b.name}, or remove the section from the branch.`,
            );
      if (!acad.levels.length) fail('Add at least one class level.');
      break;
    }
    case 'subjects-curriculum': {
      if (!acad.subjects.length) fail('Add at least one subject.');
      const empty = levelsBySection(acad).flatMap(({ section, levels }) =>
        levels.filter((lv) => !Object.values(acad.curriculum[section]?.[lv] ?? {}).includes('C')),
      );
      if (empty.length)
        fail(`Give these classes at least one compulsory subject: ${empty.join(', ')}.`);
      break;
    }
    case 'assessment-grading': {
      const gaps = schemeGaps(acad);
      if (gaps.length) fail(`Set up a scheme for ${gaps.join(', ')} first.`);
      break;
    }
    case 'teacher-assignments':
      if (!acad.confirmed.subjects) fail('Finish Subjects & Curriculum first.');
      if (!acad.assignments.length) fail('Assign at least one subject to a teacher first.');
      break;
    case 'timetable':
      if (!acad.timetables.some((t) => t.status === 'Published'))
        fail('Publish at least one class timetable first.');
      break;
  }
  acad.confirmed[STEP_KEY[step]] = true;
}

export const isAcademicStep = (id: string): id is AcademicSetupStep => id in STEP_KEY;
