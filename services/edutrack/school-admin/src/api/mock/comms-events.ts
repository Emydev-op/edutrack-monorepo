/**
 * Automatic messages raised by other modules (Finance, Students, Staff, Academics). Each helper
 * sends through the messaging core, so the school's channel settings, templates, quiet hours and
 * SMS credit all apply, and the result shows up in Delivery Logs.
 */
import { routesPath as r } from '@/router/routes-path';
import type { TimelineEntry } from '@/types';

import {
  channelSummary,
  classRecipients,
  commsDate,
  commsNaira,
  dispatch,
  guardianRecipient,
  notifyPayers,
  staffRecipient,
  type MessageRec,
} from './comms-db';
import {
  financeData,
  termsOf,
  type InvoiceRec,
  type PaymentRec,
  type RefundRec,
} from './finance-db';
import { buildLedger, isoToday } from './finance-ledger';

function ledgerOf(schoolId: string) {
  const fin = financeData[schoolId]!;
  const terms = termsOf(schoolId);
  const ledger = buildLedger(fin, (id) => terms.find((t) => t.id === id)?.start ?? isoToday());
  const students = fin.studentIndex();
  const owed = (key: string) =>
    fin.invoices
      .filter((i) => i.studentKey === key && i.status === 'Issued')
      .reduce((n, i) => n + ledger.invoice(i.id).balance, 0);
  return { fin, terms, ledger, students, owed };
}

/** Rewrites the latest history line so it says how the payer was actually told. */
function noteHow(history: TimelineEntry[], msg: MessageRec | null, title?: string) {
  const h = history[history.length - 1];
  if (!h) return;
  const how = channelSummary(msg);
  h.detail = (h.detail ?? '').replace(/(SMS and email|Email and SMS|SMS · Email)/i, how);
  if (!msg && title) h.title = title;
}

export function invoicesIssued(schoolId: string, invoices: InvoiceRec[], by: string) {
  const L = ledgerOf(schoolId);
  const list = invoices.filter((i) => i.status === 'Issued' && i.notified);
  if (!list.length) return null;
  const term = L.terms.find((t) => t.id === list[0]!.termId);
  const msg = notifyPayers(schoolId, {
    event: 'invoice.issued',
    title:
      list.length > 1
        ? `Invoices issued · ${term ? `${term.name} ${term.session}` : ''}`.trim()
        : `Invoice issued · ${list[0]!.no}`,
    by,
    source:
      list.length > 1
        ? { label: 'Invoices', to: { name: r.finance.invoices.name } }
        : {
            label: list[0]!.no,
            to: { name: r.finance.invoiceDetail.name, params: { id: list[0]!.id } },
          },
    students: list.flatMap((inv) => {
      const s = L.students.get(inv.studentKey);
      const t = L.terms.find((x) => x.id === inv.termId);
      return s
        ? [
            {
              student: s,
              vars: {
                invoice_no: inv.no,
                amount: commsNaira(L.ledger.invoice(inv.id).total),
                due_date: commsDate(inv.dueOn),
                term: t ? `${t.session} ${t.name}` : '',
              },
            },
          ]
        : [];
    }),
  });
  for (const inv of list) noteHow(inv.history, msg, 'Issued · fee payer not notified');
  return msg;
}

