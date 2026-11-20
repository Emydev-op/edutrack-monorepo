import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

/**
 * School Admin › Finance on the API, at Greenfield. The seed has First Term 2026/2027 invoices
 * for every enrolled student (Emmanuel Adeyemi paid in full, Michael Adeyemi with the sibling
 * discount, Daniel Musa still owing ₦45,000 from last term), parent transfers waiting for
 * verification, accounts, vendors and expenses. Kunle Bakare is the Bursar (every finance
 * permission); Adaeze Okonkwo, the Principal, can view and approve refunds and expenses above the
 * Bursar's limit. Covers fees, Second Term invoices generated from the structure (discounts and
 * optional items carried forward), adjustments, recording and verifying payments with receipt
 * numbers, balances carried across terms, expenses with approvals, the overview, dashboard and
 * reports, report-card holds for unpaid fees, permissions and other schools.
 */

type Api = ReturnType<typeof authed>;
interface InvoiceRow {
  id: string;
  no: string;
  studentKey: string;
  student: string;
  term: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
}

const F = '/api/v1/finance';
// Fri 20 Nov 2026, 10:00 in Lagos.
const NOW = Date.parse('2026-11-20T09:00:00.000Z');
const BURSAR = 'kunle.bakare@greenfield.edu.ng';
const PRINCIPAL = 'adaeze.okonkwo@greenfield.edu.ng';

