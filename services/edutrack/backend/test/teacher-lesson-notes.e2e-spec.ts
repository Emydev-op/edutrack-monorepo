import { seedDemoData } from '../prisma/seed/demo-data.js';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

/**
 * Lesson notes, their reviews, assessment schedules and the staff announcements feed in the
 * Teacher Workspace, at Greenfield on Wed 18 Nov 2026 (week 10 of First Term; week 11's notes are
 * due Fri 20 Nov). Mr. Ade (Mathematics, Sciences) goes to Mr. Bello, the Sciences HOD; Mrs.
 * Okafor (English, Languages has no HOD) and Mr. Bello's own notes go to Mrs. Eze, the Academic
 * Head; Mrs. Eze's own notes are filed without review.
 */

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
// Wed 18 Nov 2026, 09:00 in Lagos.
const NOW = Date.parse('2026-11-18T08:00:00.000Z');
const CONTENT =
  'Revise the mean, median and mode with worked examples from a class survey, then pairs practise on the textbook exercise and present one answer each.';
const BELLO = 'Mr. Ibrahim Bello';
const EZE = 'Mrs. Chioma Eze';

interface Row {
  key: string;
  week: number;
  subject: string;
  level: string;
  status: string;
  overdue: boolean;
  dueThisWeek: boolean;
  noteId: string | null;
}

