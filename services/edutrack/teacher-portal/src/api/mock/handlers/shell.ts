/**
 * Shell endpoints: who I am, the term context and clock, what I'm assigned to, sidebar counts
 * and search. Features don't edit this file: they add sidebar counts with `registerNavCount`.
 */
import { mock } from '@edutrack/web-core/mock';

import { routesPath as r } from '@/router/routes-path';
import type { AssignmentSummary, Me, MyScope, NavCounts, SearchResult, TermSummary } from '@/types';

import { closureReason, isoToday, nowLocal } from '../clock';
import { BRANCHES, DEPARTMENTS, SCHOOL, TERMS, type TermRecord } from '../school-db';
import {
  activeTerm,
  armById,
  assignmentsOf,
  branchOf,
  classArmOf,
  currentTeacher,
  hodDepartmentOf,
  isAcademicHead,
  noteReviewDepartments,
  sheetReviewDepartments,
  studentsInArm,
  studentsInArmFor,
  studentsTaughtBy,
  subjectByCode,
  termFor,
  termLockReason,
} from '../scope';

/* ---------- Sidebar counts registry ---------- */

/** Counts the badge beside one sidebar item for a teacher and term. */
export type NavCountFn = (teacherId: string, termId: string) => number;
const navCounters = new Map<string, NavCountFn[]>();

/**
 * Adds a sidebar count for a route name, e.g. from a feature's handler file:
 * `registerNavCount(routesPath.results.list.name, (teacherId, termId) => …)`.
 * Several counters for one route are added together; a counter that throws counts 0.
 */
export function registerNavCount(routeName: string, count: NavCountFn) {
  navCounters.set(routeName, [...(navCounters.get(routeName) ?? []), count]);
}

/** Every registered count for a teacher and term (zeros left out). */
export function navCountsFor(teacherId: string, termId: string): NavCounts {
  const out: NavCounts = {};
  for (const [route, counters] of navCounters) {
    const total = counters.reduce((sum, fn) => {
      try {
        return sum + Math.max(0, fn(teacherId, termId) || 0);
      } catch {
        return sum;
      }
    }, 0);
    if (total) out[route] = total;
  }
  return out;
}

/* ---------- Shapes ---------- */

export const termSummary = (t: TermRecord): TermSummary => ({
  id: t.id,
  sessionName: t.sessionName,
  name: t.name,
  label: `${t.sessionName} · ${t.name}`,
  status: t.status,
  start: t.start,
  end: t.end,
  resultEntryCloses: t.resultEntryCloses,
  resultsPublication: t.resultsPublication,
  lockReason: termLockReason(t.id),
});

export function assignmentSummary(teacherId: string, termId: string): AssignmentSummary[] {
  return assignmentsOf(teacherId, termId).map((ta) => {
    const a = armById(ta.armId);
    return {
      id: ta.id,
      termId,
      armId: a.id,
      armName: a.name,
      subject: ta.subject,
      subjectName: subjectByCode(ta.subject).name,
      branchId: a.branchId,
      branchName: branchOf(a.branchId).name,
      periodsPerWeek: ta.periodsPerWeek,
      students: studentsInArmFor(a.id, ta.subject, termId).length,
      type: ta.type,
    };
  });
}

/* ---------- Endpoints ---------- */

mock.get('/v1/me', (req): Me => {
  const t = currentTeacher(req);
  const term = activeTerm();
  const arm = classArmOf(t.id, term.id);
  const hod = hodDepartmentOf(t.id);
  const dept = DEPARTMENTS.find((d) => d.id === t.departmentId);
  const reviews = {
    resultSheets: sheetReviewDepartments(t.id).length > 0,
    lessonNotes: noteReviewDepartments(t.id).length > 0,
  };
  const branchIds = new Set([
    ...t.branchIds,
    ...assignmentsOf(t.id, term.id).map((a) => a.branchId),
  ]);
  return {
    teacher: {
      id: t.id,
      title: t.title,
      firstName: t.firstName,
      lastName: t.lastName,
      name: t.name,
      email: t.email,
      staffNo: t.staffNo,
      position: t.position,
      department: dept ? { id: dept.id, name: dept.name } : null,
    },
    roles: t.roles,
    isClassTeacher: arm !== null,
    classArm: arm
      ? {
          id: arm.id,
          name: arm.name,
          branchId: arm.branchId,
          branchName: branchOf(arm.branchId).name,
        }
      : null,
    isHod: hod !== null,
    hodOf: hod ? { id: hod.id, name: hod.name } : null,
    isAcademicHead: isAcademicHead(t.id),
    reviews,
    isReviewer: reviews.resultSheets || reviews.lessonNotes,
    branches: BRANCHES.filter((b) => branchIds.has(b.id)).map((b) => ({ ...b })),
    hasAssignments: assignmentsOf(t.id, term.id).length > 0,
    profileComplete: Boolean(t.phone.trim()),
  };
});

