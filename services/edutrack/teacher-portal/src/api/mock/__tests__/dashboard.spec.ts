import { beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type {
  Dashboard,
  DashboardTodo,
  NavCounts,
  RegisterDay,
  ResultSheet,
  ScoreValue,
  SubmissionList,
} from '@/types';

import { ASSIGNMENTS } from '../assignments-db';
import { signIn } from './helpers';

const TODAY = '2026-12-08';
const PAST = 't-2526-3';
const JSS2B_MTH = 'rs-t-2627-1-mc-jss2b-MTH';
const SSS1A_MTH = 'rs-t-2627-1-mc-sss1a-MTH';

const load = async (api: AxiosInstance, params: Record<string, string> = {}) =>
  (await api.get<Dashboard>('/v1/dashboard', { params })).data;
const todos = (d: Dashboard): DashboardTodo[] => (d.todo.ok ? d.todo.data : []);
const ids = (d: Dashboard) => todos(d).map((t) => t.id);
const metrics = (d: Dashboard) => {
  if (!d.metrics.ok) throw new Error('metrics failed');
  return d.metrics.data;
};

/** Fills every blank score on a sheet with a valid number (max or 10, whichever is lower). */
async function fillSheet(api: AxiosInstance, sheetId: string) {
  const sheet = (await api.get<ResultSheet>(`/v1/results/${sheetId}`)).data;
  const rows = sheet.rows.map((r) => ({
    studentId: r.studentId,
    scores: r.scores.map((v, i): ScoreValue => v ?? Math.min(10, sheet.components[i]!.max)),
    remark: r.teacherRemark,
  }));
  await api.put(`/v1/results/${sheetId}/scores`, { rows });
}

describe('Dashboard', { timeout: 30_000 }, () => {
  let ade: AxiosInstance;
  let okafor: AxiosInstance;
  let bello: AxiosInstance;
  let eze: AxiosInstance;
  let salami: AxiosInstance;
  beforeAll(async () => {
    ade = await signIn('s.ade@greenfield.edu.ng');
    okafor = await signIn('g.okafor@greenfield.edu.ng');
    bello = await signIn('i.bello@greenfield.edu.ng');
    eze = await signIn('c.eze@greenfield.edu.ng');
    salami = await signIn('t.salami@greenfield.edu.ng');
  });

  it('greets with the demo date, the term and the campuses taught', async () => {
    const d = await load(ade);
    expect(d).toMatchObject({
      today: TODAY,
      now: '2026-12-08T08:15',
      termLabel: '2026/2027 · First Term',
      termStatus: 'Active',
      lockReason: null,
      hasAssignments: true,
      profileComplete: true,
    });
    expect(d.campuses).toHaveLength(2);
  });

  it('shows Mr. Ade’s metrics from real state', async () => {
    const m = metrics(await load(ade));
    const nav = (await ade.get<NavCounts>('/v1/nav-counts')).data;
    expect(m.toGrade).toBe(18);
    expect(m.toGrade).toBe(nav.assignments);
    expect(m.sheets).toMatchObject({
      submitted: 2,
      total: 4,
      deadline: '2026-12-11T23:59',
      entryOpen: true,
    });
    expect(m.classesToday).toBeGreaterThan(0);
    // Not a class teacher, not a reviewer.
    expect(m.register).toBeNull();
    expect(m.reviews).toBeNull();
  });

  it('lists returned sheets with the reviewer’s comment and sheets with missing scores', async () => {
    const d = await load(ade);
    const returned = todos(d).find((t) => t.id === `sheet-returned:${SSS1A_MTH}`)!;
    expect(returned.kind).toBe('sheet-returned');
    expect(returned.detail).toMatch(/^Mr\. Ibrahim Bello \(HOD Sciences\): “.+”/);
    const missing = todos(d).find((t) => t.id === `sheet-missing:${JSS2B_MTH}`)!;
    expect(missing.detail).toMatch(/^Result entry closes Fri 11 Dec, 23:59 · 3 days left$/);
    expect(missing.to).toMatchObject({
      name: 'result-sheet',
      params: { sheetId: JSS2B_MTH },
      query: { focus: expect.any(String), student: expect.any(String) },
    });
    // The sidebar's Results count is the same set: returned + missing scores.
    const nav = (await ade.get<NavCounts>('/v1/nav-counts')).data;
    // The Results badge counts sheets that need fixing; "ready to submit" is a nudge, not a problem.
    const sheetItems = todos(d).filter(
      (t) => t.kind === 'sheet-missing' || t.kind === 'sheet-returned',
    ).length;
    expect(sheetItems).toBe(nav.results);
  });

  it('drops “missing scores” once the sheet is complete, and counts it once submitted', async () => {
    await fillSheet(ade, JSS2B_MTH);
    let d = await load(ade);
    expect(ids(d)).not.toContain(`sheet-missing:${JSS2B_MTH}`);
    expect(ids(d)).toContain(`sheet-ready:${JSS2B_MTH}`);
    expect(metrics(d).sheets.submitted).toBe(2);
    await ade.post(`/v1/results/${JSS2B_MTH}/submit`);
    d = await load(ade);
    expect(ids(d)).not.toContain(`sheet-missing:${JSS2B_MTH}`);
    expect(ids(d)).not.toContain(`sheet-ready:${JSS2B_MTH}`);
    expect(metrics(d).sheets.submitted).toBe(3);
  });

  it('lists submissions to grade per assignment and recomputes after grading', async () => {
    const linear = ASSIGNMENTS.find(
      (a) => a.title === 'Linear equations worksheet' && a.armId === 'mc-jss2b',
    )!;
    let d = await load(ade);
    const item = todos(d).find((t) => t.id === `grade:${linear.id}`)!;
    expect(item.title).toBe('Linear equations worksheet: 9 submissions to grade');
    // At most three grading items: the two busiest assignments, then one line summing the rest.
    const grading = todos(d).filter((t) => t.kind === 'grade');
    expect(metrics(d).toGradeAssignments).toBeGreaterThan(3);
    expect(grading).toHaveLength(3);
    expect(grading[grading.length - 1]!.id).toBe('grade:more');
    const counted = grading.reduce(
      (n, t) => n + Number(/^(\d+)/.exec(t.title)?.[1] ?? /: (\d+)/.exec(t.title)![1]),
      0,
    );
    expect(counted).toBe(metrics(d).toGrade);

    const subs = (
      await ade.get<SubmissionList>(`/v1/assignments/${linear.id}/submissions`, {
        params: { status: 'Submitted' },
      })
    ).data.rows;
    await ade.put(`/v1/assignments/${linear.id}/submissions/${subs[0]!.id}/grade`, { score: 20 });
    d = await load(ade);
    expect(todos(d).find((t) => t.id === `grade:${linear.id}`)!.title).toBe(
      'Linear equations worksheet: 8 submissions to grade',
    );
    expect(metrics(d).toGrade).toBe(17);
  });

  it('lists lesson notes returned, overdue and due this week', async () => {
    const d = await load(ade);
    const kinds = todos(d).map((t) => t.kind);
    expect(kinds.filter((k) => k === 'note-returned')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'note-overdue')).toHaveLength(3);
    expect(kinds).toContain('note-due');
    const unwritten = todos(d).find(
      (t) => t.kind === 'note-overdue' && t.detail.includes('not written'),
    )!;
    expect(unwritten.to).toMatchObject({ name: 'lesson-note-new', query: { week: '13' } });
  });

  it('shows the register to-do until today’s register is taken', async () => {
    let d = await load(okafor);
    expect(metrics(d).register).toEqual({ armName: 'JSS 2B', taken: false, closedReason: null });
    expect(ids(d)).toContain(`register:mc-jss2b:${TODAY}`);
    const day = (await okafor.get<RegisterDay>('/v1/class-teacher/register')).data;
    await okafor.put(`/v1/class-teacher/register/${TODAY}`, {
      marks: day.rows.map((r) => ({ studentId: r.studentId, status: 'Present' })),
    });
    d = await load(okafor);
    expect(metrics(d).register?.taken).toBe(true);
    expect(ids(d)).not.toContain(`register:mc-jss2b:${TODAY}`);
  });

  it('shows report-card remarks still to do for class teachers', async () => {
    const d = await load(okafor);
    const remarks = todos(d).find((t) => t.kind === 'remarks')!;
    expect(remarks.title).toBe('Report-card remarks: 5 students still to do');
    expect(remarks.detail).toMatch(/9 of 14 done/);
  });

  it('shows reviews waiting for the HOD and the Academic Head', async () => {
    const b = await load(bello);
    const bNav = (await bello.get<NavCounts>('/v1/nav-counts')).data;
    expect(metrics(b).reviews?.sheets).toBe(bNav['review-sheets']);
    expect(metrics(b).reviews?.notes).toBe(bNav['review-notes']);
    expect(ids(b)).toEqual(expect.arrayContaining(['review-sheets', 'review-notes']));

    const e = await load(eze);
    expect(metrics(e).reviews).toEqual({ sheets: null, notes: 4 });
    expect(ids(e)).toContain('review-notes');
    expect(ids(e)).not.toContain('review-sheets');
  });

  it('explains the empty state for a teacher with no classes, and asks for a phone number', async () => {
    const d = await load(salami);
    expect(d).toMatchObject({ hasAssignments: false, profileComplete: false });
    expect(todos(d)).toEqual([]);
    expect(metrics(d)).toMatchObject({ classesToday: 0, toGrade: 0, sheets: { total: 0 } });
  });

  it('is read-only for a past term: its figures, but nothing to do', async () => {
    const d = await load(ade, { term: PAST });
    expect(d.termStatus).toBe('Closed');
    expect(d.lockReason).toMatch(/closed/);
    expect(todos(d)).toEqual([]);
    expect(metrics(d).sheets).toMatchObject({ submitted: 2, total: 2, entryOpen: false });
    expect(d.lessons.ok && d.lessons.data.lessons).toEqual([]);
  });

  it('keeps the other blocks when one fails', async () => {
    const d = await load(ade, { simulate: 'lessons' });
    expect(d.lessons.ok).toBe(false);
    expect(d.metrics.ok).toBe(true);
    expect(d.todo.ok).toBe(true);
  });
});
