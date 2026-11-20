import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/auth/password.js';
import type { MembershipStatus } from '../src/generated/prisma/enums.js';
import {
  authed,
  createTestApp,
  login,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

/**
 * The Parent Portal on the API. Mrs. Funke Adeyemi (seeded login funke.adeyemi@gmail.com) is the
 * mother and fee payer of Emmanuel (JSS 2B, paid in full, has a Student Portal login) and Michael
 * (Primary 5B, owes part of First Term, no student login). Mr. Tayo Adeyemi is Emmanuel's second
 * guardian and doesn't pay his fees. Mr. Chukwudi Okeke is another family.
 */

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const CRESTVIEW = 'crestview.localhost';
const FUNKE = 'funke.adeyemi@gmail.com';
const PRINCIPAL = 'adaeze.okonkwo@greenfield.edu.ng';
const ADE = 's.ade@greenfield.edu.ng';
const P = '/api/v1/parent';

const JPG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]).toString('base64')}`;

describe('Parent Portal (e2e)', () => {
  let t: TestApp;
  let funke: Api;
  let bursar: Api;
  let schoolId: string;
  let emmanuel: string;
  let michael: string;
  let kelechi: string;
  const tag = randomUUID().slice(-8);
  const createdUsers: string[] = [];
  const borrowed: { id: string; userId: string; status: MembershipStatus }[] = [];

  const parents = new Map<string, { api: Api; userId: string }>();

  /** A Parent Portal account for a seeded guardian without one (one per guardian). */
  async function parentFor(guardianName: string) {
    const known = parents.get(guardianName);
    if (known) return known;
    const g = await t.prisma.guardian.findFirstOrThrow({
      where: { fullName: guardianName, schoolId },
    });
    const email = `parent.${tag}.${g.id.slice(-6)}@example.com`;
    const user = await t.prisma.user.create({
      data: {
        email,
        firstName: guardianName.split(' ')[0]!,
        lastName: 'Parent',
        status: 'ACTIVE',
        passwordHash: await hashPassword(PASSWORD),
        passwordChangedAt: new Date(),
        emailVerifiedAt: new Date(),
      },
    });
    createdUsers.push(user.id);
    const existing = await t.prisma.schoolMembership.findFirst({ where: { guardianId: g.id } });
    if (existing) {
      borrowed.push({ id: existing.id, userId: existing.userId, status: existing.status });
      await t.prisma.schoolMembership.update({
        where: { id: existing.id },
        data: { userId: user.id, status: 'ACTIVE', activatedAt: new Date() },
      });
    } else
      await t.prisma.schoolMembership.create({
        data: {
          schoolId,
          userId: user.id,
          kind: 'GUARDIAN',
          status: 'ACTIVE',
          guardianId: g.id,
          activatedAt: new Date(),
        },
      });
    const res = await login(t, email, PASSWORD, { portal: 'parent', host: HOST });
    expect(res.status).toBe(200);
    const made = {
      api: authed(t, res.body.data.accessToken as string, { host: HOST }),
      userId: user.id,
    };
    parents.set(guardianName, made);
    return made;
  }

  const data = async (
    req: PromiseLike<{ status: number; body: { data: unknown } }>,
    status = 200,
  ) => {
    const res = await req;
    if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const studentId = async (admissionNo: string) =>
    (await t.prisma.student.findFirstOrThrow({ where: { admissionNo } })).id;
  const upload = (api: Api, name = 'transfer.jpg') =>
    data(api.post('/api/v1/uploads').send({ name, dataUrl: JPG }), 201).catch(async () =>
      data(api.post('/api/v1/uploads').send({ name, dataUrl: JPG })),
    );

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    emmanuel = await studentId('STU-2025-0042');
    michael = await studentId('STU-2023-0311');
    kelechi = await studentId('STU-2025-0079');
    const res = await login(t, FUNKE, PASSWORD, { portal: 'parent', host: HOST });
    expect(res.status).toBe(200);
    funke = authed(t, res.body.data.accessToken as string, { host: HOST });
    bursar = authed(t, (await signIn(t, PRINCIPAL)).token);
  });

  afterAll(async () => {
    for (const b of borrowed)
      await t.prisma.schoolMembership.update({
        where: { id: b.id },
        data: { userId: b.userId, status: b.status },
      });
    await t.prisma.authSession.deleteMany({ where: { userId: { in: createdUsers } } });
    await t.prisma.notificationPreference.deleteMany({ where: { userId: { in: createdUsers } } });
    await t.prisma.schoolMembership.deleteMany({ where: { userId: { in: createdUsers } } });
    await t.prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await t.reseed();
    await t.close();
  });

  describe('sign-in and the frame', () => {
    it('signs the seeded parent in on the school’s address only', async () => {
      const res = await login(t, FUNKE, PASSWORD, { portal: 'parent', host: HOST });
      expect(res.body.data.user).toMatchObject({ email: FUNKE, displayName: 'Funke Adeyemi' });
      expect(res.body.data.school).toMatchObject({ slug: 'greenfield' });
      const crest = await login(t, FUNKE, PASSWORD, { portal: 'parent', host: CRESTVIEW });
      expect([crest.status, crest.body.error.code]).toEqual([403, 'NO_ACCESS']);
      // A Greenfield token used on another school's address is refused.
      const token = res.body.data.accessToken as string;
      expect((await authed(t, token, { host: CRESTVIEW }).get(`${P}/overview`)).status).toBe(403);
    });

    it('loads the frame: parent, school contact, term and both children with fee badges', async () => {
      const o = await data(funke.get(`${P}/overview`));
      expect(o.parent).toMatchObject({
        name: 'Mrs. Funke Adeyemi',
        firstName: 'Funke',
        email: FUNKE,
      });
      expect(o.school).toMatchObject({ name: 'Greenfield Academy', initials: 'GA' });
      expect(o.term).toMatchObject({ name: 'First Term', session: '2026/2027' });
      expect(o.children.map((c: { name: string }) => c.name)).toEqual([
        'Emmanuel Adeyemi',
        'Michael Adeyemi',
      ]);
      const [e, m] = o.children;
      expect(e).toMatchObject({
        id: emmanuel,
        initials: 'EA',
        className: 'JSS 2B',
        relationship: 'Mother',
        paysFees: true,
        access: 'full',
        handsInThrough: 'student',
        fees: { outstanding: 0 },
      });
      expect(m).toMatchObject({ className: 'Primary 5B', handsInThrough: 'guardian' });
      expect(m.fees.outstanding).toBeGreaterThan(0);
      // The older children list keeps its fields.
      const kids = await data(funke.get(`${P}/children`));
      expect(kids[0]).toMatchObject({ id: emmanuel, admissionNo: 'STU-2025-0042', leftOn: null });
    });

    it('is only for parents', async () => {
      const ade = authed(t, (await signIn(t, ADE, { host: HOST })).token, { host: HOST });
      expect((await ade.get(`${P}/overview`)).status).toBe(403);
      expect((await ade.get(`${P}/children/${emmanuel}/fees`)).status).toBe(403);
    });
  });

  describe('a child', () => {
    it('shows enrolment, this term and guardians on record by name and relationship only', async () => {
      const c = await data(funke.get(`${P}/children/${emmanuel}`));
      expect(c.enrolment).toMatchObject({
        session: '2026/2027',
        className: 'JSS 2B',
        admissionNo: 'STU-2025-0042',
        branch: 'Main Campus',
      });
      expect(c.enrolment.classTeacher).toBeTruthy();
      expect(c.thisTerm.attendance.schoolDays).toBeGreaterThan(0);
      expect(c.guardians).toEqual([
        { name: 'Mrs. Funke Adeyemi', relationship: 'Mother', you: true, paysFees: true },
        { name: 'Mr. Tayo Adeyemi', relationship: 'Father', you: false },
      ]);
      expect(JSON.stringify(c.guardians)).not.toMatch(/phone|email|@/);
    });

    it('builds Home: alerts, latest result, homework, today and announcements', async () => {
      const h = await data(funke.get(`${P}/children/${michael}/home`));
      expect(h.term).toBe('First Term · 2026/2027');
      expect(h.latestResult).toMatchObject({ status: 'not-published' });
      expect(Array.isArray(h.homework)).toBe(true);
      expect(h.today).toHaveProperty('lessons');
      expect(h.announcements).toEqual([]);
    });
  });

  describe('fees', () => {
    it('shows invoices, payments and where to pay to the fee payer', async () => {
      const f = await data(funke.get(`${P}/children/${michael}/fees`));
      expect(f).toMatchObject({ canPay: true, payBlockedReason: null, readOnly: false });
      expect(f.current).toMatchObject({ current: true, period: 'First Term · 2026/2027' });
      expect(f.current.balance).toBe(f.totals.outstanding);
      expect(f.current.installments.length).toBeGreaterThan(0);
      expect(f.payments[0]).toMatchObject({ status: 'Confirmed', method: 'Bank transfer' });
      expect(f.payTo.accounts[0]).toMatchObject({ bank: 'GTBank' });
      expect(f.payTo.reference).toBe('STU-2023-0311');
      expect(f.options[0]).toMatchObject({ key: 'all', amount: f.totals.outstanding });

      // Emmanuel is paid in full: nothing to pay.
      const e = await data(funke.get(`${P}/children/${emmanuel}/fees`));
      expect([e.totals.outstanding, e.options]).toEqual([0, []]);
    });

    it('takes a transfer claim with proof into the bursar’s verification queue', async () => {
      const before = await data(funke.get(`${P}/children/${michael}/fees`));
      const proof = await upload(funke);
      const claim = await data(
        funke.post(`${P}/children/${michael}/fees/claims`).send({
          option: 'all',
          paidOn: '2026-11-19',
          proofFileId: proof.id,
          reference: 'STU-2023-0311',
        }),
      );
      expect(claim).toMatchObject({
        amount: before.totals.outstanding,
        status: 'Pending verification',
      });

      const after = await data(funke.get(`${P}/children/${michael}/fees`));
      expect(after.totals).toMatchObject({
        outstanding: before.totals.outstanding,
        pending: before.totals.outstanding,
      });
      expect(after.options).toEqual([]);
      expect(after.payments[0]).toMatchObject({
        number: claim.number,
        status: 'Pending verification',
        byParent: true,
        proofName: 'transfer.jpg',
      });

      const queue = await data(bursar.get('/api/v1/finance/payments?tab=pending'));
      const row = queue.data.find((p: { no: string }) => p.no === claim.number);
      expect(row).toMatchObject({
        student: 'Michael Adeyemi',
        source: 'Parent claim',
        status: 'Pending verification',
        payer: 'Mrs. Funke Adeyemi',
      });
      const stored = await t.prisma.payment.findUniqueOrThrow({ where: { id: claim.id } });
      expect(stored).toMatchObject({ source: 'PARENT_CLAIM', proofFileId: proof.id });

      // Nothing left to claim, and the same proof can't be used twice.
      const again = await funke.post(`${P}/children/${michael}/fees/claims`).send({
        option: 'all',
        paidOn: '2026-11-19',
        proofFileId: (await upload(funke, 'second.jpg')).id,
      });
      expect([again.status, again.body.error.code]).toEqual([409, 'NOTHING_TO_PAY']);
      const reused = await funke.post(`${P}/children/${emmanuel}/fees/claims`).send({
        option: 'all',
        paidOn: '2026-11-19',
        proofFileId: proof.id,
      });
      expect(reused.status).toBe(422);
    });

    it('validates a claim', async () => {
      const proof = await upload(funke);
      const future = await funke
        .post(`${P}/children/${michael}/fees/claims`)
        .send({ option: 'all', paidOn: '2099-01-01', proofFileId: proof.id });
      expect(future.status).toBe(422);
      const amount = await funke
        .post(`${P}/children/${michael}/fees/claims`)
        .send({ option: 'all', paidOn: '2026-11-19', proofFileId: proof.id, amount: 1 });
      expect(amount.status).toBeGreaterThanOrEqual(400);
    });

    it('shows a guardian who doesn’t pay the fees read-only', async () => {
      const { api: tayo } = await parentFor('Tayo Adeyemi');
      const f = await data(tayo.get(`${P}/children/${emmanuel}/fees`));
      expect(f).toMatchObject({ canPay: false, payTo: null, options: [] });
      expect(f.payBlockedReason).toMatch(/Another guardian pays/);
      const kids = await data(tayo.get(`${P}/children`));
      expect(kids.map((k: { id: string; paysFees: boolean }) => [k.id, k.paysFees])).toEqual([
        [emmanuel, false],
      ]);
      const proof = await upload(tayo);
      const res = await tayo
        .post(`${P}/children/${emmanuel}/fees/claims`)
        .send({ option: 'all', paidOn: '2026-11-19', proofFileId: proof.id });
      expect([res.status, res.body.error.code]).toEqual([403, 'NOT_FEE_PAYER']);
    });

    it('lets the parent of a child who left pay an old balance', async () => {
      await t.prisma.student.update({
        where: { id: kelechi },
        data: { status: 'WITHDRAWN', leftOn: new Date(Date.now() - 10 * 86_400_000) },
      });
      try {
        const { api: obi } = await parentFor('Emeka Obi');
        const kids = await data(obi.get(`${P}/children`));
        expect(kids[0]).toMatchObject({ id: kelechi, access: 'read-only' });
        const f = await data(obi.get(`${P}/children/${kelechi}/fees`));
        expect(f).toMatchObject({ readOnly: true, canPay: true });
        expect(f.totals.outstanding).toBeGreaterThan(0);
        const proof = await upload(obi);
        const claim = await data(
          obi
            .post(`${P}/children/${kelechi}/fees/claims`)
            .send({ option: 'all', paidOn: '2026-11-18', proofFileId: proof.id }),
        );
        expect(claim.status).toBe('Pending verification');
      } finally {
        await t.prisma.student.update({
          where: { id: kelechi },
          data: { status: 'ACTIVE', leftOn: null },
        });
      }
    });
  });

  describe('results', () => {
    const snapshot = (average: string) => ({
      title: 'First Term Report · 2026/2027',
      student: { name: 'Emmanuel Adeyemi', className: 'JSS 2B' },
      components: ['CA 1 /20', 'CA 2 /20', 'Exam /60'],
      subjects: [
        {
          name: 'Mathematics',
          scores: [15, 16, 45],
          total: '76.0',
          grade: 'A',
          remark: 'Excellent',
          position: '2nd of 14',
        },
      ],
      average,
      grade: 'B',
      position: '7th of 14',
      classTeacherRemark: 'A steady, hard-working term.',
      conduct: [{ trait: 'Punctuality', rating: 5 }],
      attendance: { present: 50, late: 2, absent: 1, excused: 0, schoolDays: 53 },
      cumulative: null,
      nextTerm: 'Mon 11 Jan 2027',
      classmates: [{ id: 'x', name: 'Someone Else' }],
      held: { reason: 'secret', at: 'now', by: 'someone' },
      version: 1,
    });

    it('says when results aren’t published, shows the card once they are, and hides held ones', async () => {
      const term = await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } });
      const arm = await t.prisma.enrollment.findFirstOrThrow({
        where: { studentId: emmanuel, sessionId: term.sessionId },
      });
      let r = await data(funke.get(`${P}/children/${emmanuel}/results`));
      expect(r).toMatchObject({
        termId: term.id,
        status: 'not-published',
        card: null,
        className: 'JSS 2B',
      });
      expect(r.terms.length).toBeGreaterThanOrEqual(1);

      // A draft card (remarks, no publish) shows nothing.
      const card = await t.prisma.reportCard.create({
        data: {
          schoolId,
          termId: term.id,
          studentId: emmanuel,
          armId: arm.armId!,
          classTeacherRemark: 'Draft remark not for parents yet.',
        },
      });
      r = await data(funke.get(`${P}/children/${emmanuel}/results`));
      expect([r.status, r.card]).toEqual(['not-published', null]);

      await t.prisma.reportCard.update({
        where: { id: card.id },
        data: { publishedAt: new Date(), version: 1, snapshot: snapshot('71.4%'), average: 71.4 },
      });
      r = await data(funke.get(`${P}/children/${emmanuel}/results?term=${term.id}`));
      expect(r.status).toBe('published');
      expect(r.card).toMatchObject({ average: '71.4%', position: '7th of 14', grade: 'B' });
      expect(r.card.subjects[0]).toMatchObject({ name: 'Mathematics', total: '76.0' });
      expect(r.card).not.toHaveProperty('classmates');
      expect(r.card).not.toHaveProperty('held');
      const home = await data(funke.get(`${P}/children/${emmanuel}/home`));
      expect(home.latestResult).toMatchObject({ status: 'published', average: '71.4%' });

      // Held for fees: no card and no amount, just "contact the school".
      await t.prisma.reportCard.update({
        where: { id: card.id },
        data: { heldAt: new Date(), heldReason: 'Unpaid fees: ₦45,000 outstanding' },
      });
      r = await data(funke.get(`${P}/children/${emmanuel}/results`));
      expect(r).toMatchObject({ status: 'held', card: null });
      expect(r.held.message).toBe(
        'The school is holding this report card. Please contact the school.',
      );
      expect(JSON.stringify(r)).not.toMatch(/45,000|Unpaid/);

      // Held for another reason: the school's own words.
      await t.prisma.reportCard.update({
        where: { id: card.id },
        data: { heldReason: 'Library books not returned.' },
      });
      r = await data(funke.get(`${P}/children/${emmanuel}/results`));
      expect(r.held.message).toMatch(/Library books not returned\./);

      // Another family can't see it; unknown terms are refused.
      const { api: okeke } = await parentFor('Chukwudi Okeke');
      expect((await okeke.get(`${P}/children/${emmanuel}/results`)).status).toBe(404);
      expect(
        (await funke.get(`${P}/children/${emmanuel}/results?term=${randomUUID()}`)).status,
      ).toBe(404);
      await t.prisma.reportCard.delete({ where: { id: card.id } });
    });
  });

  describe('homework, timetable, materials and attendance', () => {
    it('hands in through the parent for a primary pupil only', async () => {
      const m = await data(funke.get(`${P}/children/${michael}/homework`));
      expect(m.handsInThrough).toBe('guardian');
      const e = await data(funke.get(`${P}/children/${emmanuel}/homework`));
      expect(e.handsInThrough).toBe('student');
      const a = e.assignments[0];
      expect(a.canSubmit).toBe(false);
      const file = await upload(funke, 'work.jpg');
      const res = await funke
        .post(`${P}/children/${emmanuel}/assignments/${a.id}/submission`)
        .send({ files: [{ id: file.id }] });
      expect([res.status, res.body.error.code]).toEqual([403, 'STUDENT_SUBMITS']);
      const mats = await data(funke.get(`${P}/children/${emmanuel}/materials`));
      expect(mats).toHaveProperty('materials');
    });

    it('shows the published timetable of the child’s class', async () => {
      const tt = await data(funke.get(`${P}/children/${emmanuel}/timetable`));
      expect(tt).toMatchObject({ className: 'JSS 2B', published: true, version: 1 });
      expect(tt.days.map((d: { day: string }) => d.day)).toEqual([
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
      ]);
      const lesson = tt.days[0].lessons.find((l: { isBreak: boolean }) => !l.isBreak);
      expect(lesson).toMatchObject({ start: expect.stringMatching(/^\d\d:\d\d$/) });
      expect(lesson.subject).toBeTruthy();
      const none = await data(funke.get(`${P}/children/${michael}/timetable`));
      expect([none.published, none.days]).toEqual([false, []]);
    });

    it('summarises attendance for the term with every marked day', async () => {
      const a = await data(funke.get(`${P}/children/${emmanuel}/attendance`));
      const s = a.summary;
      expect(s.schoolDays).toBe(a.days.length);
      expect(s.present + s.late + s.absent + s.excused).toBe(s.schoolDays);
      for (const d of a.days.filter((x: { mark: string }) => x.mark === 'Present'))
        expect(d.reason).toBeNull();
      const m = await data(funke.get(`${P}/children/${michael}/attendance`));
      expect(m.summary).toMatchObject({ schoolDays: 0, percent: null });
    });
  });

  describe('announcements and notifications', () => {
    it('shows what reaches the parent’s families and classes, not withdrawn or expired', async () => {
      const jss2b = (
        await t.prisma.enrollment.findFirstOrThrow({
          where: { studentId: emmanuel, status: 'ACTIVE' },
        })
      ).armId!;
      const other = await t.prisma.classArm.findFirstOrThrow({
        where: { schoolId, id: { not: jss2b }, level: { name: 'SSS 1' } },
      });
      const base = {
        schoolId,
        body: 'Body',
        channels: ['IN_APP' as const],
        status: 'SENT' as const,
      };
      const sent = (h: number) => new Date(Date.now() - h * 3_600_000);
      await t.prisma.announcement.createMany({
        data: [
          { ...base, title: `Everyone ${tag}`, audienceKind: 'EVERYONE', sentAt: sent(1) },
          { ...base, title: `Parents ${tag}`, audienceKind: 'PARENTS', sentAt: sent(2) },
          { ...base, title: `Teachers ${tag}`, audienceKind: 'TEACHERS', sentAt: sent(3) },
          {
            ...base,
            title: `Withdrawn ${tag}`,
            audienceKind: 'PARENTS',
            sentAt: sent(4),
            status: 'WITHDRAWN',
            withdrawnAt: new Date(),
          },
          {
            ...base,
            title: `Expired ${tag}`,
            audienceKind: 'EVERYONE',
            sentAt: sent(5),
            expiresOn: new Date('2026-01-01'),
          },
        ],
      });
      const mk = async (title: string, armId: string) => {
        const a = await t.prisma.announcement.create({
          data: { ...base, title, audienceKind: 'CLASSES', sentAt: sent(6) },
        });
        await t.prisma.announcementArm.create({ data: { schoolId, announcementId: a.id, armId } });
      };
      await mk(`JSS 2B ${tag}`, jss2b);
      await mk(`SSS 1 ${tag}`, other.id);
      const list = await data(funke.get(`${P}/announcements`));
      expect(list.map((a: { title: string }) => a.title)).toEqual([
        `Everyone ${tag}`,
        `Parents ${tag}`,
        `JSS 2B ${tag}`,
      ]);
      expect(list[2].audience).toBe('JSS 2B');
      const forMichael = await data(funke.get(`${P}/announcements?child=${michael}`));
      expect(forMichael.map((a: { title: string }) => a.title)).toEqual([
        `Everyone ${tag}`,
        `Parents ${tag}`,
      ]);
      const { api: okeke } = await parentFor('Chukwudi Okeke');
      expect((await okeke.get(`${P}/announcements?child=${michael}`)).status).toBe(404);
    });

    it('lists, reads and clears the parent’s own notifications', async () => {
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: FUNKE } });
      const other = await t.prisma.user.findUniqueOrThrow({ where: { email: PRINCIPAL } });
      await t.prisma.notification.deleteMany({ where: { userId: user.id } });
      await t.prisma.notification.createMany({
        data: [
          {
            userId: user.id,
            schoolId,
            category: 'results',
            title: 'Results out',
            link: '/results',
            entityType: 'Student',
            entityId: emmanuel,
          },
          { userId: user.id, schoolId, category: 'finance', title: 'Receipt', link: '/fees' },
        ],
      });
      const theirs = await t.prisma.notification.create({
        data: { userId: other.id, schoolId, category: 'finance', title: 'Not hers' },
      });
      const n = await data(funke.get('/api/v1/notifications'));
      expect([n.unread, n.total]).toEqual([2, 2]);
      const results = n.rows.find((r: { title: string }) => r.title === 'Results out');
      expect(results).toMatchObject({
        category: 'results',
        to: '/results',
        childId: emmanuel,
        read: false,
      });
      expect((await data(funke.post(`/api/v1/notifications/${results.id}/read`))).read).toBe(true);
      expect((await funke.post(`/api/v1/notifications/${theirs.id}/read`)).status).toBe(404);
      expect(await data(funke.post('/api/v1/notifications/read-all'))).toEqual({ marked: 1 });
      expect((await data(funke.get('/api/v1/notifications?filter=unread'))).rows).toEqual([]);
      // Sidebar counts are for staff portals.
      expect((await funke.get('/api/v1/nav-counts')).status).toBe(403);
    });
  });

  describe('profile and notification settings', () => {
    it('changes phone and address only, and records it for the school', async () => {
      const p = await data(funke.get(`${P}/profile`));
      expect(p).toMatchObject({
        name: 'Mrs. Funke Adeyemi',
        email: FUNKE,
        phone: '0803 555 0161',
        address: '22 Opebi Road, Ikeja',
      });
      const bad = await funke.patch(`${P}/profile`).send({ phone: '12345' });
      expect(bad.status).toBe(422);
      const email = await funke.patch(`${P}/profile`).send({ email: 'new@example.com' });
      expect(email.status).toBeGreaterThanOrEqual(400);
      const next = await data(
        funke
          .patch(`${P}/profile`)
          .send({ phone: '0809 555 0199', address: '5 Allen Avenue, Ikeja' }),
      );
      expect(next).toMatchObject({
        phone: '0809 555 0199',
        address: '5 Allen Avenue, Ikeja',
        email: FUNKE,
      });
      const g = await t.prisma.guardian.findFirstOrThrow({
        where: { schoolId, fullName: 'Funke Adeyemi' },
      });
      expect([g.phone, g.address, g.email]).toEqual([
        '+2348095550199',
        '5 Allen Avenue, Ikeja',
        FUNKE,
      ]);
      const audit = await t.prisma.auditEvent.findFirstOrThrow({
        where: { schoolId, entityType: 'Guardian', entityId: g.id, action: 'guardian.update' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit.summary).toMatch(/Parent Portal/);
    });

    it('saves in-app, email and SMS per kind of notification', async () => {
      const prefs = await data(funke.get(`${P}/notification-preferences`));
      expect(prefs.map((x: { key: string }) => x.key)).toEqual([
        'results',
        'finance',
        'assignments',
        'register',
        'announcements',
      ]);
      expect(prefs[0]).toMatchObject({ inApp: true, email: true, sms: true });
      const saved = await data(
        funke
          .put(`${P}/notification-preferences`)
          .send({ items: [{ key: 'announcements', inApp: true, email: false, sms: false }] }),
      );
      expect(saved.find((x: { key: string }) => x.key === 'announcements')).toMatchObject({
        email: false,
        sms: false,
      });
      // The school's next announcement skips Funke's email but still reaches her in-app.
      t.notifications.clear();
      const admin = authed(t, (await signIn(t, PRINCIPAL)).token);
      const sent = await admin.post('/api/v1/comms/announcements').send({
        title: `Prefs ${tag}`,
        body: 'Sports day holds on Friday. Come in house colours.',
        smsText: '',
        audience: { kind: 'classes', classes: ['JSS 2B'], branchId: null },
        channels: ['In-app', 'Email'],
        scheduledFor: null,
        expiresOn: null,
        action: 'send',
      });
      expect(sent.status).toBe(201);
      const emails = t.notifications.sent.filter((m) => m.template === 'announcement');
      expect(emails.length).toBeGreaterThan(0);
      expect(emails.some((m) => m.to === FUNKE)).toBe(false);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: FUNKE } });
      expect(
        await t.prisma.notification.count({ where: { userId: user.id, title: `Prefs ${tag}` } }),
      ).toBe(1);

      const wrong = await funke
        .put(`${P}/notification-preferences`)
        .send({ items: [{ key: 'whatsapp', inApp: true, email: true, sms: true }] });
      expect(wrong.status).toBe(422);
    });
  });

  describe('isolation', () => {
    it('never shows another family’s child', async () => {
      const { api: okeke } = await parentFor('Chukwudi Okeke');
      for (const path of [
        '',
        '/home',
        '/fees',
        '/results',
        '/timetable',
        '/attendance',
        '/homework',
        '/materials',
      ])
        expect((await okeke.get(`${P}/children/${michael}${path}`)).status).toBe(404);
      const proof = await upload(okeke);
      const res = await okeke
        .post(`${P}/children/${michael}/fees/claims`)
        .send({ option: 'all', paidOn: '2026-11-19', proofFileId: proof.id });
      expect(res.status).toBe(404);
      expect((await okeke.get(`${P}/children/not-a-uuid`)).status).toBe(404);
    });

    it('closes the portal when the school’s subscription lapses', async () => {
      const sub = await t.prisma.subscription.findFirstOrThrow({ where: { schoolId } });
      await t.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
      try {
        const res = await funke.get(`${P}/overview`);
        expect([res.status, res.body.error.code]).toEqual([403, 'SUBSCRIPTION_LAPSED']);
        const signin = await login(t, FUNKE, PASSWORD, { portal: 'parent', host: HOST });
        expect(signin.body.error.code).toBe('SUBSCRIPTION_LAPSED');
      } finally {
        await t.prisma.subscription.update({ where: { id: sub.id }, data: { status: sub.status } });
      }
    });
  });

  describe('invitations', () => {
    it('shows the children linked to a parent invitation', async () => {
      const admin = authed(t, (await signIn(t, PRINCIPAL)).token);
      const g = await t.prisma.guardian.findFirstOrThrow({
        where: { schoolId, fullName: 'Ngozi Eze' },
      });
      await data(admin.post(`/api/v1/guardians/${g.id}/invite`));
      const sent = t.notifications.find(g.email!, 'invitation')!;
      const token = decodeURIComponent((sent.data as { link: string }).link.split('/').pop()!);
      expect((sent.data as { link: string }).link).toContain(
        'greenfield.localhost/parent/accept-invitation/',
      );
      const inv = await data(t.http().get(`/api/v1/auth/invitations/${token}`));
      expect(inv.kind).toBe('guardian');
      expect(inv.children).toEqual([
        { name: 'Chiamaka Eze', firstName: 'Chiamaka', className: 'JSS 2B', branch: 'Main Campus' },
      ]);
    });
  });
});