describe('Teacher lesson notes, assessments and announcements (e2e)', () => {
  let t: TestApp;
  let ade: Api;
  let okafor: Api;
  let bello: Api;
  let eze: Api;
  let schoolId: string;
  let termId: string;
  let closedTerm: string;
  let jss2b: string;

  const data = async (req: PromiseLike<{ body: { data: unknown } }>) =>
    (await req).body.data as Record<string, any>;
  const list = (api: Api, query = '') => data(api.get(`/api/v1/lesson-notes${query}`));
  const nav = (api: Api) => data(api.get('/api/v1/nav-counts'));
  const dashboard = (api: Api) => data(api.get('/api/v1/dashboard'));
  const note = (o: Record<string, unknown> = {}) => ({
    subject: 'MTH',
    level: 'JSS 2',
    week: 12,
    topic: 'Statistics: mean, median and mode',
    objectives: ['Find the mean, median and mode of a data set'],
    content: CONTENT,
    attachment: null,
    schemeTopic: 'Statistics',
    submit: false,
    ...o,
  });
  /** A PUT body: the note's fields without its class and week. */
  const edit = (o: Record<string, unknown> = {}) => {
    const { subject: _s, level: _l, week: _w, ...rest } = note(o);
    return rest;
  };
  const notified = (entityId: string, email: string) =>
    t.prisma.notification.findMany({ where: { entityId, user: { email } } });

  beforeAll(async () => {
    t = await createTestApp();
    t.clock.set(NOW);
    await seedDemoData(t.prisma, t.clock.now());
    await t.redis.flushdb();
    const teacher = async (email: string) =>
      authed(t, (await signIn(t, email, { host: HOST })).token, { host: HOST });
    ade = await teacher('s.ade@greenfield.edu.ng');
    okafor = await teacher('g.okafor@greenfield.edu.ng');
    bello = await teacher('i.bello@greenfield.edu.ng');
    eze = await teacher('c.eze@greenfield.edu.ng');
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    termId = (await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } })).id;
    closedTerm = (await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'CLOSED' } }))
      .id;
    jss2b = (
      await t.prisma.classArm.findFirstOrThrow({
        where: { schoolId, name: 'B', level: { name: 'JSS 2' }, branch: { code: 'GFA-MC' } },
      })
    ).id;
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  describe('my lesson notes', () => {
    it('lists the term’s weeks, my subjects × levels and every expected note', async () => {
      const v = await list(ade);
      expect(v).toMatchObject({ termId, editable: true, today: '2026-11-18', currentWeek: 10 });
      expect(v.weeks).toHaveLength(14);
      expect(v.weeks[6]).toMatchObject({
        week: 7,
        label: 'Week 7 · 26–30 Oct',
        due: '2026-10-23',
        midterm: true,
      });
      expect(v.weeks[6].note).toMatch(/^Mid-term break/);
      expect(v.slots.map((s: { key: string }) => s.key)).toEqual([
        'MTH|JSS 2',
        'MTH|Primary 1',
        'MTH|Primary 2',
        'FMT|SSS 1',
      ]);
      expect(v.slots[0]).toMatchObject({ reviewer: BELLO, noReview: false });
      // Week 11 down to 1, four slots each.
      expect(v.rows).toHaveLength(44);
      expect(v.rows[0]).toMatchObject({ week: 11, due: '2026-11-20', dueThisWeek: true });
      expect(v.counts).toMatchObject({ overdue: 3, dueThisWeek: 4, returned: 1, waiting: 1 });
      const returned = v.rows.find((r: Row) => r.status === 'Returned');
      expect(returned).toMatchObject({ key: 'MTH|JSS 2|9', overdue: false });
      const draft = v.rows.find((r: Row) => r.key === 'MTH|JSS 2|10');
      expect(draft).toMatchObject({ status: 'Draft', overdue: true });
      expect(v.rows.find((r: Row) => r.key === 'FMT|SSS 1|10')).toMatchObject({
        status: 'Not written',
        overdue: true,
        noteId: null,
      });
    });

    it('counts returned + overdue notes in the sidebar and lists them as to-dos', async () => {
      expect((await nav(ade))['lesson-notes']).toBe(4);
      const todo = (await dashboard(ade)).todo.data as { id: string; kind: string }[];
      const kinds = todo.map((x) => x.kind).filter((k) => k.startsWith('note-'));
      expect(kinds).toEqual([
        'note-returned',
        'note-overdue',
        'note-overdue',
        'note-overdue',
        'note-due',
      ]);
      expect(todo.find((x) => x.kind === 'note-due')).toMatchObject({
        id: 'note-due:week-11',
        title: '4 lesson notes due Fri 20 Nov',
      });
      expect(todo.find((x) => x.id === 'note-overdue:FMT|SSS 1|10')).toMatchObject({
        action: 'Write',
        to: { name: 'lesson-note-new', query: { slot: 'FMT|SSS 1', week: '10' } },
      });
    });

    it('writes a draft, refuses a duplicate week, other classes and closed terms', async () => {
      const res = await ade.post('/api/v1/lesson-notes').send(note());
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Draft saved.');
      expect(res.body.data).toMatchObject({
        status: 'Draft',
        week: 12,
        level: 'JSS 2',
        reviewer: BELLO,
        editable: true,
        lockReason: null,
      });
      expect(res.body.data.history[0]).toMatchObject({ title: 'Draft started' });
      const dup = await ade.post('/api/v1/lesson-notes').send(note());
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('DUPLICATE');
      const other = await ade.post('/api/v1/lesson-notes').send(note({ subject: 'ENG' }));
      expect(other.status).toBe(422);
      expect(other.body.error.fields.slot).toBe('Choose one of your subjects and class levels.');
      const week = await ade.post('/api/v1/lesson-notes').send(note({ week: 40 }));
      expect(week.body.error.fields.week).toBe('Choose a week from 1 to 14.');
      const closed = await ade
        .post(`/api/v1/lesson-notes?term=${closedTerm}`)
        .send(note({ week: 3 }));
      expect(closed.status).toBe(409);
      expect(closed.body.error.code).toBe('TERM_LOCKED');
      // Someone else's note is out of reach.
      expect((await okafor.get(`/api/v1/lesson-notes/${res.body.data.id}`)).status).toBe(403);
      expect(
        (await okafor.put(`/api/v1/lesson-notes/${res.body.data.id}`).send(edit())).status,
      ).toBe(403);
    });

    it('attaches an uploaded file once', async () => {
      const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%EOF').toString('base64')}`;
      const file = (
        await ade.post('/api/v1/uploads').send({ name: 'statistics.pdf', dataUrl: pdf })
      ).body.data;
      const res = await ade
        .post('/api/v1/lesson-notes')
        .send(note({ level: 'Primary 1', week: 13, attachment: file }));
      expect(res.status).toBe(201);
      expect(res.body.data.attachment).toMatchObject({ id: file.id, name: 'statistics.pdf' });
      expect(res.body.data.attachment.url).toBeTruthy();
      const reused = await ade
        .post('/api/v1/lesson-notes')
        .send(note({ level: 'Primary 2', week: 13, attachment: file }));
      expect(reused.status).toBe(422);
      expect(reused.body.error.fields.attachment).toMatch(/can’t be attached here/);
      // Keeping the same file on an edit is fine.
      const kept = await ade
        .put(`/api/v1/lesson-notes/${res.body.data.id}`)
        .send(edit({ attachment: file }));
      expect(kept.status).toBe(200);
      await t.prisma.lessonNote.delete({ where: { id: res.body.data.id } });
    });

    it('leaves the note to the lead teacher when a class is co-taught', async () => {
      const lead = await t.prisma.teachingAssignment.findFirstOrThrow({
        where: { termId, armId: jss2b, subject: { code: 'MTH' }, lead: true },
      });
      const okaforStaff = await t.prisma.staff.findFirstOrThrow({
        where: { schoolId, email: 'g.okafor@greenfield.edu.ng' },
      });
      await t.prisma.teachingAssignment.create({
        data: {
          schoolId,
          sessionId: lead.sessionId,
          termId,
          levelId: lead.levelId,
          armId: jss2b,
          subjectId: lead.subjectId,
          staffId: okaforStaff.id,
          lead: false,
          periodsPerWeek: lead.periodsPerWeek,
        },
      });
      const res = await okafor.post('/api/v1/lesson-notes').send(note());
      expect(res.status).toBe(422);
      expect(res.body.error.fields.slot).toMatch(/^The lead teacher writes the lesson note/);
      expect((await list(okafor)).slots.map((s: { key: string }) => s.key)).not.toContain(
        'MTH|JSS 2',
      );
    });

    it('checks the fields before submitting, then sends the note to the HOD', async () => {
      // A note written ahead lists its week too (the list otherwise stops at next week).
      const v = await list(ade);
      expect(v.rows[0]).toMatchObject({ week: 12, overdue: false, dueThisWeek: false });
      const draft = v.rows.find((r: Row) => r.key === 'MTH|JSS 2|12').noteId as string;
      const bad = await ade
        .put(`/api/v1/lesson-notes/${draft}`)
        .send(edit({ content: 'Too short.', objectives: [], submit: true }));
      expect(bad.status).toBe(422);
      expect(bad.body.message).toBe('Complete the note before submitting it.');
      expect(bad.body.error.fields).toMatchObject({
        content: 'Write at least 50 characters (10 so far).',
        objectives: 'List at least one objective, one per line.',
      });
      const sent = await ade.put(`/api/v1/lesson-notes/${draft}`).send(edit({ submit: true }));
      expect(sent.status).toBe(200);
      expect(sent.body.message).toBe(`Lesson note submitted to ${BELLO}.`);
      expect(sent.body.data).toMatchObject({ status: 'Submitted', editable: false });
      expect(sent.body.data.lockReason).toBe(
        `With ${BELLO} for review. You can change it if it’s returned.`,
      );
      expect(sent.body.data.history[0].title).toBe(`Submitted to ${BELLO}`);
      const again = await ade.put(`/api/v1/lesson-notes/${draft}`).send(edit());
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('NOTE_LOCKED');
      const [n] = await notified(draft, 'i.bello@greenfield.edu.ng');
      expect(n).toMatchObject({
        category: 'reviews',
        title: 'Mr. Samuel Ade submitted a lesson note',
        link: `/reviews/lesson-notes/${draft}`,
      });
    });

    it('takes overdue notes off the count once they are sent', async () => {
      const draft = (await list(ade)).rows.find((r: Row) => r.key === 'MTH|JSS 2|10');
      const res = await ade
        .put(`/api/v1/lesson-notes/${draft.noteId}`)
        .send(edit({ topic: 'Graphs of linear equations', submit: true }));
      expect(res.status).toBe(200);
      const v = await list(ade);
      expect(v.counts).toMatchObject({ overdue: 2, returned: 1, waiting: 3 });
      expect((await nav(ade))['lesson-notes']).toBe(3);
    });

    it('shows a closed term read-only', async () => {
      const v = await list(ade, `?term=${closedTerm}`);
      expect(v.editable).toBe(false);
      expect(v.lockReason).toMatch(/is closed\. Its records are read-only\.$/);
      expect(v.counts.overdue).toBe(0);
    });
  });

  describe('reviews', () => {
    let noteId: string;

    it('lists what waits on the HOD and keeps reviews to HODs and the Academic Head', async () => {
      const v = await data(bello.get('/api/v1/reviews/notes'));
      expect(v.scope).toBe('Sciences');
      noteId = v.waiting.find((n: { week: number; level: string }) => n.week === 12).id;
      expect(v.waiting.map((n: { teacher: string }) => n.teacher)).toEqual([
        'Mr. Samuel Ade',
        'Mr. Samuel Ade',
        'Mr. Samuel Ade',
      ]);
      expect((await okafor.get('/api/v1/reviews/notes')).status).toBe(403);
      expect((await nav(bello))['review-notes']).toBe(3);
      expect((await dashboard(bello)).metrics.data.reviews).toEqual({ sheets: 0, notes: 3 });
    });

    it('returns a note with a comment, which reopens it for the teacher', async () => {
      const short = await bello.post(`/api/v1/reviews/notes/${noteId}/return`).send({
        comment: 'Redo it',
      });
      expect(short.status).toBe(422);
      expect(short.body.error.fields.comment).toBe(
        'Tell the teacher what to change (10 characters or more).',
      );
      const res = await bello.post(`/api/v1/reviews/notes/${noteId}/return`).send({
        comment: 'Add a worked example on the median of an even set.',
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'Returned', canDecide: false });
      expect(res.body.data.decisionNote).toMatch(/^You returned this note/);
      const again = await bello.post(`/api/v1/reviews/notes/${noteId}/approve`);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ALREADY_DECIDED');
      const [n] = await notified(noteId, 's.ade@greenfield.edu.ng');
      expect(n).toMatchObject({ category: 'lesson-notes', link: `/lesson-notes/${noteId}` });
      const mine = await data(ade.get(`/api/v1/lesson-notes/${noteId}`));
      expect(mine).toMatchObject({
        status: 'Returned',
        editable: true,
        returnComment: 'Add a worked example on the median of an even set.',
      });
      expect((await nav(ade))['lesson-notes']).toBe(4);
    });

    it('resubmits to the same reviewer, who approves it; approved notes are read-only', async () => {
      const saved = await ade.put(`/api/v1/lesson-notes/${noteId}`).send(edit());
      expect(saved.body.message).toBe('Changes saved. Submit the note to send it back for review.');
      const res = await ade.put(`/api/v1/lesson-notes/${noteId}`).send(edit({ submit: true }));
      expect(res.body.data).toMatchObject({ status: 'Submitted', reviewer: BELLO });
      expect(res.body.data.history[0].title).toBe(`Resubmitted to ${BELLO}`);
      const ok = await bello.post(`/api/v1/reviews/notes/${noteId}/approve`);
      expect(ok.status).toBe(200);
      expect(ok.body.message).toBe('Lesson note approved. The teacher was notified.');
      expect(ok.body.data).toMatchObject({ status: 'Approved', canDecide: false });
      const mine = await data(ade.get(`/api/v1/lesson-notes/${noteId}`));
      expect(mine.editable).toBe(false);
      expect(mine.lockReason).toBe(`Approved by ${BELLO}. Approved notes are read-only.`);
      expect((await ade.put(`/api/v1/lesson-notes/${noteId}`).send(edit())).body.error.code).toBe(
        'NOTE_LOCKED',
      );
      const v = await data(bello.get('/api/v1/reviews/notes'));
      expect(v.recent[0]).toMatchObject({ id: noteId, status: 'Approved' });
      expect(v.recent[0].decision).toMatch(/^Approved /);
    });

    it('sends a department with no HOD to the Academic Head', async () => {
      const row = (await list(okafor)).rows.find((r: Row) => r.key === 'ENG|JSS 2|10');
      expect(row.status).toBe('Submitted');
      const mine = await data(okafor.get(`/api/v1/lesson-notes/${row.noteId}`));
      expect(mine.reviewer).toBe(EZE);
      const v = await data(eze.get('/api/v1/reviews/notes'));
      expect(v.scope).toContain('Languages');
      expect(v.scope).toContain('HODs’ own notes');
      expect(v.waiting.map((n: { id: string }) => n.id)).toContain(row.noteId);
      const notMine = await bello.get(`/api/v1/reviews/notes/${row.noteId}`);
      expect(notMine.status).toBe(403);
      expect(notMine.body.message).toBe(
        'You don’t review Languages lesson notes. You review Sciences notes.',
      );
      const ok = await eze.post(`/api/v1/reviews/notes/${row.noteId}/approve`);
      expect(ok.body.data.status).toBe('Approved');
      expect((await dashboard(eze)).metrics.data.reviews).toEqual({ sheets: null, notes: 6 });
    });

    it('sends the HOD’s own notes to the Academic Head', async () => {
      const res = await bello
        .post('/api/v1/lesson-notes')
        .send(note({ subject: 'BSC', level: 'JSS 1', topic: 'Ecology: habitats', submit: true }));
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ status: 'Submitted', reviewer: EZE });
      const own = await bello.get(`/api/v1/reviews/notes/${res.body.data.id}`);
      expect(own.status).toBe(403);
      expect(own.body.message).toMatch(/^You can’t review your own lesson note/);
      const v = await data(bello.get('/api/v1/reviews/notes'));
      expect(v.waiting.map((n: { id: string }) => n.id)).not.toContain(res.body.data.id);
      const head = await data(eze.get('/api/v1/reviews/notes'));
      expect(head.waiting.map((n: { id: string }) => n.id)).toContain(res.body.data.id);
      const [n] = await notified(res.body.data.id, 'c.eze@greenfield.edu.ng');
      expect(n.title).toBe('Mr. Ibrahim Bello submitted a lesson note');
    });

    it('files the Academic Head’s own notes without review', async () => {
      const res = await eze
        .post('/api/v1/lesson-notes')
        .send(note({ subject: 'ENG', level: 'Primary 1', topic: 'Formal letters', submit: true }));
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Lesson note filed. Your own notes need no review.');
      expect(res.body.data).toMatchObject({
        status: 'Approved',
        noReview: true,
        reviewer: 'No review needed (Academic Head)',
        editable: false,
      });
      expect(res.body.data.history[0].title).toBe('Filed by the Academic Head — no review needed');
    });
  });

  describe('assessment schedules', () => {
    let examId: string;
    const schedule = (o: Record<string, unknown> = {}) =>
      ade.post('/api/v1/assessments').send({
        armId: jss2b,
        subject: 'MTH',
        componentKey: 'EXAMINATION',
        date: '2026-11-30',
        topics: 'Everything covered this term',
        instructions: 'Bring a ruler and a pencil.',
        ...o,
      });

    it('lists the scheme per section and my classes’ scheduled components', async () => {
      const v = await data(ade.get('/api/v1/assessments'));
      expect(v.editable).toBe(true);
      expect(v.schemes.map((s: { section: string }) => s.section)).toEqual(['JSS', 'PRI', 'SSS']);
      expect(v.schemes[0]).toMatchObject({ sectionName: 'Junior Secondary' });
      const maths = v.rows.filter((r: { arm: string }) => r.arm === 'JSS 2B');
      expect(maths.map((r: { componentKey: string; date: string; status: string }) => r)).toEqual([
        expect.objectContaining({ componentKey: 'CA2', date: '2026-11-25', status: 'Scheduled' }),
        expect.objectContaining({ componentKey: 'CA1', date: '2026-10-13', status: 'Done' }),
      ]);
      expect(maths[0]).toMatchObject({ students: 14, scored: 0, missing: 14 });
      const opts = await data(ade.get('/api/v1/assessments/options'));
      const cls = opts.classes.find(
        (c: { armId: string; subject: string }) => c.armId === jss2b && c.subject === 'MTH',
      );
      expect(cls.available.map((c: { key: string }) => c.key)).toEqual(['EXAMINATION']);
    });

    it('schedules a component on a school day in the term, once per class', async () => {
      const weekend = await schedule({ date: '2026-11-21' });
      expect(weekend.status).toBe(422);
      expect(weekend.body.error.fields.date).toBe('There are no classes on 21 Nov 2026 (Weekend).');
      expect((await schedule({ date: '2026-11-10' })).body.error.fields.date).toBe(
        'Choose today (18 Nov 2026) or a later date.',
      );
      expect((await schedule({ date: '2027-01-20' })).body.error.fields.date).toMatch(
        /^Choose a date inside First Term/,
      );
      expect((await schedule({ componentKey: 'QUIZ' })).body.error.fields.componentKey).toBe(
        'Choose a component from the school’s scheme.',
      );
      expect((await schedule({ armId: '' })).body.error.fields.classKey).toBe(
        'Choose one of your classes.',
      );
      const notMine = await schedule({ subject: 'ENG' });
      expect(notMine.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
      expect(notMine.status).toBe(403);
      const closed = await ade
        .post(`/api/v1/assessments?term=${closedTerm}`)
        .send({ armId: jss2b, subject: 'MTH', componentKey: 'CA1', date: '2026-11-30' });
      expect(closed.body.error.code).toBe('TERM_LOCKED');
      const res = await schedule();
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Assessment scheduled.');
      expect(res.body.data).toMatchObject({
        component: 'Examination',
        status: 'Scheduled',
        canReschedule: true,
        students: 14,
      });
      examId = res.body.data.id;
      const dup = await schedule({ date: '2026-12-01' });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('DUPLICATE');
      // Mrs. Okafor co-teaches JSS 2B Mathematics now (above), so she sees it; Mrs. Eze doesn't.
      expect((await okafor.get(`/api/v1/assessments/${examId}`)).status).toBe(200);
      expect((await eze.get(`/api/v1/assessments/${examId}`)).status).toBe(403);
    });

    it('reschedules until scores are on the sheet, and reads its counts from the sheet', async () => {
      const moved = await ade
        .patch(`/api/v1/assessments/${examId}`)
        .send({ date: '2026-12-01', topics: 'Everything covered this term' });
      expect(moved.status).toBe(200);
      expect(moved.body.data.date).toBe('2026-12-01');
      expect(moved.body.data.history[0].title).toBe('Rescheduled by Mr. Samuel Ade');
      const sheetId = moved.body.data.sheetId as string;
      const sheet = await data(ade.get(`/api/v1/results/${sheetId}`));
      const [first, second] = sheet.rows as { studentId: string }[];
      const saved = await ade.put(`/api/v1/results/${sheetId}/scores`).send({
        rows: [
          { studentId: first!.studentId, scores: [null, null, 64] },
          { studentId: second!.studentId, scores: [null, null, 'ABS'] },
        ],
      });
      expect(saved.status).toBe(200);
      const a = await data(ade.get(`/api/v1/assessments/${examId}`));
      expect(a).toMatchObject({ scored: 1, absent: 1, exempt: 0, missing: 12 });
      const stuck = await ade
        .patch(`/api/v1/assessments/${examId}`)
        .send({ date: '2026-12-02', topics: 'Everything covered this term' });
      expect(stuck.status).toBe(409);
      expect(stuck.body.error.code).toBe('SCORES_ENTERED');
      const text = await ade
        .patch(`/api/v1/assessments/${examId}`)
        .send({ topics: 'The whole term’s scheme of work', instructions: '' });
      expect(text.status).toBe(200);
      expect(text.body.data.history[0].title).toBe('Details updated by Mr. Samuel Ade');
    });

    it('keeps past assessments as they were', async () => {
      const v = await data(ade.get('/api/v1/assessments'));
      const ca1 = v.rows.find(
        (r: { arm: string; componentKey: string }) =>
          r.arm === 'JSS 2B' && r.componentKey === 'CA1',
      );
      expect((await data(ade.get(`/api/v1/assessments/${ca1.id}`))).canReschedule).toBe(false);
      const res = await ade.patch(`/api/v1/assessments/${ca1.id}`).send({ date: '2026-11-30' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_TAKEN');
    });
  });

  describe('announcements', () => {
    it('shows what was sent to staff, teachers or everyone, and hides the rest', async () => {
      const sentAt = new Date(NOW - 3_600_000);
      const make = (title: string, o: Record<string, unknown>) =>
        t.prisma.announcement.create({
          data: {
            schoolId,
            title,
            body: `${title}. More details inside.`,
            audienceKind: 'EVERYONE',
            channels: ['IN_APP'],
            status: 'SENT',
            sentAt,
            ...o,
          },
        });
      const everyone = await make('Carol service on Thursday', {});
      const parents = await make('PTA levy reminder', { audienceKind: 'PARENTS' });
      await make('Staff meeting moved', { audienceKind: 'TEACHERS', withdrawnAt: sentAt });
      await make('Old notice', {
        audienceKind: 'STAFF',
        expiresOn: new Date('2026-11-01T00:00:00.000Z'),
      });
      await make('Draft notice', { audienceKind: 'TEACHERS', status: 'DRAFT', sentAt: null });
      const rows = await data(ade.get('/api/v1/announcements'));
      expect((rows as unknown as { title: string }[]).map((a) => a.title)).toEqual([
        'Carol service on Thursday',
        'Lesson notes are due every Friday',
      ]);
      expect(rows[0]).toMatchObject({
        audience: 'Whole school',
        campuses: 'All campuses',
        when: 'Today 08:00',
        pinned: false,
      });
      expect(rows[1]).toMatchObject({ audience: 'All staff', author: EZE });
      const one = await data(ade.get(`/api/v1/announcements/${everyone.id}`));
      expect(one.body).toBe('Carol service on Thursday. More details inside.');
      expect((await ade.get(`/api/v1/announcements/${parents.id}`)).status).toBe(404);
      const found = await data(ade.get('/api/v1/announcements?search=carol'));
      expect(found).toHaveLength(1);
    });
  });

  describe('tenant isolation', () => {
    it('keeps one school’s notes and schedules out of another’s address', async () => {
      const n = await t.prisma.lessonNote.findFirstOrThrow({ where: { schoolId } });
      const token = (await signIn(t, 's.ade@greenfield.edu.ng', { host: HOST })).token;
      const elsewhere = authed(t, token, { host: 'crestview.localhost' });
      expect([401, 403, 404]).toContain(
        (await elsewhere.get(`/api/v1/lesson-notes/${n.id}`)).status,
      );
      expect([401, 403, 404]).toContain((await elsewhere.get('/api/v1/assessments')).status);
      const crestview = await t.prisma.school.findFirstOrThrow({ where: { slug: 'crestview' } });
      expect(await t.prisma.lessonNote.count({ where: { schoolId: crestview.id } })).toBe(0);
    });
  });
});
