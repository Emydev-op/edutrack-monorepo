import { authed, createTestApp, login, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
/** A real 1×1 PNG, so the report card PDF can draw it. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * A student's photo: set and removed in School Admin, on their record, and on the report card in
 * School Admin, the Parent and Student Portals and the PDF.
 */
describe('Student photos (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let emmanuel: string;

  const pdf = (req: ReturnType<Api['get']>) =>
    req.buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    emmanuel = (
      await t.prisma.student.findFirstOrThrow({ where: { admissionNo: 'STU-2025-0042' } })
    ).id;
  });

  afterAll(async () => {
    await t.prisma.student.updateMany({ where: { id: emmanuel }, data: { photoFileId: null } });
    await t.reseed();
    await t.close();
  });

  it('refuses files that aren’t a JPG or PNG', async () => {
    const res = await admin
      .put(`/api/v1/students/${emmanuel}/photo`)
      .send({ photo: 'data:application/pdf;base64,JVBERi0xLjQK' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FILE_TYPE');
  });

  it('sets the photo, shows it on the record and replaces the old one', async () => {
    const res = await admin.put(`/api/v1/students/${emmanuel}/photo`).send({ photo: PNG });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Photo saved for Emmanuel Adeyemi.');
    expect(res.body.data.photoUrl).toMatch(/^https:\/\/storage\.test\/schools\/.+\/students\//);
    const first = res.body.data.photoUrl as string;
    const record = (await admin.get(`/api/v1/students/${emmanuel}`)).body.data;
    expect(record.photoUrl).toBe(first);

    const again = await admin.put(`/api/v1/students/${emmanuel}/photo`).send({ photo: PNG });
    const key = first.replace('https://storage.test/', '');
    expect(t.storage.objects.has(key)).toBe(false); // the old file is removed
    expect(again.body.data.photoUrl).not.toBe(first);
  });

  it('prints it on the report card everywhere', async () => {
    const term = await t.prisma.term.findFirstOrThrow({
      where: { status: 'ACTIVE', session: { school: { slug: 'greenfield' } } },
    });
    const enr = await t.prisma.enrollment.findFirstOrThrow({
      where: { studentId: emmanuel, status: 'ACTIVE' },
    });
    await t.prisma.reportCard.create({
      data: {
        schoolId: enr.schoolId,
        termId: term.id,
        studentId: emmanuel,
        armId: enr.armId!,
        publishedAt: new Date(),
        version: 1,
        snapshot: {
          title: 'First Term Report',
          student: { name: 'Emmanuel Adeyemi', admissionNo: 'STU-2025-0042', className: 'JSS 2B' },
          components: [],
          subjects: [],
          average: '70.0%',
        },
      },
    });
    const funke = authed(
      t,
      (await signIn(t, 'funke.adeyemi@gmail.com', { host: HOST, portal: 'parent' })).token,
      { host: HOST },
    );
    const parent = (await funke.get(`/api/v1/parent/children/${emmanuel}/results`)).body.data;
    expect(parent.card.student.photoUrl).toMatch(/^https:\/\/storage\.test\//);
    const s = await login(t, 'STU-2025-0042', undefined, { host: HOST, portal: 'student' });
    const me = authed(t, s.body.data.accessToken as string, { host: HOST });
    expect((await me.get('/api/v1/student/results')).body.data.card.student.photoUrl).toBeTruthy();
    const file = await pdf(funke.get(`/api/v1/parent/children/${emmanuel}/results/pdf`));
    expect(file.status).toBe(200);
    // The photo is embedded as an image.
    expect((file.body as Buffer).toString('latin1')).toMatch(/\/Subtype \/Image/);
  });

  it('removes the photo', async () => {
    const res = await admin.put(`/api/v1/students/${emmanuel}/photo`).send({ photo: null });
    expect(res.body).toMatchObject({ message: 'Photo removed for Emmanuel Adeyemi.' });
    expect((await admin.get(`/api/v1/students/${emmanuel}`)).body.data.photoUrl).toBeNull();
  });

  it('isn’t open to other portals or other schools', async () => {
    const okafor = authed(
      t,
      (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token,
      { host: HOST },
    );
    expect(
      (await okafor.put(`/api/v1/students/${emmanuel}/photo`).send({ photo: PNG })).status,
    ).toBeGreaterThanOrEqual(403);
  });
});
