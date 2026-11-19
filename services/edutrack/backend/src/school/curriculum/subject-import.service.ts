import { HttpStatus, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AppException } from '../../common/errors/app.exception.js';
import type { SubjectCategory } from '../../generated/prisma/enums.js';
import { AcademicCatalogService } from '../academics/academic-catalog.service.js';
import { SchoolAuditService } from '../shared/school-audit.service.js';
import { SectionAccessService } from '../shared/section-access.service.js';
import { asTx } from '../shared/tenant-tx.js';
import { parseCsv } from '../staff/staff-view.js';
import { CATEGORY_BY_LABEL, CATEGORY_LABEL } from './curriculum-defaults.js';

const CODE = /^[A-Z]{2,4}\d?$/;
const MAX_ROWS = 300;
const SHARED = 'Shared (every section)';
const HEADERS = ['Subject name', 'Code', 'Section', 'Category', 'Lessons per week', 'Status'];

/** One subject row, as the school edits it in the preview. */
export interface SubjectImportRow {
  row: number;
  name: string;
  code: string;
  /** A section name, or empty for a subject shared by every section. */
  section: string;
  category: string;
  periods: number | string;
  status: string;
}

export interface SubjectImportIssue {
  field: 'name' | 'code' | 'section' | 'category' | 'periods' | 'status' | 'row';
  message: string;
}

/**
 * School Admin › Subjects › Bulk upload: an Excel template with dropdowns (sections, categories,
 * status), a preview the school can correct row by row, and an import that creates every row or
 * none. Duplicates are caught inside the file and against existing subjects: codes are unique in
 * the school, names unique within a section.
 */
@Injectable()
export class SubjectImportService {
  constructor(
    private readonly catalog: AcademicCatalogService,
    private readonly sectionAccess: SectionAccessService,
    private readonly audit: SchoolAuditService,
  ) {}

  private get db() {
    return this.catalog.db;
  }

  private async sections() {
    const [all, mine] = await Promise.all([
      this.catalog.structure.sections(),
      this.sectionAccess.mine(),
    ]);
    return { all, mine };
  }

