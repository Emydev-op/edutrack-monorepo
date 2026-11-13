import { beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type { LessonNote, LessonNotesList, NavCounts, NewLessonNotePayload } from '@/types';

import { FILED_BY_HEAD, NOTES, lessonNotesDueFor, waitingNotes } from '../lesson-notes-db';
import { NOTIFICATIONS } from '../notify-db';
import { failure, signIn } from './helpers';

const note = (over: Partial<NewLessonNotePayload> = {}): NewLessonNotePayload => ({
  subject: 'MTH',
  level: 'JSS 2',
  week: 14,
  topic: 'Revision for examinations',
  objectives: ['Revise simultaneous equations', 'Practise past questions'],
  content:
    'Recap the term’s topics with a quick quiz, then work through two past examination papers in groups and review answers together.',
  attachment: null,
  schemeTopic: 'Revision',
  submit: true,
  ...over,
});

describe('Lesson notes', { timeout: 30_000 }, () => {
  let ade: AxiosInstance;
  let okafor: AxiosInstance;
  let bello: AxiosInstance;
  beforeAll(async () => {
    ade = await signIn('s.ade@greenfield.edu.ng');
    okafor = await signIn('g.okafor@greenfield.edu.ng');
    bello = await signIn('i.bello@greenfield.edu.ng');
  });

  it('lists the term’s weeks with due dates and the mid-term break flagged', async () => {
    const { data } = await ade.get<LessonNotesList>('/v1/lesson-notes');
    expect(data.weeks).toHaveLength(14);
    expect(data.weeks[0]).toMatchObject({ week: 1, start: '2026-09-14', due: '2026-09-11' });
    expect(data.weeks.filter((w) => w.midterm).map((w) => w.week)).toEqual([7, 8]);
    expect(data.weeks[13]).toMatchObject({ label: 'Week 14 · 14–18 Dec', due: '2026-12-11' });
    expect(data.currentWeek).toBe(13);
    expect(data.slots.map((s) => s.label)).toEqual([
      'JSS 1 · Mathematics',
      'JSS 2 · Mathematics',
      'SSS 1 · Further Mathematics',
      'SSS 1 · Mathematics',
    ]);
    expect(data.slots.every((s) => s.reviewer === 'Mr. Ibrahim Bello')).toBe(true);
  });

  it('shows overdue, due-this-week and returned notes, and counts them in the sidebar', async () => {
    const { data } = await ade.get<LessonNotesList>('/v1/lesson-notes');
    expect(data.counts).toMatchObject({ overdue: 3, dueThisWeek: 4, returned: 1, waiting: 1 });
    const overdue = data.rows.filter((r) => r.overdue).map((r) => `${r.label} ${r.status}`);
    expect(overdue.sort()).toEqual([
      'JSS 1 · Mathematics Draft',
      'JSS 2 · Mathematics Not written',
      'SSS 1 · Further Mathematics Not written',
    ]);
    const returned = data.rows.find((r) => r.status === 'Returned')!;
    expect(returned).toMatchObject({ week: 12, label: 'JSS 2 · Mathematics' });
    expect(returned.returnComment).toBe('Add worked examples for simultaneous equations.');
    expect(data.rows.filter((r) => r.week === 14).every((r) => r.due === '2026-12-11')).toBe(true);
    expect(lessonNotesDueFor('ade', 't-2627-1')).toEqual({
      overdue: 3,
      dueThisWeek: 4,
      returned: 1,
    });
    expect((await ade.get<NavCounts>('/v1/nav-counts')).data['lesson-notes']).toBe(4);
  });

  it('allows one note per subject, class level and week', async () => {
    const dup = await failure(ade.post('/v1/lesson-notes', note({ level: 'JSS 1', week: 13 })));
    expect(dup).toMatchObject({ status: 409, code: 'DUPLICATE' });
    expect(dup.message).toMatch(
      /already have a lesson note for JSS 1 · Mathematics, week 13 \(Draft\)/,
    );
  });

  it('validates the fields', async () => {
    const res = await ade
      .post('/v1/lesson-notes', note({ content: 'Too short', objectives: [] }))
      .catch((e) => e.response);
    expect(res.status).toBe(422);
    expect(Object.keys(res.data.fields).sort()).toEqual(['content', 'objectives']);
    const six = await ade
      .post('/v1/lesson-notes', note({ objectives: ['a', 'b', 'c', 'd', 'e', 'f'] }))
      .catch((e) => e.response);
    expect(six.data.fields.objectives).toMatch(/up to 5/);
    const big = await ade
      .post(
        '/v1/lesson-notes',
        note({
          attachment: { name: 'slides.pdf', type: 'application/pdf', bytes: 11 * 1024 * 1024 },
        }),
      )
      .catch((e) => e.response);
    expect(big.data.fields.attachment).toMatch(/up to 10 MB/);
    const notMine = await ade
      .post('/v1/lesson-notes', note({ subject: 'PHY', level: 'SSS 1' }))
      .catch((e) => e.response);
    expect(notMine.status).toBe(422);
    expect(notMine.data.fields.slot).toBeTruthy();
    const week = await ade.post('/v1/lesson-notes', note({ week: 15 })).catch((e) => e.response);
    expect(week.data.fields.week).toMatch(/1 to 14/);
    // A draft only needs the topic.
    const draft = await ade.post<LessonNote>(
      '/v1/lesson-notes',
      note({
        level: 'SSS 1',
        subject: 'FMT',
        week: 14,
        content: '',
        objectives: [],
        submit: false,
      }),
    );
    expect(draft.data).toMatchObject({ status: 'Draft', editable: true, overdue: false });
  });

  it('sends Mr. Ade’s note to his HOD, Mr. Bello', async () => {
    const before = NOTIFICATIONS.filter((n) => n.teacherId === 'bello').length;
    const { data } = await ade.post<LessonNote>('/v1/lesson-notes', note());
    expect(data).toMatchObject({
      status: 'Submitted',
      reviewer: 'Mr. Ibrahim Bello',
      editable: false,
    });
    expect(data.lockReason).toMatch(/With Mr. Ibrahim Bello/);
    expect(data.history[0]!.title).toBe('Submitted to Mr. Ibrahim Bello');
    const toBello = NOTIFICATIONS.filter((n) => n.teacherId === 'bello');
    expect(toBello.length).toBe(before + 1);
    expect(toBello.slice(-1)[0]!.title).toBe('Mr. Samuel Ade submitted a lesson note');
    expect(lessonNotesDueFor('ade', 't-2627-1').dueThisWeek).toBe(3);
    const locked = await failure(ade.put(`/v1/lesson-notes/${data.id}`, note()));
    expect(locked).toMatchObject({ status: 409, code: 'NOTE_LOCKED' });
  });

  it('sends Mrs. Okafor’s (no HOD) and Mr. Bello’s own (he is the HOD) to the Academic Head', async () => {
    const okaforNote = await okafor.post<LessonNote>(
      '/v1/lesson-notes',
      note({ subject: 'ENG', level: 'JSS 2', topic: 'Revision: comprehension and summary' }),
    );
    expect(okaforNote.data.reviewer).toBe('Mrs. Chioma Eze');
    const belloNote = await bello.post<LessonNote>(
      '/v1/lesson-notes',
      note({ subject: 'PHY', level: 'SSS 1', topic: 'Revision: waves and light' }),
    );
    expect(belloNote.data.reviewer).toBe('Mrs. Chioma Eze');
    expect(
      NOTIFICATIONS.filter(
        (n) => n.teacherId === 'eze' && n.title.includes('submitted a lesson note'),
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('files the Academic Head’s own notes as Approved on submit, with no review', async () => {
    const eze = await signIn('c.eze@greenfield.edu.ng');
    const list = (await eze.get<LessonNotesList>('/v1/lesson-notes')).data;
    expect(list.slots).toEqual([
      expect.objectContaining({ label: 'JSS 1 · English Language', noReview: true }),
    ]);
    // Her seeded notes were filed the same way: no "academic office" review in their history.
    const seeded = list.rows.find((r) => r.status === 'Approved')!;
    const old = (await eze.get<LessonNote>(`/v1/lesson-notes/${seeded.noteId}`)).data;
    expect(old.history.map((h) => h.title)).toContain(FILED_BY_HEAD);
    expect(old.history.some((h) => /academic office/.test(h.title))).toBe(false);

    const notified = NOTIFICATIONS.length;
    const waitingBefore = waitingNotes('eze', 't-2627-1').length;
    const { data } = await eze.post<LessonNote>(
      '/v1/lesson-notes',
      note({ subject: 'ENG', level: 'JSS 1', topic: 'Revision: comprehension and summary' }),
    );
    expect(data).toMatchObject({ status: 'Approved', noReview: true, editable: false });
    expect(data.decidedAt).toBe(data.submittedAt);
    expect(data.history[0]).toMatchObject({ title: FILED_BY_HEAD, tone: 'success' });
    expect(data.lockReason).toMatch(/no review needed/);
    // Nobody is asked to review it, and it never sits in a queue.
    expect(NOTIFICATIONS.length).toBe(notified);
    expect(waitingNotes('eze', 't-2627-1').length).toBe(waitingBefore);
    expect(NOTES.some((n) => n.teacherId === 'eze' && n.status === 'Submitted')).toBe(false);
  });

  it('keeps notes private to their teacher and approved notes read-only', async () => {
    const list = (await ade.get<LessonNotesList>('/v1/lesson-notes')).data;
    const approved = list.rows.find((r) => r.status === 'Approved')!;
    expect((await failure(okafor.get(`/v1/lesson-notes/${approved.noteId}`))).status).toBe(403);
    const view = (await ade.get<LessonNote>(`/v1/lesson-notes/${approved.noteId}`)).data;
    expect(view).toMatchObject({ editable: false });
    expect(view.lockReason).toMatch(/Approved notes are read-only/);
    expect((await failure(ade.put(`/v1/lesson-notes/${approved.noteId}`, note()))).status).toBe(
      409,
    );
  });

  it('is read-only for a past term', async () => {
    const past = (
      await ade.get<LessonNotesList>('/v1/lesson-notes', { params: { term: 't-2526-3' } })
    ).data;
    expect(past.editable).toBe(false);
    expect(past.rows.every((r) => r.status === 'Approved')).toBe(true);
    expect(past.counts.overdue).toBe(0);
    const res = await failure(
      ade.post('/v1/lesson-notes', note({ level: 'JSS 1', week: 2 }), {
        params: { term: 't-2526-3' },
      }),
    );
    expect(res).toMatchObject({ status: 409, code: 'TERM_LOCKED' });
  });
});