describe('Finance (e2e)', () => {
  let t: TestApp;
  let bursar: Api;
  let principal: Api;
  let schoolId: string;
  let secondTermId: string;
  let firstTermId: string;
  let mainId: string;
  const student: Record<string, string> = {};

  const signInAll = async () => {
    bursar = authed(t, (await signIn(t, BURSAR)).token);
    principal = authed(t, (await signIn(t, PRINCIPAL)).token);
  };
  /** The data of a successful answer (fails the test on anything else). */
  const ok = async (req: PromiseLike<{ status: number; body: { data: unknown } }>) => {
    const res = await req;
    if (res.status >= 300) throw new Error(`${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const account = (key: string) => ok(bursar.get(`${F}/students/${key}`));
  const invoicesOf = async (term: string) =>
    (await ok(bursar.get(`${F}/invoices?term=${term}&pageSize=100`))).data as InvoiceRow[];

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    t.clock.set(NOW);
    // The demo Bursar's password is seeded as expired (the change-password demo).
    await t.prisma.user.update({
      where: { email: BURSAR },
      data: { passwordChangedAt: new Date(NOW) },
    });
    await signInAll();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    const terms = await t.prisma.term.findMany({
      where: { schoolId, session: { name: '2026/2027' } },
    });
    firstTermId = terms.find((x) => x.name === 'First Term')!.id;
    secondTermId = terms.find((x) => x.name === 'Second Term')!.id;
    mainId = (await t.prisma.branch.findFirstOrThrow({ where: { schoolId, code: 'GFA-MC' } })).id;
    for (const s of await t.prisma.student.findMany({ where: { schoolId } }))
      student[s.admissionNo] = s.id;
  });

  afterAll(async () => {
    t.clock.set(Date.now());
    await t.reseed();
    await t.close();
  });

  describe('seeded figures', () => {
    it('loads every screen', async () => {
      for (const path of [
        'options',
        'overview',
        'fees',
        'fees/structure',
        'discounts',
        'plans',
        'settings',
        'invoices',
        'payments',
        'payments?tab=pending',
        'refunds',
        'accounts',
        'expenses',
        'vendors',
        'students?search=ade',
        'reports/collection',
        'reports/outstanding',
        'reports/income-expenditure',
        'reports/cash-book',
      ]) {
        const res = await bursar.get(`${F}/${path}`);
        expect([path, res.status]).toEqual([path, 200]);
      }
    });

    it('carries last term’s balance on the student’s account', async () => {
      const emmanuel = await account(student['STU-2025-0042']!);
      expect(emmanuel).toMatchObject({ outstanding: 0, payTo: null });
      const daniel = await account(student['STU-2025-0055']!);
      const terms = (daniel.invoices as InvoiceRow[]).map((i) => `${i.term}:${i.status}`);
      expect(terms).toContain('Third Term:Paid');
      // ₦200,000 paid this term cleared last term's ₦45,000 first.
      const first = (daniel.invoices as InvoiceRow[]).find((i) => i.term === 'First Term')!;
      expect(first.paid).toBe(155000);
      expect(daniel.outstanding).toBe(first.balance);
      expect(daniel.payTo).toMatchObject({ bank: 'GTBank', reference: 'STU-2025-0055' });
    });

    it('shows the student page’s Finance tab from the ledger', async () => {
      const id = student['STU-2025-0055']!;
      const page = await ok(principal.get(`/api/v1/students/${id}`));
      const acct = await account(id);
      expect(page.financeKey).toBe(id);
      expect(page.credit).toBe(acct.credit);
      expect(page.invoices.map((i: { period: string }) => i.period)).toEqual([
        '2026/2027 · First Term',
        '2025/2026 · Third Term',
      ]);
      expect(page.invoices[0]).toMatchObject({ balance: acct.outstanding, status: 'Overdue' });
      expect(page.balance).toBe(acct.outstanding);
      expect(page.payments.length).toBe(2);
      expect(page.payments[0]).toMatchObject({
        title: expect.stringMatching(/^₦200,000 · Bank transfer · RCT-2026-\d{4}$/),
        tone: 'success',
      });
    });

    it('shows each branch’s figures for the term', async () => {
      const branch = await ok(principal.get(`/api/v1/branches/${mainId}`));
      const report = await ok(bursar.get(`${F}/reports/collection?term=${firstTermId}`));
      expect(branch.finance).toMatchObject({
        term: 'First Term 2026/2027',
        billed: expect.stringMatching(/^₦/),
        collected: expect.stringMatching(new RegExp(`· ${report.totals.rate}%$`)),
        outstanding: expect.stringMatching(/ students$/),
      });
      // Lekki Campus has a published structure but nobody billed there yet.
      const lekki = await t.prisma.branch.findFirstOrThrow({ where: { schoolId, code: 'GFA-LK' } });
      expect((await ok(principal.get(`/api/v1/branches/${lekki.id}`))).finance).toBeNull();
    });

    it('marks the Setup Center’s Fees step done from the published structure', async () => {
      const setup = await ok(principal.get('/api/v1/setup'));
      const fees = setup.steps.find((x: { id: string }) => x.id === 'fees');
      expect(fees).toMatchObject({
        done: true,
        auto: true,
        to: { name: 'fees', query: { from: 'setup' } },
        description: expect.stringMatching(
          /^10 fee items · First Term published · \d+ invoices issued$/,
        ),
      });
    });

    it('shows the pending parent claims with their proof', async () => {
      const list = await ok(bursar.get(`${F}/payments?tab=pending`));
      expect(list.summary.pendingCount).toBe(2);
      const claim = list.data[0];
      const detail = await ok(bursar.get(`${F}/payments/${claim.id}`));
      expect(detail).toMatchObject({ status: 'Pending verification', source: 'Parent claim' });
      expect(detail.proof).toBeTruthy();
    });
  });

  describe('fees', () => {
    it('adds, edits and removes a fee item', async () => {
      const item = await ok(
        bursar.post(`${F}/fees/items`).send({
          name: 'Excursion levy',
          category: 'Activities',
          charged: 'Every term',
          type: 'Optional',
          description: 'Trips and visits',
        }),
      );
      expect(item).toMatchObject({ name: 'Excursion levy', status: 'Active', invoiceLines: 0 });
      const dupe = await bursar.post(`${F}/fees/items`).send({
        name: 'excursion levy',
        category: 'Activities',
        charged: 'Every term',
        type: 'Optional',
        description: '',
      });
      expect(dupe.status).toBe(422);
      const edited = await ok(
        bursar.put(`${F}/fees/items/${item.id}`).send({
          name: 'Excursion levy',
          category: 'Activities',
          charged: 'Once a session',
          type: 'Optional',
          description: '',
        }),
      );
      expect(edited.charged).toBe('Once a session');
      expect((await ok(bursar.delete(`${F}/fees/items/${item.id}`))).archived).toBe(false);
      // Tuition is on invoices: it is archived, not removed.
      const fees = await ok(bursar.get(`${F}/fees`));
      expect(fees.items.some((i: { name: string }) => i.name === 'Excursion levy')).toBe(false);
    });

    it('copies First Term’s amounts to Second Term and publishes them', async () => {
      const copied = await ok(
        bursar.post(`${F}/fees/structure/copy`).send({
          fromTermId: firstTermId,
          toTermId: secondTermId,
          branchId: mainId,
        }),
      );
      expect(copied.status).toBe('Draft');
      const published = await ok(
        bursar.post(`${F}/fees/structure/publish`).send({ termId: secondTermId, branchId: mainId }),
      );
      expect(published.status).toBe('Published');
    });

    it('saves billing settings with the receipt prefix', async () => {
      const s = await ok(bursar.get(`${F}/settings`));
      const res = await ok(
        bursar.put(`${F}/settings`).send({
          ...s,
          receiptPrefix: 'GFR',
          dueDates: Object.fromEntries(
            (s.dueDates as { termId: string; due: string }[]).map((d) => [d.termId, d.due]),
          ),
        }),
      );
      expect(res.receiptPrefix).toBe('GFR');
      const same = await bursar
        .put(`${F}/settings`)
        .send({ ...s, invoicePrefix: 'GFR', receiptPrefix: 'GFR', dueDates: {} });
      expect(same.status).toBe(422);
    });
  });

  describe('Second Term invoices', () => {
    let rows: InvoiceRow[] = [];

    it('previews and generates the term’s invoices in one go', async () => {
      const body = { termId: secondTermId, branchId: mainId, issue: true };
      const preview = await ok(bursar.post(`${F}/invoices/generate/preview`).send(body));
      expect(preview.toCreate).toBeGreaterThan(10);
      expect(preview.alreadyInvoiced).toBe(0);
      expect(preview.discounts).toBeGreaterThan(0);
      const sentBefore = t.notifications.sent.length;
      const res = await ok(bursar.post(`${F}/invoices/generate`).send(body));
      expect(res).toMatchObject({ created: preview.toCreate, issued: preview.toCreate });
      expect(t.notifications.sent.length).toBeGreaterThan(sentBefore);
      rows = await invoicesOf(secondTermId);
      expect(rows.length).toBe(preview.toCreate);
      expect(rows.every((r) => /^INV-2026-\d{4}$/.test(r.no))).toBe(true);
      const again = await bursar.post(`${F}/invoices/generate`).send(body);
      expect(again.status).toBe(422);
    });

    it('bills compulsory items, carries opted-in extras and applies the sibling discount', async () => {
      const lines = async (key: string) => {
        const inv = rows.find((r) => r.studentKey === student[key])!;
        return ok(bursar.get(`${F}/invoices/${inv.id}`));
      };
      const emmanuel = await lines('STU-2025-0042');
      const labels = emmanuel.lines.map((l: { label: string }) => l.label);
      expect(labels).toEqual(
        expect.arrayContaining(['Tuition', 'Examination fee', 'ICT fee', 'Lunch']),
      );
      // Once a session (development levy) and new-student fees aren't billed again.
      expect(labels).not.toContain('Development levy');
      expect(labels).not.toContain('Admission fee');
      const michael = await lines('STU-2023-0311');
      expect(michael.discounts[0]).toMatchObject({ label: 'Sibling discount · 2nd child' });
      expect(michael.lines.map((l: { label: string }) => l.label)).toContain('School bus');
    });

    it('adjusts one invoice: a charge, a scholarship and the payment plan', async () => {
      const inv = rows.find((r) => r.studentKey === student['STU-2025-0051'])!;
      const added = await ok(
        bursar
          .post(`${F}/invoices/${inv.id}/lines`)
          .send({ label: 'Lost library book', amount: 5000 }),
      );
      expect(added.total).toBe(inv.total + 5000);
      const line = added.lines.find((l: { label: string }) => l.label === 'Lost library book');
      const noReason = await bursar.delete(
        `${F}/invoices/${inv.id}/lines/${added.lines.find((l: { label: string }) => l.label === 'Tuition').id}`,
      );
      expect(noReason.status).toBe(422);
      const removed = await ok(
        bursar.delete(`${F}/invoices/${inv.id}/lines/${line.id}?reason=Book%20found`),
      );
      expect(removed.total).toBe(inv.total);
      const scholarship = removed.discountsAvailable.find(
        (d: { basis: string }) => d.basis === 'Scholarship',
      );
      const discounted = await ok(
        bursar
          .post(`${F}/invoices/${inv.id}/discounts`)
          .send({ discountId: scholarship.id, reason: 'Second in class' }),
      );
      expect(discounted.discountTotal).toBe(scholarship.amount);
      expect(discounted.history.length).toBeGreaterThan(1);
      const plan = discounted.plans.find((p: { name: string }) => p.name === 'Two installments');
      const planned = await ok(
        bursar.put(`${F}/invoices/${inv.id}/plan`).send({ planId: plan.id }),
      );
      expect(planned.installments).toHaveLength(2);
    });
  });

  describe('payments', () => {
    it('records cash with the next receipt number and confirms it', async () => {
      const options = await ok(bursar.get(`${F}/options`));
      const cash = options.accounts.find((a: { kind: string }) => a.kind === 'Cash');
      const key = student['STU-2025-0074']!;
      const before = await account(key);
      const body = {
        studentKey: key,
        amount: 50000,
        date: '2026-11-20',
        method: 'Cash',
        accountId: cash.id,
        reference: '',
        payer: '',
        note: 'Paid at the bursary',
        allocations: [],
        matched: false,
      };
      const check = await ok(bursar.post(`${F}/payments/check`).send(body));
      expect(check.status).toBe('Confirmed');
      const paid = await ok(bursar.post(`${F}/payments`).send(body));
      expect(paid).toMatchObject({ status: 'Confirmed', amount: 50000, method: 'Cash' });
      expect(paid.no).toMatch(/^GFR-2026-\d{4}$/);
      expect((await account(key)).outstanding).toBe(before.outstanding - 50000);
      const receipts = t.notifications.sent.filter((m) => m.channel === 'email');
      expect(receipts.length).toBeGreaterThan(0);
    });

    it('keeps a recorded transfer pending until it is verified', async () => {
      const options = await ok(bursar.get(`${F}/options`));
      const bank = options.accounts.find((a: { kind: string; name: string }) =>
        a.name.startsWith('Fees collection'),
      );
      const key = student['STU-2025-0079']!;
      const before = await account(key);
      const transfer = {
        studentKey: key,
        amount: 80000,
        date: '2026-11-19',
        method: 'Bank transfer',
        accountId: bank.id,
        reference: 'GTB/NIP/55500123',
        payer: '',
        note: '',
        allocations: [],
        matched: false,
      };
      const p = await ok(bursar.post(`${F}/payments`).send(transfer));
      expect(p.status).toBe('Pending verification');
      expect((await account(key)).outstanding).toBe(before.outstanding);
      const dupe = await bursar.post(`${F}/payments`).send(transfer);
      expect(dupe.status).toBe(422);
      const verified = await ok(bursar.post(`${F}/payments/${p.id}/verify`));
      expect(verified.status).toBe('Confirmed');
      expect((await account(key)).outstanding).toBe(before.outstanding - 80000);
      const again = await bursar.post(`${F}/payments/${p.id}/verify`);
      expect(again.status).toBe(409);
    });

    it('verifies one parent claim and rejects the other with a reason', async () => {
      const pending = (await ok(bursar.get(`${F}/payments?tab=pending`))).data as {
        id: string;
        studentKey: string;
      }[];
      const [a, b] = pending;
      const ok1 = await ok(bursar.post(`${F}/payments/${a!.id}/verify`));
      expect(ok1.status).toBe('Confirmed');
      const noReason = await bursar.post(`${F}/payments/${b!.id}/reject`).send({ reason: '' });
      expect(noReason.status).toBe(422);
      const rejected = await ok(
        bursar.post(`${F}/payments/${b!.id}/reject`).send({ reason: 'Not on the statement' }),
      );
      expect(rejected).toMatchObject({ status: 'Rejected', rejectReason: 'Not on the statement' });
      expect(t.notifications.sent.some((m) => m.channel === 'email')).toBe(true);
    });
  });

  describe('expenses', () => {
    it('needs the Bursar, then the Principal above the limit, then pays', async () => {
      const options = await ok(bursar.get(`${F}/options`));
      const vendor = options.vendors[0];
      const ops = options.accounts.find((a: { name: string }) => a.name.startsWith('Operations'));
      const e = await ok(
        bursar.post(`${F}/expenses`).send({
          date: '2026-11-18',
          category: 'Maintenance',
          description: 'Generator overhaul',
          vendorId: vendor.id,
          branchId: mainId,
          amount: 300000,
          method: 'Bank transfer',
          notes: '',
          attachment: { name: 'quote.pdf', size: '120 KB' },
          submit: true,
        }),
      );
      expect(e).toMatchObject({ status: 'Submitted', waitingOn: 'Bursar' });
      expect(e.no).toMatch(/^EXP-2026-\d{4}$/);
      const first = await ok(bursar.post(`${F}/expenses/${e.id}/approve`));
      expect(first).toMatchObject({ status: 'Submitted', waitingOn: 'Principal' });
      const twice = await bursar.post(`${F}/expenses/${e.id}/approve`);
      expect(twice.status).toBe(403);
      const second = await ok(principal.post(`${F}/expenses/${e.id}/approve`));
      expect(second.status).toBe('Approved');
      const paid = await ok(
        bursar
          .post(`${F}/expenses/${e.id}/pay`)
          .send({ accountId: ops.id, date: '2026-11-20', reference: 'ZEN/TRF/9001' }),
      );
      expect(paid.status).toBe('Paid');
      const list = await ok(bursar.get(`${F}/expenses?status=Paid`));
      expect(list.data.some((x: { id: string }) => x.id === e.id)).toBe(true);
    });
  });

  describe('overview, dashboard and reports', () => {
    it('agree on the term’s figures', async () => {
      const overview = await ok(bursar.get(`${F}/overview?term=${firstTermId}`));
      const collected = overview.kpis.find((k: { label: string }) => k.label === 'Collected');
      expect(collected.value).toMatch(/^₦/);
      const report = await ok(bursar.get(`${F}/reports/collection?term=${firstTermId}`));
      const school = await ok(principal.get(`/api/v1/reports/collection?term=${firstTermId}`));
      expect(school.blocked).toBeNull();
      expect(school.totals.collected).toBe(report.totals.collected);
      expect(report.totals.billed).toBeGreaterThan(report.totals.collected);
      const catalog = await ok(principal.get('/api/v1/reports'));
      const financial = catalog.groups.find((g: { name: string }) => g.name === 'Financial');
      expect(financial.reports.every((r: { available: boolean }) => r.available)).toBe(true);
      for (const id of ['outstanding', 'income-expenditure', 'cash-book', 'payments', 'discounts'])
        expect((await ok(principal.get(`/api/v1/reports/${id}`))).blocked).toBeNull();
    });

    it('fills the dashboard’s fee figures and card', async () => {
      const dash = await ok(principal.get('/api/v1/dashboard'));
      const fees = dash.metrics.find((m: { label: string }) => m.label === 'Fees collected');
      expect(fees.value).toMatch(/^₦/);
      expect(fees.hint).toMatch(/% of ₦/);
      expect(dash.attention.some((a: { id: string }) => a.id === 'overdue-invoices')).toBe(true);
      const card = await ok(principal.get('/api/v1/dashboard/finance'));
      expect(card.available).toBe(true);
      expect(card.weekly).toHaveLength(8);
      expect(card.sections.length).toBeGreaterThan(0);
    });
  });

  describe('report cards held for unpaid fees', () => {
    /** Approved sheets for every subject of an arm in First Term, then publish it. */
    async function publish(level: string, arm: string) {
      const armRow = await t.prisma.classArm.findFirstOrThrow({
        where: { schoolId, name: arm, level: { name: level }, branchId: mainId },
        include: { level: { include: { section: true } } },
      });
      const R = '/api/v1/academics/results';
      const check = await ok(principal.get(`${R}/publish/${armRow.id}?term=${firstTermId}`));
      const session = await t.prisma.academicSession.findFirstOrThrow({
        where: { schoolId, status: 'ACTIVE' },
      });
      const scheme = await t.prisma.assessmentScheme.findFirstOrThrow({
        where: { sessionId: session.id, sectionId: armRow.level.sectionId },
      });
      const roll = await t.prisma.enrollment.findMany({
        where: { sessionId: session.id, armId: armRow.id, status: 'ACTIVE' },
      });
      for (const label of check.notApproved as string[]) {
        const name = label.replace(/ \(.*\)$/, '');
        const subject = await t.prisma.subject.findFirstOrThrow({ where: { schoolId, name } });
        const sheet = await t.prisma.resultSheet.create({
          data: {
            schoolId,
            sessionId: session.id,
            termId: firstTermId,
            levelId: armRow.levelId,
            armId: armRow.id,
            subjectId: subject.id,
            schemeId: scheme.id,
            status: 'APPROVED',
          },
        });
        await t.prisma.resultEntry.createMany({
          data: roll.map((e) => ({
            schoolId,
            sheetId: sheet.id,
            studentId: e.studentId,
            total: 65,
          })),
        });
      }
      await ok(
        principal.post(`${R}/publish/${armRow.id}`).send({ acknowledged: true, term: firstTermId }),
      );
      return t.prisma.reportCard.findMany({ where: { termId: firstTermId, armId: armRow.id } });
    }
    const financeToggle = (holdReportCards: boolean) =>
      ok(principal.put('/api/v1/settings/finance').send({ holdReportCards }));

    it('holds the cards of students who owe when the setting is on', async () => {
      expect((await financeToggle(true)).holdReportCards).toBe(true);
      // Emmanuel paid First Term; his Second Term bill is cancelled, so he owes nothing.
      const emmanuel = (await invoicesOf(secondTermId)).find(
        (r) => r.studentKey === student['STU-2025-0042'],
      )!;
      const cancelled = await ok(
        bursar.post(`${F}/invoices/${emmanuel.id}/cancel`).send({ reason: 'Billed in error' }),
      );
      expect(cancelled.status).toBe('Cancelled');
      expect((await account(emmanuel.studentKey)).outstanding).toBe(0);
      const cards = await publish('JSS 2', 'B');
      const held = cards.filter((c) => c.heldAt);
      expect(held.length).toBeGreaterThan(0);
      expect(held.every((c) => /^Unpaid fees: ₦[\d,]+ outstanding$/.test(c.heldReason!))).toBe(
        true,
      );
      // Emmanuel paid in full: his card is out.
      expect(cards.find((c) => c.studentId === student['STU-2025-0042'])!.heldAt).toBeNull();
      // Released one by one, as any held card.
      const one = held[0]!;
      await ok(
        principal
          .post(`/api/v1/academics/results/report-card/${one.studentId}/release`)
          .send({ term: firstTermId }),
      );
    });

    it('holds nothing when the setting is off', async () => {
      await financeToggle(false);
      const cards = await publish('Primary 5', 'B');
      expect(cards.length).toBeGreaterThan(0);
      expect(cards.every((c) => !c.heldAt)).toBe(true);
    });
  });

  describe('access', () => {
    it('lets section admins look but not change finance', async () => {
      const membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { schoolId, user: { email: BURSAR } },
      });
      const primary = await t.prisma.section.findFirstOrThrow({
        where: { schoolId, name: 'Primary' },
      });
      await t.prisma.membershipSection.create({
        data: { schoolId, membershipId: membership.id, sectionId: primary.id },
      });
      try {
        expect((await bursar.get(`${F}/invoices`)).status).toBe(200);
        const res = await bursar.post(`${F}/fees/items`).send({
          name: 'Swimming',
          category: 'Activities',
          charged: 'Every term',
          type: 'Optional',
          description: '',
        });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('SECTION_FORBIDDEN');
      } finally {
        await t.prisma.membershipSection.deleteMany({ where: { membershipId: membership.id } });
      }
    });

    it('needs the finance permissions', async () => {
      // The Principal can look, but not record payments.
      expect((await principal.get(`${F}/payments`)).status).toBe(200);
      const res = await principal.post(`${F}/fees/items`).send({});
      expect(res.status).toBe(403);
      // An academic head without finance access can't even look.
      const head = authed(t, (await signIn(t, 'c.eze@greenfield.edu.ng')).token);
      expect((await head.get(`${F}/overview`)).status).toBe(403);
    });

    it('keeps other schools out', async () => {
      const udo = authed(t, (await signIn(t, 'e.udo@crestviewcollege.ng')).token);
      const inv = (await invoicesOf(firstTermId))[0]!;
      expect((await udo.get(`${F}/invoices/${inv.id}`)).status).toBe(404);
      expect((await udo.get(`${F}/students/${inv.studentKey}`)).status).toBe(404);
      const list = await ok(udo.get(`${F}/payments`));
      expect(list.data).toHaveLength(0);
    });
  });
});
