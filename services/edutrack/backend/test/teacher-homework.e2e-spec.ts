import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/auth/password.js';
import type { MembershipStatus } from '../src/generated/prisma/enums.js';
import {
  authed,
  createTestApp,
  login,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

/**
 * Homework on the API: the Teacher Workspace's assignments, submissions and materials, uploads,
 * the sidebar count and dashboard to-dos, and the Parent Portal's view of a child's homework with
 * a parent handing in a primary pupil's work. Mr. Ade teaches JSS 2B Mathematics; Mrs. Okafor
 * teaches JSS 2B English. Mrs. Funke Adeyemi is the mother of Emmanuel (JSS 2B, who has a
 * Student Portal login) and Michael (Primary 5B, who doesn't).
 */

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const ADE = 's.ade@greenfield.edu.ng';
const OKAFOR = 'g.okafor@greenfield.edu.ng';
const ALGEBRA = 'Algebraic expressions · holiday revision';

const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;
const PDF = dataUrl('application/pdf', Buffer.from('%PDF-1.4\n% homework test\n'));
const JPG = dataUrl('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]));

/** "YYYY-MM-DDTHH:mm" in Lagos, `days` from now at 16:00 (kept before the term ends). */
const due = (days: number) => {
  const day = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  return `${day < '2026-12-18' ? day : '2026-12-18'}T16:00`;
};

describe('Teacher homework and the Parent Portal (e2e)', () => {
  let t: TestApp;
  let ade: Api;
  let okafor: Api;
  let jss2b: string;
  let closedTerm: string;
  const tag = randomUUID().slice(-8);
  const createdUsers: string[] = [];
  const borrowed: { id: string; userId: string; status: MembershipStatus }[] = [];

  const upload = (api: Api, name: string, url = PDF) =>
    api.post('/api/v1/uploads').send({ name, dataUrl: url });
  const list = async (api: Api, query = '') =>
    (await api.get(`/api/v1/assignments${query}`)).body.data;
  const algebra = async () =>
    (await list(ade)).data.find((a: { title: string }) => a.title === ALGEBRA);
  const body = (o: Record<string, unknown> = {}) => ({
    armId: jss2b,
    subject: 'MTH',
    title: `Test homework ${tag}`,
    instructions: 'Answer every question.',
    dueAt: due(3),
    maxScore: 10,
    allowLate: false,
    attachments: [],
    publish: true,
    ...o,
  });

  /** A Parent Portal account for a seeded guardian (none are seeded). */
  async function parentFor(guardianName: string) {
    const g = await t.prisma.guardian.findFirstOrThrow({
      where: { fullName: guardianName, school: { slug: 'greenfield' } },
    });
    const email = `parent.${tag}.${g.id.slice(-6)}@example.com`;
    const user = await t.prisma.user.create({
      data: {
        email,
        firstName: 'Test',
        lastName: 'Parent',
        status: 'ACTIVE',
        passwordHash: await hashPassword(PASSWORD),
        passwordChangedAt: new Date(),
        emailVerifiedAt: new Date(),
      },
    });
    createdUsers.push(user.id);
    // The guardian may already have an account (invited elsewhere): borrow it, put it back after.
    const existing = await t.prisma.schoolMembership.findFirst({ where: { guardianId: g.id } });
    if (existing) {
      borrowed.push({ id: existing.id, userId: existing.userId, status: existing.status });
      await t.prisma.schoolMembership.update({
        where: { id: existing.id },
        data: { userId: user.id, status: 'ACTIVE', activatedAt: new Date() },
      });
    } else
      await t.prisma.schoolMembership.create({
        data: {
          schoolId: g.schoolId,
          userId: user.id,
          kind: 'GUARDIAN',
          status: 'ACTIVE',
          guardianId: g.id,
          activatedAt: new Date(),
        },
      });
    const res = await login(t, email, PASSWORD, { portal: 'parent', host: HOST });
    expect(res.status).toBe(200);
    return authed(t, res.body.data.accessToken as string, { host: HOST });
  }

  const studentId = async (admissionNo: string) =>
    (await t.prisma.student.findFirstOrThrow({ where: { admissionNo } })).id;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    ade = authed(t, (await signIn(t, ADE, { host: HOST })).token, { host: HOST });
    okafor = authed(t, (await signIn(t, OKAFOR, { host: HOST })).token, { host: HOST });
    const scope = (await ade.get('/api/v1/my-scope')).body.data;
    jss2b = scope.assignments.find(
      (a: { armName: string; subject: string }) => a.armName === 'JSS 2B' && a.subject === 'MTH',
    ).armId;
    const ctx = (await ade.get('/api/v1/context')).body.data;
    closedTerm = ctx.terms.find((x: { status: string }) => x.status === 'Closed').id;
  });

  afterAll(async () => {
    for (const b of borrowed)
      await t.prisma.schoolMembership.update({
        where: { id: b.id },
        data: { userId: b.userId, status: b.status },
      });
    await t.prisma.authSession.deleteMany({ where: { userId: { in: createdUsers } } });
    await t.prisma.schoolMembership.deleteMany({ where: { userId: { in: createdUsers } } });
    await t.prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await t.reseed();
    await t.close();
  });

  describe('assignments', () => {
    it('lists my seeded homework with counts and what waits to be graded', async () => {
      const v = await list(ade);
      expect(v.counts).toMatchObject({ Draft: 1, Published: 1, Closed: 1, toGrade: 4 });
      const a = v.data.find((x: { title: string }) => x.title === ALGEBRA);
      expect(a).toMatchObject({
        status: 'Published',
        maxScore: 20,
        classLabel: 'JSS 2B · Mathematics',
        submitted: 8,
        toGrade: 4,
        pastDue: false,
      });
      expect(a.students).toBeGreaterThanOrEqual(10);
      const detail = (await ade.get(`/api/v1/assignments/${a.id}`)).body.data;
      expect(detail.counts).toMatchObject({ Returned: 2, Graded: 2, Submitted: 4 });
      expect(detail.highestScore).toMatchObject({ score: 18 });
      expect(detail.attachments[0]).toMatchObject({ unavailable: false });
      expect(detail.attachments[0].materialId).toBeTruthy();
      expect(detail.permissions).toMatchObject({ edit: true, close: true, delete: false });
      expect((await list(ade, '?status=To%20grade')).data).toHaveLength(1);
    });

    it('checks uploads by their content', async () => {
      expect((await upload(ade, 'virus.exe')).status).toBe(422);
      const fake = await upload(ade, 'fake.pdf', JPG);
      expect([fake.status, fake.body.error.fields.file]).toEqual([
        422,
        expect.stringMatching(/real .pdf/),
      ]);
      const ok = await upload(ade, 'worksheet.pdf');
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ name: 'worksheet.pdf', type: 'application/pdf' });
      expect(
        t.storage.objects.has(
          `schools/${(await t.prisma.storedFile.findUniqueOrThrow({ where: { id: ok.body.data.id } })).schoolId}/homework/${ok.body.data.id}.pdf`,
        ),
      ).toBe(true);
    });

    it('validates, publishes with attachments and tells the families', async () => {
      const noTitle = await ade.post('/api/v1/assignments').send(body({ title: ' ' }));
      expect([noTitle.status, Object.keys(noTitle.body.error.fields)]).toEqual([422, ['title']]);
      const noDue = await ade.post('/api/v1/assignments').send(body({ dueAt: null }));
      expect(noDue.body.error.fields.dueAt).toBe('Choose a due date and time.');
      const outside = await ade
        .post('/api/v1/assignments')
        .send(body({ dueAt: '2027-02-01T16:00' }));
      expect(outside.body.error.fields.dueAt).toMatch(/inside First Term/);
      const max = await ade.post('/api/v1/assignments').send(body({ maxScore: 150 }));
      expect(max.body.error.fields.maxScore).toMatch(/1 to 100/);

      const file = (await upload(ade, 'questions.pdf')).body.data;
      const res = await ade
        .post('/api/v1/assignments')
        .send(body({ attachments: [{ id: file.id, name: file.name }] }));
      expect(res.status).toBe(201);
      expect(res.body.message).toMatch(/published/);
      expect(res.body.data).toMatchObject({ status: 'Published', toGrade: 0, submitted: 0 });
      expect(res.body.data.attachments[0]).toMatchObject({
        id: file.id,
        name: 'questions.pdf',
        url: expect.stringContaining('https://storage.test/'),
      });
      expect(res.body.data.history[0].title).toBe('Published');
      const message = await t.prisma.message.findFirst({
        where: { sourceType: 'Assignment', sourceId: res.body.data.id },
      });
      expect(message).toMatchObject({ event: 'ASSIGNMENT_PUBLISHED' });
      expect(message!.recipientCount).toBeGreaterThan(0);

      // An upload is attached once, by the teacher who uploaded it.
      const again = await ade
        .post('/api/v1/assignments')
        .send(body({ title: `Second ${tag}`, attachments: [{ id: file.id }] }));
      expect([again.status, again.body.error.fields.attachments]).toEqual([
        422,
        expect.stringMatching(/can’t be attached here/),
      ]);
      const hers = (await upload(okafor, 'mine.pdf')).body.data;
      const stolen = await ade
        .post('/api/v1/assignments')
        .send(body({ title: `Third ${tag}`, attachments: [{ id: hers.id }] }));
      expect(stolen.status).toBe(422);
    });

    it('refuses classes I don’t teach, other teachers’ work and closed terms', async () => {
      const notMine = await okafor.post('/api/v1/assignments').send(body());
      expect(notMine.status).toBe(403);
      const a = await algebra();
      expect((await okafor.get(`/api/v1/assignments/${a.id}`)).status).toBe(403);
      expect((await okafor.get(`/api/v1/assignments/${a.id}/submissions`)).status).toBe(403);
      const closed = await ade.post(`/api/v1/assignments?term=${closedTerm}`).send(body());
      expect([closed.status, closed.body.error.code]).toEqual([409, 'TERM_LOCKED']);
      expect((await ade.get(`/api/v1/assignments/${randomUUID()}`)).status).toBe(404);
    });

    it('edits, closes, reopens and deletes by the rules', async () => {
      const a = (await ade.post('/api/v1/assignments').send(body({ title: `Edit me ${tag}` }))).body
        .data;
      const back = await ade.patch(`/api/v1/assignments/${a.id}`).send(body({ publish: false }));
      expect(back.status).toBe(422);
      const move = await ade.patch(`/api/v1/assignments/${a.id}`).send(body({ subject: 'ENG' }));
      expect(move.status).toBe(422);
      const renamed = await ade
        .patch(`/api/v1/assignments/${a.id}`)
        .send(body({ title: `Edited ${tag}` }));
      expect(renamed.body.data).toMatchObject({ title: `Edited ${tag}`, status: 'Published' });
      expect(renamed.body.data.history[0].title).toBe('Changed after publishing');

      expect((await ade.delete(`/api/v1/assignments/${a.id}`)).status).toBe(422);
      const closed = await ade.post(`/api/v1/assignments/${a.id}/close`);
      expect([closed.status, closed.body.data.status]).toEqual([200, 'Closed']);
      expect((await ade.post(`/api/v1/assignments/${a.id}/close`)).status).toBe(422);
      expect((await ade.patch(`/api/v1/assignments/${a.id}`).send(body())).status).toBe(422);
      const reopened = await ade.post(`/api/v1/assignments/${a.id}/reopen`);
      expect(reopened.body.data).toMatchObject({ status: 'Published', closedAt: null });

      const draft = (
        await ade
          .post('/api/v1/assignments')
          .send({ armId: jss2b, subject: 'MTH', title: `Draft ${tag}`, publish: false })
      ).body.data;
      expect(draft).toMatchObject({ status: 'Draft', dueAt: null, students: expect.any(Number) });
      const gone = await ade.delete(`/api/v1/assignments/${draft.id}`);
      expect([gone.status, gone.body.data]).toEqual([200, { deleted: draft.id }]);
    });

    it('won’t drop the max score below a score already given', async () => {
      const a = await algebra();
      const res = await ade.patch(`/api/v1/assignments/${a.id}`).send({
        title: ALGEBRA,
        instructions: 'Same.',
        dueAt: a.dueAt,
        maxScore: 10,
        publish: true,
      });
      expect(res.body.error.fields.maxScore).toMatch(/already has 18/);
    });
  });

  describe('submissions', () => {
    it('lists every student on the class list, missing ones included', async () => {
      const a = await algebra();
      const v = (await ade.get(`/api/v1/assignments/${a.id}/submissions`)).body.data;
      expect(v.rows).toHaveLength(a.students);
      expect(v.counts.All).toBe(a.students);
      expect(v.counts['Not submitted']).toBe(a.students - 8);
      expect(v.assignment.permissions.grade).toBe(true);
      const missing = (
        await ade.get(`/api/v1/assignments/${a.id}/submissions?status=Not%20submitted`)
      ).body.data.rows;
      expect(
        missing.every((r: { id: string; status: string }) => r.id && r.status === 'Not submitted'),
      ).toBe(true);
    });

    it('grades, returns (telling the family), bulk returns and excuses', async () => {
      const a = await algebra();
      const rows = (await ade.get(`/api/v1/assignments/${a.id}/submissions`)).body.data.rows as {
        id: string;
        status: string;
        studentName: string;
      }[];
      const url = (id: string) => `/api/v1/assignments/${a.id}/submissions/${id}`;
      const missing = rows.find((r) => r.status === 'Not submitted')!;
      const waiting = rows.filter((r) => r.status === 'Submitted');
      const graded = rows.filter((r) => r.status === 'Graded');

      expect((await ade.put(`${url(missing.id)}/grade`).send({ score: 5 })).status).toBe(422);
      const tooHigh = await ade.put(`${url(waiting[0]!.id)}/grade`).send({ score: 25 });
      expect(tooHigh.body.error.fields.score).toMatch(/0 to 20/);
      const g = await ade
        .put(`${url(waiting[0]!.id)}/grade`)
        .send({ score: 16, feedback: 'Good work.' });
      expect(g.body.data).toMatchObject({ status: 'Graded', score: 16, feedback: 'Good work.' });
      expect(g.body.data.history[0].title).toBe('Graded');

      const r = await ade.post(`${url(waiting[0]!.id)}/return`).send({});
      expect(r.body.data).toMatchObject({ status: 'Returned', score: 16 });
      const returned = await t.prisma.message.findFirst({
        where: { sourceId: a.id, event: 'ASSIGNMENT_RETURNED' },
      });
      expect(returned).toBeTruthy();

      const bulk = await ade
        .post(`/api/v1/assignments/${a.id}/submissions/return`)
        .send({ ids: [...graded.map((x) => x.id), missing.id] });
      expect(bulk.body.data.returned).toBe(graded.length);
      expect(bulk.body.data.skipped).toEqual([
        { id: missing.id, studentName: missing.studentName, reason: 'Nothing handed in' },
      ]);

      expect((await ade.post(`${url(missing.id)}/excuse`).send({ reason: '' })).status).toBe(422);
      const ex = await ade.post(`${url(missing.id)}/excuse`).send({ reason: 'Sick all week' });
      expect(ex.body.data).toMatchObject({ status: 'Excused', excuseReason: 'Sick all week' });
      expect((await ade.post(`${url(waiting[1]!.id)}/excuse`).send({ reason: 'No' })).status).toBe(
        422,
      );
      const undo = await ade.delete(`${url(missing.id)}/excuse`);
      expect(undo.body.data.status).toBe('Not submitted');
    });

    it('counts work to grade in the sidebar and on the dashboard', async () => {
      const toGrade = (await list(ade)).counts.toGrade;
      expect(toGrade).toBeGreaterThan(0);
      const counts = (await ade.get('/api/v1/nav-counts')).body.data;
      expect(counts.assignments).toBe(toGrade);
      const dash = (await ade.get('/api/v1/dashboard')).body.data;
      expect(dash.metrics.data).toMatchObject({ toGrade, toGradeAssignments: 1 });
      const item = dash.todo.data.find((x: { kind: string }) => x.kind === 'grade');
      expect(item).toMatchObject({
        title: expect.stringContaining(ALGEBRA),
        to: { name: 'submissions', params: { assignmentId: expect.any(String) } },
      });
    });

    it('shows a student’s assignments from me on the student page', async () => {
      const emmanuel = await studentId('STU-2025-0042');
      const rows = (await ade.get(`/api/v1/assignments/student/${emmanuel}`)).body.data;
      expect(rows.map((r: { title: string }) => r.title)).toEqual(
        expect.arrayContaining([ALGEBRA, 'Number bases practice']),
      );
      const tobi = await studentId('STU-2025-0702');
      expect((await ade.get(`/api/v1/assignments/student/${tobi}`)).status).toBe(403);
    });
  });

  describe('materials', () => {
    it('shares, archives and restores, with download links', async () => {
      const v = (await ade.get('/api/v1/materials')).body.data;
      expect(v.counts).toEqual({ Published: 1, Archived: 1 });
      const badLink = await ade.post('/api/v1/materials').send({
        armId: jss2b,
        subject: 'MTH',
        type: 'Video link',
        title: 'Elsewhere',
        link: 'https://example.com/video',
      });
      expect(badLink.body.error.fields.link).toMatch(/YouTube, Vimeo or Google Drive/);
      const pdf = (await upload(ade, 'notes.pdf')).body.data;
      const wrongType = await ade.post('/api/v1/materials').send({
        armId: jss2b,
        subject: 'MTH',
        type: 'Image',
        title: 'Notes',
        file: pdf,
      });
      expect(wrongType.body.error.fields.file).toMatch(/isn’t a image file|isn’t a .*file/);
      const res = await ade.post('/api/v1/materials').send({
        armId: jss2b,
        subject: 'MTH',
        type: 'PDF',
        title: `Notes ${tag}`,
        description: 'Read before Monday.',
        file: pdf,
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        status: 'Published',
        type: 'PDF',
        file: { id: pdf.id, url: expect.stringContaining('https://storage.test/') },
      });
      expect(
        (
          await okafor.post('/api/v1/materials').send({
            armId: jss2b,
            subject: 'MTH',
            type: 'Video link',
            title: 'x',
            link: 'https://youtu.be/abc',
          })
        ).status,
      ).toBe(403);
      expect((await okafor.get(`/api/v1/materials/${res.body.data.id}`)).status).toBe(403);
      const closed = await ade.post(`/api/v1/materials?term=${closedTerm}`).send({
        armId: jss2b,
        subject: 'MTH',
        type: 'Video link',
        title: 'x',
        link: 'https://youtu.be/abc',
      });
      expect(closed.status).toBe(409);

      // The seeded video is attached to the algebra homework: archived, it shows as unavailable.
      const video = v.data.find((m: { status: string }) => m.status === 'Published');
      const archived = await ade.post(`/api/v1/materials/${video.id}/archive`);
      expect(archived.body.data).toMatchObject({
        status: 'Archived',
        linkedAssignments: [{ title: ALGEBRA }],
      });
      const a = await algebra();
      expect((await ade.get(`/api/v1/assignments/${a.id}`)).body.data.attachments[0]).toMatchObject(
        {
          unavailable: true,
          url: null,
        },
      );
      expect((await ade.post(`/api/v1/materials/${video.id}/archive`)).status).toBe(422);
      const restored = await ade.post(`/api/v1/materials/${video.id}/restore`);
      expect(restored.body.data.status).toBe('Published');
      expect(restored.body.data.history.map((h: { title: string }) => h.title)).toEqual([
        'Restored',
        'Archived',
      ]);
    });
  });

  describe('the Parent Portal', () => {
    it('lets a parent hand in a primary pupil’s work, and shows returned feedback', async () => {
      const funke = await parentFor('Funke Adeyemi');
      const michael = await studentId('STU-2023-0311');
      const emmanuel = await studentId('STU-2025-0042');

      const hw = (await funke.get(`/api/v1/parent/children/${michael}/homework`)).body.data;
      expect(hw.handsInThrough).toBe('guardian');
      const sheet = hw.assignments.find(
        (a: { title: string }) => a.title === 'Fractions worksheet',
      );
      expect(sheet).toMatchObject({ status: 'Not submitted', canSubmit: true, score: null });

      const photo = (await upload(funke, 'page1.jpg', JPG)).body.data;
      const none = await funke
        .post(`/api/v1/parent/children/${michael}/assignments/${sheet.id}/submission`)
        .send({ files: [] });
      expect(none.status).toBe(422);
      const res = await funke
        .post(`/api/v1/parent/children/${michael}/assignments/${sheet.id}/submission`)
        .send({ note: 'Michael did all twelve.', files: [{ id: photo.id }] });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'Submitted',
        late: false,
        submittedByGuardian: expect.stringContaining('Funke Adeyemi'),
        files: [{ id: photo.id, url: expect.stringContaining('https://storage.test/') }],
      });
      const row = await t.prisma.submission.findFirstOrThrow({
        where: { assignmentId: sheet.id, studentId: michael },
      });
      expect(row.submittedByGuardianId).toBeTruthy();
      expect(row.status).toBe('SUBMITTED');

      // Emmanuel (JSS 2) has a Student Portal login, so he hands in his own work.
      const jss = (await funke.get(`/api/v1/parent/children/${emmanuel}/homework`)).body.data;
      expect(jss.handsInThrough).toBe('student');
      const alg = jss.assignments.find((a: { title: string }) => a.title === ALGEBRA);
      expect(alg.canSubmit).toBe(false);
      const refused = await funke
        .post(`/api/v1/parent/children/${emmanuel}/assignments/${alg.id}/submission`)
        .send({ files: [{ id: (await upload(funke, 'x.jpg', JPG)).body.data.id }] });
      expect([refused.status, refused.body.error.code]).toEqual([403, 'STUDENT_SUBMITS']);
      // Feedback shows once returned; a grade not yet returned stays private.
      for (const a of jss.assignments as {
        status: string;
        score: number | null;
        feedback: string | null;
      }[])
        if (a.status === 'Returned') expect(a.feedback).not.toBeNull();
        else expect([a.score, a.feedback]).toEqual([null, null]);
      expect(jss.materials.length).toBeGreaterThan(0);

      // Another child's parent can't see or hand in Michael's work.
      const okeke = await parentFor('Chukwudi Okeke');
      expect((await okeke.get(`/api/v1/parent/children/${michael}/homework`)).status).toBe(404);
      const other = await okeke
        .post(`/api/v1/parent/children/${michael}/assignments/${sheet.id}/submission`)
        .send({ files: [{ id: (await upload(okeke, 'y.jpg', JPG)).body.data.id }] });
      expect(other.status).toBe(404);
      // Teachers can't use the parent routes.
      expect((await ade.get(`/api/v1/parent/children/${michael}/homework`)).status).toBe(403);
    });
  });

  describe('tenant isolation', () => {
    it('keeps one school’s homework out of another’s address', async () => {
      const a = await algebra();
      const token = (await signIn(t, ADE, { host: HOST })).token;
      const elsewhere = authed(t, token, { host: 'crestview.localhost' });
      const res = await elsewhere.get(`/api/v1/assignments/${a.id}`);
      expect([401, 403, 404]).toContain(res.status);
      const crestview = await t.prisma.school.findFirstOrThrow({ where: { slug: 'crestview' } });
      expect(await t.prisma.assignment.count({ where: { schoolId: crestview.id } })).toBe(0);
    });
  });
});
