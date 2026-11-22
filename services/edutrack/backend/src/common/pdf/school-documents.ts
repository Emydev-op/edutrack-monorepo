import { StreamableFile } from '@nestjs/common';
import PDFDocument from 'pdfkit';

/**
 * Printable school documents (report cards and payment receipts) as A4 PDFs, drawn with pdfkit's
 * built-in Helvetica so nothing is fetched or bundled. Amounts print as "NGN 45,000": the naira
 * sign isn't in the standard PDF fonts.
 */

export interface DocSchool {
  name: string;
  motto?: string | null;
  address?: string | null;
  brandColor?: string | null;
}

export interface ReportCardDoc {
  school: DocSchool;
  title: string;
  student: { name: string; admissionNo: string; gender?: string | null; className: string };
  classTeacher?: string | null;
  components: string[];
  subjects: {
    name: string;
    scores: (string | number)[];
    total: string;
    grade: string;
    remark: string;
    position?: string | null;
  }[];
  average: string;
  grade: string;
  position?: string | null;
  nextTerm?: string | null;
  classTeacherRemark?: string | null;
  conduct?: { trait: string; rating: string | number | null }[];
  attendance?: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    schoolDays: number;
  } | null;
  cumulative?: unknown;
  publishedAt?: string | null;
  /** Prints a "Preview, not published" band (School Admin before publishing). */
  preview?: boolean;
  /** Nursery cards: a rating and comment per learning area, height, weight, head's comment. */
  mode?: 'scores' | 'descriptive';
  headTeacherRemark?: string | null;
  height?: number | null;
  weight?: number | null;
}

export interface ReceiptDoc {
  school: DocSchool;
  no: string;
  date: string;
  student: string;
  className: string;
  admissionNo?: string | null;
  payer?: string | null;
  method: string;
  reference?: string | null;
  account?: string | null;
  amount: number;
  allocations: { no: string; term: string; amount: number }[];
  unallocated: number;
  balanceNow: number;
  verifiedBy?: string | null;
  issuedAt: string;
}

const INK = '#1f1a17';
const MUTED = '#6b625c';
const LINE = '#e4dcd2';
const BRICK = '#b5452b';
const M = 40; // page margin
const W = 595.28 - M * 2; // A4 content width

