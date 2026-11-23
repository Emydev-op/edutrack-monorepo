import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const A = '/api/v1/admissions/applications';
const PHONE = '+2348095550555';

interface Detail {
  id: string;
  number: string;
  stage: string;
  next: string[];
  canEdit: boolean;
  canAdmit: boolean;
  studentId: string | null;
  assessmentResult: string;
  offerExpiresOn: string | null;
  history: { title: string; detail: string }[];
}

/**
 * Admission applications: the office records an applicant, reviews them (assessment day and
 * result), sends an offer with an accept-by date, records the family's answer, and admits them
 * through the admission wizard. Moves a stage doesn't allow are refused; rejecting or a declined
 * offer needs a reason; every step is in the application's history.
 */
describe('Admission applications (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  let app: Detail;

  const input = (over: Record<string, unknown> = {}) => ({
    firstName: 'Ireti',
    surname: 'Balogun',
    otherNames: '',
    gender: 'Female',
    dateOfBirth: '2014-02-10',
    type: 'New intake',
    branch: 'Main Campus',
    level: 'JSS 1',
    guardianName: 'Mrs. Bisi Balogun',
    guardianPhone: '0809 555 0555',
    guardianEmail: '',
    previousSchool: 'Bright Stars Primary',
    note: '',
    ...over,
  });
  const move = (id: string, body: Record<string, unknown>) =>
    admin.post(`${A}/${id}/stage`).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    const students = await t.prisma.student.findMany({
      where: { schoolId, surname: 'Balogun', firstName: { in: ['Ireti', 'Dapo'] } },
      select: { id: true },
    });
    const ids = students.map((s) => s.id);
    await t.prisma.admissionApplication.deleteMany({
      where: { schoolId, surname: 'Balogun' },
    });
    await t.prisma.invoice.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.studentSubject.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.studentGuardian.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.student.deleteMany({ where: { id: { in: ids } } });
    await t.prisma.guardian.deleteMany({ where: { schoolId, phone: PHONE } });
    await t.reseed();
    await t.close();
  });

  it('records an application with the next number, and checks what’s missing', async () => {
    const bad = await admin
      .post(A)
      .send(input({ firstName: '', guardianPhone: '', guardianEmail: '', level: 'Year 99' }));
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual([
      'firstName',
      'guardianPhone',
      'level',
    ]);

    const res = await admin.post(A).send(input());
    expect(res.status).toBe(201);
    app = res.body.data as Detail;
    expect(app).toMatchObject({ stage: 'Pending', canEdit: true, canAdmit: false });
    expect(app.number).toMatch(/^APP-\d{4}-\d{4}$/);
    expect(app.next).toEqual(['Under review', 'Rejected']);
    expect(app.history[0]!.title).toBe('Application recorded');
    const list = (await admin.get('/api/v1/admissions')).body.data as {
      id: string;
      number: string;
    }[];
    expect(list.find((r) => r.id === app.id)?.number).toBe(app.number);

    const second = (await admin.post(A).send(input({ firstName: 'Dapo' }))).body.data as Detail;
    const n = (x: string) => Number(x.slice(-4));
    expect(n(second.number)).toBe(n(app.number) + 1);
  });

  it('moves through review and offer, refusing moves a stage doesn’t allow', async () => {
    const skip = await move(app.id, { stage: 'Offer accepted' });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('STAGE_NOT_ALLOWED');

    const review = await move(app.id, {
      stage: 'Under review',
      assessmentOn: '2026-11-28',
      assessmentResult: '68%',
    });
    expect(review.status).toBe(200);
    expect(review.body.data).toMatchObject({ stage: 'Under review', assessmentResult: '68%' });

    const offer = await move(app.id, { stage: 'Offer sent', offerExpiresOn: '2027-01-15' });
    expect(offer.body.data).toMatchObject({ stage: 'Offer sent', offerExpiresOn: '2027-01-15' });

    const accepted = (await move(app.id, { stage: 'Offer accepted' })).body.data as Detail;
    expect(accepted).toMatchObject({ stage: 'Offer accepted', canAdmit: true });
    expect(accepted.history.map((h) => h.title).slice(0, 3)).toEqual([
      'Offer accepted',
      'Offer sent',
      'Under review',
    ]);
  });

  it('needs a reason to reject, and can reopen', async () => {
    const other = (await admin.get('/api/v1/admissions')).body.data.find(
      (r: { applicant: string }) => r.applicant === 'Dapo Balogun',
    );
    expect((await move(other.id, { stage: 'Rejected' })).body.error.fields.note).toBeTruthy();
    const rejected = await move(other.id, { stage: 'Rejected', note: 'No places left in JSS 1' });
    expect(rejected.body.data).toMatchObject({ stage: 'Rejected', next: ['Under review'] });
    const reopened = await move(other.id, { stage: 'Under review' });
    expect(reopened.body.data.stage).toBe('Under review');
  });

  it('admits from the accepted offer, after which the application is closed', async () => {
    const res = await admin.post('/api/v1/admissions').send({
      applicationId: app.id,
      surname: 'Balogun',
      firstName: 'Ireti',
      otherNames: '',
      gender: 'Female',
      dateOfBirth: '2014-02-10',
      stateOfOrigin: 'lagos',
      previousSchool: 'Bright Stars Primary',
      guardian: { mode: 'new', name: 'Mrs. Bisi Balogun', phone: PHONE, email: '' },
      relationship: 'Mother',
      paysFees: true,
      invite: false,
      branch: 'Main Campus',
      level: 'JSS 1',
      arm: 'B',
      admissionType: 'New intake',
      admissionDate: '',
      documents: { birth: 'birth.pdf', photo: null, report: null },
      billing: 'defer',
      siblingDiscount: false,
    });
    expect(res.status).toBe(200);
    const done = (await admin.get(`${A}/${app.id}`)).body.data as Detail;
    expect(done).toMatchObject({ stage: 'Admitted', canEdit: false, canAdmit: false, next: [] });
    expect(done.studentId).toBe(res.body.data.studentId);
    expect((await admin.put(`${A}/${app.id}`).send(input())).body.error.code).toBe(
      'APPLICATION_ADMITTED',
    );
    expect((await move(app.id, { stage: 'Declined', note: 'x' })).status).toBe(409);
  });
});
