import { beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type {
  AssignmentDetail,
  AssignmentList,
  BulkReturnResult,
  NavCounts,
  StudentAssignmentRow,
  SubmissionDetail,
  SubmissionList,
} from '@/types';

import {
  ASSIGNMENTS,
  assignmentsForClass,
  openAssignmentFor,
  studentAssignments,
  submissionsFor,
  toGradeCount,
} from '../assignments-db';
import { nowLocal } from '../clock';
import { failure as baseFailure, signIn } from './helpers';

/** The failure plus the field a 422 names (from `fields`). */
async function failure(request: Promise<unknown>) {
  let field: string | undefined;
  const f = await baseFailure(
    request.catch((e: { response?: { data?: { fields?: Record<string, string> } } }) => {
      field = Object.keys(e.response?.data?.fields ?? {})[0];
      throw e;
    }),
  );
  return { ...f, field };
}

const FIRST = 't-2627-1';
const PAST = 't-2526-3';

const draft = (over: Record<string, unknown> = {}) => ({
  armId: 'mc-jss2b',
  subject: 'MTH',
  title: 'Factorisation practice',
  instructions: 'Answer all questions and show your working.',
  dueAt: '2026-12-14T16:00',
  maxScore: 20,
  allowLate: false,
  attachments: [{ name: 'factorisation.pdf', type: 'application/pdf', bytes: 400_000 }],
  publish: true,
  ...over,
});

let ade: AxiosInstance;
let okafor: AxiosInstance;

beforeAll(async () => {
  ade = await signIn('s.ade@greenfield.edu.ng');
  okafor = await signIn('g.okafor@greenfield.edu.ng');
});

const byTitle = (title: string, armId = 'mc-jss2b') =>
  ASSIGNMENTS.find((a) => a.title === title && a.armId === armId && a.teacherId === 'ade')!;

describe('Seeded assignments', () => {
  it('gives every demo teacher published, closed and draft work with seeded submissions', () => {
    for (const t of ['ade', 'okafor', 'bello', 'eze']) {
      const mine = ASSIGNMENTS.filter((a) => a.teacherId === t && a.termId === FIRST);
      expect(new Set(mine.map((a) => a.status))).toEqual(new Set(['Published', 'Closed', 'Draft']));
    }
    const algebra = byTitle('Algebraic expressions');
    expect(algebra.maxScore).toBe(20);
    const subs = submissionsFor(algebra);
    expect(subs).toHaveLength(14);
    const emmanuel = subs.find((s) => s.studentId && s.files[0]?.name.includes('emmanuel'));
    expect(emmanuel?.status).toBe('Submitted');
    const future = ASSIGNMENTS.flatMap(submissionsFor).filter(
      (s) => s.submittedAt && s.submittedAt >= nowLocal(),
    );
    expect(future).toEqual([]);
  });

  it('marks work handed in after the due time as Late, only when late work is allowed', () => {
    const wrong = ASSIGNMENTS.flatMap((a) =>
      submissionsFor(a).filter(
        (s) =>
          (s.status === 'Late' && !(a.allowLate && s.submittedAt! > a.dueAt!)) ||
          (s.late && !(s.submittedAt! > a.dueAt!)) ||
          (!a.allowLate && s.submittedAt && s.submittedAt > a.dueAt!),
      ),
    );
    expect(wrong).toEqual([]);
    expect(ASSIGNMENTS.some((a) => submissionsFor(a).some((s) => s.status === 'Late'))).toBe(true);
    const linear = byTitle('Linear equations worksheet');
    const counts = submissionsFor(linear).reduce<Record<string, number>>(
      (c, s) => ({ ...c, [s.status]: (c[s.status] ?? 0) + 1 }),
      {},
    );
    expect(counts.Submitted).toBe(7);
    expect(counts.Late).toBe(2);
  });

  it('exposes helpers for the class, student and lesson pages', () => {
    expect(assignmentsForClass('mc-jss2b', 'MTH', FIRST).length).toBe(4);
    expect(openAssignmentFor('mc-jss2b', 'MTH', FIRST)?.title).toBe('Algebraic expressions');
    const student = submissionsFor(byTitle('Algebraic expressions'))[0]!.studentId;
    expect(studentAssignments(student, 'ade', FIRST).length).toBe(3);
    expect(toGradeCount('ade', FIRST)).toBe(18);
    for (const t of ['okafor', 'bello', 'eze'])
      expect(toGradeCount(t, FIRST)).toBeGreaterThanOrEqual(5);
    for (const t of ['okafor', 'bello', 'eze'])
      expect(toGradeCount(t, FIRST)).toBeLessThanOrEqual(20);
  });
});

describe('Assignments list and scope', () => {
  it('lists my assignments with counts and filters by class and subject', async () => {
    const { data } = await ade.get<AssignmentList>('/v1/assignments', {
      params: { class: 'mc-jss2b', subject: 'MTH' },
    });
    expect(data.meta.total).toBe(4);
    expect(data.data.every((r) => r.classLabel === 'JSS 2B · Mathematics')).toBe(true);
    const linear = data.data.find((r) => r.title === 'Linear equations worksheet')!;
    expect(linear.toGrade).toBe(9);
    expect(linear.students).toBe(14);
    const { data: drafts } = await ade.get<AssignmentList>('/v1/assignments', {
      params: { status: 'Draft' },
    });
    expect(drafts.data.every((r) => r.status === 'Draft')).toBe(true);
  });

  it('refuses a class I don’t teach and someone else’s assignment', async () => {
    const f = await failure(
      ade.get('/v1/assignments', { params: { class: 'mc-jss2b', subject: 'ENG' } }),
    );
    expect(f.status).toBe(403);
    expect(f.message).toMatch(/JSS 2B · English Language/);
    const theirs = ASSIGNMENTS.find((a) => a.teacherId === 'okafor')!;
    const g = await failure(ade.get(`/v1/assignments/${theirs.id}`));
    expect(g.status).toBe(403);
    expect(g.message).not.toContain(theirs.title);
    expect(g.message).toMatch(/You teach/);
    const sub = submissionsFor(theirs)[0]!;
    expect(
      (
        await failure(
          ade.put(`/v1/assignments/${theirs.id}/submissions/${sub.id}/grade`, { score: 5 }),
        )
      ).status,
    ).toBe(403);
    expect((await failure(ade.get('/v1/assignments/as-99999'))).status).toBe(404);
  });

  it('counts submissions waiting to be graded in the sidebar', async () => {
    const { data } = await ade.get<NavCounts>('/v1/nav-counts');
    expect(data.assignments).toBe(toGradeCount('ade', FIRST));
  });
});

describe('Create, publish and edit', () => {
  it('publishes a valid assignment and creates a Not submitted row for every student', async () => {
    const { data } = await ade.post<AssignmentDetail>('/v1/assignments', draft());
    expect(data.status).toBe('Published');
    expect(data.counts['Not submitted']).toBe(14);
    expect(data.history[0]?.detail).toMatch(/14 students and their guardians/);
  });

  it('saves a draft with just a title, and checks what it has', async () => {
    const { data } = await ade.post<AssignmentDetail>(
      '/v1/assignments',
      draft({ publish: false, instructions: '', dueAt: null, maxScore: null }),
    );
    expect(data.status).toBe('Draft');
    expect(data.counts['Not submitted']).toBe(0);
    const f = await failure(ade.post('/v1/assignments', draft({ publish: false, title: '  ' })));
    expect(f).toMatchObject({ status: 422, field: 'title' });
  });

  it('refuses a due date in the past or outside the active term', async () => {
    const past = await failure(ade.post('/v1/assignments', draft({ dueAt: '2026-12-08T08:00' })));
    expect(past).toMatchObject({ status: 422, field: 'dueAt' });
    expect(past.message).toMatch(/already passed/);
    const outside = await failure(
      ade.post('/v1/assignments', draft({ dueAt: '2027-01-05T16:00' })),
    );
    expect(outside.field).toBe('dueAt');
    expect(outside.message).toMatch(/inside First Term/);
  });

  it('checks the title, instructions, max score and attachments', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ title: 'x'.repeat(121) }, 'title'],
      [{ instructions: '' }, 'instructions'],
      [{ maxScore: 0 }, 'maxScore'],
      [{ maxScore: 101 }, 'maxScore'],
      [{ maxScore: 12.5 }, 'maxScore'],
      [
        { attachments: [{ name: 'big.pdf', type: 'application/pdf', bytes: 26 * 1024 * 1024 }] },
        'attachments',
      ],
      [{ attachments: [{ name: 'virus.exe', type: '', bytes: 1000 }] }, 'attachments'],
      [
        {
          attachments: Array.from({ length: 6 }, (_, i) => ({
            name: `p${i}.pdf`,
            type: 'application/pdf',
            bytes: 1000,
          })),
        },
        'attachments',
      ],
    ];
    for (const [over, code] of cases)
      expect((await failure(ade.post('/v1/assignments', draft(over)))).field).toBe(code);
  });

  it('only creates for my own classes', async () => {
    const f = await failure(ade.post('/v1/assignments', draft({ armId: 'mc-jss3a' })));
    expect(f.status).toBe(403);
  });

  it('edits a published assignment, but never below a score already given', async () => {
    const closed = byTitle('Number bases practice');
    const graded = byTitle('Linear equations worksheet');
    const best = Math.max(...submissionsFor(graded).map((s) => s.score ?? 0));
    const f = await failure(
      ade.patch(`/v1/assignments/${graded.id}`, draft({ maxScore: best - 1, dueAt: graded.dueAt })),
    );
    expect(f.status).toBe(422);
    expect(f.field).toBe('maxScore');
    expect(f.message).toMatch(new RegExp(`already has ${best}`));
    // An unchanged (already past) due date doesn't block other edits.
    const { data } = await ade.patch<AssignmentDetail>(
      `/v1/assignments/${graded.id}`,
      draft({ title: 'Linear equations worksheet (v2)', dueAt: graded.dueAt, maxScore: 30 }),
    );
    expect(data.title).toBe('Linear equations worksheet (v2)');
    expect(data.history[0]?.title).toBe('Changed after publishing');
    // A published one can't move class or go back to draft; a closed one needs reopening.
    expect(
      (await failure(ade.patch(`/v1/assignments/${graded.id}`, draft({ armId: 'mc-jss1a' }))))
        .field,
    ).toBe('armId');
    expect(
      (
        await failure(
          ade.patch(`/v1/assignments/${graded.id}`, draft({ publish: false, dueAt: graded.dueAt })),
        )
      ).status,
    ).toBe(422);
    expect((await failure(ade.patch(`/v1/assignments/${closed.id}`, draft()))).message).toMatch(
      /Reopen/,
    );
  });
});

