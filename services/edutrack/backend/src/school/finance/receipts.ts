import { AppException } from '../../common/errors/app.exception.js';
import { receiptPdf, type DocSchool } from '../../common/pdf/school-documents.js';
import { shortDate } from './finance-format.js';
import type { PaymentRec } from './finance-data.js';
import type { FinView } from './finance-view.js';
import type { TenantTx } from '../shared/tenant-tx.js';

/** The school's name, motto, address and brand colour for a printed document. */
export async function documentSchool(
  db: TenantTx,
  schoolId: string,
  /** The student's campus: its own colour and address replace the school's. */
  branchId?: string | null,
): Promise<DocSchool> {
  const s = await db.school.findUnique({
    where: { id: schoolId },
    select: {
      name: true,
      motto: true,
      street: true,
      city: true,
      state: true,
      phone: true,
      email: true,
      brandColor: true,
    },
  });
  const b = branchId
    ? await db.branch.findFirst({
        where: { id: branchId },
        select: {
          street: true,
          city: true,
          state: true,
          phone: true,
          email: true,
          brandColor: true,
        },
      })
    : null;
  const at = b?.street ? b : s;
  return {
    name: s?.name ?? 'School',
    motto: s?.motto ?? null,
    address: [
      [at?.street, at?.city, at?.state].filter(Boolean).join(', '),
      [b?.phone ?? s?.phone, b?.email ?? s?.email].filter(Boolean).join(' · '),
    ]
      .filter(Boolean)
      .join(' · '),
    brandColor: b?.brandColor ?? s?.brandColor ?? null,
  };
}

/**
 * A confirmed payment's receipt as a PDF (School Admin › Finance and the Parent Portal). Pending
 * and rejected payments have no receipt yet: the money isn't confirmed.
 */
export async function paymentReceipt(v: FinView, p: PaymentRec, school: DocSchool, now: Date) {
  if (p.status !== 'Confirmed')
    throw AppException.conflict(
      p.status === 'Rejected'
        ? 'This payment was rejected, so there’s no receipt.'
        : 'The receipt is ready once the school confirms this payment.',
      'RECEIPT_NOT_READY',
    );
  const s = v.fin.students.get(p.studentKey);
  const row = v.paymentRow(p);
  const file = await receiptPdf({
    school,
    no: p.no,
    date: shortDate(p.date),
    student: row.student,
    className: row.className,
    admissionNo: s?.admissionNo ?? null,
    payer: p.payer,
    method: p.method,
    reference: p.reference,
    account: row.account,
    amount: p.amount,
    allocations: p.allocations.map((a) => {
      const inv = v.fin.invoices.find((i) => i.id === a.invoiceId);
      const t = inv && v.terms.find((x) => x.id === inv.termId);
      return {
        no: inv?.no ?? '',
        term: t ? `${t.name} · ${t.session}` : '',
        amount: a.amount,
      };
    }),
    unallocated: row.unallocated,
    balanceNow: v.outstandingOf(p.studentKey),
    verifiedBy: p.verifiedBy,
    issuedAt: now.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Lagos',
    }),
  });
  return { file, name: `Receipt-${p.no.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf` };
}