export function naira(n: number) {
  const v = Math.round(n * 100) / 100;
  return `${v < 0 ? '-' : ''}NGN ${Math.abs(v).toLocaleString('en-NG', {
    minimumFractionDigits: v % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function brand(school: DocSchool) {
  return /^#[0-9a-f]{6}$/i.test(school.brandColor ?? '') ? school.brandColor! : BRICK;
}

function toBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function newDoc(title: string, school: DocSchool) {
  return new PDFDocument({
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: { Title: title, Author: school.name, Creator: 'EduTrack' },
  });
}

/** The school's header band: name, motto, address, then the document title. */
function header(doc: PDFKit.PDFDocument, school: DocSchool, title: string, right?: string) {
  const color = brand(school);
  doc.rect(0, 0, 595.28, 6).fill(color);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(school.name, M, M, { width: W });
  if (school.motto)
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(school.motto, { width: W });
  if (school.address)
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(school.address, { width: W });
  doc.moveDown(0.6);
  const y = doc.y;
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(color)
    .text(title, M, y, { width: W * 0.7 });
  if (right)
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(right, M + W * 0.5, y + 2, { width: W * 0.5, align: 'right' });
  doc.moveDown(0.4);
  rule(doc);
}

function rule(doc: PDFKit.PDFDocument, gap = 0.5) {
  doc
    .moveTo(M, doc.y)
    .lineTo(M + W, doc.y)
    .lineWidth(0.6)
    .strokeColor(LINE)
    .stroke();
  doc.moveDown(gap);
}

/** Label/value pairs laid out in columns. */
function facts(doc: PDFKit.PDFDocument, pairs: [string, string][], cols = 2, width = W) {
  const colW = width / cols;
  const top = doc.y;
  let rowY = top;
  pairs.forEach(([label, value], i) => {
    const col = i % cols;
    if (col === 0 && i > 0) rowY += 28;
    const x = M + col * colW;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(label.toUpperCase(), x, rowY, {
        width: colW - 8,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(value || '—', x, rowY + 10, { width: colW - 8, lineBreak: false, ellipsis: true });
  });
  doc.y = rowY + 30;
  doc.x = M;
}

interface Col {
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

/** A simple table that breaks onto new pages and repeats its header. */
function table(doc: PDFKit.PDFDocument, cols: Col[], rows: string[][], color: string) {
  const total = cols.reduce((s, c) => s + c.width, 0);
  const widths = cols.map((c) => (c.width / total) * W);
  const drawHead = () => {
    const y = doc.y;
    doc.rect(M, y, W, 18).fill(color);
    let x = M;
    cols.forEach((c, i) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#ffffff')
        .text(c.label, x + 4, y + 5, { width: widths[i]! - 8, align: c.align ?? 'left' });
      x += widths[i]!;
    });
    doc.y = y + 18;
  };
  drawHead();
  rows.forEach((row, r) => {
    doc.font('Helvetica').fontSize(9);
    const h =
      Math.max(...row.map((v, i) => doc.heightOfString(v || '—', { width: widths[i]! - 8 }))) + 8;
    if (doc.y + h > 841.89 - M - 20) {
      doc.addPage();
      drawHead();
    }
    const y = doc.y;
    if (r % 2) doc.rect(M, y, W, h).fill('#faf6f1');
    let x = M;
    row.forEach((v, i) => {
      doc
        .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor(INK)
        .text(v || '—', x + 4, y + 4, { width: widths[i]! - 8, align: cols[i]!.align ?? 'left' });
      x += widths[i]!;
    });
    doc.y = y + h;
  });
  doc.x = M;
  doc.moveDown(0.6);
}

function section(doc: PDFKit.PDFDocument, title: string, need = 60) {
  if (doc.y + need > 841.89 - M) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(title, M, doc.y, { width: W });
  doc.moveDown(0.3);
}

function footer(doc: PDFKit.PDFDocument, text: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise start a new page.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`${text} · Page ${i + 1} of ${range.count}`, M, 841.89 - M + 12, {
        width: W,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }
}

/** A student's term report card, from the snapshot frozen at publishing. */
export function reportCardPdf(input: ReportCardDoc, photo?: Buffer | null): Promise<Buffer> {
  // Older snapshots may lack parts: print what's there.
  const card: ReportCardDoc = {
    ...input,
    school: input.school ?? { name: '' },
    title: input.title ?? 'Report card',
    student: input.student ?? { name: '', admissionNo: '', className: '' },
    components: input.components ?? [],
    subjects: (input.subjects ?? []).map((x) => ({ ...x, scores: x.scores ?? [] })),
    average: input.average ?? '—',
    grade: input.grade ?? '—',
  };
  const doc = newDoc(`${card.student.name} · ${card.title}`, card.school);
  const color = brand(card.school);
  header(doc, card.school, card.title, card.publishedAt ? `Published ${card.publishedAt}` : '');
  if (card.preview) {
    doc.rect(M, doc.y, W, 18).fill('#fdf0e6');
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(BRICK)
      .text('PREVIEW · NOT PUBLISHED. Scores may still change.', M, doc.y + 5, {
        width: W,
        align: 'center',
      });
    doc.y += 10;
    doc.moveDown(0.6);
  }
  // The student's photo, when the school has one, beside their details.
  const PHOTO_W = 64;
  const PHOTO_H = 80;
  const top = doc.y;
  let pictured = false;
  if (photo)
    try {
      doc.image(photo, M + W - PHOTO_W, top, { fit: [PHOTO_W, PHOTO_H], align: 'center' });
      doc
        .rect(M + W - PHOTO_W, top, PHOTO_W, PHOTO_H)
        .lineWidth(0.6)
        .strokeColor(LINE)
        .stroke();
      pictured = true;
    } catch {
      // Not an image pdfkit can read: leave it out.
    }
  facts(
    doc,
    [
      ['Student', card.student.name],
      ['Admission number', card.student.admissionNo],
      ['Class', card.student.className],
      ['Class teacher', card.classTeacher ?? ''],
      ...((card.mode === 'descriptive'
        ? [
            ['Height', card.height != null ? `${card.height} cm` : 'Not recorded'],
            ['Weight', card.weight != null ? `${card.weight} kg` : 'Not recorded'],
          ]
        : [
            [
              'Average',
              `${card.average}${card.grade && card.grade !== '—' ? ` (${card.grade})` : ''}`,
            ],
            ['Position', card.position ?? 'Not shown'],
          ]) as [string, string][]),
    ],
    3,
    pictured ? W - PHOTO_W - 12 : W,
  );
  if (pictured && doc.y < top + PHOTO_H + 8) doc.y = top + PHOTO_H + 8;

  const hasPos = card.subjects.some((s) => s.position);
  if (card.mode === 'descriptive') {
    section(doc, 'Learning areas');
    table(
      doc,
      [
        { label: 'Learning area', width: 3 },
        { label: 'Rating', width: 2 },
        { label: 'Comment', width: 4 },
      ],
      card.subjects.map((s) => [s.name, s.grade, s.remark]),
      color,
    );
  } else {
    section(doc, 'Subjects');
    table(
      doc,
      [
        { label: 'Subject', width: 3 },
        ...card.components.map((c) => ({ label: c, width: 1.2, align: 'center' as const })),
        { label: 'Total', width: 1, align: 'center' },
        { label: 'Grade', width: 0.9, align: 'center' },
        ...(hasPos ? [{ label: 'Position', width: 1.3, align: 'center' as const }] : []),
        { label: 'Remark', width: 2 },
      ],
      card.subjects.map((s) => [
        s.name,
        ...card.components.map((_, i) => String(s.scores[i] ?? '—')),
        s.total,
        s.grade,
        ...(hasPos ? [s.position ?? '—'] : []),
        s.remark,
      ]),
      color,
    );
  }

  const cum = cumulativeRows(card.cumulative);
  if (cum) {
    section(doc, 'Cumulative (whole session)');
    table(doc, cum.cols, cum.rows, color);
  }

  if (card.attendance) {
    section(doc, 'Attendance');
    const a = card.attendance;
    facts(
      doc,
      [
        ['School days', String(a.schoolDays)],
        ['Present', String(a.present)],
        ['Late', String(a.late)],
        ['Absent', String(a.absent)],
        ['Excused', String(a.excused)],
      ],
      5,
    );
  }

  const conduct = (card.conduct ?? []).filter((c) => c.rating !== null);
  if (conduct.length) {
    section(doc, 'Conduct');
    facts(
      doc,
      conduct.map((c) => [c.trait, String(c.rating)]),
      4,
    );
  }

  section(doc, 'Class teacher’s remark', 50);
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(INK)
    .text(card.classTeacherRemark || 'No remark.', M, doc.y, { width: W });
  doc.moveDown(0.8);
  if (card.headTeacherRemark) {
    section(doc, 'Head teacher’s comment', 50);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(INK)
      .text(card.headTeacherRemark, M, doc.y, { width: W });
    doc.moveDown(0.8);
  }
  if (card.nextTerm) {
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(INK)
      .text(card.nextTerm, M, doc.y, { width: W });
    doc.moveDown(1.2);
  }
  // Signature lines.
  if (doc.y + 50 > 841.89 - M) doc.addPage();
  const y = doc.y + 24;
  for (const [i, label] of ['Class teacher', 'Principal / Head teacher'].entries()) {
    const x = M + i * (W / 2 + 10);
    doc
      .moveTo(x, y)
      .lineTo(x + W / 2 - 10, y)
      .lineWidth(0.6)
      .strokeColor(MUTED)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(label, x, y + 4);
  }
  footer(doc, `${card.school.name} · Generated by EduTrack`);
  return toBuffer(doc);
}

/** The snapshot's whole-session block (third term): each subject's term totals and average. */
function cumulativeRows(c: unknown): { cols: Col[]; rows: string[][] } | null {
  const v = c as {
    terms?: string[];
    subjects?: { name: string; totals: (number | null)[]; average: number | null }[];
    average?: number | null;
  } | null;
  if (!v?.subjects?.length) return null;
  const terms = v.terms ?? [];
  const n = (x: number | null | undefined) => (x === null || x === undefined ? '—' : x.toFixed(1));
  const cols: Col[] = [
    { label: 'Subject', width: 3 },
    ...terms.map((t) => ({ label: t, width: 1.3, align: 'center' as const })),
    { label: 'Average', width: 1.2, align: 'center' },
  ];
  const rows = v.subjects.map((s) => [
    s.name,
    ...terms.map((_, i) => n(s.totals[i])),
    n(s.average),
  ]);
  rows.push(['Overall', ...terms.map(() => ''), n(v.average)]);
  return { cols, rows };
}

/** An official receipt for a confirmed payment. */
export function receiptPdf(r: ReceiptDoc): Promise<Buffer> {
  const doc = newDoc(`Receipt ${r.no}`, r.school);
  const color = brand(r.school);
  header(doc, r.school, 'Payment receipt', `Receipt no. ${r.no}`);
  facts(
    doc,
    [
      ['Received from', r.payer || 'Parent / guardian'],
      ['Date received', r.date],
      ['For student', r.student],
      ['Class', r.className],
      ['Admission number', r.admissionNo ?? ''],
      ['Payment method', [r.method, r.reference].filter(Boolean).join(' · ')],
    ],
    2,
  );
  doc.rect(M, doc.y, W, 44).fill('#faf6f1');
  const boxY = doc.y;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text('AMOUNT RECEIVED', M + 12, boxY + 8);
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(color)
    .text(naira(r.amount), M + 12, boxY + 19);
  doc.y = boxY + 56;
  doc.x = M;

  section(doc, 'Applied to');
  const rows = r.allocations.map((a) => [a.no, a.term, naira(a.amount)]);
  if (r.unallocated > 0) rows.push(['Credit on account', '', naira(r.unallocated)]);
  table(
    doc,
    [
      { label: 'Invoice', width: 2 },
      { label: 'Term', width: 3 },
      { label: 'Amount', width: 2, align: 'right' },
    ],
    rows.length ? rows : [['—', 'Not applied yet', naira(r.amount)]],
    color,
  );
  facts(
    doc,
    [
      ['Outstanding balance after this payment', naira(Math.max(0, r.balanceNow))],
      ['Paid into', r.account ?? ''],
    ],
    2,
  );
  if (r.verifiedBy) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Confirmed by ${r.verifiedBy}.`, M, doc.y, { width: W });
    doc.moveDown(0.5);
  }
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      'This receipt was generated by EduTrack from the school’s records. Keep it for your records.',
      M,
      doc.y + 6,
      { width: W },
    );
  footer(doc, `${r.school.name} · Issued ${r.issuedAt}`);
  return toBuffer(doc);
}

/** Sends a generated PDF as a download (routes marked `@RawResponse()`). */
export function pdfFile(doc: { file: Buffer; name: string }) {
  return new StreamableFile(doc.file, {
    type: 'application/pdf',
    disposition: `attachment; filename="${doc.name}"`,
  });
}

/** A safe download name: "Emmanuel-Adeyemi-First-Term-2026-2027.pdf". */
export function pdfName(label: string) {
  return `${label.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
}