describe('Close, reopen and delete', () => {
  it('closes a published assignment, reopens it, and only deletes drafts', async () => {
    const a = byTitle('Algebraic expressions', 'mc-jss1a');
    const { data: closed } = await ade.post<AssignmentDetail>(`/v1/assignments/${a.id}/close`);
    expect(closed.status).toBe('Closed');
    expect(closed.permissions.reopen).toBe(true);
    const { data: open } = await ade.post<AssignmentDetail>(`/v1/assignments/${a.id}/reopen`);
    expect(open.status).toBe('Published');
    expect((await failure(ade.delete(`/v1/assignments/${a.id}`))).status).toBe(422);
    const d = byTitle('Angles in polygons', 'mc-jss1a');
    await ade.delete(`/v1/assignments/${d.id}`);
    expect((await failure(ade.get(`/v1/assignments/${d.id}`))).status).toBe(404);
  });

  it('reopening past the due date allows late work', async () => {
    const a = byTitle('Number bases practice', 'mc-jss1a');
    const { data } = await ade.post<AssignmentDetail>(`/v1/assignments/${a.id}/reopen`);
    expect(data.allowLate).toBe(true);
    expect(data.history[0]?.detail).toMatch(/marked Late/);
  });
});

describe('Grading, returning and excusing', () => {
  const subsOf = (title: string, armId = 'mc-jss2b') => submissionsFor(byTitle(title, armId));
  const url = (title: string, id: string, armId = 'mc-jss2b') =>
    `/v1/assignments/${byTitle(title, armId).id}/submissions/${id}`;

  it('lists submissions with counts per status and prev/next navigation', async () => {
    const a = byTitle('Algebraic expressions');
    const { data } = await ade.get<SubmissionList>(`/v1/assignments/${a.id}/submissions`);
    expect(data.counts.All).toBe(14);
    expect(data.counts.Submitted).toBe(3);
    const { data: only } = await ade.get<SubmissionList>(`/v1/assignments/${a.id}/submissions`, {
      params: { status: 'Submitted' },
    });
    expect(only.rows.every((r) => r.status === 'Submitted')).toBe(true);
    const first = data.rows[0]!;
    const { data: one } = await ade.get<SubmissionDetail>(
      `/v1/assignments/${a.id}/submissions/${first.id}`,
    );
    expect(one.prevId).toBeNull();
    expect(one.nextId).toBe(data.rows[1]!.id);
    expect(one.position).toBe(1);
  });

  it('saves a private grade, returns it, and allows a regrade', async () => {
    const s = subsOf('Algebraic expressions').find((x) => x.status === 'Submitted')!;
    const u = url('Algebraic expressions', s.id);
    expect((await failure(ade.put(`${u}/grade`, { score: 21 }))).field).toBe('score');
    expect((await failure(ade.put(`${u}/grade`, { score: -1 }))).field).toBe('score');
    expect((await failure(ade.post(`${u}/return`, { score: null }))).field).toBe('score');
    const { data: graded } = await ade.put<SubmissionDetail>(`${u}/grade`, {
      score: 17,
      feedback: 'Good work.',
    });
    expect(graded.status).toBe('Graded');
    const { data: returned } = await ade.post<SubmissionDetail>(`${u}/return`, {});
    expect(returned.status).toBe('Returned');
    expect(returned.score).toBe(17);
    const { data: regraded } = await ade.put<SubmissionDetail>(`${u}/grade`, {
      score: 18,
      feedback: '',
    });
    expect(regraded.status).toBe('Graded');
    expect(regraded.history[0]?.title).toBe('Regraded');
  });

  it('can’t grade work that wasn’t handed in, but can excuse it with a reason', async () => {
    const s = subsOf('Algebraic expressions').find((x) => x.status === 'Not submitted')!;
    const u = url('Algebraic expressions', s.id);
    const f = await failure(ade.put(`${u}/grade`, { score: 10 }));
    expect(f.status).toBe(422);
    expect(f.message).toMatch(/hasn’t handed anything in/);
    expect((await failure(ade.post(`${u}/excuse`, { reason: '' }))).field).toBe('reason');
    const { data } = await ade.post<SubmissionDetail>(`${u}/excuse`, {
      reason: 'Sick bay all week',
    });
    expect(data.status).toBe('Excused');
    expect((await failure(ade.put(`${u}/grade`, { score: 10 }))).message).toMatch(/excused/);
    const { data: undone } = await ade.delete<SubmissionDetail>(`${u}/excuse`);
    expect(undone.status).toBe('Not submitted');
    const handedIn = subsOf('Algebraic expressions').find((x) => x.status === 'Submitted')!;
    expect(
      (
        await failure(
          ade.post(`${url('Algebraic expressions', handedIn.id)}/excuse`, { reason: 'x y z' }),
        )
      ).status,
    ).toBe(422);
  });

  it('bulk-returns only graded work and says why the rest was skipped', async () => {
    const a = byTitle('Linear equations worksheet (v2)');
    const subs = submissionsFor(a);
    const graded = subs.filter((s) => s.status === 'Graded').map((s) => s.id);
    const others = subs.filter((s) => s.status !== 'Graded').slice(0, 3);
    const { data } = await ade.post<BulkReturnResult>(
      `/v1/assignments/${a.id}/submissions/return`,
      {
        ids: [...graded, ...others.map((s) => s.id)],
      },
    );
    expect(data.returned).toBe(graded.length);
    expect(data.skipped).toHaveLength(others.length);
    expect(data.skipped[0]?.reason).toMatch(
      /Not graded yet|Nothing handed in|Already returned|Excused/,
    );
    expect(submissionsFor(a).filter((s) => s.status === 'Graded')).toHaveLength(0);
  });

  it('lists a student’s assignments for the student page, within scope', async () => {
    const s = subsOf('Algebraic expressions')[0]!;
    const { data } = await ade.get<StudentAssignmentRow[]>(
      `/v1/assignments/student/${s.studentId}`,
    );
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((r) => r.classLabel === 'JSS 2B · Mathematics')).toBe(true);
    const jss3 = await failure(ade.get('/v1/assignments/student/st-200'));
    expect(jss3.status).toBe(403);
  });
});

describe('Past term', () => {
  it('shows past work read-only and refuses every change with TERM_LOCKED', async () => {
    const { data } = await ade.get<AssignmentList>('/v1/assignments', { params: { term: PAST } });
    expect(data.meta.total).toBe(4);
    const a = ASSIGNMENTS.find((x) => x.teacherId === 'ade' && x.termId === PAST)!;
    const { data: detail } = await ade.get<AssignmentDetail>(`/v1/assignments/${a.id}`);
    expect(detail.permissions).toMatchObject({ edit: false, reopen: false, grade: false });
    expect(detail.permissions.lockReason).toMatch(/closed/);
    const sub = submissionsFor(a).find((s) => s.score !== null)!;
    const writes = [
      () => ade.post(`/v1/assignments/${a.id}/reopen`),
      () => ade.put(`/v1/assignments/${a.id}/submissions/${sub.id}/grade`, { score: 1 }),
      () => ade.post('/v1/assignments', draft(), { params: { term: PAST } }),
    ];
    for (const w of writes) expect((await failure(w())).code).toBe('TERM_LOCKED');
    expect((await failure(okafor.get(`/v1/assignments/${a.id}`))).status).toBe(403);
  });
});
