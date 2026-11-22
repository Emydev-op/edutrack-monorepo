import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const R = '/api/v1/academics/results';

/**
 * The Principal's (head teacher's) comment on report cards: one card at a time, or a whole class
 * on one screen, until the class is published. Secondary cards say "Principal".
 */
describe('Principal’s remarks on report cards (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let armId: string;
  let termId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    const schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } }))
      .id;
    armId = (
      await t.prisma.classArm.findFirstOrThrow({
        where: { schoolId, name: 'B', level: { name: 'JSS 2' }, branch: { code: 'GFA-MC' } },
      })
    ).id;
    termId = (await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } })).id;
  });

  afterAll(async () => {
    await t.prisma.resultPublication.deleteMany({ where: { termId, armId } });
    await t.reseed();
    await t.close();
  });

  it('lists the class for the Principal, with class teacher remarks', async () => {
    const res = await admin.get(`${R}/head-remarks/${armId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ arm: 'JSS 2B', label: 'Principal', editable: true });
    expect(res.body.data.students.length).toBeGreaterThan(5);
    expect(res.body.data.students[0]).toHaveProperty('classTeacherRemark');
  });

  it('saves comments for several students at once, and shows them on the card', async () => {
    const { students } = (await admin.get(`${R}/head-remarks/${armId}`)).body.data;
    const [a, b] = students as { studentId: string }[];
    const tooLong = await admin
      .put(`${R}/head-remarks/${armId}`)
      .send({ remarks: { [a!.studentId]: 'x'.repeat(401) } });
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error.fields[a!.studentId]).toMatch(/400 characters/);
    const stranger = await admin
      .put(`${R}/head-remarks/${armId}`)
      .send({ remarks: { '00000000-0000-7000-8000-000000000000': 'Hello' } });
    expect(stranger.status).toBe(422);

    const res = await admin.put(`${R}/head-remarks/${armId}`).send({
      remarks: { [a!.studentId]: 'An outstanding term.', [b!.studentId]: 'Good progress.' },
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('2 comments saved.');
    const again = await admin
      .put(`${R}/head-remarks/${armId}`)
      .send({ remarks: { [a!.studentId]: 'An outstanding term.' } });
    expect(again.body.message).toBe('No changes to save.');

    const card = (await admin.get(`${R}/report-card/${a!.studentId}`)).body.data;
    expect(card).toMatchObject({
      headTeacherRemark: 'An outstanding term.',
      headLabel: 'Principal',
    });

    // One card at a time works too; empty removes it.
    const one = await admin
      .put(`${R}/report-card/${b!.studentId}/head-remark`)
      .send({ remark: '' });
    expect(one.body.data.headTeacherRemark).toBeNull();
  });

  it('is read-only once the class is published', async () => {
    const schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } }))
      .id;
    await t.prisma.resultPublication.create({
      data: { schoolId, termId, armId, publishedAt: new Date() },
    });
    const view = (await admin.get(`${R}/head-remarks/${armId}`)).body.data;
    expect(view.editable).toBe(false);
    const res = await admin
      .put(`${R}/head-remarks/${armId}`)
      .send({ remarks: { [view.students[0].studentId]: 'Too late' } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESULTS_PUBLISHED');
  });
});
