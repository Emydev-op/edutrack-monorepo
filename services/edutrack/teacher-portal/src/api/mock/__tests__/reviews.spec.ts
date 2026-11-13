import { beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type {
  LessonNote,
  LessonNotesList,
  NavCounts,
  ResultSheet,
  ReviewNote,
  ReviewNotesList,
  ReviewSheet,
  ReviewSheetsList,
} from '@/types';

import { NOTIFICATIONS } from '../notify-db';
import { failure, signIn } from './helpers';

const JSS1A_MTH = 'rs-t-2627-1-mc-jss1a-MTH';
const JSS2B_MTH = 'rs-t-2627-1-mc-jss2b-MTH';
const JSS2B_AGR = 'rs-t-2627-1-mc-jss2b-AGR';
const SSS1A_MTH = 'rs-t-2627-1-mc-sss1a-MTH';

describe('HOD reviews of result sheets', () => {
  let ade: AxiosInstance;
  let bello: AxiosInstance;
  beforeAll(async () => {
    ade = await signIn('s.ade@greenfield.edu.ng');
    bello = await signIn('i.bello@greenfield.edu.ng');
  });

  it('lists Sciences sheets submitted to the HOD, never his own', async () => {
    const { data } = await bello.get<ReviewSheetsList>('/v1/reviews/sheets');
    expect(data.department).toBe('Sciences');
    expect(data.waiting.map((s) => `${s.arm} · ${s.subjectName}`).sort()).toEqual([
      'JSS 1A · Mathematics',
      'JSS 2B · Agricultural Science',
      'SSS 1A · Chemistry',
    ]);
    expect(data.waiting.every((s) => s.status === 'Submitted')).toBe(true);
    expect(data.recent.map((s) => s.id)).toContain(SSS1A_MTH); // returned yesterday
    expect((await bello.get<NavCounts>('/v1/nav-counts')).data['review-sheets']).toBe(3);
  });

  it('is only for HODs, for their own department, and not for their own sheets', async () => {
    expect((await failure(ade.get('/v1/reviews/sheets'))).status).toBe(403);
    expect((await failure(ade.get(`/v1/reviews/sheets/${JSS1A_MTH}`))).status).toBe(403);
    const humanities = await failure(bello.get('/v1/reviews/sheets/rs-t-2627-1-mc-jss2b-CRS'));
    expect(humanities.status).toBe(403);
    expect(humanities.message).toMatch(/You don’t review Humanities sheets/);
    const own = await failure(bello.get('/v1/reviews/sheets/rs-t-2627-1-mc-sss1a-PHY'));
    expect(own.status).toBe(403);
    expect(own.message).toMatch(/own sheet/);
    expect((await failure(bello.post(`/v1/reviews/sheets/${JSS2B_MTH}/forward`))).status).toBe(403); // still Ade's draft: never sent to him
  });

  it('shows the sheet read-only with totals and flags', async () => {
    const { data } = await bello.get<ReviewSheet>(`/v1/reviews/sheets/${JSS1A_MTH}`);
    expect(data).toMatchObject({ canDecide: true, status: 'Submitted', teacher: 'Mr. Samuel Ade' });
    expect(data.lock).toMatchObject({ code: 'SHEET_LOCKED' });
    expect(data.rows.find((r) => r.name === 'Oreoluwa Fashola')?.flag).toBe('Exempt from CA 1');
    expect(data.stats.missing).toBe(0);
  });

  it('forwards to the academic office, notifies the teacher, and refuses a second decision', async () => {
    const before = NOTIFICATIONS.filter((n) => n.teacherId === 'ade').length;
    const { data } = await bello.post<ResultSheet>(`/v1/reviews/sheets/${JSS1A_MTH}/forward`);
    expect(data).toMatchObject({ status: 'Under review', withLabel: 'With the academic office' });
    expect(data.history[0]).toMatchObject({
      title: 'Forwarded by HOD Mr. Ibrahim Bello',
      detail: 'Sciences · sent to the academic office',
    });
    const toAde = NOTIFICATIONS.filter((n) => n.teacherId === 'ade');
    expect(toAde.length).toBe(before + 1);
    expect(toAde.slice(-1)[0]!.title).toBe('Mr. Ibrahim Bello forwarded your result sheet');
    const again = await failure(bello.post(`/v1/reviews/sheets/${JSS1A_MTH}/forward`));
    expect(again).toMatchObject({
      status: 409,
      message: 'This sheet was already forwarded to the academic office.',
    });
    const ret = await failure(
      bello.post(`/v1/reviews/sheets/${JSS1A_MTH}/return`, { comment: 'Please check CA 2.' }),
    );
    expect(ret.status).toBe(409);
    const view = await bello.get<ReviewSheet>(`/v1/reviews/sheets/${JSS1A_MTH}`);
    expect(view.data.canDecide).toBe(false);
  });

  it('returns with a comment of 10+ characters and notifies the teacher', async () => {
    const short = await bello
      .post(`/v1/reviews/sheets/${JSS2B_AGR}/return`, { comment: 'Fix it' })
      .catch((e) => e.response);
    expect(short.status).toBe(422);
    expect(short.data.fields.comment).toMatch(/10 characters/);
    const { data } = await bello.post<ResultSheet>(`/v1/reviews/sheets/${JSS2B_AGR}/return`, {
      comment: 'Two practical scores look swapped with CA 1. Please check.',
    });
    expect(data.status).toBe('Returned');
    expect(data.returned).toMatchObject({ by: 'Mr. Ibrahim Bello (HOD Sciences)' });
    expect(NOTIFICATIONS.filter((n) => n.teacherId === 'oladipo').slice(-1)[0]!.title).toBe(
      'Mr. Ibrahim Bello returned your result sheet',
    );
    const again = await failure(
      bello.post(`/v1/reviews/sheets/${JSS2B_AGR}/return`, { comment: 'Another long comment.' }),
    );
    expect(again).toMatchObject({
      status: 409,
      message: 'This sheet was already returned to the teacher.',
    });
  });

  it('runs the whole loop: submit → return → fix → resubmit → forward', async () => {
    // Ade completes JSS 2B and submits.
    const { data: draft } = await ade.get<ResultSheet>(`/v1/results/${JSS2B_MTH}`);
    await ade.put(`/v1/results/${JSS2B_MTH}/scores`, {
      rows: draft.rows.map((r) => ({
        studentId: r.studentId,
        scores: r.scores.map((v) => (v === null ? 11 : v)),
      })),
    });
    await ade.post(`/v1/results/${JSS2B_MTH}/submit`);
    // Chemistry is still waiting, plus this one.
    expect((await bello.get<NavCounts>('/v1/nav-counts')).data['review-sheets']).toBe(2);
    // Bello returns it.
    await bello.post(`/v1/reviews/sheets/${JSS2B_MTH}/return`, {
      comment: 'Blessing’s CA 2 looks low against her CA 1. Please confirm.',
    });
    const { data: back } = await ade.get<ResultSheet>(`/v1/results/${JSS2B_MTH}`);
    expect(back).toMatchObject({ status: 'Returned', lock: null });
    expect(back.returned!.note).toMatch(/Blessing/);
    expect((await ade.get<NavCounts>('/v1/nav-counts')).data.results).toBe(2); // SSS 1A + JSS 2B
    // Ade fixes it and resubmits: it goes back to Bello.
    const blessing = back.rows.find((r) => r.name === 'Blessing Etim')!;
    await ade.put(`/v1/results/${JSS2B_MTH}/scores`, {
      rows: [
        { studentId: blessing.studentId, scores: [blessing.scores[0], 15, blessing.scores[2]] },
      ],
    });
    const { data: resent } = await ade.post<ResultSheet>(`/v1/results/${JSS2B_MTH}/submit`);
    expect(resent).toMatchObject({ status: 'Submitted', withHod: true });
    const list = await bello.get<ReviewSheetsList>('/v1/reviews/sheets');
    expect(list.data.waiting.map((s) => s.id)).toContain(JSS2B_MTH);
    // Bello forwards.
    const { data: done } = await bello.post<ResultSheet>(`/v1/reviews/sheets/${JSS2B_MTH}/forward`);
    expect(done.status).toBe('Under review');
    const titles = done.history.map((h) => h.title);
    expect(titles.slice(0, 4)).toEqual([
      'Forwarded by HOD Mr. Ibrahim Bello',
      'Resubmitted by Mr. Samuel Ade to Mr. Ibrahim Bello (HOD Sciences)',
      'Returned by HOD Mr. Ibrahim Bello',
      'Submitted by Mr. Samuel Ade to Mr. Ibrahim Bello (HOD Sciences)',
    ]);
  });

  it('resubmits the seeded returned sheet to the same HOD', async () => {
    const { data } = await ade.post<ResultSheet>(`/v1/results/${SSS1A_MTH}/submit`);
    expect(data.withLabel).toBe('With Mr. Ibrahim Bello (HOD Sciences)');
    const view = await bello.get<ReviewSheet>(`/v1/reviews/sheets/${SSS1A_MTH}`);
    expect(view.data.canDecide).toBe(true);
  });
});

describe('Lesson note reviews', { timeout: 30_000 }, () => {
  let ade: AxiosInstance;
  let okafor: AxiosInstance;
  let bello: AxiosInstance;
  let eze: AxiosInstance;
  beforeAll(async () => {
    ade = await signIn('s.ade@greenfield.edu.ng');
    okafor = await signIn('g.okafor@greenfield.edu.ng');
    bello = await signIn('i.bello@greenfield.edu.ng');
    eze = await signIn('c.eze@greenfield.edu.ng');
  });

  const waitingLabels = (list: ReviewNotesList) =>
    list.waiting.map((n) => `${n.teacher} · ${n.level} · ${n.subjectName} · ${n.week}`).sort();

  it('shows the HOD his department’s notes, never his own', async () => {
    const { data } = await bello.get<ReviewNotesList>('/v1/reviews/notes');
    expect(data.scope).toBe('Sciences');
    expect(waitingLabels(data)).toEqual(
      [
        'Mr. Samuel Ade · SSS 1 · Mathematics · 13',
        'Mrs. Zainab Balogun · JSS 1 · Basic Science · 13',
        'Mr. Obinna Okonjo · SSS 1 · Chemistry · 13',
      ].sort(),
    );
    expect(data.waiting.every((n) => n.teacher !== 'Mr. Ibrahim Bello')).toBe(true);
    expect(data.recent.length).toBeGreaterThan(0);
    expect((await bello.get<NavCounts>('/v1/nav-counts')).data['review-notes']).toBe(3);
  });

  it('shows the Academic Head departments with no HOD and HODs’ own notes', async () => {
    const { data } = await eze.get<ReviewNotesList>('/v1/reviews/notes');
    expect(data.scope).toBe('Languages, Vocational, HODs’ own notes');
    const labels = waitingLabels(data);
    expect(labels).toHaveLength(4);
    expect(labels).toContain('Mrs. Grace Okafor · JSS 2 · English Language · 13');
    expect(labels).toContain('Mr. Ibrahim Bello · SSS 1 · Physics · 13');
    expect(data.waiting.map((n) => n.department).sort()).toEqual([
      'Languages',
      'Languages',
      'Sciences',
      'Vocational',
    ]);
    expect((await eze.get<NavCounts>('/v1/nav-counts')).data['review-notes']).toBe(4);
  });

  it('is only for reviewers, inside their scope', async () => {
    expect((await failure(ade.get('/v1/reviews/notes'))).status).toBe(403);
    const eList = (await eze.get<ReviewNotesList>('/v1/reviews/notes')).data;
    const okaforNote = eList.waiting.find((n) => n.teacher === 'Mrs. Grace Okafor')!;
    const languages = await failure(bello.get(`/v1/reviews/notes/${okaforNote.id}`));
    expect(languages.status).toBe(403);
    expect(languages.message).toMatch(/You don’t review Languages lesson notes/);
    const bList = (await bello.get<ReviewNotesList>('/v1/reviews/notes')).data;
    const adeNote = bList.waiting.find((n) => n.teacher === 'Mr. Samuel Ade')!;
    const sciences = await failure(eze.get(`/v1/reviews/notes/${adeNote.id}`));
    expect(sciences.status).toBe(403);
    expect(sciences.message).toMatch(/You don’t review Sciences lesson notes/);
    const belloOwn = eList.waiting.find((n) => n.teacher === 'Mr. Ibrahim Bello')!;
    const own = await failure(bello.get(`/v1/reviews/notes/${belloOwn.id}`));
    expect(own.status).toBe(403);
    expect(own.message).toMatch(/your own lesson note/);
    // A draft in his department was never sent to him.
    const adeDraft = (await ade.get<LessonNotesList>('/v1/lesson-notes')).data.rows.find(
      (r) => r.status === 'Draft',
    )!;
    const draft = await failure(bello.get(`/v1/reviews/notes/${adeDraft.noteId}`));
    expect(draft.status).toBe(403);
    expect(draft.message).toMatch(/hasn’t been submitted to you/);
  });

  it('returns with a comment, takes the resubmission back, then approves', async () => {
    const bList = (await bello.get<ReviewNotesList>('/v1/reviews/notes')).data;
    const id = bList.waiting.find((n) => n.teacher === 'Mr. Samuel Ade')!.id;
    const short = await failure(
      bello.post(`/v1/reviews/notes/${id}/return`, { comment: 'Fix it' }),
    );
    expect(short.status).toBe(422);

    const before = NOTIFICATIONS.filter((n) => n.teacherId === 'ade').length;
    const { data: returned } = await bello.post<ReviewNote>(`/v1/reviews/notes/${id}/return`, {
      comment: 'Add a starter activity and two worked examples.',
    });
    expect(returned).toMatchObject({ status: 'Returned', canDecide: false });
    expect(NOTIFICATIONS.filter((n) => n.teacherId === 'ade').length).toBe(before + 1);
    const again = await failure(bello.post(`/v1/reviews/notes/${id}/approve`));
    expect(again).toMatchObject({ status: 409, code: 'ALREADY_DECIDED' });

    // Ade edits and resubmits: back to Bello.
    const mine = (await ade.get<LessonNote>(`/v1/lesson-notes/${id}`)).data;
    expect(mine).toMatchObject({
      editable: true,
      returnComment: 'Add a starter activity and two worked examples.',
    });
    const { data: resent } = await ade.put<LessonNote>(`/v1/lesson-notes/${id}`, {
      topic: mine.topic,
      objectives: [...mine.objectives, 'Complete two worked examples as a class'],
      content: `${mine.content} Starter: a five-minute mental maths warm-up.`,
      attachment: null,
      schemeTopic: mine.schemeTopic,
      submit: true,
    });
    expect(resent).toMatchObject({ status: 'Submitted', reviewer: 'Mr. Ibrahim Bello' });
    expect(resent.history[0]!.title).toBe('Resubmitted to Mr. Ibrahim Bello');

    const { data: approved } = await bello.post<ReviewNote>(`/v1/reviews/notes/${id}/approve`);
    expect(approved).toMatchObject({ status: 'Approved', canDecide: false });
    expect(NOTIFICATIONS.filter((n) => n.teacherId === 'ade').slice(-1)[0]!.title).toBe(
      'Mr. Ibrahim Bello approved your lesson note',
    );
    const twice = await failure(bello.post(`/v1/reviews/notes/${id}/approve`));
    expect(twice).toMatchObject({ status: 409, message: 'This note was already approved.' });
    const after = (await bello.get<ReviewNotesList>('/v1/reviews/notes')).data;
    expect(after.waiting.map((n) => n.id)).not.toContain(id);
    expect(after.recent[0]!.id).toBe(id);
  });

  it('lets the Academic Head approve Mrs. Okafor’s note', async () => {
    const eList = (await eze.get<ReviewNotesList>('/v1/reviews/notes')).data;
    const id = eList.waiting.find((n) => n.teacher === 'Mrs. Grace Okafor')!.id;
    const view = (await eze.get<ReviewNote>(`/v1/reviews/notes/${id}`)).data;
    expect(view).toMatchObject({ canDecide: true, department: 'Languages' });
    await eze.post(`/v1/reviews/notes/${id}/approve`);
    const hers = (await okafor.get<LessonNote>(`/v1/lesson-notes/${id}`)).data;
    expect(hers).toMatchObject({ status: 'Approved', editable: false });
    expect((await eze.get<NavCounts>('/v1/nav-counts')).data['review-notes']).toBe(3);
  });
});
