import ExcelJS from 'exceljs';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

interface Row {
  line: number;
  level: string;
  arm: string;
  newLevel: boolean;
  errors: string[];
}

/**
 * Bulk upload of classes and arms: an Excel template with branch and section dropdowns, one row
 * per arm. Checking the file reports each row's problems; importing adds levels new to a branch
 * and the arms, through the same rules as adding them by hand.
 */
describe('Classes and arms bulk upload (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  const tag = Date.now().toString(36).slice(-5).toUpperCase();
  const NEW_LEVEL = `Year ${tag}`;
  const started = new Date();

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
  });

  afterAll(async () => {
    const level = await t.prisma.classLevel.findFirst({ where: { schoolId, name: NEW_LEVEL } });
    await t.prisma.classArm.deleteMany({
      where: { schoolId, OR: [{ name: 'Q' }, ...(level ? [{ levelId: level.id }] : [])] },
    });
    if (level) {
      await t.prisma.branchLevel.deleteMany({ where: { levelId: level.id } });
      await t.prisma.classLevel.delete({ where: { id: level.id } });
    }
    await t.prisma.auditEvent.deleteMany({
      where: {
        schoolId,
        createdAt: { gte: started },
        action: { in: ['classes.import', 'level.create', 'arm.create'] },
      },
    });
    await t.prisma.importBatch.deleteMany({ where: { schoolId, kind: 'CLASSES' } });
    await t.reseed();
    await t.close();
  });

  it('builds the template with branch and section dropdowns', async () => {
    const res = await admin
      .get('/api/v1/academics/classes/import/template')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    expect(wb.getWorksheet('Classes')!.getRow(1).values).toEqual(
      expect.arrayContaining(['branch', 'section', 'class_level', 'arm', 'class_teacher']),
    );
    const lists = (wb.getWorksheet('Lists')!.getColumn(1).values as unknown[]).map(String);
    expect(lists).toEqual(expect.arrayContaining(['Main Campus', 'Lekki Campus']));
  });

  it('checks each row, then adds the new level and arms', async () => {
    const main = await t.prisma.branch.findFirstOrThrow({ where: { schoolId, code: 'GFA-MC' } });
    const section = (
      await t.prisma.section.findFirstOrThrow({
        where: {
          schoolId,
          branches: { some: { branchId: main.id } },
          name: { contains: 'Junior' },
        },
      })
    ).name;
    const existing = await t.prisma.classArm.findFirstOrThrow({
      where: { schoolId, branchId: main.id, archivedAt: null, level: { name: 'JSS 1' } },
    });
    const csv = [
      'branch,section,class_level,arm,capacity,room,class_teacher',
      `Main Campus,${section},${NEW_LEVEL},A,30,Room 9,`,
      `main campus,${section},${NEW_LEVEL},B,,,`,
      `Main Campus,${section},JSS 1,Q,35,,`,
      `Main Campus,${section},JSS 1,${existing.name},35,,`,
      `Main Campus,${section},${NEW_LEVEL},A,30,,`,
      `Mars Campus,${section},JSS 1,C,35,,`,
      `Main Campus,${section},JSS 1,R,500,,nobody@nowhere.ng`,
    ].join('\n');
    const res = await admin
      .post('/api/v1/academics/classes/import')
      .send({ fileName: 'classes.csv', text: csv });
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as Row[];
    expect(rows.slice(0, 3).map((r) => r.errors)).toEqual([[], [], []]);
    expect(rows[0]).toMatchObject({ newLevel: true });
    expect(rows[2]).toMatchObject({ newLevel: false, level: 'JSS 1' });
    expect(rows[3]!.errors[0]).toContain('already exists');
    expect(rows[4]!.errors).toContain('this arm is in the file twice');
    expect(rows[5]!.errors[0]).toContain('unknown branch');
    expect(rows[6]!.errors).toEqual(
      expect.arrayContaining([
        'capacity must be a whole number from 1 to 100',
        'no active staff member “nobody@nowhere.ng”',
      ]),
    );

    const done = await admin.post(`/api/v1/academics/classes/import/${res.body.data.id}/commit`);
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ imported: 3, levels: 1, skipped: 4 });
    expect(done.body.message).toBe('3 arms imported. 4 rows skipped.');
    const added = await t.prisma.classArm.findMany({
      where: { schoolId, branchId: main.id, level: { name: NEW_LEVEL } },
      orderBy: { name: 'asc' },
    });
    expect(added.map((a) => [a.name, a.capacity, a.room])).toEqual([
      ['A', 30, 'Room 9'],
      ['B', 40, null],
    ]);
    // Committed once only.
    expect(
      (await admin.post(`/api/v1/academics/classes/import/${res.body.data.id}/commit`)).body.error
        .code,
    ).toBe('IMPORT_EXPIRED');
  });
});
