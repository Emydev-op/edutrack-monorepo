import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
interface Metric {
  label: string;
  value: string;
  hint: string;
  hintTone: string;
}
interface Result {
  id: string;
  title: string;
  type: string;
  meta: string;
  to: { name: string; params?: Record<string, string> };
}
interface Row {
  cells: Record<string, string | number | null>;
  to?: { name: string; params?: Record<string, string> };
}

const ADAEZE = 'adaeze.okonkwo@greenfield.edu.ng';
const HOST = 'greenfield.localhost';
const MAIN = 'Main Campus';
// Fri 20 Nov 2026, 10:00 in Lagos: First Term is running.
const NOW = Date.parse('2026-11-20T09:00:00.000Z');

/**
 * School Admin's dashboard, command-menu search and Reports on Greenfield's seeded records, the
 * Finance figures, the Communication placeholders, and the Teacher Workspace still getting its own
 * dashboard and search on the same paths.
 */
describe('School dashboard, search and reports (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let kingsway: Api;
  let okafor: Api;
  let schoolId: string;
  let mainId: string;
  let termId: string;

  const query = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const dashboard = async (branch = MAIN) =>
    (
      await admin.get(
        `/api/v1/dashboard?${query({ branch, session: '2026/2027', term: 'First Term' })}`,
      )
    ).body.data;
  const search = async (api: Api, q: string) =>
    (await api.get(`/api/v1/search?${query({ q })}`)).body.data as Result[];
  const report = async (id: string, o: Record<string, string> = {}) =>
    (
      await admin.get(
        `/api/v1/reports/${id}?${query({ branch: MAIN, session: '2026/2027', ...o })}`,
      )
    ).body.data;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    t.clock.set(NOW);
    admin = authed(t, (await signIn(t, ADAEZE)).token);
    kingsway = authed(t, (await signIn(t, 'ifeoma.briggs@kingsway.edu.ng')).token);
    okafor = authed(t, (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token, {
      host: HOST,
    });
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    mainId = (await t.prisma.branch.findFirstOrThrow({ where: { schoolId, name: MAIN } })).id;
    termId = (await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } })).id;
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  describe('dashboard', () => {
    it('shows the working branch from live records', async () => {
      const d = await dashboard();
      expect(d.hasData).toBe(true);
      expect(d.metrics.map((m: Metric) => m.label)).toEqual([
        'Students',
        'Teachers',
        'Classes',
        'Fees collected',
        'Outstanding',
      ]);
      const onRoll = await t.prisma.student.count({
        where: {
          schoolId,
          branchId: mainId,
          deletedAt: null,
          status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] },
        },
      });
      const arms = await t.prisma.classArm.count({
        where: { schoolId, branchId: mainId, archivedAt: null },
      });
      const [students, , classes] = d.metrics as Metric[];
      expect(students!.value).toBe(onRoll.toLocaleString('en-NG'));
      expect(classes!.value).toBe(String(arms));
      // Fee figures come from Finance's ledger (the seeded First Term invoices).
      const [fees, owed] = d.metrics.slice(3) as Metric[];
      expect(fees).toMatchObject({
        value: expect.stringMatching(/^₦/),
        hint: expect.stringMatching(/% of ₦/),
      });
      expect(owed).toMatchObject({
        value: expect.stringMatching(/^₦/),
        hint: expect.stringMatching(/ students · ₦.* overdue$/),
        hintTone: 'error',
      });

      // All branches counts everyone.
      const all = (await dashboard('All branches')).metrics[0] as Metric;
      const everyone = await t.prisma.student.count({
        where: { schoolId, deletedAt: null, status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] } },
      });
      expect(all.value).toBe(everyone.toLocaleString('en-NG'));
    });

    it('lists what needs attention, the calendar, enrolment and activity', async () => {
      const d = await dashboard();
      const ids = d.attention.map((a: { id: string }) => a.id);
      // No result sheet is in yet this term.
      const due = d.attention.find((a: { id: string }) => a.id === 'results-due');
      expect(due).toMatchObject({
        badge: { label: 'Due', tone: 'warning' },
        text: expect.stringMatching(
          /^\d+ result sheets not yet submitted · entry closes Fri 11 Dec/,
        ),
        area: 'Academics · Results · First Term',
        to: { name: 'results' },
      });
      const waiting = await t.prisma.supportTicket.count({
        where: { schoolId, status: { in: ['WAITING_FOR_SCHOOL', 'RESOLVED'] } },
      });
      expect(ids.includes('support')).toBe(waiting > 0);
      // Finance: the seeded overdue invoices and parent transfers waiting for verification.
      expect(ids).toContain('overdue-invoices');
      expect(d.attention.find((a: { id: string }) => a.id === 'verify-transfers')).toMatchObject({
        text: '2 bank transfers awaiting verification',
        to: { name: 'payments', query: { tab: 'pending' } },
      });
      expect(ids).not.toContain('sender-id');

      expect(d.upcoming.length).toBeLessThanOrEqual(6);
      expect(d.upcoming.length).toBeGreaterThan(0);
      for (const e of d.upcoming) {
        expect(e.date).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2,3}$/);
        expect([
          'Examination',
          'Results',
          'Meeting',
          'PTA',
          'Event',
          'Term',
          'Break',
          'Holiday',
        ]).toContain(e.type);
      }
      expect(d.upcoming).toContainEqual({
        date: 'Fri 11 Dec',
        title: 'Result entry deadline',
        type: 'Results',
      });
      expect(d.enrollment.at(-1)).toMatchObject({ label: '2026/27', value: expect.any(Number) });
      expect(d.enrollment.at(-1).value).toBeGreaterThan(0);
      expect(d.performance).toEqual([]);
      expect(Array.isArray(d.activity)).toBe(true);
    });

    it('answers the fee card from Finance', async () => {
      const res = await admin.get(`/api/v1/dashboard/finance?${query({ branch: MAIN })}`);
      expect(res.status).toBe(200);
      const card = res.body.data;
      expect(card).toMatchObject({ available: true });
      expect(card.weekly).toHaveLength(8);
      expect(card.sections.map((x: { label: string }) => x.label)).toContain('Junior Secondary');
      for (const x of card.sections) expect(x.percent).toBeGreaterThanOrEqual(0);
    });

    it('still gives the Teacher Workspace its own dashboard on the same path', async () => {
      const res = await okafor.get(`/api/v1/dashboard?term=${termId}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Dashboard loaded.');
      expect(res.body.data).toHaveProperty('todo.ok');
      expect(res.body.data).not.toHaveProperty('hasData');
      // Its dev-tool flag is accepted (and ignored).
      expect((await okafor.get('/api/v1/dashboard?simulate=lessons-error')).status).toBe(200);
      // School Admin only.
      expect((await okafor.get('/api/v1/dashboard/finance')).status).toBe(403);
      expect((await okafor.get('/api/v1/reports')).status).toBe(403);
    });

    it('refuses unknown query fields', async () => {
      const res = await admin.get('/api/v1/dashboard?colour=red');
      expect(res.status).toBe(422);
    });
  });

  describe('search', () => {
    it('finds students by name and admission number', async () => {
      const s = await t.prisma.student.findFirstOrThrow({
        where: { schoolId, status: 'ACTIVE', deletedAt: null },
        orderBy: { admissionNo: 'asc' },
      });
      const byName = await search(admin, `${s.firstName} ${s.surname}`);
      const hit = byName.find((r) => r.id === s.id);
      expect(hit).toMatchObject({
        type: 'Student',
        title: `${s.firstName} ${s.surname}`,
        to: { name: 'student', params: { id: s.id } },
      });
      expect(hit!.meta).toContain(s.admissionNo);
      expect((await search(admin, s.admissionNo)).map((r) => r.id)).toContain(s.id);
    });

    it('finds parents, staff, classes, subjects and tickets', async () => {
      const g = await t.prisma.guardian.findFirstOrThrow({
        where: { schoolId, deletedAt: null, mergedIntoId: null, students: { some: {} } },
      });
      const parent = (await search(admin, g.fullName)).find((r) => r.id === g.id);
      expect(parent).toMatchObject({
        type: 'Parent',
        to: { name: 'parent', params: { id: g.id } },
      });
      expect(parent!.meta).toMatch(/^Guardian of /);

      const staff = await t.prisma.staff.findFirstOrThrow({
        where: { schoolId, kind: 'TEACHING', status: 'ACTIVE' },
      });
      const teacher = (await search(admin, staff.staffNumber)).find((r) => r.id === staff.id);
      expect(teacher).toMatchObject({
        type: 'Teacher',
        to: { name: 'staff-member', params: { id: staff.id } },
      });

      const cls = (await search(admin, 'jss 2b')).filter((r) => r.type === 'Class');
      expect(cls.map((r) => r.title)).toContain('JSS 2B');
      expect(cls[0]!.meta).toMatch(/students · /);
      expect(cls[0]!.to.name).toBe('class');

      const maths = (await search(admin, 'mathematics')).filter((r) => r.type === 'Subject');
      expect(maths.length).toBeGreaterThan(0);
      expect(maths[0]).toMatchObject({ to: { name: 'subjects' } });

      const ticket = (await search(admin, 'SUP-1042')).find((r) => r.type === 'Ticket');
      expect(ticket).toMatchObject({
        id: 'SUP-1042',
        to: { name: 'support-ticket', params: { id: 'SUP-1042' } },
      });
    });

    it('caps the list and ignores one-letter searches', async () => {
      expect((await search(admin, 'a')).length).toBe(0);
      expect((await search(admin, '')).length).toBe(0);
      expect((await search(admin, 'an')).length).toBeLessThanOrEqual(9);
    });

    it('only finds the signed-in school’s records', async () => {
      // Kingsway has no students in the seed (and the reseed leaves other schools' extra rows):
      // give it one for this test and remove it again.
      const kwId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'kingsway' } })).id;
      await t.prisma.student.deleteMany({
        where: { schoolId: kwId, admissionNo: 'KWS-2026-0001' },
      });
      await t.prisma.branch.deleteMany({ where: { schoolId: kwId, code: 'KWS-MC' } });
      const existing = await t.prisma.branch.findFirst({ where: { schoolId: kwId } });
      const branch =
        existing ??
        (await t.prisma.branch.create({
          data: { schoolId: kwId, name: 'Main Campus', code: 'KWS-MC', isOriginal: true },
        }));
      const kw = await t.prisma.student.create({
        data: {
          schoolId: kwId,
          branchId: branch.id,
          admissionNo: 'KWS-2026-0001',
          firstName: 'Zebedee',
          surname: 'Quartermaine',
          gender: 'MALE',
          admittedOn: new Date('2026-09-14'),
        },
      });
      try {
        expect((await search(admin, 'Quartermaine')).length).toBe(0);
        expect((await search(admin, kw.admissionNo)).some((r) => r.id === kw.id)).toBe(false);
        expect((await search(kingsway, 'Zebedee Quartermaine')).some((r) => r.id === kw.id)).toBe(
          true,
        );
        expect((await search(kingsway, 'SUP-1042')).some((r) => r.type === 'Ticket')).toBe(false);
      } finally {
        await t.prisma.student.delete({ where: { id: kw.id } });
        if (!existing) await t.prisma.branch.delete({ where: { id: branch.id } });
      }
    });

    it('still searches the Teacher Workspace’s own scope', async () => {
      const res = await okafor.get('/api/v1/search?q=jss%202b');
      expect(res.status).toBe(200);
      expect(res.body.data.some((r: { type: string }) => r.type === 'Class')).toBe(true);
    });
  });

  describe('reports', () => {
    it('lists every report, with Communication ones not openable yet', async () => {
      const res = await admin.get('/api/v1/reports');
      expect(res.status).toBe(200);
      const groups = res.body.data.groups as {
        name: string;
        reports: { id: string; available: boolean; availableWith: string | null }[];
      }[];
      expect(groups.map((g) => g.name)).toEqual([
        'Academic',
        'Students',
        'Staff',
        'Financial',
        'Communication',
      ]);
      const by = (name: string) => groups.find((g) => g.name === name)!.reports;
      expect(by('Financial').every((r) => r.available && r.availableWith === null)).toBe(true);
      expect(by('Communication')).toEqual([
        expect.objectContaining({
          id: 'message-delivery',
          available: false,
          availableWith: 'Communication',
        }),
      ]);
      expect([...by('Academic'), ...by('Students'), ...by('Staff')].every((r) => r.available)).toBe(
        true,
      );
    });

    it('works out the Financial reports from Finance', async () => {
      const r = await report('collection');
      expect(r.blocked).toBeNull();
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.metrics.map((m: { label: string }) => m.label)).toEqual([
        'Billed',
        'Collected',
        'Outstanding',
        'Overdue',
      ]);
      const owing = await report('outstanding');
      expect(owing.rows[0].to).toMatchObject({ name: 'student-account' });
      expect((await report('message-delivery')).blocked.title).toBe('Available with Communication');
    });

    it('counts enrolment per class', async () => {
      const r = await report('enrollment');
      expect(r.blocked).toBeNull();
      expect(r.scope).toBe(`2026/2027 · ${MAIN}`);
      expect(r.columns.map((c: { key: string }) => c.key)).not.toContain('branch');
      const sessionId = (await t.prisma.term.findUniqueOrThrow({ where: { id: termId } }))
        .sessionId;
      const enrolled = await t.prisma.enrollment.count({
        where: {
          schoolId,
          sessionId,
          branchId: mainId,
          status: 'ACTIVE',
          student: { deletedAt: null, status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] } },
        },
      });
      expect(r.totals.total).toBe(enrolled);
      expect(r.totals.male + r.totals.female).toBe(enrolled);
      const jss2b = r.rows.find((x: Row) => x.cells.class === 'JSS 2B');
      expect(jss2b).toMatchObject({ cells: { section: 'Junior Secondary', total: 14 } });

      const all = await report('enrollment', { branch: 'All branches' });
      expect(all.columns.map((c: { key: string }) => c.key)).toContain('branch');
      const jss = await report('enrollment', { section: 'Junior Secondary' });
      expect(
        jss.rows.every((x: Row) => x.cells.section === 'Junior Secondary' || !x.cells.section),
      ).toBe(true);
    });

    it('works out result completion, subject performance and grades from the sheets', async () => {
      const completion = await report('result-completion', { term: termId });
      expect(completion.filters[0]).toMatchObject({ key: 'term', value: termId });
      expect(completion.totals.sheets).toBeGreaterThan(0);
      expect(completion.totals['Not started']).toBe(completion.totals.sheets);

      // JSS 2B Mathematics approved, as if it had come through review.
      const armId = (
        await t.prisma.classArm.findFirstOrThrow({
          where: { schoolId, name: 'B', level: { name: 'JSS 2' }, branchId: mainId },
        })
      ).id;
      expect((await admin.get(`/api/v1/academics/results/sheets/${armId}/MTH`)).status).toBe(200);
      const sheet = await t.prisma.resultSheet.findFirstOrThrow({
        where: { termId, armId, subject: { code: 'MTH' } },
      });
      const comps = await t.prisma.assessmentComponent.findMany({
        where: { schemeId: sheet.schemeId },
        orderBy: { sortOrder: 'asc' },
      });
      const roll = await t.prisma.enrollment.findMany({
        where: { armId, status: 'ACTIVE' },
        select: { studentId: true },
      });
      // Everyone scores 80% of each component except one student on 30%.
      for (const [i, { studentId }] of roll.entries()) {
        const entry = await t.prisma.resultEntry.create({
          data: { schoolId, sheetId: sheet.id, studentId },
        });
        await t.prisma.resultScore.createMany({
          data: comps.map((c) => ({
            schoolId,
            entryId: entry.id,
            componentId: c.id,
            state: 'SCORED' as const,
            score: Number(c.maxScore) * (i === 0 ? 0.3 : 0.8),
          })),
        });
      }
      await t.prisma.resultSheet.update({ where: { id: sheet.id }, data: { status: 'APPROVED' } });

      const perf = await report('subject-performance', { section: 'Junior Secondary' });
      expect(perf.rows).toHaveLength(1);
      expect(perf.rows[0].cells).toMatchObject({
        subject: 'Mathematics',
        sheets: 1,
        students: roll.length,
        highest: 80,
        lowest: 30,
      });
      expect(perf.rows[0].cells.passRate).toBe(Math.round(((roll.length - 1) / roll.length) * 100));

      const grades = await report('grade-distribution', { term: termId });
      expect(grades.filters[1]).toMatchObject({ key: 'section', value: 'Junior Secondary' });
      expect(grades.rows).toEqual([
        expect.objectContaining({
          cells: expect.objectContaining({ class: 'JSS 2B', results: roll.length }),
          to: { name: 'class', params: { id: armId } },
        }),
      ]);

      const after = await report('result-completion', { section: 'Junior Secondary' });
      expect(after.rows.find((x: Row) => x.cells.group === 'JSS 2B').cells.Approved).toBe(1);

      // On the dashboard too.
      const d = await dashboard();
      expect(d.performance).toEqual([{ label: 'Mathematics', percent: expect.any(Number) }]);
    });

    it('reads attendance from the registers', async () => {
      const r = await report('attendance');
      expect(r.blocked).toBeNull();
      expect(r.metrics.map((m: { label: string }) => m.label)).toEqual([
        'Attendance',
        'School days so far',
        'Registers not taken',
      ]);
      const arms = await t.prisma.classArm.count({
        where: { schoolId, branchId: mainId, archivedAt: null },
      });
      expect(r.rows).toHaveLength(arms);
      expect(r.rows[0].to.name).toBe('attendance-arm');
    });

    it('covers admissions, leavers, staff and teaching load', async () => {
      const apps = await t.prisma.admissionApplication.count({ where: { schoolId } });
      const admissions = await report('admissions');
      expect(admissions.rows).toHaveLength(apps);
      expect(admissions.metrics[0]).toMatchObject({ label: 'Applications', value: String(apps) });
      const pending = await report('admissions', { status: 'Pending' });
      expect(pending.rows.every((x: Row) => x.cells.stage === 'Pending')).toBe(true);

      const moves = await report('movements', { branch: 'All branches' });
      const left = await t.prisma.student.count({
        where: {
          schoolId,
          deletedAt: null,
          status: { in: ['TRANSFERRED', 'WITHDRAWN', 'GRADUATED'] },
        },
      });
      expect(moves.rows).toHaveLength(left);
      const bad = await admin.get('/api/v1/reports/movements?from=2026-13-01');
      expect(bad.status).toBe(422);
      expect(bad.body.message).toBe('From isn’t a valid date.');
      const backwards = await admin.get('/api/v1/reports/movements?from=2026-12-01&to=2026-11-01');
      expect(backwards.body.message).toBe('The start date is after the end date.');

      const staff = await report('staff', { branch: 'All branches' });
      const active = await t.prisma.staff.count({ where: { schoolId, status: 'ACTIVE' } });
      expect(staff.totals.total).toBe(active);
      expect(staff.totals.access + staff.totals.noAccess).toBe(active);

      const load = await report('teacher-workload');
      expect(load.rows.length).toBeGreaterThan(0);
      expect(load.rows[0].to.name).toBe('staff-member');
      expect(load.metrics[0].label).toBe('Teachers');
    });

    it('404s an unknown report', async () => {
      const res = await admin.get('/api/v1/reports/profit');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('REPORT_NOT_FOUND');
    });
  });
});
