import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

/**
 * Results (Phase 3b) at Greenfield, First Term 2026/2027, on JSS 2B: Mr. Ade's Mathematics goes
 * through Mr. Bello (HOD Sciences) to the academic office; Mrs. Okafor's English (Languages has no
 * HOD) goes straight to the office. The other subjects are filled in directly, then the class is
 * published, report cards checked, corrections applied, and the Third Term's cumulative view.
 */

type Api = ReturnType<typeof authed>;
type Value = number | 'ABS' | 'EXM' | null;
interface Row {
  studentId: string;
  name: string;
  scores: Value[];
  total: number | null;
}

const HOST = 'greenfield.localhost';
const R = '/api/v1/academics/results';
// Fri 20 Nov 2026, 10:00 in Lagos: First Term is running and entry closes Fri 11 Dec, 23:59.
const NOW = Date.parse('2026-11-20T09:00:00.000Z');
const AFTER_DEADLINE = Date.parse('2026-12-12T09:00:00.000Z');
const MAX = [20, 20, 100];
// A one-pixel PDF header is enough for the type check.
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%EOF').toString('base64')}`;

/** Students 0 and 1 tie at the top; everyone after is one step lower than the one before. */
const rank = (i: number) => (i <= 1 ? 0 : i - 1);
const score = (max: number, i: number) => Math.round(max * (0.95 - 0.05 * rank(i)));
const fullRow = (i: number): Value[] => MAX.map((m) => score(m, i));

