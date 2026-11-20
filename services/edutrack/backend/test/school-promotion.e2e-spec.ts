import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

/**
 * End-of-session promotion at Greenfield, from 2026/2027 (Active). JSS 2B gets published results
 * for the session's three terms; the Junior Secondary rule (45% annual average and a pass in
 * English and Mathematics) suggests decisions, the school overrides some with reasons, and
 * applying enrolls the class into 2027/2028. Then Primary 6 → JSS 1 across the section boundary,
 * SSS 3 graduating, section admins, the fees setting and the session-closing checklist.
 */

type Api = ReturnType<typeof authed>;
interface StudentView {
  id: string;
  name: string;
  arm: string | null;
  average: number | null;
  mustPass: (number | null)[];
  eligible: boolean | null;
  note: string;
  suggestion: string | null;
  decision: string | null;
  reason: string;
  next: string;
}

const P = '/api/v1/academics/promotion';
// Fri 20 Nov 2026, 10:00 in Lagos.
const NOW = Date.parse('2026-11-20T09:00:00.000Z');
const ADMIN = 'adaeze.okonkwo@greenfield.edu.ng';

describe('Promotion (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  let sessionId: string;
  let branchId: string;
  const levelId: Record<string, string> = {};
  const key = (level: string) => `${levelId[level]}~${branchId}`;
  /** JSS 2B's students, in the screen's order (surname, first name). */
  let roll: { id: string; name: string }[] = [];

  const view = async (level: string) => {
    const res = await admin.get(`${P}?class=${encodeURIComponent(key(level))}`);
    expect(res.status).toBe(200);
    return res.body.data as {
      from: string;
      to: string;
      rule: string;
      mustPass: string[];
      classes: { id: string; name: string; pending: number; total: number; status: string }[];
      classId: string;
      nextLevel: string | null;
      students: StudentView[];
      applied: boolean;
      suggestions: boolean;
    };
  };
  const student = (v: { students: StudentView[] }, i: number) =>
    v.students.find((s) => s.id === roll[i]!.id)!;
  const decide = (
    level: string,
    decisions: { studentId: string; decision: string | null; reason?: string }[],
  ) => admin.put(`${P}/${key(level)}`).send({ decisions });
  const settings = (body: Record<string, boolean>) =>
    admin.put('/api/v1/settings/academic').send(body);

  /** Published results for a JSS 2B subject in a term: totals by roll index (null: none). */
  async function publish(code: string, termId: string, total: (i: number) => number | null) {
    const arm = await t.prisma.classArm.findFirstOrThrow({
      where: { schoolId, name: 'B', levelId: levelId['JSS 2'], branchId },
    });
    const subject = await t.prisma.subject.findFirstOrThrow({ where: { schoolId, code } });
    const scheme = await t.prisma.assessmentScheme.findFirstOrThrow({
      where: { sessionId, section: { code: 'JSS' } },
    });
    const sheet = await t.prisma.resultSheet.create({
      data: {
        schoolId,
        sessionId,
        termId,
        levelId: arm.levelId,
        armId: arm.id,
        subjectId: subject.id,
        schemeId: scheme.id,
        status: 'PUBLISHED',
        publishedAt: new Date(NOW),
      },
    });
    const rows = roll
      .map((s, i) => ({ studentId: s.id, total: total(i) }))
      .filter((r) => r.total !== null);
    await t.prisma.resultEntry.createMany({
      data: rows.map((r) => ({
        schoolId,
        sheetId: sheet.id,
        studentId: r.studentId,
        total: r.total,
      })),
    });
  }

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    t.clock.set(NOW);
    admin = authed(t, (await signIn(t, ADMIN)).token);
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    const session = await t.prisma.academicSession.findFirstOrThrow({
      where: { schoolId, status: 'ACTIVE' },
      include: { terms: { orderBy: { sequence: 'asc' } } },
    });
    sessionId = session.id;
    branchId = (await t.prisma.branch.findFirstOrThrow({ where: { schoolId, code: 'GFA-MC' } })).id;
    for (const l of await t.prisma.classLevel.findMany({ where: { schoolId } }))
      levelId[l.name] = l.id;
    roll = (
      await t.prisma.enrollment.findMany({
        where: { sessionId, levelId: levelId['JSS 2'], branchId, status: 'ACTIVE' },
        include: { student: true },
        orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
      })
    ).map((e) => ({ id: e.studentId, name: `${e.student.firstName} ${e.student.surname}` }));
    expect(roll.length).toBeGreaterThan(10);

    // Totals: 0 is eligible (Mathematics 50 and 70 → 60), 1 fails Mathematics, 2 averages 44,
    // the last has no results at all, everyone else is comfortably through.
    const last = roll.length - 1;
    const [first, second, third] = session.terms;
    const eng = (i: number) => (i === last ? null : i === 2 ? 44 : 70);
    const bsc = (i: number) => (i === last ? null : i === 2 ? 44 : i === 1 ? 80 : 50);
    const mth = (term: number) => (i: number) =>
      i === last ? null : i === 0 ? [50, 70, null][term]! : i === 1 ? 35 : i === 2 ? 44 : 55;
    for (const [n, term] of [first!, second!, third!].entries()) {
      await publish('ENG', term.id, eng);
      await publish('BSC', term.id, bsc);
      await publish('MTH', term.id, mth(n));
    }
  });

  afterAll(async () => {
    t.clock.set(Date.now());
    await t.reseed();
    await t.close();
  });

  describe('the rule', () => {
    it('is set per section on Assessment & Grading', async () => {
      const a = (await admin.get('/api/v1/academics/assessment')).body.data;
      const names = (section: string, ids: string[]) =>
        ids.map(
          (id) => a.promotionSubjects[section].find((s: { id: string }) => s.id === id)?.name,
        );
      expect(a.promotion['Junior Secondary'].minAverage).toBe(45);
      expect(names('Junior Secondary', a.promotion['Junior Secondary'].mustPass)).toEqual(
        expect.arrayContaining(['English Language', 'Mathematics']),
      );
      expect(a.promotion['Junior Secondary'].mustPass).toHaveLength(2);
      expect(a.promotion.Primary.minAverage).toBe(40);
      expect(a.promotion.Nursery).toEqual({ minAverage: null, mustPass: [] });

      const body = (promotion: Record<string, unknown>) => ({
        same: a.same,
        schemes: a.schemes,
        rounding: a.rounding,
        passMark: a.passMark,
        promotion,
      });
      const jss = a.promotion['Junior Secondary'];
      const bad = await admin.put('/api/v1/academics/assessment').send(
        body({
          'Junior Secondary': {
            minAverage: 45,
            mustPass: ['00000000-0000-4000-8000-000000000000'],
          },
        }),
      );
      expect(bad.status).toBe(422);
      expect(bad.body.error.code).toBe('PROMOTION_RULE_INVALID');
      const nursery = await admin
        .put('/api/v1/academics/assessment')
        .send(body({ Nursery: { minAverage: 50, mustPass: [] } }));
      expect(nursery.body.error.code).toBe('PROMOTION_RULE_INVALID');

      const res = await admin
        .put('/api/v1/academics/assessment')
        .send(body({ 'Junior Secondary': { minAverage: 50, mustPass: jss.mustPass } }));
      expect(res.status).toBe(200);
      expect(res.body.data.promotion['Junior Secondary'].minAverage).toBe(50);
      expect((await view('JSS 2')).rule).toMatch(/^Annual average of 50% or more/);
      const settingsView = (await admin.get('/api/v1/settings/academic')).body.data;
      expect(settingsView.promotionRule).toContain('Junior Secondary: Annual average of 50%');

      await admin.put('/api/v1/academics/assessment').send(body({ 'Junior Secondary': jss }));
    });
  });

  describe('suggestions', () => {
    it('works out annual averages, eligibility and a suggestion per student', async () => {
      const v = await view('JSS 2');
      expect(v).toMatchObject({
        from: '2026/2027',
        to: '',
        classId: key('JSS 2'),
        nextLevel: 'JSS 3',
        applied: false,
        suggestions: true,
        rule: 'Annual average of 45% or more and a pass (40%) in English Language and Mathematics',
        mustPass: ['English Language', 'Mathematics'],
      });
      expect(v.classes.find((c) => c.id === key('JSS 2'))).toMatchObject({
        status: 'Pending',
        total: roll.length,
        pending: roll.length,
      });
      // Mathematics 50 and 70 (the third term not published) → 60; (70 + 60 + 50) / 3 = 60.
      expect(student(v, 0)).toMatchObject({
        average: 60,
        mustPass: [70, 60],
        eligible: true,
        suggestion: 'Promote',
        decision: null,
        arm: 'B',
      });
      expect(student(v, 1)).toMatchObject({
        mustPass: [70, 35],
        eligible: false,
        suggestion: 'Repeat',
        note: 'Below the pass mark (40) in Mathematics',
      });
      expect(student(v, 2)).toMatchObject({
        average: 44,
        eligible: false,
        suggestion: 'Repeat',
        note: 'Annual average below 45%',
      });
      expect(student(v, roll.length - 1)).toMatchObject({
        average: null,
        eligible: null,
        suggestion: null,
      });
      expect(student(v, roll.length - 1).note).toMatch(/No published results/);
      expect(student(v, 5)).toMatchObject({ eligible: true, suggestion: 'Promote' });
    });

    it('makes no suggestions when the school turns them off', async () => {
      expect((await settings({ promotionSuggestions: false })).status).toBe(200);
      const v = await view('JSS 2');
      expect(v.suggestions).toBe(false);
      expect(v.students.every((s) => s.suggestion === null && s.eligible === null)).toBe(true);
      expect(student(v, 0).average).toBe(60);
      await settings({ promotionSuggestions: true });
    });

    it('lands on the first class still pending without a class', async () => {
      const res = await admin.get(P);
      expect(res.status).toBe(200);
      const v = res.body.data;
      expect(v.classes.length).toBeGreaterThan(3);
      expect(v.classes.map((c: { id: string }) => c.id)).toContain(key('JSS 2'));
      expect(v.classId).toBe(v.classes[0].id);
    });
  });

  describe('deciding and applying JSS 2', () => {
    const last = () => roll.length - 1;

    it('saves drafts and refuses a decision the class can’t take', async () => {
      const grad = await decide('JSS 2', [{ studentId: roll[0]!.id, decision: 'Graduate' }]);
      expect(grad.status).toBe(422);
      expect(grad.body.error.code).toBe('DECISION_INVALID');

      // Everyone takes the suggestion except 0 (repeats), 1 (promoted) and the last (no decision).
      const decisions = roll.slice(0, -1).map((s, i) => ({
        studentId: s.id,
        decision: i === 0 || i === 2 ? 'Repeat' : 'Promote',
        reason: '',
      }));
      const res = await decide('JSS 2', decisions);
      expect(res.status).toBe(200);
      expect(student(res.body.data, 1).decision).toBe('Promote');
      expect(student(res.body.data, last()).decision).toBeNull();
      expect(student(res.body.data, 3).next).toBe('JSS 3 · arm B');
      expect(student(res.body.data, 0).next).toBe('JSS 2 · arm B (repeat)');
      expect(res.body.data.classes.find((c: { id: string }) => c.id === key('JSS 2')).pending).toBe(
        1,
      );
    });

    it('needs the next session first', async () => {
      const res = await admin.post(`${P}/${key('JSS 2')}/apply`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NO_NEXT_SESSION');
      const created = await admin.post('/api/v1/academics/sessions').send({
        name: '2027/2028',
        start: '2027-09-13',
        end: '2028-07-21',
        structure: '3 terms',
        termNames: ['First Term', 'Second Term', 'Third Term'],
      });
      expect(created.status).toBe(201);
      expect((await view('JSS 2')).to).toBe('2027/2028');
    });

    it('needs every student decided and a reason for each exception', async () => {
      const undecided = await admin.post(`${P}/${key('JSS 2')}/apply`);
      expect(undecided.status).toBe(422);
      expect(undecided.body.error.code).toBe('UNDECIDED');
      expect(undecided.body.message).toContain(roll[last()]!.name);

      await decide('JSS 2', [
        { studentId: roll[last()]!.id, decision: 'Transfer', reason: 'Family relocating to Abuja' },
      ]);
      const noReason = await admin.post(`${P}/${key('JSS 2')}/apply`);
      expect(noReason.status).toBe(422);
      expect(noReason.body.error.code).toBe('REASON_REQUIRED');
      // 0 is eligible but repeats; 1 isn't but is promoted. 2 repeats as suggested: no reason.
      expect(noReason.body.message).toContain(roll[0]!.name);
      expect(noReason.body.message).toContain(roll[1]!.name);
      expect(noReason.body.message).not.toContain(roll[2]!.name);

      await decide('JSS 2', [
        { studentId: roll[0]!.id, decision: 'Repeat', reason: 'Parents asked; long illness' },
        { studentId: roll[1]!.id, decision: 'Promote', reason: 'Passed the Mathematics re-sit' },
      ]);
    });

    it('enrolls the class into 2027/2028, keeping arms where there is room', async () => {
      // JSS 3B has room for three: the rest wait for an arm.
      await t.prisma.classArm.updateMany({
        where: { schoolId, levelId: levelId['JSS 3'], branchId, name: 'B' },
        data: { capacity: 3 },
      });
      const res = await admin.post(`${P}/${key('JSS 2')}/apply`);
      expect(res.status).toBe(200);
      const promoted = roll.length - 3;
      expect(res.body.data.created).toBe(promoted + 2);
      expect(res.body.data.applied).toBe(true);
      expect(res.body.data.classes.find((c: { id: string }) => c.id === key('JSS 2')).status).toBe(
        'Complete',
      );

      const next = await t.prisma.academicSession.findFirstOrThrow({
        where: { schoolId, name: '2027/2028' },
      });
      const enrolled = await t.prisma.enrollment.findMany({
        where: { sessionId: next.id },
        include: { arm: true },
      });
      const inJss3 = enrolled.filter((e) => e.levelId === levelId['JSS 3']);
      expect(inJss3).toHaveLength(promoted);
      expect(inJss3.filter((e) => e.arm?.name === 'B')).toHaveLength(3);
      expect(inJss3.filter((e) => e.armId === null)).toHaveLength(promoted - 3);
      const repeating = enrolled.filter((e) => e.levelId === levelId['JSS 2']);
      expect(repeating.map((e) => e.studentId)).toEqual(
        expect.arrayContaining([roll[0]!.id, roll[2]!.id]),
      );
      expect(repeating).toHaveLength(2);
      expect(repeating.every((e) => e.arm?.name === 'B' && e.branchId === branchId)).toBe(true);
      expect(enrolled.some((e) => e.studentId === roll[last()]!.id)).toBe(false);

      const old = await t.prisma.enrollment.findMany({
        where: { sessionId, studentId: { in: roll.map((s) => s.id) } },
        include: { promotionDecisions: true },
      });
      expect(old.find((e) => e.studentId === roll[0]!.id)!.outcome).toBe('REPEAT');
      expect(old.find((e) => e.studentId === roll[3]!.id)!.outcome).toBe('PROMOTE');
      const leaver = old.find((e) => e.studentId === roll[last()]!.id)!;
      expect(leaver).toMatchObject({ outcome: 'TRANSFER', status: 'ACTIVE' });
      expect(leaver.promotionDecisions[0]).toMatchObject({
        decision: 'TRANSFER',
        reason: 'Family relocating to Abuja',
        toSessionId: next.id,
      });
      expect(old.every((e) => e.promotionDecisions[0]?.appliedAt)).toBe(true);
      const s = await t.prisma.student.findUniqueOrThrow({ where: { id: roll[last()]!.id } });
      expect(s).toMatchObject({ status: 'TRANSFERRED', exitKind: 'TRANSFER' });
      expect(s.leftOn?.toISOString().slice(0, 10)).toBe('2027-07-23');

      const v = await view('JSS 2');
      expect(student(v, 0)).toMatchObject({ decision: 'Repeat', next: 'JSS 2 · arm B (repeat)' });
      expect(v.students.filter((x) => x.next === 'JSS 3 · arm B')).toHaveLength(3);
      expect(v.students.filter((x) => x.next === 'JSS 3 · awaiting an arm')).toHaveLength(
        promoted - 3,
      );
      expect(student(v, last()).next).toBe('Leaves school');

      const audit = await t.prisma.auditEvent.findFirst({
        where: { schoolId, action: 'promotion.apply' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.summary).toBe('Promotion decisions applied for JSS 2');
    });

    it('is then read-only and can’t be applied twice', async () => {
      const put = await decide('JSS 2', [{ studentId: roll[0]!.id, decision: 'Promote' }]);
      expect(put.status).toBe(409);
      expect(put.body.error.code).toBe('ALREADY_APPLIED');
      const again = await admin.post(`${P}/${key('JSS 2')}/apply`);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ALREADY_APPLIED');
    });
  });

  describe('other classes', () => {
    it('promotes the last class of a section into the next section, without results', async () => {
      // Michael moves up to Primary 6A for this test: Primary 6 → JSS 1.
      const michael = await t.prisma.student.findFirstOrThrow({
        where: { schoolId, admissionNo: 'STU-2023-0311' },
      });
      const p6a = await t.prisma.classArm.findFirstOrThrow({
        where: { schoolId, levelId: levelId['Primary 6'], branchId, name: 'A' },
      });
      await t.prisma.enrollment.updateMany({
        where: { sessionId, studentId: michael.id },
        data: { levelId: p6a.levelId, armId: p6a.id },
      });
      const v = await view('Primary 6');
      expect(v.nextLevel).toBe('JSS 1');
      expect(v.rule).toMatch(/^Annual average of 40% or more/);
      expect(v.students[0]).toMatchObject({ id: michael.id, eligible: null, suggestion: null });
      expect(v.students[0]!.note).toMatch(/No published results/);

      expect(
        (await decide('Primary 6', [{ studentId: michael.id, decision: 'Promote' }])).status,
      ).toBe(200);
      const res = await admin.post(`${P}/${key('Primary 6')}/apply`);
      expect(res.status).toBe(200);
      expect(res.body.data.students[0].next).toBe('JSS 1 · arm A');
      const e = await t.prisma.enrollment.findFirstOrThrow({
        where: { studentId: michael.id, session: { name: '2027/2028' } },
        include: { arm: true },
      });
      expect(e).toMatchObject({ levelId: levelId['JSS 1'], branchId });
      expect(e.arm?.name).toBe('A');
    });

    it('graduates the final class', async () => {
      const v = await view('SSS 3');
      expect(v.nextLevel).toBeNull();
      const seun = v.students[0]!;
      const promote = await decide('SSS 3', [{ studentId: seun.id, decision: 'Promote' }]);
      expect(promote.body.error.code).toBe('DECISION_INVALID');
      await decide('SSS 3', [{ studentId: seun.id, decision: 'Graduate' }]);
      const res = await admin.post(`${P}/${key('SSS 3')}/apply`);
      expect(res.status).toBe(200);
      expect(res.body.data.created).toBe(0);
      expect(res.body.data.students[0].next).toBe('Graduates');
      expect(res.body.data.classes.find((c: { id: string }) => c.id === key('SSS 3')).status).toBe(
        'Graduated',
      );
      const s = await t.prisma.student.findUniqueOrThrow({ where: { id: seun.id } });
      expect(s.status).toBe('GRADUATED');
      expect(s.graduatedOn?.toISOString().slice(0, 10)).toBe('2027-07-23');
      expect(
        await t.prisma.enrollment.count({
          where: { studentId: seun.id, session: { name: '2027/2028' } },
        }),
      ).toBe(0);
    });

    it('lets section admins decide only for their sections', async () => {
      const membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { schoolId, user: { email: ADMIN } },
      });
      const primary = await t.prisma.section.findFirstOrThrow({
        where: { schoolId, name: 'Primary' },
      });
      await t.prisma.membershipSection.create({
        data: { schoolId, membershipId: membership.id, sectionId: primary.id },
      });
      try {
        const halima = (await view('SSS 1')).students[0]!;
        const put = await decide('SSS 1', [{ studentId: halima.id, decision: 'Promote' }]);
        expect(put.status).toBe(403);
        expect(put.body.error.code).toBe('SECTION_FORBIDDEN');
        const apply = await admin.post(`${P}/${key('SSS 1')}/apply`);
        expect(apply.body.error.code).toBe('SECTION_FORBIDDEN');
      } finally {
        await t.prisma.membershipSection.deleteMany({ where: { membershipId: membership.id } });
      }
    });

    it('doesn’t block on fees while Finance has no balances', async () => {
      await settings({ blockPromotionOnFees: true });
      try {
        const halima = (await view('SSS 1')).students[0]!;
        await decide('SSS 1', [{ studentId: halima.id, decision: 'Promote' }]);
        const res = await admin.post(`${P}/${key('SSS 1')}/apply`);
        expect(res.status).toBe(200);
        expect(res.body.data.feesBlock).toBe(true);
      } finally {
        await settings({ blockPromotionOnFees: false });
      }
    });
  });

  describe('the session-closing checklist', () => {
    it('counts the classes promoted', async () => {
      const item = async (id: string) =>
        (await admin.get(`/api/v1/academics/sessions/${id}/close`)).body.data.checklist.items.find(
          (i: { label: string }) => i.label === 'Promotion',
        );
      const classes = (await view('JSS 2')).classes;
      const done = classes.filter((c) => c.status !== 'Pending').length;
      expect(done).toBe(4);
      expect(await item(sessionId)).toMatchObject({
        detail: `4 of ${classes.length} classes promoted`,
        status: 'Review needed',
      });
      // 2025/2026's leavers and Emmanuel were all decided at the time.
      const last = await t.prisma.academicSession.findFirstOrThrow({
        where: { schoolId, name: '2025/2026' },
      });
      expect(await item(last.id)).toMatchObject({ status: 'Complete' });
    });
  });
});
