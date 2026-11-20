import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context.js';
import type { CommsEventKey } from '../communication/comms-catalog.js';
import {
  CommsDispatchService,
  type CommsRecipient,
} from '../communication/comms-dispatch.service.js';
import { asTx, type TenantTx } from '../shared/tenant-tx.js';
import type { FinStudent } from './finance-data.js';
import { daysBetween, money, plural } from './finance-format.js';
import type { FinView } from './finance-view.js';

/** One fee payer message: the student it is about and their template variables. */
export interface FeeMessage {
  studentKey: string;
  vars: Record<string, string>;
}

const fmtDue = (isoDay: string) =>
  new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Tells fee payers about invoices, reminders, payment details, receipts, rejected transfers and
 * refunds, through Communication (the school's event switches, channels and wording; SMS uses
 * the school's prepaid units). Runs inside the finance write's transaction; call the returned
 * `flush` after it commits so email and SMS go out only for saved changes.
 */
@Injectable()
export class FinanceNotifyService {
  constructor(private readonly comms: CommsDispatchService) {}

  /** `account_details` and `reference` for a student's fee payer. */
  payVars(view: FinView, s: FinStudent, balance: number) {
    const to = view.payTo(s, balance);
    return {
      account_details: to ? `${to.bank} ${to.accountNumber} (${to.accountName})` : 'the school',
      reference: to?.reference ?? s.admissionNo,
    };
  }

  invoiceVars(view: FinView, invoiceId: string) {
    const inv = view.fin.invoices.find((i) => i.id === invoiceId)!;
    const s = view.students.get(inv.studentKey)!;
    const term = view.terms.find((t) => t.id === inv.termId);
    const st = view.ledger.invoice(inv.id);
    return {
      invoice_no: inv.no,
      amount: money(st.total),
      balance: money(st.balance),
      due_date: fmtDue(inv.dueOn),
      days_overdue: String(Math.max(0, daysBetween(inv.dueOn, view.today))),
      term: term ? `${term.session} ${term.name}` : '',
      ...this.payVars(view, s, view.outstandingOf(s.key)),
    };
  }

  /**
   * Sends one event to the fee payers of these students (one message, a recipient per payer and
   * student). Students without a guardian are skipped. Returns how many payers it reached.
   */
  async send(
    tx: TenantTx,
    view: FinView,
    event: CommsEventKey,
    title: string,
    messages: FeeMessage[],
  ): Promise<{ recipients: number; flush: () => Promise<void> }> {
    const none = { recipients: 0, flush: () => Promise.resolve() };
    const withPayer = messages.filter((m) => view.students.get(m.studentKey)?.payerGuardianId);
    if (!withPayer.length) return none;
    const guardianIds = [
      ...new Set(withPayer.map((m) => view.students.get(m.studentKey)!.payerGuardianId!)),
    ];
    const guardians = await tx.guardian.findMany({
      where: { id: { in: guardianIds } },
      select: {
        id: true,
        title: true,
        fullName: true,
        email: true,
        phone: true,
        membership: { select: { userId: true, status: true } },
      },
    });
    const byId = new Map(guardians.map((g) => [g.id, g]));
    const recipients: CommsRecipient[] = [];
    for (const m of withPayer) {
      const s = view.students.get(m.studentKey)!;
      const g = byId.get(s.payerGuardianId!);
      if (!g) continue;
      const name = [g.title, g.fullName].filter(Boolean).join(' ');
      recipients.push({
        key: `${g.id}#${s.key}`,
        role: 'PARENT',
        name,
        userId: g.membership?.status === 'ACTIVE' ? g.membership.userId : null,
        guardianId: g.id,
        studentId: s.key,
        email: g.email,
        phone: g.phone,
        vars: {
          parent_name: name,
          student_name: s.name,
          first_name: s.firstName,
          ...m.vars,
        },
        entity: { type: 'Student', id: s.key },
      });
    }
    if (!recipients.length) return none;
    const payers = new Set(recipients.map((r) => r.guardianId)).size;
    const sent = await this.comms.dispatch(asTx(tx), view.fin.schoolId, {
      event,
      title,
      audienceLabel:
        recipients.length === 1 ? recipients[0]!.name : `${plural(payers, 'fee payer')}`,
      recipients,
      createdById: RequestContext.get()?.userId ?? null,
      source: { type: 'Finance', id: messages[0]!.studentKey },
      inApp: { category: 'finance', link: '/fees' },
    });
    return { recipients: payers, flush: sent.flush };
  }
}
