import type { TenantTx } from '../shared/tenant-tx.js';

/**
 * What each student owes in naira on issued invoices (every term, so earlier balances carry
 * forward), from the invoices' stored totals, kept in step with payments by `FinanceCore`. For
 * modules outside Finance: promotion's fee block and results publishing's report-card holds.
 */
export async function outstandingBalances(
  db: Pick<TenantTx, 'invoice'>,
  studentIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>(studentIds.map((id) => [id, 0]));
  if (!studentIds.length) return out;
  const rows = await db.invoice.findMany({
    where: { studentId: { in: studentIds }, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
    select: { studentId: true, totalKobo: true, paidKobo: true },
  });
  for (const r of rows) {
    const owed = r.totalKobo - r.paidKobo;
    if (owed > 0n) out.set(r.studentId, (out.get(r.studentId) ?? 0) + Number(owed) / 100);
  }
  return out;
}
