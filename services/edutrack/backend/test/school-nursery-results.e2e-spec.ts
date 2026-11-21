import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const NOW = Date.parse('2026-11-20T09:00:00.000Z');
const SALAMI = 't.salami@greenfield.edu.ng';

interface Sheet {
  id: string;
  arm: string;
  subject: string;
  status: string;
  mode?: string;
  ratings?: { id: string; name: string }[];
  rows: { studentId: string; scores: (number | null)[]; grade: string | null }[];
  revision: number;
}

/**
 * Nursery (descriptive) results: the class teacher rates every learning area of their class on
 * the scheme's scale, submits for the usual review, adds a comment, height and weight; School Admin
 * adds the head teacher's comment and publishes; the card has ratings, no scores or positions.
 */
describe('Nursery report cards (e2e)', () => {
  let t: TestApp;
  let teacher: Api;
  let admin: Api;
  let armId: string;
  let pupil: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    t.clock.set(NOW);
    const schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } }))
      .id;
    const arm = await t.prisma.classArm.findFirstOrThrow({
      where: {
        schoolId,
        name: 'A',
        level: { name: 'Nursery 2' },
        enrollments: { some: { status: 'ACTIVE' } },
      },
    });
    armId = arm.id;
    pupil = (await t.prisma.enrollment.findFirstOrThrow({ where: { armId, status: 'ACTIVE' } }))
      .studentId;
    // Mr. Salami (a teacher with a login and no classes yet) becomes Nursery 2A's class teacher.
    const session = await t.prisma.academicSession.findFirstOrThrow({
      where: { schoolId, status: 'ACTIVE' },
    });
    const salami = await t.prisma.staff.findFirstOrThrow({ where: { email: SALAMI } });
    await t.prisma.classTeacherAssignment.updateMany({
      where: { armId, endsOn: null },
      data: { endsOn: new Date(NOW - 86_400_000) },
    });
    await t.prisma.classTeacherAssignment.create({
      data: {
        schoolId,
        sessionId: session.id,
        armId,
        staffId: salami.id,
        startsOn: session.startsOn,
      },
    });
    teacher = authed(t, (await signIn(t, SALAMI, { host: HOST })).token, { host: HOST });
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    t.clock.set(Date.now());
    await t.reseed();
    await t.close();
  });

  const mySheets = async () =>
    ((await teacher.get('/api/v1/results')).body.data.sheets as Sheet[]).filter(
      (s) => s.arm === 'Nursery 2A',
    );

  it('gives the class teacher a rating sheet for every learning area', async () => {
    const sheets = await mySheets();
    expect(sheets.length).toBeGreaterThan(2);
    const sheet = (await teacher.get(`/api/v1/results/${sheets[0]!.id}`)).body.data as Sheet;
    expect(sheet.mode).toBe('descriptive');
    expect(sheet.ratings!.length).toBeGreaterThanOrEqual(3);
    expect(sheet.rows[0]).toMatchObject({ studentId: pupil, scores: [null], grade: null });
  });

  it('refuses a score where a rating belongs, and refuses submitting unrated children', async () => {
    const [first] = await mySheets();
    const sheet = (await teacher.get(`/api/v1/results/${first!.id}`)).body.data as Sheet;
    const bad = await teacher
      .put(`/api/v1/results/${sheet.id}/scores`)
      .send({ rows: [{ studentId: pupil, scores: [72] }], revision: sheet.revision });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fields[`${pupil}.rating`]).toBe('Choose a rating from the scale.');
    const early = await teacher.post(`/api/v1/results/${sheet.id}/submit`);
    expect(early.status).toBe(422);
    expect(early.body.message).toMatch(/no rating yet/);
  });

  it('rates, submits, gets approved and published with the card extras', async () => {
    for (const s of await mySheets()) {
      const sheet = (await teacher.get(`/api/v1/results/${s.id}`)).body.data as Sheet;
      const saved = await teacher.put(`/api/v1/results/${sheet.id}/scores`).send({
        rows: [{ studentId: pupil, scores: [1], remark: 'Loves this activity.' }],
        revision: sheet.revision,
      });
      expect(saved.status).toBe(200);
      expect(saved.body.data.rows[0].grade).toBe(sheet.ratings![0]!.name);
      const sub = await teacher.post(`/api/v1/results/${sheet.id}/submit`);
      expect(sub.status).toBe(200);
      const approve = await admin
        .post(`/api/v1/academics/results/sheets/${armId}/${s.subject}/approve`)
        .send({});
      if (approve.status !== 200) {
        // With an HOD in between, forward it first.
        expect([200, 409]).toContain(approve.status);
      }
    }

    // The class teacher's comment, height and weight (no conduct ratings for Nursery).
    const form = (await teacher.get(`/api/v1/class-teacher/report-cards/${pupil}`)).body.data;
    expect(form.mode).toBe('descriptive');
    const badMeasure = await teacher
      .put(`/api/v1/class-teacher/report-cards/${pupil}`)
      .send({ remark: 'A cheerful child who enjoys stories and songs.', height: 400 });
    expect(badMeasure.body.error.fields.height).toMatch(/cm/);
    const saved = await teacher.put(`/api/v1/class-teacher/report-cards/${pupil}`).send({
      remark: 'A cheerful child who enjoys stories and songs.',
      height: 104.5,
      weight: 17.2,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ done: true, height: 104.5, weight: 17.2 });

    const head = await admin
      .put(`/api/v1/academics/results/report-card/${pupil}/head-remark`)
      .send({ remark: 'A wonderful term. Keep it up!' });
    expect(head.status).toBe(200);
    expect(head.body.data).toMatchObject({
      mode: 'descriptive',
      headTeacherRemark: 'A wonderful term. Keep it up!',
      height: 104.5,
      weight: 17.2,
      components: [],
      attendance: null,
      position: null,
    });
    expect(head.body.data.subjects[0]).toMatchObject({
      scores: [],
      remark: 'Loves this activity.',
    });

    const check = (await admin.get(`/api/v1/academics/results/publish/${armId}`)).body.data;
    expect(check).toBeTruthy();
    const pub = await admin
      .post(`/api/v1/academics/results/publish/${armId}`)
      .send({ acknowledged: true });
    expect(pub.status).toBe(200);
    const card = await t.prisma.reportCard.findFirstOrThrow({ where: { studentId: pupil } });
    expect(card.publishedAt).toBeTruthy();
    expect((card.snapshot as { mode: string }).mode).toBe('descriptive');

    // Read-only after publishing.
    const late = await admin
      .put(`/api/v1/academics/results/report-card/${pupil}/head-remark`)
      .send({ remark: 'Changed' });
    expect(late.body.error.code).toBe('RESULTS_PUBLISHED');
  });
});
