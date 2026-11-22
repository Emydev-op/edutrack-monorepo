import ExcelJS from 'exceljs';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

/**
 * Bulk-upload templates are Excel workbooks with the school's own choices as dropdowns on every
 * row (so no one types "male" or "jss1"), and a filled template uploads as it is.
 */
describe('Excel bulk-upload templates (e2e)', () => {
  let t: TestApp;
  let admin: Api;

  const download = async (path: string) => {
    const res = await admin
      .get(path)
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
    return wb;
  };
  /** The dropdown options for a column header (from the hidden Lists sheet). */
  const optionsOf = (wb: ExcelJS.Workbook, header: string) => {
    const lists = wb.getWorksheet('Lists')!;
    for (let c = 1; c <= lists.columnCount; c++) {
      const values = (lists.getColumn(c).values as unknown[]).filter(Boolean).map(String);
      if (values[0] === header) return values.slice(1);
    }
    return null;
  };
  const validationFor = (wb: ExcelJS.Workbook, sheet: string, cell: string) =>
    (
      wb.getWorksheet(sheet) as unknown as {
        dataValidations: {
          find(address: string): { type: string; formulae: string[] } | undefined;
        };
      }
    ).dataValidations.find(cell);

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  it('builds the student template with the school’s choices as dropdowns', async () => {
    const wb = await download('/api/v1/imports/template?branch=Main%20Campus');
    const sheet = wb.getWorksheet('Students')!;
    expect(sheet.getRow(1).values).toEqual(
      expect.arrayContaining(['surname*', 'gender*', 'class_level*', 'arm*', 'relationship']),
    );
    expect(optionsOf(wb, 'gender*')).toEqual(['Male', 'Female']);
    expect(optionsOf(wb, 'class_level*')).toEqual(expect.arrayContaining(['JSS 1', 'JSS 2']));
    expect(optionsOf(wb, 'arm*')).toEqual(expect.arrayContaining(['A', 'B']));
    expect(optionsOf(wb, 'state_of_origin')).toContain('Lagos');
    expect(optionsOf(wb, 'branch')).toEqual(
      expect.arrayContaining(['Main Campus', 'Lekki Campus']),
    );
    // Every row has the dropdown, not just the first.
    expect(validationFor(wb, 'Students', 'D500')).toMatchObject({ type: 'list' });
  });

  it('builds the staff template with type, branch, access and role dropdowns', async () => {
    const wb = await download('/api/v1/staff/import/template');
    expect(optionsOf(wb, 'type')).toEqual(['Teaching', 'Non-teaching']);
    expect(optionsOf(wb, 'portal_access')).toEqual(['Yes', 'No']);
    expect(optionsOf(wb, 'branch')).toContain('Main Campus');
    expect(optionsOf(wb, 'role')).toContain('Teacher');
    expect(optionsOf(wb, 'role')).not.toContain('Owner');
  });

  it('reads a filled Excel template as it is', async () => {
    const wb = await download('/api/v1/imports/template?branch=Main%20Campus');
    const sheet = wb.getWorksheet('Students')!;
    // Overwrite the example with two students (a real Excel date for one birthday).
    sheet.getRow(2).values = [
      'Okoro',
      'Ada',
      '',
      'Female',
      new Date(Date.UTC(2014, 4, 12)),
      'JSS 1',
      'A',
      'Mrs. Ngozi Okoro',
      '0803 555 0177',
      '',
      'Mother',
      'Enugu',
      '',
      'Main Campus',
    ];
    sheet.getRow(3).values = [
      'Bello',
      'Musa',
      '',
      'Male',
      '03/09/2013',
      'JSS 1',
      'A',
      '',
      '',
      '',
      '',
      'Kano',
      '',
      'Main Campus',
    ];
    const content = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const res = await admin
      .post('/api/v1/imports')
      .send({ fileName: 'intake.xlsx', text: content, branch: 'Main Campus' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ rows: 2, valid: 2 });
    const pdf = await admin
      .post('/api/v1/imports')
      .send({ fileName: 'intake.pdf', text: 'x', branch: 'Main Campus' });
    expect(pdf.body.error.code).toBe('IMPORT_FORMAT');
  });
});