  /** The .xlsx template: one sheet to fill in, dropdowns for the select columns. */
  async template(): Promise<Buffer> {
    const { all, mine } = await this.sections();
    const sectionNames = all.filter((s) => !mine || mine.has(s.id)).map((s) => s.name);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduTrack';
    const sheet = wb.addWorksheet('Subjects');
    const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });
    sheet.columns = HEADERS.map((header, i) => ({
      header,
      key: String(i),
      width: [32, 10, 26, 16, 18, 12][i],
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const sectionsList = [...sectionNames, ...(mine ? [] : [SHARED])];
    const categories = Object.values(CATEGORY_LABEL);
    lists.getColumn(1).values = ['Sections', ...sectionsList];
    lists.getColumn(2).values = ['Categories', ...categories];
    lists.getColumn(3).values = ['Status', 'Active', 'Inactive'];
    const list = (col: string, n: number) => `Lists!$${col}$2:$${col}$${n + 1}`;
    for (let r = 2; r <= MAX_ROWS + 1; r++) {
      const dropdown = (formula: string, prompt: string) => ({
        type: 'list' as const,
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: 'Choose from the list',
        error: prompt,
      });
      sheet.getCell(`C${r}`).dataValidation = dropdown(
        list('A', sectionsList.length),
        'Choose one of your sections.',
      );
      sheet.getCell(`D${r}`).dataValidation = dropdown(
        list('B', categories.length),
        'Choose a category.',
      );
      sheet.getCell(`F${r}`).dataValidation = dropdown(list('C', 2), 'Active or Inactive.');
      sheet.getCell(`E${r}`).dataValidation = {
        type: 'whole',
        operator: 'between',
        allowBlank: true,
        formulae: [1, 10],
        showErrorMessage: true,
        errorTitle: 'Lessons per week',
        error: 'Enter a whole number from 1 to 10.',
      };
    }
    // One example row, to be overwritten.
    sheet.addRow(['Mathematics', 'MTH', sectionsList[0] ?? '', 'Core', 5, 'Active']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Reads an uploaded .xlsx (base64) or .csv (text) into rows. */
  private async read(fileName: string, content: string): Promise<SubjectImportRow[]> {
    const lower = fileName.toLowerCase();
    let table: string[][];
    if (lower.endsWith('.xlsx')) {
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load(Buffer.from(content, 'base64') as unknown as ArrayBuffer);
      } catch {
        throw unprocessable(
          'That file isn’t a readable Excel workbook. Download the template again.',
        );
      }
      const sheet = wb.getWorksheet('Subjects') ?? wb.worksheets[0];
      if (!sheet) throw unprocessable('The workbook has no sheets.');
      table = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        table.push(
          HEADERS.map((_, i) => {
            const v = row.getCell(i + 1).value;
            if (v === null || v === undefined) return '';
            if (typeof v === 'object' && 'text' in v) return String(v.text);
            if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
            return String(v);
          }),
        );
      });
    } else if (lower.endsWith('.csv')) table = parseCsv(content);
    else throw unprocessable('Upload the template as .xlsx or .csv.');
    const [head, ...body] = table;
    const normal = (h: string) => h.trim().toLowerCase();
    if (!head || normal(head[0] ?? '') !== 'subject name')
      throw unprocessable('Use the template: its first column is “Subject name”.');
    const rows = body
      .map((cells, i) => ({ cells, row: i + 2 }))
      .filter(({ cells }) => cells.some((c) => (c ?? '').trim()));
    if (!rows.length) throw unprocessable('The file has no subjects in it.');
    if (rows.length > MAX_ROWS) throw unprocessable(`Upload up to ${MAX_ROWS} subjects at a time.`);
    return rows.map(({ cells, row }) => ({
      row,
      name: (cells[0] ?? '').trim(),
      code: (cells[1] ?? '').trim().toUpperCase(),
      section: (cells[2] ?? '').trim() === SHARED ? '' : (cells[2] ?? '').trim(),
      category: (cells[3] ?? '').trim(),
      periods: (cells[4] ?? '').trim(),
      status: (cells[5] ?? '').trim() || 'Active',
    }));
  }

  /** Checks every row; codes left blank get one suggested from the name. */
  private async check(rows: SubjectImportRow[]) {
    const [{ all, mine }, existing] = await Promise.all([
      this.sections(),
      this.db.subject.findMany({ select: { code: true, name: true, sectionId: true } }),
    ]);
    const sectionByName = new Map(all.map((s) => [s.name.toLowerCase(), s]));
    const sectionName = (id: string | null) => all.find((s) => s.id === id)?.name ?? 'Shared';
    const usedCodes = new Set(existing.map((s) => s.code));
    const codesInFile = new Map<string, number>();
    const namesInFile = new Map<string, number>();
    const checked = rows.map((r) => {
      const issues: SubjectImportIssue[] = [];
      const name = (r.name ?? '').trim();
      if (!name) issues.push({ field: 'name', message: 'Name the subject.' });
      else if (name.length > 80)
        issues.push({ field: 'name', message: 'Keep subject names under 80 characters.' });
      const section = r.section ? sectionByName.get(r.section.toLowerCase()) : null;
      if (r.section && !section)
        issues.push({ field: 'section', message: `${r.section} isn’t one of your sections.` });
      else if (mine && !(section && mine.has(section.id)))
        issues.push({
          field: 'section',
          message: section
            ? `You manage other sections, so you can’t add subjects to ${section.name}.`
            : 'Only a whole-school admin can add shared subjects. Choose your section.',
        });
      const category = CATEGORY_BY_LABEL[r.category] as SubjectCategory | undefined;
      if (!category)
        issues.push({
          field: 'category',
          message: `Choose a category: ${Object.values(CATEGORY_LABEL).join(', ')}.`,
        });
      const periods = Number(r.periods);
      if (!Number.isInteger(periods) || periods < 1 || periods > 10)
        issues.push({ field: 'periods', message: 'Lessons per week must be 1–10.' });
      if (!['Active', 'Inactive'].includes(r.status))
        issues.push({ field: 'status', message: 'Status is Active or Inactive.' });
      let code = (r.code ?? '').trim().toUpperCase();
      if (!code && name) code = suggestCode(name, (c) => usedCodes.has(c) || codesInFile.has(c));
      if (!CODE.test(code))
        issues.push({ field: 'code', message: 'Use 2–4 capitals for the code, e.g. MTH.' });
      else if (usedCodes.has(code)) {
        const owner = existing.find((s) => s.code === code)!;
        issues.push({ field: 'code', message: `${code} is already used by ${owner.name}.` });
      } else if (codesInFile.has(code))
        issues.push({ field: 'code', message: `${code} is also on row ${codesInFile.get(code)}.` });
      else codesInFile.set(code, r.row);
      const nameKey = `${section?.id ?? ''}|${name.toLowerCase()}`;
      if (name) {
        const clash = existing.find(
          (s) =>
            s.name.toLowerCase() === name.toLowerCase() && s.sectionId === (section?.id ?? null),
        );
        if (clash)
          issues.push({
            field: 'name',
            message: `${name} already exists in ${sectionName(clash.sectionId)}.`,
          });
        else if (namesInFile.has(nameKey))
          issues.push({
            field: 'name',
            message: `${name} is also on row ${namesInFile.get(nameKey)}.`,
          });
        else namesInFile.set(nameKey, r.row);
      }
      return {
        row: r.row,
        name,
        code,
        section: section?.name ?? '',
        category: r.category,
        periods: Number.isInteger(periods) ? periods : r.periods,
        status: r.status,
        issues,
        sectionId: section?.id ?? null,
        categoryKey: category,
      };
    });
    return checked;
  }

  private static view(checked: Awaited<ReturnType<SubjectImportService['check']>>) {
    const rows = checked.map(({ sectionId: _s, categoryKey: _c, ...r }) => r);
    const withIssues = rows.filter((r) => r.issues.length).length;
    return { rows, total: rows.length, ready: rows.length - withIssues, withIssues };
  }

  /** Reads the file and checks it, without saving anything. */
  async preview(fileName: string, content: string) {
    return SubjectImportService.view(await this.check(await this.read(fileName, content)));
  }

  /** Imports the (possibly corrected) rows: all of them, or none if any still has a problem. */
  async commit(schoolId: string, rows: SubjectImportRow[]) {
    if (!rows.length) throw unprocessable('There’s nothing to import.');
    if (rows.length > MAX_ROWS) throw unprocessable(`Import up to ${MAX_ROWS} subjects at a time.`);
    const checked = await this.check(rows);
    const bad = checked.filter((r) => r.issues.length);
    if (bad.length)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        `${bad.length} row${bad.length === 1 ? ' needs' : 's need'} fixing before the import.`,
        'IMPORT_HAS_ISSUES',
        // "<row>.<field>" → message, so the preview can mark each cell.
        Object.fromEntries(
          bad.flatMap((r) => r.issues.map((i) => [`${r.row}.${i.field}`, i.message])),
        ),
      );
    await this.db.$transaction(async (tx) => {
      await tx.subject.createMany({
        data: checked.map((r) => ({
          schoolId,
          code: r.code,
          name: r.name,
          category: r.categoryKey!,
          periodsPerWeek: Number(r.periods),
          sectionId: r.sectionId,
          status: r.status === 'Inactive' ? ('INACTIVE' as const) : ('ACTIVE' as const),
        })),
      });
      await this.audit.record(
        {
          action: 'subject.import',
          area: 'Academic',
          entity: 'Subject',
          summary: `${checked.length} subject${checked.length === 1 ? '' : 's'} imported`,
          detail: checked.map((r) => r.code).join(', '),
        },
        asTx(tx),
      );
    });
    return { imported: checked.length };
  }
}

const unprocessable = (message: string) =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, message, 'IMPORT_INVALID');

/** "Further Mathematics" → FMA (then FMT, FUR…, with a digit if all are taken). */
function suggestCode(name: string, taken: (code: string) => boolean): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.join('');
  const options = [
    words.length > 1
      ? words
          .map((w) => w[0])
          .join('')
          .slice(0, 3)
      : '',
    letters.slice(0, 3),
    words[0] && words[1] ? `${words[0].slice(0, 2)}${words[1][0]}` : '',
    letters.slice(0, 4),
  ].filter((c) => c.length >= 2);
  for (const c of options) if (!taken(c)) return c;
  const base = (options[0] ?? 'SUB').slice(0, 3);
  for (let i = 1; i <= 9; i++) if (!taken(`${base}${i}`)) return `${base}${i}`;
  return base;
}
