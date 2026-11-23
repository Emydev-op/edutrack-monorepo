import ExcelJS from 'exceljs';
import { authed, createTestApp, login, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const G = '/api/v1/platform/groups';

interface SchoolRow {
  name: string;
  term: string | null;
  compareTerm: string | null;
  students: { onRoll: number; admitted: number; left: number };
  staff: { total: number; teaching: number; perTeacher: number | null };
  results: { graded: number; average: number | null; passRate: number | null };
  fees: { billed: number; collected: number; outstanding: number; rate: number | null } | null;
}

/**
 * Group reports: the group's staff see every school side by side for a term, compared with the
 * term before (results, attendance, fees, enrolment, staff), results by subject, the group's top
 * students, fees owed per class and collections by month, and download it all as Excel. The
 * group's academic staff see no fees.
 */
describe('School group reports (e2e)', () => {
  let t: TestApp;
  let tolu: Api;
  let groupId: string;
  const suffix = Date.now().toString(36);
  const OWNER = `reports.${suffix}@example.ng`;
  const PASS = 'Group-Owner-2026!';

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    tolu = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
    const ids = await t.prisma.school.findMany({
      where: { slug: { in: ['greenfield', 'crestview'] } },
      select: { id: true },
    });
    groupId = (await tolu.post(G).send({ name: `Reports Group ${suffix}` })).body.data.id;
    for (const s of ids) await tolu.post(`${G}/${groupId}/schools`).send({ schoolId: s.id });
    await tolu
      .post(`${G}/${groupId}/staff`)
      .send({ name: 'Chief Ade Bello', email: OWNER, role: 'Group owner' });
    const sent = t.notifications.find(OWNER, 'invitation')!;
    const token = decodeURIComponent(
      (sent.data as { link: string }).link.split('/').pop()!.split('?')[0]!,
    );
    await t
      .http()
      .post(`/api/v1/auth/invitations/${encodeURIComponent(token)}/accept`)
      .set('X-Forwarded-For', '10.9.1.20')
      .send({ firstName: 'Ade', lastName: 'Bello', phone: '', password: PASS });
  });

  afterAll(async () => {
    await t.prisma.school.updateMany({
      where: { groupId: { not: null } },
      data: { groupId: null },
    });
    await t.prisma.schoolMembership.deleteMany({ where: { groupId: { not: null } } });
    await t.prisma.schoolGroup.deleteMany({ where: { name: { contains: suffix } } });
    await t.reseed();
    await t.close();
  });

  const owner = async () =>
    authed(t, (await login(t, OWNER, PASS)).body.data.accessToken as string);

  it('compares the schools for this term against the term before', async () => {
    const api = await owner();
    const res = await api.get('/api/v1/group/reports');
    expect(res.status).toBe(200);
    const r = res.body.data;
    expect(r).toMatchObject({ period: 'current', seesFees: true, role: 'Group owner' });
    const schools = r.schools as SchoolRow[];
    expect(schools.map((s) => s.name).sort()).toEqual(['Crestview College', 'Greenfield Academy']);
    const gf = schools.find((s) => s.name === 'Greenfield Academy')!;
    expect(gf.term).toEqual(expect.any(String));
    expect(gf.students.onRoll).toBeGreaterThan(10);
    expect(gf.staff.teaching).toBeGreaterThan(0);
    expect(gf.staff.teaching).toBeLessThanOrEqual(gf.staff.total);
    expect(gf.fees).toMatchObject({ billed: expect.any(Number), collected: expect.any(Number) });
    expect(gf.fees!.outstanding).toBe(Math.max(0, gf.fees!.billed - gf.fees!.collected));

    // Totals add the schools up.
    expect(r.totals.students.onRoll).toBe(schools.reduce((a, s) => a + s.students.onRoll, 0));
    expect(r.totals.results.graded).toBe(schools.reduce((a, s) => a + s.results.graded, 0));
    expect(r.totals.fees.billed).toBeCloseTo(
      schools.reduce((a, s) => a + (s.fees?.billed ?? 0), 0),
      2,
    );
    expect(Array.isArray(r.subjects)).toBe(true);
    expect(Array.isArray(r.topStudents)).toBe(true);
    for (let i = 1; i < r.topStudents.length; i++)
      expect(r.topStudents[i - 1].average).toBeGreaterThanOrEqual(r.topStudents[i].average);
    expect(Array.isArray(r.collections)).toBe(true);

    // The term before becomes the reported term.
    const last = (await api.get('/api/v1/group/reports?period=previous')).body.data;
    expect(last.period).toBe('previous');
    const gfLast = (last.schools as SchoolRow[]).find((s) => s.name === 'Greenfield Academy')!;
    if (gf.compareTerm) expect(gfLast.term).toBe(gf.compareTerm);
  });

  it('downloads the report as an Excel workbook', async () => {
    const api = await owner();
    const res = await api
      .get('/api/v1/group/reports/export')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Schools',
      'Results by subject',
      'Top students',
      'Fees owed by class',
      'Collections by month',
      'Payment methods',
    ]);
    const schools = wb.getWorksheet('Schools')!;
    expect(schools.getCell('A1').value).toBe('School');
    // Two schools and the group total.
    expect(schools.rowCount).toBe(4);
    expect(schools.getCell('A4').value).toBe('Group total');
  });

  it('hides fees from group academic staff and refuses school staff', async () => {
    const staffId = (await tolu.get(`${G}/${groupId}`)).body.data.staff[0].id;
    await tolu.put(`${G}/${groupId}/staff/${staffId}`).send({ role: 'Group academic' });
    const api = await owner();
    const r = (await api.get('/api/v1/group/reports')).body.data;
    expect(r.seesFees).toBe(false);
    expect(r.totals.fees).toBeNull();
    expect(r.arrears).toBeNull();
    expect((r.schools as SchoolRow[]).every((s) => s.fees === null)).toBe(true);

    const adaeze = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    expect((await adaeze.get('/api/v1/group/reports')).body.error.code).toBe('NOT_GROUP_STAFF');
  });
});