describe('Results (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let ade: Api;
  let okafor: Api;
  let bello: Api;
  let schoolId: string;
  let termId: string;
  let armId: string;
  let mathsId: string;
  let englishId: string;
  let students: Row[] = [];

  const sheetOf = async (api: Api, id: string) =>
    (await api.get(`/api/v1/results/${id}`)).body.data;
  const save = (api: Api, id: string, rows: { studentId: string; scores: Value[] }[]) =>
    api.put(`/api/v1/results/${id}/scores`).send({ rows });
  const fillAll = (api: Api, id: string) =>
    save(
      api,
      id,
      students.map((s, i) => ({ studentId: s.studentId, scores: fullRow(i) })),
    );
  const userIdOf = async (email: string) =>
    (await t.prisma.user.findFirstOrThrow({ where: { email } })).id;

  /** Fills a JSS 2B subject's sheet directly (as if its teacher had) and sets its status. */
  async function fillDirect(code: string, status: 'APPROVED', absent?: number) {
    expect((await admin.get(`${R}/sheets/${armId}/${code}`)).status).toBe(200);
    const sheet = await t.prisma.resultSheet.findFirstOrThrow({
      where: { termId, armId, subject: { code } },
    });
    const comps = await t.prisma.assessmentComponent.findMany({
      where: { schemeId: sheet.schemeId },
      orderBy: { sortOrder: 'asc' },
    });
    for (const [i, s] of students.entries()) {
      const entry = await t.prisma.resultEntry.upsert({
        where: { sheetId_studentId: { sheetId: sheet.id, studentId: s.studentId } },
        create: { schoolId, sheetId: sheet.id, studentId: s.studentId },
        update: {},
      });
      await t.prisma.resultScore.deleteMany({ where: { entryId: entry.id } });
      await t.prisma.resultScore.createMany({
        data: comps.map((c, k) =>
          absent === i && k === 2
            ? { schoolId, entryId: entry.id, componentId: c.id, state: 'ABSENT' as const }
            : {
                schoolId,
                entryId: entry.id,
                componentId: c.id,
                state: 'SCORED' as const,
                score: score(Number(c.maxScore), i),
              },
        ),
      });
    }
    await t.prisma.resultSheet.update({ where: { id: sheet.id }, data: { status } });
  }

  /** Signs everyone in again (after the clock moves, their access tokens would have expired). */
  async function signInAll() {
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    const teacher = async (email: string) =>
      authed(t, (await signIn(t, email, { host: HOST })).token, { host: HOST });
    ade = await teacher('s.ade@greenfield.edu.ng');
    okafor = await teacher('g.okafor@greenfield.edu.ng');
    bello = await teacher('i.bello@greenfield.edu.ng');
  }

  /** Notifications aren't part of the seed: drop the ones this file's clock window made. */
  const dropNotifications = () =>
    t.prisma.notification.deleteMany({
      where: {
        school: { slug: 'greenfield' },
        category: { in: ['results', 'reviews'] },
        createdAt: { gte: new Date(NOW - 60_000), lte: new Date(AFTER_DEADLINE + 86_400_000) },
      },
    });

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    t.clock.set(NOW);
    await dropNotifications();
    await signInAll();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    termId = (await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } })).id;
    armId = (
      await t.prisma.classArm.findFirstOrThrow({
        where: { schoolId, name: 'B', level: { name: 'JSS 2' }, branch: { code: 'GFA-MC' } },
      })
    ).id;
  });

  afterAll(async () => {
    await dropNotifications();
    await t.reseed();
    await t.close();
  });

  describe('entering scores', () => {
    it('lists my sheets with the term’s deadline', async () => {
      const res = await ade.get('/api/v1/results');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        termId,
        deadline: '2026-12-11T23:59',
        entryOpen: true,
      });
      const maths = res.body.data.sheets.find(
        (s: { arm: string; subject: string }) => s.arm === 'JSS 2B' && s.subject === 'MTH',
      );
      expect(maths).toMatchObject({ status: 'Not started', editable: true, students: 14 });
      mathsId = maths.id;
      // Open for entry with missing scores: on the sidebar and the to-do list.
      expect((await ade.get('/api/v1/nav-counts')).body.data.results).toBeGreaterThan(0);
      const todo = (await ade.get('/api/v1/dashboard')).body.data.todo.data;
      expect(todo).toContainEqual(
        expect.objectContaining({
          id: `sheet-missing:${mathsId}`,
          action: 'Start sheet',
          to: expect.objectContaining({ name: 'result-sheet', params: { sheetId: mathsId } }),
        }),
      );
      const english = (await okafor.get('/api/v1/results')).body.data.sheets.find(
        (s: { arm: string; subject: string }) => s.arm === 'JSS 2B' && s.subject === 'ENG',
      );
      englishId = english.id;
    });

    it('opens a sheet with the scheme and where it goes next', async () => {
      const sheet = await sheetOf(ade, mathsId);
      expect(sheet.components.map((c: { key: string }) => c.key)).toEqual([
        'CA1',
        'CA2',
        'EXAMINATION',
      ]);
      expect(sheet).toMatchObject({
        submitToHod: true,
        submitTo: 'Mr. Ibrahim Bello (HOD Sciences)',
        isLead: true,
        passMark: 40,
      });
      students = sheet.rows;
      expect(students).toHaveLength(14);
      expect((await sheetOf(okafor, englishId)).submitTo).toBe(
        'the academic office (Languages has no HOD)',
      );
      // Not her class.
      expect((await okafor.get(`/api/v1/results/${mathsId}`)).status).toBe(403);
    });

    it('refuses scores that aren’t scores', async () => {
      const [a, b] = students;
      const bad = await save(ade, mathsId, [
        { studentId: a!.studentId, scores: [25, 'X' as never, 30.25] },
        { studentId: b!.studentId, scores: [10, 10] },
      ]);
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields).toMatchObject({
        [`${a!.studentId}.CA1`]: 'Enter 0–20 (one decimal place at most), ABS or EXM',
        [`${a!.studentId}.CA2`]: expect.any(String),
        [`${a!.studentId}.EXAMINATION`]: expect.any(String),
        [b!.studentId]: 'Send 3 scores.',
      });
      const outsider = await save(ade, mathsId, [
        { studentId: '00000000-0000-7000-8000-000000000000', scores: [1, 1, 1] },
      ]);
      expect(outsider.status).toBe(422);
    });

    it('saves a draft: blanks stay missing, ABS has no total, EXM re-weights', async () => {
      const [a, b, c] = students;
      const res = await save(ade, mathsId, [
        { studentId: a!.studentId, scores: [18, 17.5, 50] },
        { studentId: b!.studentId, scores: [18, null, 50] },
        { studentId: c!.studentId, scores: ['EXM', 20, 'ABS'] },
      ]);
      expect(res.status).toBe(200);
      const rows = res.body.data.rows as Row[];
      expect(res.body.data.status).toBe('Draft');
      // 18/20×20 + 17.5/20×20 + 50/100×60 = 65.5 → 66 (whole numbers).
      expect(rows[0]!.total).toBe(66);
      expect(rows[1]).toMatchObject({ total: null, flag: 'Missing score' });
      expect(rows[2]).toMatchObject({ total: null, flag: 'Absent (Examination) · make-up needed' });
      expect(res.body.data.completion).toMatchObject({ scored: 8, total: 42 });
    });

    it('lets a co-teacher save but not submit', async () => {
      const ta = await t.prisma.teachingAssignment.findFirstOrThrow({
        where: { termId, armId, subject: { code: 'MTH' }, lead: true },
      });
      const okaforStaff = await t.prisma.staff.findFirstOrThrow({
        where: { schoolId, email: 'g.okafor@greenfield.edu.ng' },
      });
      await t.prisma.teachingAssignment.create({
        data: {
          ...ta,
          id: undefined,
          staffId: okaforStaff.id,
          lead: false,
          createdAt: undefined,
          updatedAt: undefined,
        },
      });
      const sheet = await sheetOf(okafor, mathsId);
      expect(sheet).toMatchObject({ isLead: false, lead: 'Mr. Samuel Ade' });
      expect((await fillAll(okafor, mathsId)).status).toBe(200);
      const submit = await okafor.post(`/api/v1/results/${mathsId}/submit`);
      expect(submit.status).toBe(403);
      expect(submit.body.error.code).toBe('NOT_LEAD');
    });
  });

  describe('the review chain', () => {
    it('won’t submit while scores are missing', async () => {
      await save(ade, mathsId, [{ studentId: students[0]!.studentId, scores: [18, null, 50] }]);
      const res = await ade.post(`/api/v1/results/${mathsId}/submit`);
      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/1 student has missing scores/);
      expect(res.body.error.fields[students[0]!.studentId]).toBe('CA 2 missing');
    });

    it('submits to the HOD, who is told; the teacher can recall until the HOD acts', async () => {
      expect((await fillAll(ade, mathsId)).status).toBe(200);
      const sub = await ade.post(`/api/v1/results/${mathsId}/submit`);
      expect(sub.status).toBe(200);
      expect(sub.body.data).toMatchObject({ status: 'Submitted', withHod: true, canRecall: true });
      expect(
        await t.prisma.notification.count({
          where: {
            userId: await userIdOf('i.bello@greenfield.edu.ng'),
            category: 'reviews',
            entityId: mathsId,
          },
        }),
      ).toBe(1);
      // Locked while it's reviewed.
      expect((await fillAll(ade, mathsId)).body.error.code).toBe('SHEET_LOCKED');
      const queue = (await bello.get('/api/v1/reviews/sheets')).body.data;
      expect(queue.department).toBe('Sciences');
      expect(queue.waiting.map((s: { id: string }) => s.id)).toEqual([mathsId]);
      expect((await bello.get('/api/v1/nav-counts')).body.data['review-sheets']).toBe(1);

      const recall = await ade.post(`/api/v1/results/${mathsId}/recall`);
      expect(recall.status).toBe(200);
      expect(recall.body.data.status).toBe('Draft');
      expect((await bello.post(`/api/v1/reviews/sheets/${mathsId}/forward`)).body.error.code).toBe(
        'SHEET_LOCKED',
      );
      expect((await ade.post(`/api/v1/results/${mathsId}/submit`)).status).toBe(200);
    });

    it('lets the HOD return with a comment and the teacher resubmit to them', async () => {
      const short = await bello
        .post(`/api/v1/reviews/sheets/${mathsId}/return`)
        .send({ comment: 'Fix' });
      expect(short.status).toBe(422);
      const ret = await bello
        .post(`/api/v1/reviews/sheets/${mathsId}/return`)
        .send({ comment: 'Please check CA 2 against the mark book.' });
      expect(ret.status).toBe(200);
      const sheet = await sheetOf(ade, mathsId);
      expect(sheet).toMatchObject({
        status: 'Returned',
        editable: true,
        returned: {
          by: 'Mr. Ibrahim Bello (HOD Sciences)',
          note: 'Please check CA 2 against the mark book.',
        },
      });
      const todo = (await ade.get('/api/v1/dashboard')).body.data.todo.data;
      expect(todo.some((x: { kind: string }) => x.kind === 'sheet-returned')).toBe(true);
      expect((await ade.post(`/api/v1/results/${mathsId}/submit`)).body.data.status).toBe(
        'Submitted',
      );
    });

    it('forwards to the office; then the teacher can’t recall', async () => {
      const fwd = await bello.post(`/api/v1/reviews/sheets/${mathsId}/forward`);
      expect(fwd.status).toBe(200);
      expect(fwd.body.data.status).toBe('Under review');
      const recall = await ade.post(`/api/v1/results/${mathsId}/recall`);
      expect(recall.status).toBe(409);
      expect(recall.body.error.code).toBe('NOT_RECALLABLE');
      const recent = (await bello.get('/api/v1/reviews/sheets')).body.data.recent;
      expect(recent[0]).toMatchObject({
        id: mathsId,
        decision: expect.stringMatching(/^Forwarded /),
      });
      const review = (await bello.get(`/api/v1/reviews/sheets/${mathsId}`)).body.data;
      expect(review).toMatchObject({ canDecide: false });
      // Not an HOD.
      expect((await okafor.get('/api/v1/reviews/sheets')).status).toBe(403);
    });

    it('lets the office approve; an HOD-held sheet can’t be decided yet', async () => {
      expect((await admin.get('/api/v1/nav-counts')).body.data.results).toBe(1);
      const view = (await admin.get(`${R}/sheets/${armId}/MTH`)).body.data;
      expect(view).toMatchObject({
        status: 'Under review',
        canDecide: true,
        teacher: 'Mr. Samuel Ade',
      });
      const ok = await admin.post(`${R}/sheets/${armId}/MTH/approve`).send({});
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe('Approved');
      expect(ok.body.data.history[0].title).toMatch(/^Approved by /);
    });

    it('sends a sheet with no HOD straight to the office, which can return it', async () => {
      expect((await fillAll(okafor, englishId)).status).toBe(200);
      const sub = await okafor.post(`/api/v1/results/${englishId}/submit`);
      expect(sub.body.data).toMatchObject({ status: 'Under review', withHod: false });
      const noNote = await admin.post(`${R}/sheets/${armId}/ENG/return`).send({});
      expect(noNote.status).toBe(422);
      const ret = await admin
        .post(`${R}/sheets/${armId}/ENG/return`)
        .send({ note: 'Add the make-up exam for two students.' });
      expect(ret.body.data).toMatchObject({
        status: 'Returned',
        returnedBy: 'the academic office',
      });
      expect((await sheetOf(okafor, englishId)).submitTo).toBe('the academic office');
    });
  });

  describe('the entry deadline', () => {
    afterAll(async () => {
      t.clock.set(NOW);
      await signInAll();
    });

    it('locks entry after the deadline until the office reopens the sheet', async () => {
      t.clock.set(AFTER_DEADLINE);
      await signInAll();
      const locked = await fillAll(okafor, englishId);
      expect(locked.status).toBe(409);
      expect(locked.body.error.code).toBe('TERM_LOCKED');
      expect(locked.body.message).toMatch(/Result entry closed on Fri 11 Dec at 23:59/);
      const bad = await admin.post(`${R}/sheets/${armId}/ENG/reopen`).send({ days: 0 });
      expect(bad.status).toBe(422);
      const reopen = await admin.post(`${R}/sheets/${armId}/ENG/reopen`).send({ days: 2 });
      expect(reopen.status).toBe(200);
      expect(reopen.body.data.entryReopenedUntil).toBe('2026-12-14T10:00');
      expect((await fillAll(okafor, englishId)).status).toBe(200);
      expect((await okafor.post(`/api/v1/results/${englishId}/submit`)).body.data.status).toBe(
        'Under review',
      );
      expect((await admin.post(`${R}/sheets/${armId}/ENG/approve`).send({})).status).toBe(200);
    });
  });

  describe('remarks, publishing and report cards', () => {
    it('takes the class teacher’s remark and ratings', async () => {
      const id = students[0]!.studentId;
      const bad = await okafor
        .put(`/api/v1/class-teacher/report-cards/${id}`)
        .send({ remark: 'Too short', ratings: { Punctuality: 6 } });
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields).toMatchObject({
        remark: 'Write at least 20 characters (9 so far).',
        'ratings.Punctuality': 'Rate punctuality from 1 to 5.',
      });
      const ok = await okafor.put(`/api/v1/class-teacher/report-cards/${id}`).send({
        remark: 'A diligent student who leads by example in class.',
        ratings: {
          Punctuality: 5,
          Neatness: 4,
          Attentiveness: 5,
          'Relationship with others': 4,
          Leadership: 5,
        },
      });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ done: true, editable: true });
      const list = (await okafor.get('/api/v1/class-teacher/report-cards')).body.data;
      expect(list.progress).toEqual({ done: 1, total: 14 });
      expect((await okafor.get('/api/v1/nav-counts')).body.data['report-cards']).toBe(13);
      const progress = (await okafor.get('/api/v1/class-teacher/progress')).body.data;
      expect(progress.summary.Approved).toBe(2);
      const pending = progress.subjects.find((s: { canRemind: boolean }) => s.canRemind);
      const remind = await okafor.post(`/api/v1/class-teacher/progress/${pending.sheetId}/remind`);
      expect(remind.status).toBe(200);
      const again = await okafor.post(`/api/v1/class-teacher/progress/${pending.sheetId}/remind`);
      expect(again.body.error.code).toBe('ALREADY_REMINDED');
    });

    it('won’t publish until every subject is approved', async () => {
      const check = (await admin.get(`${R}/publish/${armId}`)).body.data;
      expect(check.notApproved.length).toBe(check.subjects - 2);
      expect(check.missingRemarks).toBe(13);
      const res = await admin.post(`${R}/publish/${armId}`).send({ acknowledged: true });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NOT_APPROVED');
    });

    it('asks to acknowledge absent flags, then publishes with positions', async () => {
      const matrix = (await admin.get(R)).body.data;
      const row = matrix.rows.find((r: { arm: string }) => r.arm === 'JSS 2B');
      const others = Object.entries(row.cells)
        .filter(([code, st]) => st !== null && code !== 'MTH' && code !== 'ENG')
        .map(([code]) => code);
      // Student 5 missed the Basic Science exam.
      for (const code of others) await fillDirect(code, 'APPROVED', code === 'BSC' ? 5 : undefined);
      // Hold one card before publishing: its guardians aren't told.
      const held = students[3]!.studentId;
      expect(
        (await admin.post(`${R}/report-card/${held}/hold`).send({ reason: 'Fees outstanding' }))
          .status,
      ).toBe(200);

      const check = (await admin.get(`${R}/publish/${armId}`)).body.data;
      expect(check.notApproved).toEqual([]);
      expect(check.flags).toEqual([
        `${students[5]!.name} · Basic Science: Absent (Examination) · make-up needed`,
      ]);
      const unack = await admin.post(`${R}/publish/${armId}`).send({});
      expect(unack.status).toBe(422);
      expect(unack.body.error.code).toBe('FLAGS_UNACKNOWLEDGED');
      const res = await admin.post(`${R}/publish/${armId}`).send({ acknowledged: true });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('JSS 2B results published.');

      expect(
        await t.prisma.resultSheet.count({
          where: { termId, armId, status: { not: 'PUBLISHED' } },
        }),
      ).toBe(0);
      const pub = await t.prisma.resultPublication.findFirstOrThrow({ where: { termId, armId } });
      expect(pub.version).toBe(1);
      const sheet = await t.prisma.resultSheet.findFirstOrThrow({ where: { id: mathsId } });
      expect(
        (await t.prisma.assessmentScheme.findFirstOrThrow({ where: { id: sheet.schemeId } }))
          .lockedAt,
      ).not.toBeNull();
      // Ties share the position and the next one is skipped, by class average and per subject.
      const cards = await t.prisma.reportCard.findMany({ where: { termId, armId } });
      const pos = (i: number) =>
        cards.find((c) => c.studentId === students[i]!.studentId)!.position;
      expect([pos(0), pos(1), pos(2), pos(3)]).toEqual([1, 1, 3, 4]);
      const entries = await t.prisma.resultEntry.findMany({ where: { sheetId: mathsId } });
      const sub = (i: number) =>
        entries.find((e) => e.studentId === students[i]!.studentId)!.position;
      expect([sub(0), sub(1), sub(2)]).toEqual([1, 1, 3]);
      expect(cards.every((c) => c.version === 1 && c.publishedAt)).toBe(true);
      // Teachers are told; guardians of held cards aren't.
      expect(
        await t.prisma.notification.count({
          where: {
            userId: await userIdOf('s.ade@greenfield.edu.ng'),
            title: 'JSS 2B First Term results are published',
          },
        }),
      ).toBe(1);
      const heldGuardians = await t.prisma.studentGuardian.findMany({
        where: { studentId: held },
        select: { guardian: { select: { membership: { select: { userId: true } } } } },
      });
      for (const g of heldGuardians)
        if (g.guardian.membership)
          expect(
            await t.prisma.notification.count({
              where: { userId: g.guardian.membership.userId, category: 'results' },
            }),
          ).toBe(0);
      const again = await admin.post(`${R}/publish/${armId}`).send({ acknowledged: true });
      expect(again.body.error.code).toBe('ALREADY_PUBLISHED');
      // Remarks lock with publishing.
      const locked = await okafor
        .put(`/api/v1/class-teacher/report-cards/${students[1]!.studentId}`)
        .send({
          remark: 'A diligent student who leads by example in class.',
          ratings: {
            Punctuality: 5,
            Neatness: 4,
            Attentiveness: 5,
            'Relationship with others': 4,
            Leadership: 5,
          },
        });
      expect(locked.body.error.code).toBe('RESULTS_PUBLISHED');
    });

    it('downloads the report card as a PDF', async () => {
      const res = await admin
        .get(`${R}/report-card/${students[0]!.studentId}/pdf`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=".+\.pdf"/);
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('shows the report card with attendance, remarks, positions and the next term', async () => {
      const card = (await admin.get(`${R}/report-card/${students[0]!.studentId}`)).body.data;
      expect(card).toMatchObject({
        title: 'First Term Report · 2026/2027',
        school: { name: 'Greenfield Academy' },
        student: { className: 'JSS 2B' },
        classTeacher: 'Mrs. Grace Okafor',
        position: '1st of 14',
        published: true,
        version: 1,
        nextTerm: 'Second Term begins 12 Jan 2027',
        classTeacherRemark: 'A diligent student who leads by example in class.',
        held: null,
        cumulative: null,
      });
      expect(card.components).toEqual(['CA 1 /20', 'CA 2 /20', 'Examination /100']);
      expect(card.conduct).toContainEqual({ trait: 'Punctuality', rating: 5 });
      expect(card.attendance.schoolDays).toBeGreaterThan(0);
      expect(card.subjects.find((s: { name: string }) => s.name === 'Mathematics')).toMatchObject({
        total: '95.0',
        position: '1st of 14',
      });
      const third = (await admin.get(`${R}/report-card/${students[2]!.studentId}`)).body.data;
      expect(third.position).toBe('3rd of 14');
    });

    it('holds and releases a report card', async () => {
      const id = students[3]!.studentId;
      const card = (await admin.get(`${R}/report-card/${id}`)).body.data;
      expect(card.held).toMatchObject({ reason: 'Fees outstanding' });
      const twice = await admin
        .post(`${R}/report-card/${id}/hold`)
        .send({ reason: 'Again please' });
      expect(twice.body.error.code).toBe('ALREADY_HELD');
      const released = await admin.post(`${R}/report-card/${id}/release`).send({});
      expect(released.status).toBe(200);
      expect(released.body.data.held).toBeNull();
      expect((await admin.post(`${R}/report-card/${id}/release`).send({})).body.error.code).toBe(
        'NOT_HELD',
      );
    });
  });

  describe('corrections', () => {
    let correctionId: string;
    const last = () => students[13]!;

    it('takes a teacher’s request with evidence', async () => {
      const base = {
        sheetId: mathsId,
        studentId: last().studentId,
        componentKey: 'EXAMINATION',
        proposed: 95,
        reason: 'Script re-marked: question 7 was not added.',
      };
      const short = await ade.post('/api/v1/corrections').send({ ...base, reason: 'Re-marked' });
      expect(short.status).toBe(422);
      expect(short.body.error.fields.reason).toMatch(/15 characters/);
      const fake = await ade.post('/api/v1/corrections').send({
        ...base,
        evidence: {
          name: 'x.pdf',
          size: 3,
          type: 'application/pdf',
          dataUrl: 'data:text/plain;base64,aGk=',
        },
      });
      expect(fake.body.error.fields.evidence).toBe('Attach a PDF or a photo (JPG or PNG).');
      const res = await ade.post('/api/v1/corrections').send({
        ...base,
        evidence: { name: 'script.pdf', size: 14, type: 'application/pdf', dataUrl: PDF },
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        status: 'Under review',
        evidence: 'script.pdf',
        original: 35,
        proposed: 95,
        component: 'Examination (max 100)',
      });
      correctionId = res.body.data.id;
      expect([...t.storage.objects.keys()].some((k) => k.includes('/corrections/'))).toBe(true);
      const dup = await ade.post('/api/v1/corrections').send(base);
      expect(dup.body.error.code).toBe('DUPLICATE');
      expect((await ade.get('/api/v1/results')).body.data.corrections[0].id).toBe(correctionId);
      // Only published sheets take corrections; and only its teachers ask.
      expect((await bello.post('/api/v1/corrections').send(base)).status).toBe(403);
    });

    it('applies it: the score, total and position change and the card is re-issued', async () => {
      const list = (await admin.get(`${R}/corrections`)).body.data;
      expect(list[0]).toMatchObject({ id: correctionId, status: 'Under review' });
      const res = await admin.post(`${R}/corrections/${correctionId}/approve`).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Applied');
      const row = (await sheetOf(ade, mathsId)).rows.find(
        (r: Row) => r.studentId === last().studentId,
      );
      expect(row.scores[2]).toBe(95);
      // 7 + 7 + 95/100×60 = 71 (it was 35).
      expect(row.total).toBe(71);
      const cards = await t.prisma.reportCard.findMany({ where: { termId, armId } });
      expect(cards.find((c) => c.studentId === last().studentId)!.version).toBe(2);
      expect(cards.find((c) => c.studentId === students[0]!.studentId)!.version).toBe(1);
      const entry = await t.prisma.resultEntry.findFirstOrThrow({
        where: { sheetId: mathsId, studentId: last().studentId },
      });
      expect(entry.position).toBeLessThan(13);
      expect(
        (await admin.post(`${R}/corrections/${correctionId}/approve`).send({})).body.error.code,
      ).toBe('ALREADY_DECIDED');
    });

    it('rejects one with a note', async () => {
      const res = await ade.post('/api/v1/corrections').send({
        sheetId: mathsId,
        studentId: students[12]!.studentId,
        componentKey: 'CA1',
        proposed: 12,
        reason: 'CA 1 test was marked out of 18, not 20.',
      });
      expect(res.status).toBe(201);
      const id = res.body.data.id;
      expect((await admin.post(`${R}/corrections/${id}/reject`).send({})).status).toBe(422);
      const rej = await admin
        .post(`${R}/corrections/${id}/reject`)
        .send({ note: 'The mark book shows 8.' });
      expect(rej.body.data).toMatchObject({
        status: 'Rejected',
        decisionNote: 'The mark book shows 8.',
      });
    });
  });

  describe('the third term’s cumulative report', () => {
    it('shows each term’s totals and the annual averages', async () => {
      const terms = await t.prisma.term.findMany({
        where: {
          sessionId: (await t.prisma.term.findUniqueOrThrow({ where: { id: termId } })).sessionId,
        },
        orderBy: { sequence: 'asc' },
      });
      const [first, second, third] = terms;
      const maths = await t.prisma.resultSheet.findUniqueOrThrow({ where: { id: mathsId } });
      // Second Term's Mathematics, published: everyone scored 70.
      const sheet = await t.prisma.resultSheet.create({
        data: {
          ...maths,
          id: undefined,
          termId: second!.id,
          teachingAssignmentId: null,
          status: 'PUBLISHED',
          createdAt: undefined,
          updatedAt: undefined,
          revision: 0,
        },
      });
      await t.prisma.resultEntry.create({
        data: {
          schoolId,
          sheetId: sheet.id,
          studentId: students[0]!.studentId,
          total: 70,
          grade: 'A',
        },
      });
      await t.prisma.term.update({ where: { id: first!.id }, data: { status: 'CLOSED' } });
      await t.prisma.term.update({ where: { id: third!.id }, data: { status: 'ACTIVE' } });

      const card = (await admin.get(`${R}/report-card/${students[0]!.studentId}?term=${third!.id}`))
        .body.data;
      expect(card.title).toBe('Third Term Report · 2026/2027');
      expect(card.cumulative.terms).toEqual(['First Term', 'Second Term', 'Third Term']);
      expect(
        card.cumulative.subjects.find((s: { name: string }) => s.name === 'Mathematics'),
      ).toEqual({
        name: 'Mathematics',
        totals: [95, 70, null],
        average: 82.5,
      });
      expect(card.cumulative.average).toEqual(expect.any(Number));
      // A closed term is read-only for teachers.
      const closed = await fillAll(ade, mathsId);
      expect(closed.body.error.code).toBe('TERM_LOCKED');

      await t.prisma.term.update({ where: { id: third!.id }, data: { status: 'UPCOMING' } });
      await t.prisma.term.update({ where: { id: first!.id }, data: { status: 'ACTIVE' } });
    });
  });

  describe('access', () => {
    it('refuses a section admin outside their sections', async () => {
      const membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { schoolId, user: { email: 'adaeze.okonkwo@greenfield.edu.ng' } },
      });
      const primary = await t.prisma.section.findFirstOrThrow({
        where: { schoolId, name: 'Primary' },
      });
      await t.prisma.membershipSection.create({
        data: { schoolId, membershipId: membership.id, sectionId: primary.id },
      });
      try {
        const res = await admin
          .post(`${R}/report-card/${students[4]!.studentId}/hold`)
          .send({ reason: 'Disciplinary matter' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SECTION_FORBIDDEN');
        // Viewing is still fine.
        expect((await admin.get(`${R}/sheets/${armId}/MTH`)).status).toBe(200);
      } finally {
        await t.prisma.membershipSection.deleteMany({ where: { membershipId: membership.id } });
      }
    });

    it('keeps other schools out', async () => {
      const udo = authed(t, (await signIn(t, 'e.udo@crestviewcollege.ng')).token);
      // Crestview has no session yet (409) and never sees Greenfield's arm or student.
      for (const path of [
        `${R}/sheets/${armId}/MTH`,
        `${R}/report-card/${students[0]!.studentId}`,
      ]) {
        const res = await udo.get(path);
        expect([404, 409]).toContain(res.status);
        expect(res.body.data).toBeUndefined();
      }
      expect((await udo.get(`${R}/corrections`)).body.data).toEqual([]);
    });
  });
});
