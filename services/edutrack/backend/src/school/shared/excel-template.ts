import { HttpStatus } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AppException } from '../../common/errors/app.exception.js';

/** Rows of a bulk-upload template that get the column's dropdown and checks. */
export const TEMPLATE_ROWS = 2000;

export interface TemplateColumn {
  /** The header the import reads (e.g. "gender*"). */
  header: string;
  width?: number;
  /** A dropdown on every row: only these values can be chosen. */
  options?: string[];
  /** Shown when the cell is selected (a short hint, e.g. "DD/MM/YYYY"). */
  hint?: string;
}

const letter = (i: number) => {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/**
 * A bulk-upload template as an Excel workbook: the columns with a frozen bold header, a dropdown
 * of the school's own options on every row of each choice column (from a hidden "Lists" sheet,
 * so long lists like states and classes work), hints, and example rows to overwrite.
 */
export async function buildTemplate(
  sheetName: string,
  columns: TemplateColumn[],
  examples: (string | number)[][] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduTrack';
  const sheet = wb.addWorksheet(sheetName);
  const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });
  sheet.columns = columns.map((c, i) => ({
    header: c.header,
    key: String(i),
    width: c.width ?? Math.max(14, c.header.length + 4),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of examples) sheet.addRow(row);

  // Range-wide validation (one rule per column instead of one per cell): in exceljs at runtime,
  // missing from its type definitions.
  const validations = (
    sheet as unknown as {
      dataValidations: { add(range: string, rule: Record<string, unknown>): void };
    }
  ).dataValidations;
  let listCol = 0;
  for (const [i, c] of columns.entries()) {
    const col = letter(i);
    const range = `${col}2:${col}${TEMPLATE_ROWS + 1}`;
    if (c.options?.length) {
      const lc = letter(listCol++);
      lists.getColumn(lc).values = [c.header, ...c.options];
      validations.add(range, {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${lc}$2:$${lc}$${c.options.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Choose from the list',
        error: `Pick one of the options for ${c.header.replace(/\*.*$/, '')}.`,
        showInputMessage: !!c.hint,
        promptTitle: c.hint ? c.header.replace(/\*.*$/, '') : undefined,
        prompt: c.hint,
      });
    } else if (c.hint) {
      validations.add(range, {
        type: 'any',
        allowBlank: true,
        showInputMessage: true,
        promptTitle: c.header.replace(/\*.*$/, ''),
        prompt: c.hint,
      });
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A cell as the import reads it: dates as DD/MM/YYYY, numbers and text as typed. */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const d = String(v.getUTCDate()).padStart(2, '0');
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${v.getUTCFullYear()}`;
  }
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text; // hyperlink
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue); // formula
    return '';
  }
  return String(v).trim();
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * The upload's text for the CSV readers: a filled `.xlsx` template (sent as base64) becomes CSV
 * from its first sheet; a CSV is returned as it is.
 */
export async function importText(fileName: string, content: string): Promise<string> {
  if (!/\.xlsx$/i.test(fileName.trim())) return content;
  const wb = new ExcelJS.Workbook();
  const base64 = content.replace(/^data:[^,]*,/, '');
  try {
    await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer);
  } catch {
    throw new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'This isn’t a readable Excel file. Download the template again and fill it in.',
      'IMPORT_FORMAT',
    );
  }
  const sheet = wb.worksheets.find((w) => w.state !== 'veryHidden' && w.state !== 'hidden');
  if (!sheet) return '';
  const width = sheet.columnCount;
  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = Array.from({ length: width }, (_, i) => cellText(row.getCell(i + 1).value));
    if (cells.some((c) => c !== '')) lines.push(cells.map(csvCell).join(','));
  });
  return lines.join('\n');
}
