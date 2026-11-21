import { authed, createTestApp, login, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const P = '/api/v1/parent';
const S = '/api/v1/student';

/**
 * Printable documents: a published report card as a PDF (Parent and Student Portals) and a
 * confirmed payment's receipt (Parent Portal and School Admin › Finance).
 */
describe('Report card and receipt PDFs (e2e)', () => {
  let t: TestApp;
  let funke: Api;
  let student: Api;
  let admin: Api;
  let schoolId: string;
  let emmanuel: string;
  let michael: string;
  let armId: string;
  let termId: string;

  const pdf = (req: ReturnType<Api['get']>) =>
    req.buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  const expectPdf = (res: { status: number; headers: Record<string, string>; body: unknown }) => {
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  };
  const studentId = async (admissionNo: string) =>
    (await t.prisma.student.findFirstOrThrow({ where: { admissionNo } })).id;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    emmanuel = await studentId('STU-2025-0042');
    michael = await studentId('STU-2023-0311');
    armId = (
      await t.prisma.enrollment.findFirstOrThrow({
        where: { studentId: emmanuel, status: 'ACTIVE' },
      })
    ).armId!;
    termId = (await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } })).id;
    funke = authed(
      t,
      (await signIn(t, 'funke.adeyemi@gmail.com', { host: HOST, portal: 'parent' })).token,
      { host: HOST },
    );
    const s = await login(t, 'STU-2025-0042', undefined, { host: HOST, portal: 'student' });
    student = authed(t, s.body.data.accessToken as string, { host: HOST });
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    await t.prisma.reportCard.deleteMany({ where: { studentId: emmanuel, termId } });
    await t.reseed();
    await t.close();
  });

  describe('report cards', () => {
    it('refuses a card that isn’t published, then downloads it once it is', async () => {
      const early = await funke.get(`${P}/children/${emmanuel}/results/pdf`);
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('RESULT_NOT_PUBLISHED');

      await t.prisma.reportCard.create({
        data: {
          schoolId,
          termId,
          studentId: emmanuel,
          armId,
          publishedAt: new Date(),
          version: 1,
          average: 71.4,
          snapshot: {
            school: { name: 'Greenfield Academy', motto: 'Light and truth', address: 'Ikeja' },
            title: 'First Term Report · 2026/2027',
            student: {
              name: 'Emmanuel Adeyemi',
              admissionNo: 'STU-2025-0042',
              className: 'JSS 2B',
            },
            classTeacher: 'Mrs. Grace Okafor',
            components: ['CA1 /20', 'CA2 /20', 'Exam /60'],
            subjects: [
              {
                name: 'Mathematics',
                scores: [16, 15, 45],
                total: '76.0',
                grade: 'A',
                remark: 'Excellent',
                position: '2nd of 14',
              },
              {
                name: 'English Language',
                scores: [14, 'ABS', 40],
                total: '54.0',
                grade: 'C',
                remark: 'Absent',
                position: null,
              },
            ],
            average: '71.4%',
            grade: 'B',
            position: '7th of 14',
            nextTerm: 'Second Term begins 12 Jan 2027',
            classTeacherRemark: 'A diligent student.',
            conduct: [{ trait: 'Punctuality', rating: 4 }],
            attendance: { present: 50, late: 2, absent: 3, excused: 1, schoolDays: 54 },
            cumulative: null,
            publishedAt: '2026-11-20 10:00',
          },
        },
      });
      const parent = await pdf(funke.get(`${P}/children/${emmanuel}/results/pdf`));
      expectPdf(parent);
      expect(parent.headers['content-disposition']).toMatch(
        /filename="Emmanuel-Adeyemi-First-Term[^"]*\.pdf"/,
      );
      expectPdf(await pdf(student.get(`${S}/results/pdf`)));
    });

    it('refuses a held card without giving the fees reason', async () => {
      await t.prisma.reportCard.updateMany({
        where: { studentId: emmanuel, termId },
        data: { heldAt: new Date(), heldReason: 'Unpaid fees: ₦45,000 outstanding' },
      });
      for (const res of [
        await student.get(`${S}/results/pdf`),
        await funke.get(`${P}/children/${emmanuel}/results/pdf`),
      ]) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('RESULT_HELD');
        expect(res.body.message).not.toMatch(/45,000|Unpaid/);
      }
    });
  });

  describe('receipts', () => {
    it('downloads a confirmed payment’s receipt for the parent and the bursar', async () => {
      const fees = (await funke.get(`${P}/children/${michael}/fees`)).body.data;
      const paid = fees.payments.find((p: { status: string }) => p.status === 'Confirmed');
      const res = await pdf(funke.get(`${P}/children/${michael}/payments/${paid.id}/receipt`));
      expectPdf(res);
      expect(res.headers['content-disposition']).toContain(`Receipt-${paid.number}`);
      expectPdf(await pdf(admin.get(`/api/v1/finance/payments/${paid.id}/receipt`)));
      // By receipt number too.
      expectPdf(await pdf(admin.get(`/api/v1/finance/payments/${paid.number}/receipt`)));
    });

    it('has no receipt for a payment that isn’t confirmed, or for another child', async () => {
      const fees = (await funke.get(`${P}/children/${michael}/fees`)).body.data;
      const paid = fees.payments[0];
      await t.prisma.payment.update({
        where: { id: paid.id },
        data: { status: 'PENDING_VERIFICATION' },
      });
      const pending = await funke.get(`${P}/children/${michael}/payments/${paid.id}/receipt`);
      expect(pending.status).toBe(409);
      expect(pending.body.error.code).toBe('RECEIPT_NOT_READY');
      expect((await admin.get(`/api/v1/finance/payments/${paid.id}/receipt`)).status).toBe(409);
      await t.prisma.payment.update({ where: { id: paid.id }, data: { status: 'CONFIRMED' } });

      // Michael's payment asked for under Emmanuel isn't found.
      const other = await funke.get(`${P}/children/${emmanuel}/payments/${paid.id}/receipt`);
      expect(other.status).toBe(404);
      // Students don't get receipts.
      expect(
        (await student.get(`${P}/children/${michael}/payments/${paid.id}/receipt`)).status,
      ).toBeGreaterThanOrEqual(401);
    });
  });
});