mock.get('/v1/context', () => {
  const active = activeTerm();
  const today = isoToday();
  const reason = closureReason(today);
  return {
    terms: [...TERMS].sort((a, b) => b.start.localeCompare(a.start)).map(termSummary),
    activeTermId: active?.id ?? null,
    today,
    now: nowLocal(),
    isSchoolDay: reason === null,
    closedReason: reason,
    entryDeadline: active?.resultEntryCloses ?? null,
    calendar: active?.calendar ?? [],
    school: { name: SCHOOL.name, academicOffice: SCHOOL.academicOffice },
  };
});

mock.get('/v1/my-scope', (req): MyScope => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const assignments = assignmentSummary(t.id, term.id);
  const arm = classArmOf(t.id, term.id);
  return {
    termId: term.id,
    assignments,
    classArm: arm
      ? {
          id: arm.id,
          name: arm.name,
          branchName: branchOf(arm.branchId).name,
          students: studentsInArm(arm.id, term.id).length,
        }
      : null,
    multiCampus: new Set(assignments.map((a) => a.branchId)).size > 1,
  };
});

mock.get('/v1/nav-counts', (req) => {
  const t = currentTeacher(req);
  return navCountsFor(t.id, termFor(req).id);
});

/** My students and my classes, for the command menu. */
mock.get('/v1/search', (req): SearchResult[] => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const q = (req.query.q ?? '').trim().toLowerCase();
  const assignments = assignmentSummary(t.id, term.id);
  const multi = new Set(assignments.map((a) => a.branchId)).size > 1;
  const classes: SearchResult[] = assignments.map((a) => ({
    id: a.id,
    type: 'Class',
    title: `${a.armName} · ${a.subjectName}`,
    meta: `${multi ? `${a.branchName} · ` : ''}${a.students} students · ${a.periodsPerWeek} periods a week`,
    to: { name: r.teaching.class.name, params: { armId: a.armId, subject: a.subject } },
  }));
  const subjects: SearchResult[] = [...new Set(assignments.map((a) => a.subject))].map((code) => ({
    id: `subject-${code}`,
    type: 'Subject',
    title: subjectByCode(code).name,
    meta: assignments
      .filter((a) => a.subject === code)
      .map((a) => a.armName)
      .join(', '),
    to: { name: r.teaching.subject.name, params: { subject: code } },
  }));
  const students: SearchResult[] = studentsTaughtBy(t.id, term.id).map(({ student }) => ({
    id: student.id,
    type: 'Student',
    title: student.name,
    meta: `${student.admissionNo} · ${armById(student.armId).name}`,
    to: { name: r.teaching.student.name, params: { studentId: student.id } },
  }));
  const pages: SearchResult[] = [
    ['Timetable', r.teaching.timetable.name, 'My week'],
    ['Results', r.results.list.name, 'Score sheets for the term'],
    ['Assignments', r.assignments.list.name, 'Homework and submissions'],
    ['Profile', r.profile.view.name, 'Phone, password and devices'],
  ].map(([title, name, meta]) => ({
    id: `page-${name}`,
    type: 'Page',
    title: title!,
    meta: meta!,
    to: { name: name! },
  }));
  const all = [...classes, ...subjects, ...students, ...pages];
  if (!q) return [...classes, ...pages].slice(0, 9);
  return all.filter((x) => `${x.title} ${x.meta}`.toLowerCase().includes(q)).slice(0, 9);
});