export function feeReminders(schoolId: string, invoices: InvoiceRec[], by: string) {
  const L = ledgerOf(schoolId);
  const today = isoToday();
  const groups = { overdue: [] as InvoiceRec[], due: [] as InvoiceRec[] };
  for (const inv of invoices)
    (L.ledger.invoice(inv.id).overdue ? groups.overdue : groups.due).push(inv);
  const sent: MessageRec[] = [];
  for (const [kind, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const overdue = kind === 'overdue';
    const msg = notifyPayers(schoolId, {
      event: overdue ? 'fee.overdue' : 'fee.reminder',
      title:
        list.length > 1
          ? overdue
            ? 'Overdue fee reminder'
            : 'Fee reminder'
          : `${overdue ? 'Overdue fee reminder' : 'Fee reminder'} · ${list[0]!.no}`,
      by,
      source:
        list.length > 1
          ? { label: 'Invoices', to: { name: r.finance.invoices.name } }
          : {
              label: list[0]!.no,
              to: { name: r.finance.invoiceDetail.name, params: { id: list[0]!.id } },
            },
      students: list.flatMap((inv) => {
        const s = L.students.get(inv.studentKey);
        const st = L.ledger.invoice(inv.id);
        return s
          ? [
              {
                student: s,
                vars: {
                  balance: commsNaira(st.balance),
                  due_date: commsDate(inv.dueOn),
                  days_overdue: String(
                    Math.max(
                      1,
                      Math.round(
                        (new Date(today).getTime() - new Date(inv.dueOn).getTime()) / 86_400_000,
                      ),
                    ),
                  ),
                },
              },
            ]
          : [];
      }),
    });
    for (const inv of list)
      noteHow(inv.history, msg, 'Reminder not sent · reminders are switched off');
    if (msg) sent.push(msg);
  }
  return sent;
}

export function paymentDetailsSent(schoolId: string, studentKey: string, by: string) {
  const L = ledgerOf(schoolId);
  const s = L.students.get(studentKey);
  if (!s) return null;
  return notifyPayers(schoolId, {
    event: 'payment.details',
    title: `Payment details · ${s.name}`,
    by,
    source: { label: s.name, to: { name: r.finance.studentAccount.name, params: { key: s.key } } },
    students: [{ student: s, vars: { balance: commsNaira(L.owed(s.key)) } }],
  });
}

export function paymentsConfirmed(schoolId: string, payments: PaymentRec[], by: string) {
  if (!payments.length) return [];
  const L = ledgerOf(schoolId);
  const out: MessageRec[] = [];
  for (const p of payments) {
    const s = L.students.get(p.studentKey);
    if (!s) continue;
    const msg = notifyPayers(schoolId, {
      event: 'payment.confirmed',
      title: `Payment received · ${commsNaira(p.amount)}`,
      by,
      source: { label: p.no, to: { name: r.finance.paymentDetail.name, params: { id: p.id } } },
      students: [
        {
          student: s,
          vars: {
            amount: commsNaira(p.amount),
            receipt_no: p.no,
            balance: commsNaira(L.owed(s.key)),
          },
        },
      ],
    });
    if (msg) out.push(msg);
  }
  return out;
}

export function paymentRejected(schoolId: string, p: PaymentRec, by: string) {
  const L = ledgerOf(schoolId);
  const s = L.students.get(p.studentKey);
  if (!s) return null;
  return notifyPayers(schoolId, {
    event: 'payment.rejected',
    title: `Payment not confirmed · ${commsNaira(p.amount)}`,
    by,
    source: { label: p.no, to: { name: r.finance.paymentDetail.name, params: { id: p.id } } },
    students: [{ student: s, vars: { amount: commsNaira(p.amount), reason: p.rejectReason } }],
  });
}

export function refundPaid(schoolId: string, rf: RefundRec, by: string) {
  const L = ledgerOf(schoolId);
  const s = L.students.get(rf.studentKey);
  if (!s) return null;
  return notifyPayers(schoolId, {
    event: 'refund.paid',
    title: `Refund paid · ${rf.no}`,
    by,
    source: { label: rf.no, to: { name: r.finance.refundDetail.name, params: { id: rf.id } } },
    students: [{ student: s, vars: { amount: commsNaira(rf.amount), refund_no: rf.no } }],
  });
}

export function staffInvited(
  schoolId: string,
  person: { id: string; name: string; email: string; phone: string },
  role: string,
  by: string,
  userId?: string,
) {
  return dispatch(schoolId, {
    event: 'staff.invitation',
    title: 'Staff invitation',
    audience: person.name,
    by,
    recipients: [staffRecipient(person, { role, invite_link: 'https://app.edutrack.ng/i/…' })],
    source: userId
      ? { label: person.name, to: { name: r.school.user.name, params: { id: userId } } }
      : { label: person.name, to: { name: r.staff.detail.name, params: { id: person.id } } },
  });
}

type Guardian = { id: string; name: string; email: string; phone: string; portal: string };

export function guardianInvited(schoolId: string, g: Guardian, children: string[], by: string) {
  return dispatch(schoolId, {
    event: 'parent.invitation',
    title: 'Parent Portal invitation',
    audience: g.name,
    by,
    recipients: [
      guardianRecipient(g, {
        children:
          children.length > 1
            ? `${children.slice(0, -1).join(', ')} and ${children[children.length - 1]}`
            : (children[0] ?? 'your child'),
        invite_link: 'https://parents.edutrack.ng/i/…',
      }),
    ],
    source: { label: g.name, to: { name: r.students.parent.name, params: { id: g.id } } },
  });
}

export function studentAdmitted(
  schoolId: string,
  g: Guardian,
  student: { id: string; name: string; admissionNo: string; className: string },
  by: string,
) {
  return dispatch(schoolId, {
    event: 'admission',
    title: `Admission · ${student.name}`,
    audience: g.name,
    by,
    recipients: [
      guardianRecipient(g, {
        student_name: student.name,
        admission_no: student.admissionNo,
        class: student.className,
      }),
    ],
    source: {
      label: student.name,
      to: { name: r.students.detail.name, params: { id: student.id } },
    },
  });
}

export function studentExited(
  schoolId: string,
  guardians: Guardian[],
  student: { id: string; name: string },
  kind: string,
  effective: string,
  by: string,
) {
  if (!guardians.length) return null;
  return dispatch(schoolId, {
    event: 'student.exit',
    title: `${kind === 'Transfer' ? 'Transfer' : 'Withdrawal'} · ${student.name}`,
    audience: guardians.length === 1 ? guardians[0]!.name : `${guardians.length} guardians`,
    by,
    recipients: guardians.map((g) =>
      guardianRecipient(g, {
        student_name: student.name,
        kind: kind === 'Transfer' ? 'transfer' : 'withdrawal',
        effective_date: effective,
      }),
    ),
    source: {
      label: student.name,
      to: { name: r.students.detail.name, params: { id: student.id } },
    },
  });
}

export function resultsPublished(
  schoolId: string,
  classLabel: string,
  term: string,
  session: string,
  by: string,
) {
  const recipients = classRecipients(schoolId, classLabel, []);
  return dispatch(schoolId, {
    event: 'result.published',
    title: `Result published · ${classLabel} ${term}`,
    audience: `${classLabel} families`,
    by,
    recipients,
    vars: { class: classLabel, term, session },
    source: { label: 'Results', to: { name: r.academics.results.name } },
  });
}

export function timetablePublished(
  schoolId: string,
  classLabel: string,
  teachers: string[],
  term: string,
  by: string,
) {
  return dispatch(schoolId, {
    event: 'timetable.published',
    title: `Timetable published · ${classLabel}`,
    audience: `${classLabel} teachers, students and guardians`,
    by,
    recipients: classRecipients(schoolId, classLabel, teachers),
    vars: { class: classLabel, term, effective_date: commsDate(isoToday()) },
    source: { label: 'Timetable', to: { name: r.academics.timetable.name } },
  });
}
