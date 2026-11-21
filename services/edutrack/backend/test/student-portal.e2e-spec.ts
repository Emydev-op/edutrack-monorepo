import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/auth/password.js';
import {
  authed,
  createTestApp,
  login,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

/**
 * The Student Portal on the API. Emmanuel Adeyemi (JSS 2B, seeded login: admission number
 * STU-2025-0042 and the demo password) signs in on Greenfield's address. A classmate gets a
 * login here for the isolation, leaver and password tests.
 */

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const CRESTVIEW = 'crestview.localhost';
const EMMANUEL = 'STU-2025-0042';
const PRINCIPAL = 'adaeze.okonkwo@greenfield.edu.ng';
const S = '/api/v1/student';
const JPG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]).toString('base64')}`;

describe('Student Portal (e2e)', () => {
  let t: TestApp;
  let me: Api;
  let schoolId: string;
  let emmanuel: string;
  let jss2b: string;
  const tag = randomUUID().slice(-8);

  const data = async (
    req: PromiseLike<{ status: number; body: { data: unknown } }>,
    status = 200,
  ) => {
    const res = await req;
    if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const signInStudent = (admissionNo: string, password = PASSWORD, host = HOST) =>
    login(t, admissionNo, password, { portal: 'student', host });
  const upload = (api: Api) =>
    data(api.post('/api/v1/uploads').send({ name: 'work.jpg', dataUrl: JPG }), 201).catch(
      async () => data(api.post('/api/v1/uploads').send({ name: 'work.jpg', dataUrl: JPG })),
    );

  /** A Student Portal login for a JSS 2B classmate of Emmanuel's (password: the demo one). */
  async function classmate(opts: { mustChange?: boolean; status?: 'ACTIVE' | 'INVITED' } = {}) {
    const e = await t.prisma.enrollment.findFirstOrThrow({
      where: {
        armId: jss2b,
        status: 'ACTIVE',
        studentId: { not: emmanuel },
        student: { membership: null, status: 'ACTIVE' },
      },
      include: { student: true },
    });
    const user = await t.prisma.user.create({
      data: {
        firstName: e.student.firstName,
        lastName: e.student.surname,
        status: 'ACTIVE',
        passwordHash: await hashPassword(PASSWORD),
        passwordChangedAt: new Date(),
        mustChangePassword: opts.mustChange ?? false,
      },
    });
    await t.prisma.schoolMembership.create({
      data: {
        schoolId,
        userId: user.id,
        kind: 'STUDENT',
        studentId: e.studentId,
        status: opts.status ?? 'ACTIVE',
        activatedAt: new Date(),
      },
    });
    return { student: e.student, userId: user.id };
  }

  async function signedIn(admissionNo: string) {
    const res = await signInStudent(admissionNo);
    if (res.status !== 200) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
    return authed(t, res.body.data.accessToken as string, { host: HOST });
  }

  /** A copy of one of Emmanuel's seeded assignments with other dates and status. */
  async function assignment(over: Record<string, unknown>) {
    const list = await data(me.get(`${S}/homework`));
    const seeded = await t.prisma.assignment.findFirstOrThrow({
      where: { id: list.assignments[0].id },
    });
    return t.prisma.assignment.create({
      data: {
        schoolId,
        termId: seeded.termId,
        armId: seeded.armId,
        subjectId: seeded.subjectId,
        teacherStaffId: seeded.teacherStaffId,
        title: `Essay ${tag} ${randomUUID().slice(-4)}`,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        dueAt: new Date(t.clock.now().getTime() + 3 * 86_400_000),
        ...over,
      },
    });
  }

  /** Classmate logins made by earlier runs: the seed leaves them, so clear them each time. */
  const removeClassmates = () =>
    t.prisma.schoolMembership.deleteMany({
      where: { schoolId, kind: 'STUDENT', studentId: { not: emmanuel } },
    });

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    emmanuel = (await t.prisma.student.findFirstOrThrow({ where: { admissionNo: EMMANUEL } })).id;
    jss2b = (
      await t.prisma.enrollment.findFirstOrThrow({
        where: { studentId: emmanuel, status: 'ACTIVE' },
      })
    ).armId!;
    await removeClassmates();
    me = await signedIn(EMMANUEL);
  });

  afterAll(async () => {
    await removeClassmates();
    await t.reseed();
    await t.close();
  });

  describe('sign-in', () => {
    it('signs Emmanuel in with his admission number on the school’s address only', async () => {
      const res = await signInStudent(EMMANUEL.toLowerCase());
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({
        admissionNo: EMMANUEL,
        displayName: 'Emmanuel Adeyemi',
      });
      expect(res.body.data.school).toMatchObject({ slug: 'greenfield' });
      expect((await signInStudent(EMMANUEL, 'wrong-password')).status).toBe(401);
      expect((await signInStudent(EMMANUEL, PASSWORD, CRESTVIEW)).status).toBe(401);
      const token = res.body.data.accessToken as string;
      expect((await authed(t, token, { host: CRESTVIEW }).get(`${S}/overview`)).status).toBe(403);
    });

    it('explains why a login can’t be used', async () => {
      const pending = await classmate({ status: 'INVITED' });
      const a = await signInStudent(pending.student.admissionNo);
      expect([a.status, a.body.error.code]).toEqual([403, 'ACCOUNT_PENDING']);
      await t.prisma.schoolMembership.updateMany({
        where: { userId: pending.userId },
        data: { status: 'ACTIVE' },
      });
      await t.prisma.user.update({
        where: { id: pending.userId },
        data: { mustChangePassword: true },
      });
      const b = await signInStudent(pending.student.admissionNo);
      expect([b.status, b.body.error.code]).toEqual([403, 'PASSWORD_EXPIRED']);
      const set = await t.http().post('/api/v1/auth/password/expired').set('Host', HOST).send({
        portal: 'student',
        email: pending.student.admissionNo,
        current: PASSWORD,
        next: 'Learner#2026',
      });
      expect(set.status).toBe(200);
      expect((await signInStudent(pending.student.admissionNo, 'Learner#2026')).status).toBe(200);

      const jss = await t.prisma.section.findFirstOrThrow({ where: { schoolId, code: 'JSS' } });
      await t.prisma.section.update({ where: { id: jss.id }, data: { studentLogins: false } });
      try {
        const off = await signInStudent(EMMANUEL);
        expect([off.status, off.body.error.code]).toEqual([403, 'STUDENT_LOGINS_OFF']);
      } finally {
        await t.prisma.section.update({ where: { id: jss.id }, data: { studentLogins: true } });
      }

      const sub = await t.prisma.subscription.findFirstOrThrow({ where: { schoolId } });
      await t.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
      try {
        expect((await signInStudent(EMMANUEL)).body.error.code).toBe('SUBSCRIPTION_LAPSED');
        const res = await me.get(`${S}/home`);
        expect([res.status, res.body.error.code]).toEqual([403, 'SUBSCRIPTION_LAPSED']);
      } finally {
        await t.prisma.subscription.update({ where: { id: sub.id }, data: { status: sub.status } });
      }
    });

    it('is only for students', async () => {
      const admin = authed(t, (await signIn(t, PRINCIPAL)).token);
      expect((await admin.get(`${S}/overview`)).status).toBe(403);
    });
  });

  describe('the frame, home, timetable and profile', () => {
    it('loads the frame: the student, the school’s contact details and the term', async () => {
      const o = await data(me.get(`${S}/overview`));
      expect(o.student).toMatchObject({
        id: emmanuel,
        name: 'Emmanuel Adeyemi',
        initials: 'EA',
        admissionNo: EMMANUEL,
        className: 'JSS 2B',
        section: 'Junior Secondary',
        access: 'full',
      });
      expect(o.school).toMatchObject({ name: 'Greenfield Academy', initials: 'GA' });
      expect(o.term).toMatchObject({ name: 'First Term', session: '2026/2027' });
    });

    it('builds Home: today, homework due, latest result, attendance and announcements', async () => {
      const h = await data(me.get(`${S}/home`));
      expect(h).toHaveProperty('today.lessons');
      expect(h).toHaveProperty('latestResult.status');
      expect(Array.isArray(h.homework)).toBe(true);
      expect(typeof h.homeworkDue).toBe('number');
      expect(h.attendance.schoolDays).toBeGreaterThan(0);
      expect(Array.isArray(h.announcements)).toBe(true);
    });

    it('shows the published timetable of his class', async () => {
      const tt = await data(me.get(`${S}/timetable`));
      expect(tt).toMatchObject({ className: 'JSS 2B', published: true });
      expect(tt.days).toHaveLength(5);
      expect((await me.get(`${S}/timetable?term=${randomUUID()}`)).status).toBe(404);
      expect((await me.get(`${S}/timetable?term=nope`)).status).toBe(422);
    });

    it('summarises attendance for the term with every marked day', async () => {
      const a = await data(me.get(`${S}/attendance`));
      expect(a.summary.schoolDays).toBe(a.days.length);
      expect(a.summary.present + a.summary.late + a.summary.absent + a.summary.excused).toBe(
        a.summary.schoolDays,
      );
    });

    it('shows his details read-only, guardians by name only', async () => {
      const p = await data(me.get(`${S}/profile`));
      expect(p).toMatchObject({
        name: 'Emmanuel Adeyemi',
        admissionNo: EMMANUEL,
        className: 'JSS 2B',
        gender: 'Male',
        status: 'Active',
      });
      expect(p.guardians[0]).toEqual({ name: 'Mrs. Funke Adeyemi', relationship: 'Mother' });
      expect(JSON.stringify(p.guardians)).not.toMatch(/phone|email|@/);
      expect((await me.patch(`${S}/profile`).send({ firstName: 'X' })).status).toBe(404);
    });
  });

  describe('homework and materials', () => {
    it('lists his assignments and materials with what he can hand in', async () => {
      const hw = await data(me.get(`${S}/homework`));
      expect(hw.handsInThrough).toBe('student');
      expect(hw.student).toMatchObject({ id: emmanuel, className: 'JSS 2B' });
      expect(hw.assignments.length).toBeGreaterThan(0);
      const m = await data(me.get(`${S}/materials`));
      expect(m).toHaveProperty('materials');
    });

    it('hands in his own work while open, late only when allowed, never once graded', async () => {
      const open = await assignment({});
      const empty = await me.post(`${S}/assignments/${open.id}/submission`).send({ files: [] });
      expect(empty.status).toBe(422);
      const file = await upload(me);
      const res = await me
        .post(`${S}/assignments/${open.id}/submission`)
        .send({ files: [{ id: file.id }], note: 'My essay' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Work handed in. Your teacher can see it now.');
      expect(res.body.data).toMatchObject({
        status: 'Submitted',
        late: false,
        note: 'My essay',
        submittedByGuardian: null,
        canSubmit: true,
      });
      // Replaced before grading.
      const again = await upload(me);
      const re = await data(
        me.post(`${S}/assignments/${open.id}/submission`).send({ files: [{ id: again.id }] }),
      );
      expect(re.files).toHaveLength(1);

      const past = new Date(t.clock.now().getTime() - 86_400_000);
      const noLate = await assignment({ dueAt: past });
      const f2 = await upload(me);
      const refused = await me
        .post(`${S}/assignments/${noLate.id}/submission`)
        .send({ files: [{ id: f2.id }] });
      expect([refused.status, refused.body.error.code]).toEqual([422, 'PAST_DUE']);
      const late = await assignment({ dueAt: past, allowLate: true });
      const lateRes = await me
        .post(`${S}/assignments/${late.id}/submission`)
        .send({ files: [{ id: f2.id }] });
      expect([lateRes.status, lateRes.body.data.status]).toEqual([200, 'Late']);
      expect(lateRes.body.message).toBe('Work handed in late. Your teacher can see it now.');

      const closed = await assignment({ status: 'CLOSED', closedAt: new Date() });
      const f3 = await upload(me);
      const c = await me
        .post(`${S}/assignments/${closed.id}/submission`)
        .send({ files: [{ id: f3.id }] });
      expect([c.status, c.body.error.code]).toEqual([422, 'CLOSED']);

      await t.prisma.submission.updateMany({
        where: { assignmentId: open.id, studentId: emmanuel },
        data: { status: 'RETURNED', score: 8, feedback: 'Good', returnedAt: new Date() },
      });
      const graded = await me
        .post(`${S}/assignments/${open.id}/submission`)
        .send({ files: [{ id: f3.id }] });
      expect([graded.status, graded.body.error.code]).toEqual([422, 'ALREADY_GRADED']);
      const listed = (await data(me.get(`${S}/homework`))).assignments.find(
        (a: { id: string }) => a.id === open.id,
      );
      expect(listed).toMatchObject({ status: 'Returned', score: 8, feedback: 'Good' });
      expect(listed.canSubmit).toBe(false);
    });

    it('refuses assignments set for another class', async () => {
      const seeded = await assignment({});
      const other = await t.prisma.classArm.findFirstOrThrow({
        where: { schoolId, id: { not: jss2b }, level: { name: 'SSS 1' } },
      });
      const elsewhere = await t.prisma.assignment.update({
        where: { id: seeded.id },
        data: { armId: other.id },
      });
      const f = await upload(me);
      const res = await me
        .post(`${S}/assignments/${elsewhere.id}/submission`)
        .send({ files: [{ id: f.id }] });
      expect(res.status).toBe(404);
      expect((await me.post(`${S}/assignments/nope/submission`).send({ files: [] })).status).toBe(
        404,
      );
    });
  });

  describe('results', () => {
    it('says when results aren’t published, shows the card once they are, and hides held ones', async () => {
      const term = await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } });
      let r = await data(me.get(`${S}/results`));
      expect(r).toMatchObject({ termId: term.id, status: 'not-published', card: null });
      const card = await t.prisma.reportCard.create({
        data: {
          schoolId,
          termId: term.id,
          studentId: emmanuel,
          armId: jss2b,
          publishedAt: new Date(),
          version: 1,
          average: 71.4,
          snapshot: {
            title: 'First Term Report',
            subjects: [{ name: 'Mathematics', total: '76.0', grade: 'A' }],
            average: '71.4%',
            position: '7th of 14',
            classmates: [{ id: 'x' }],
          },
        },
      });
      r = await data(me.get(`${S}/results`));
      expect(r.status).toBe('published');
      expect(r.card).toMatchObject({ average: '71.4%', position: '7th of 14' });
      expect(r.card).not.toHaveProperty('classmates');
      expect((await data(me.get(`${S}/home`))).latestResult).toMatchObject({
        status: 'published',
        average: '71.4%',
      });
      await t.prisma.reportCard.update({
        where: { id: card.id },
        data: { heldAt: new Date(), heldReason: 'Unpaid fees: ₦45,000 outstanding' },
      });
      r = await data(me.get(`${S}/results`));
      expect(r).toMatchObject({ status: 'held', card: null });
      expect(JSON.stringify(r)).not.toMatch(/45,000|Unpaid/);
      await t.prisma.reportCard.delete({ where: { id: card.id } });
    });
  });

  describe('announcements and notifications', () => {
    it('shows what reaches students, everyone and his class, not withdrawn or expired', async () => {
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
          { ...base, title: `Students ${tag}`, audienceKind: 'STUDENTS', sentAt: sent(2) },
          { ...base, title: `Parents ${tag}`, audienceKind: 'PARENTS', sentAt: sent(3) },
          { ...base, title: `Teachers ${tag}`, audienceKind: 'TEACHERS', sentAt: sent(4) },
          {
            ...base,
            title: `Withdrawn ${tag}`,
            audienceKind: 'STUDENTS',
            sentAt: sent(5),
            status: 'WITHDRAWN',
            withdrawnAt: new Date(),
          },
          {
            ...base,
            title: `Expired ${tag}`,
            audienceKind: 'STUDENTS',
            sentAt: sent(6),
            expiresOn: new Date('2026-01-01'),
          },
        ],
      });
      for (const [title, armId] of [
        [`JSS 2B ${tag}`, jss2b],
        [`SSS 1 ${tag}`, other.id],
      ] as const) {
        const a = await t.prisma.announcement.create({
          data: { ...base, title, audienceKind: 'CLASSES', sentAt: sent(7) },
        });
        await t.prisma.announcementArm.create({ data: { schoolId, announcementId: a.id, armId } });
      }
      const list = await data(me.get(`${S}/announcements`));
      expect(
        list.map((a: { title: string }) => a.title).filter((x: string) => x.endsWith(tag)),
      ).toEqual([`Everyone ${tag}`, `Students ${tag}`, `JSS 2B ${tag}`]);
      expect(list.find((a: { title: string }) => a.title === `JSS 2B ${tag}`).audience).toBe(
        'JSS 2B',
      );
    });

    it('lists, reads and clears his own notifications', async () => {
      const m = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { studentId: emmanuel, kind: 'STUDENT' },
      });
      const other = await t.prisma.user.findUniqueOrThrow({ where: { email: PRINCIPAL } });
      await t.prisma.notification.deleteMany({ where: { userId: m.userId } });
      await t.prisma.notification.createMany({
        data: [
          { userId: m.userId, schoolId, category: 'assignments', title: 'Work returned' },
          { userId: m.userId, schoolId, category: 'results', title: 'Results out' },
        ],
      });
      const theirs = await t.prisma.notification.create({
        data: { userId: other.id, schoolId, category: 'finance', title: 'Not his' },
      });
      const n = await data(me.get('/api/v1/notifications'));
      expect([n.unread, n.total]).toEqual([2, 2]);
      expect((await data(me.post(`/api/v1/notifications/${n.rows[0].id}/read`))).read).toBe(true);
      expect((await me.post(`/api/v1/notifications/${theirs.id}/read`)).status).toBe(404);
      expect(await data(me.post('/api/v1/notifications/read-all'))).toEqual({ marked: 1 });
      expect((await data(me.get('/api/v1/notifications?filter=unread'))).rows).toEqual([]);
      expect((await me.get('/api/v1/nav-counts')).status).toBe(403);
    });
  });

  describe('isolation, password and leavers', () => {
    it('keeps each student to their own records', async () => {
      const mate = await classmate();
      const api = await signedIn(mate.student.admissionNo);
      const o = await data(api.get(`${S}/overview`));
      expect(o.student.id).toBe(mate.student.id);
      const open = await assignment({});
      const f = await upload(me);
      await data(me.post(`${S}/assignments/${open.id}/submission`).send({ files: [{ id: f.id }] }));
      // The classmate can't hand in Emmanuel's file or see his submission.
      const res = await api
        .post(`${S}/assignments/${open.id}/submission`)
        .send({ files: [{ id: f.id }] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const theirs = (await data(api.get(`${S}/homework`))).assignments.find(
        (a: { id: string }) => a.id === open.id,
      );
      if (theirs) expect(theirs.status).toBe('Not submitted');
    });

    it('changes the password with the current one', async () => {
      const mate = await classmate();
      const api = await signedIn(mate.student.admissionNo);
      const bad = await api
        .post('/api/v1/auth/password/change')
        .send({ current: 'wrong', next: 'Brand#New2026' });
      expect(bad.status).toBe(422);
      expect(
        (
          await api
            .post('/api/v1/auth/password/change')
            .send({ current: PASSWORD, next: 'Brand#New2026' })
        ).status,
      ).toBe(200);
      expect((await signInStudent(mate.student.admissionNo, 'Brand#New2026')).status).toBe(200);
    });

    it('turns read-only for a student who has left, and refuses their next sign-in', async () => {
      const mate = await classmate();
      const api = await signedIn(mate.student.admissionNo);
      const open = await assignment({});
      await t.prisma.student.update({
        where: { id: mate.student.id },
        data: { status: 'WITHDRAWN', leftOn: t.clock.now() },
      });
      // The session open when they left keeps a read-only view.
      const o = await data(api.get(`${S}/overview`));
      expect(o.student.access).toBe('read-only');
      expect((await api.get(`${S}/results`)).status).toBe(200);
      const res = await api
        .post(`${S}/assignments/${open.id}/submission`)
        .send({ files: [{ id: randomUUID() }] });
      expect([res.status, res.body.error.code]).toEqual([403, 'READ_ONLY']);
      const again = await signInStudent(mate.student.admissionNo);
      expect([again.status, again.body.error.code]).toEqual([403, 'STUDENT_LEFT']);
    });
  });
});
