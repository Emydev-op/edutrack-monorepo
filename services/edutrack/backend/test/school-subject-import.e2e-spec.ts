import ExcelJS from 'exceljs';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

/** School Admin › Subjects › Bulk upload: the template, the checked preview and the import. */
describe('Subject bulk upload (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  const ADDED = ['ROB', 'GEOG', 'VAR'];
  const removeAdded = async () => {
    const ids = (
      await t.prisma.subject.findMany({
        where: {
          OR: [{ code: { in: ADDED } }, { name: { in: ['Visual Arts', 'Geography Club'] } }],
        },
        select: { id: true },
      })
    ).map((s) => s.id);
    await t.prisma.subject.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    await removeAdded();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    await removeAdded();
    await t.reseed();
    await t.close();
  });

  it('downloads an Excel template with dropdowns for the select columns', async () => {
    const res = await admin
      .get('/api/v1/academics/subjects/template')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('Subjects')!;
    expect(sheet.getRow(1).values).toEqual(
      expect.arrayContaining(['Subject name', 'Code', 'Section', 'Category', 'Lessons per week']),
    );
    expect(sheet.getCell('C2').dataValidation).toMatchObject({ type: 'list' });
    expect(sheet.getCell('D2').dataValidation).toMatchObject({ type: 'list' });
    const lists = wb.getWorksheet('Lists')!;
    expect(lists.getColumn(1).values).toEqual(expect.arrayContaining(['Primary', 'Nursery']));
  });

  it('previews a file, catching duplicates in it and against existing subjects', async () => {
    const csv = [
      'Subject name,Code,Section,Category,Lessons per week,Status',
      'Robotics,ROB,Senior Secondary,Science,4,Active',
      'Visual Arts,,Primary,Arts,2,',
      'Visual Arts,,Primary,Arts,2,Active',
      'Mathematics,MTH,Senior Secondary,Core,5,Active',
      'Geography Club,GEOG,Atlantis,Nonsense,12,Maybe',
    ].join('\n');
    const res = await admin
      .post('/api/v1/academics/subjects/import')
      .send({ fileName: 'subjects.csv', content: csv });
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as {
      row: number;
      code: string;
      issues: { field: string; message: string }[];
    }[];
    expect(res.body.data).toMatchObject({ total: 5 });
    expect(rows[0]!.issues).toEqual([]);
    expect(rows[1]!.code).toMatch(/^[A-Z]{2,4}\d?$/); // suggested
    expect(rows[2]!.issues.map((i) => i.field)).toContain('name'); // same as row 3
    expect(rows[3]!.issues.map((i) => i.field)).toContain('code'); // MTH is taken
    expect(rows[4]!.issues.map((i) => i.field).sort()).toEqual(
      ['category', 'periods', 'section', 'status'].sort(),
    );

    // Importing with problems saves nothing and says which cells are wrong.
    const bad = await admin.post('/api/v1/academics/subjects/import/commit').send({
      rows: [
        {
          row: 2,
          name: 'Robotics',
          code: 'ROB',
          section: 'Senior Secondary',
          category: 'Science',
          periods: 4,
          status: 'Active',
        },
        {
          row: 6,
          name: 'Geography Club',
          code: 'GEOG',
          section: 'Atlantis',
          category: 'Nonsense',
          periods: 12,
          status: 'Maybe',
        },
      ],
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('IMPORT_HAS_ISSUES');
    expect(bad.body.error.fields['6.section']).toMatch(/Atlantis/);
    expect(await t.prisma.subject.count({ where: { code: 'ROB' } })).toBe(0);

    // After fixing the rows in the preview, everything imports.
    const ok = await admin.post('/api/v1/academics/subjects/import/commit').send({
      rows: [
        {
          row: 2,
          name: 'Robotics',
          code: 'ROB',
          section: 'Senior Secondary',
          category: 'Science',
          periods: 4,
          status: 'Active',
        },
        {
          row: 3,
          name: 'Visual Arts',
          code: 'VAR',
          section: 'Primary',
          category: 'Arts',
          periods: 2,
          status: 'Active',
        },
      ],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.message).toBe('2 subjects imported.');
    const rob = await t.prisma.subject.findFirst({
      where: { code: 'ROB' },
      include: { section: true },
    });
    expect(rob?.section?.name).toBe('Senior Secondary');
  });

  it('refuses files that aren’t the template', async () => {
    const res = await admin
      .post('/api/v1/academics/subjects/import')
      .send({ fileName: 'subjects.pdf', content: 'x' });
    expect(res.status).toBe(422);
    const wrong = await admin
      .post('/api/v1/academics/subjects/import')
      .send({ fileName: 'subjects.csv', content: 'Name,Code\nMaths,MTH' });
    expect(wrong.body.message).toBe('Use the template: its first column is “Subject name”.');
  });
});
