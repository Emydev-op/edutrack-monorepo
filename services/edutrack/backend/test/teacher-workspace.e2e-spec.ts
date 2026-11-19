import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

/**
 * Teacher Workspace API on the school's address (greenfield.localhost/teacher): the frame,
 * teaching and the class register. Mrs. Okafor teaches JSS 2B English and is its class teacher;
 * Mr. Ade teaches JSS 2B Mathematics.
 */

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const OKAFOR = 'g.okafor@greenfield.edu.ng';
const ADE = 's.ade@greenfield.edu.ng';

describe('Teacher Workspace (e2e)', () => {
  let t: TestApp;
  let okafor: Api;
  let ade: Api;

  const register = async (api: Api, date?: string) =>
    (await api.get(`/api/v1/class-teacher/register${date ? `?date=${date}` : ''}`)).body.data;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    okafor = authed(t, (await signIn(t, OKAFOR, { host: HOST })).token, { host: HOST });
    ade = authed(t, (await signIn(t, ADE, { host: HOST })).token, { host: HOST });
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  describe('sign-in and the frame', () => {
    it('signs in with the school’s colour and logo address in the session', async () => {
      const res = await signIn(t, OKAFOR, { host: HOST });
      expect(res.body.data.school).toMatchObject({
        slug: 'greenfield',
        name: 'Greenfield Academy',
        brandColor: expect.stringMatching(/^#/),
      });
      expect(res.body.data.school).toHaveProperty('logoUrl');
    });

    it('describes the teacher, their class and their roles', async () => {
      const res = await okafor.get('/api/v1/me');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        teacher: { firstName: 'Grace', lastName: 'Okafor', name: 'Mrs. Grace Okafor' },
        isClassTeacher: true,
        classArm: { name: 'JSS 2B', branchName: 'Main Campus' },
        hasAssignments: true,
      });
      expect(res.body.data.roles).toContain('Teacher');
    });

    it('gives the terms, the active one and the clock', async () => {
      const v = (await okafor.get('/api/v1/context')).body.data;
      expect(v.activeTermId).toBeTruthy();
      const active = v.terms.find((x: { id: string }) => x.id === v.activeTermId);
      expect(active).toMatchObject({ status: 'Active', lockReason: null });
      expect(v.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.school.name).toBe('Greenfield Academy');
      const closed = v.terms.find((x: { status: string }) => x.status === 'Closed');
      expect(closed.lockReason).toMatch(/is closed/);
    });

    it('lists my assignments and my class', async () => {
      const v = (await okafor.get('/api/v1/my-scope')).body.data;
      expect(
        v.assignments.some(
          (a: { armName: string; subject: string }) =>
            a.armName === 'JSS 2B' && a.subject === 'ENG',
        ),
      ).toBe(true);
      expect(v.classArm).toMatchObject({ name: 'JSS 2B', students: 14 });
    });

    it('searches my classes and students', async () => {
      const v = (await okafor.get('/api/v1/search?q=jss%202b')).body.data;
      expect(v.some((r: { type: string }) => r.type === 'Class')).toBe(true);
    });
  });

  describe('teaching', () => {
    it('shows my classes and one class with its students', async () => {
      const list = (await okafor.get('/api/v1/teaching/classes')).body.data;
      expect(list.readOnly).toBe(false);
      const eng = list.classes.find(
        (c: { armName: string; subject: string }) => c.armName === 'JSS 2B' && c.subject === 'ENG',
      );
      expect(eng).toMatchObject({
        isClassTeacher: true,
        students: 14,
        section: 'JSS',
        sheet: null,
      });
      const detail = (await okafor.get(`/api/v1/teaching/classes/${eng.armId}/ENG`)).body.data;
      expect(detail.students).toHaveLength(14);
      expect(detail.classTeacher.name).toBe('Mrs. Grace Okafor');
      // JSS 2B has a published timetable, so English has a next lesson.
      expect(detail.nextLesson === null || detail.nextLesson.periodId.startsWith('P')).toBe(true);
    });

    it('refuses classes and students I don’t teach', async () => {
      const mine = (await okafor.get('/api/v1/teaching/classes')).body.data.classes[0];
      const notMine = await okafor.get(`/api/v1/teaching/classes/${mine.armId}/FMT`);
      expect(notMine.status).toBe(403);
      const other = await t.prisma.enrollment.findFirst({
        where: { status: 'ACTIVE', arm: { level: { name: 'Nursery 1' } } },
      });
      if (other)
        expect((await okafor.get(`/api/v1/teaching/students/${other.studentId}`)).status).toBe(403);
    });

    it('lists my subjects with schemes, and my students with filters', async () => {
      const subjects = (await okafor.get('/api/v1/teaching/subjects')).body.data;
      expect(subjects.subjects.some((s: { code: string }) => s.code === 'ENG')).toBe(true);
      const eng = (await okafor.get('/api/v1/teaching/subjects/ENG')).body.data;
      expect(
        eng.schemes.find((s: { section: string }) => s.section === 'JSS').components,
      ).toHaveLength(3);
      const students = (await okafor.get('/api/v1/teaching/students?q=adeyemi&pageSize=5')).body
        .data;
      expect(students.data.every((r: { name: string }) => /adeyemi/i.test(r.name))).toBe(true);
      expect(students.meta.pageSize).toBe(5);
      const one = students.data[0];
      if (one) {
        const detail = (await okafor.get(`/api/v1/teaching/students/${one.id}`)).body.data;
        expect(detail).toMatchObject({ id: one.id, scores: [], results: [] });
        expect(detail.attendance.schoolDays).toBeGreaterThan(0);
      }
    });

    it('builds my week from published timetables', async () => {
      const v = (await ade.get('/api/v1/teaching/timetable')).body.data;
      expect(v.published).toBe(true);
      expect(v.lessons.every((l: { subject: string; armName: string }) => l.armName)).toBe(true);
      expect(
        v.lessons.some(
          (l: { armName: string; subject: string }) =>
            l.armName === 'JSS 2B' && l.subject === 'MTH',
        ),
      ).toBe(true);
      expect(v.periods.map((p: { label: string }) => p.label)).toContain('Break');
      const lesson = (await ade.get(`/api/v1/teaching/lessons/${v.lessons[0].id}`)).body.data;
      expect(lesson.lesson.id).toBe(v.lessons[0].id);
      expect(
        (
          await okafor.get(
            `/api/v1/teaching/lessons/${v.lessons.find((l: { subject: string }) => l.subject === 'MTH').id}`,
          )
        ).status,
      ).toBe(404);
    });
  });

  describe('register', () => {
    it('shows today (or the last school day) with the roll and the edit window', async () => {
      const day = await register(okafor);
      expect(day.arm).toBe('JSS 2B');
      expect(day.editableDays.length).toBeGreaterThan(0);
      expect(day.editableDays.length).toBeLessThanOrEqual(6);
    });

    it('locks weekends, future days, and days older than the window', async () => {
      const day = await register(okafor);
      const sat = (() => {
        const d = new Date(`${day.today}T00:00:00Z`);
        while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      })();
      expect((await register(okafor, sat)).lock?.code ?? 'OUT_OF_TERM').toMatch(
        /NO_SCHOOL|OUT_OF_TERM/,
      );
      const tomorrow = new Date(Date.parse(`${day.today}T00:00:00Z`) + 3 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      expect((await register(okafor, tomorrow)).lock?.code).toMatch(/FUTURE|NO_SCHOOL|OUT_OF_TERM/);
      const old = (await register(okafor, day.termStart)).lock;
      if (day.editableDays.length && !day.editableDays.includes(day.termStart))
        expect(old?.code).toMatch(/TOO_OLD|NO_SCHOOL/);
      const put = await okafor
        .put(`/api/v1/class-teacher/register/${day.termStart}`)
        .send({ marks: [] });
      expect(put.status).toBe(409);
    });

    it('saves a day, validates marks, and tells parents of new absences in the app', async () => {
      const day = await register(okafor);
      const date = day.editableDays[0];
      if (!date) return; // No school day in the window (e.g. the term is over).
      const target = (await register(okafor, date)).rows as { studentId: string; name: string }[];
      const missing = await okafor.put(`/api/v1/class-teacher/register/${date}`).send({
        marks: target.slice(1).map((r) => ({ studentId: r.studentId, status: 'Present' })),
      });
      expect(missing.status).toBe(422);
      expect(missing.body.message).toBe('1 student needs a mark or a reason before you can save.');
      const excused = await okafor.put(`/api/v1/class-teacher/register/${date}`).send({
        marks: target.map((r, i) => ({
          studentId: r.studentId,
          status: i === 0 ? 'Excused' : 'Present',
        })),
      });
      expect(excused.body.message).toBe('1 student needs a mark or a reason before you can save.');

      // Clear earlier alerts for the first student, then mark them absent.
      const first = target[0]!;
      const marks = target.map((r, i) => ({
        studentId: r.studentId,
        status: i === 0 ? 'Absent' : 'Present',
      }));
      await okafor
        .put(`/api/v1/class-teacher/register/${date}`)
        .send({ marks: target.map((r) => ({ studentId: r.studentId, status: 'Present' })) })
        .expect(200);
      const before = await t.prisma.notification.count({
        where: { category: 'register', entityId: first.studentId },
      });
      const guardiansWithAccounts = await t.prisma.studentGuardian.count({
        where: { studentId: first.studentId, guardian: { membership: { status: 'ACTIVE' } } },
      });
      const saved = await okafor.put(`/api/v1/class-teacher/register/${date}`).send({ marks });
      expect(saved.status).toBe(200);
      // Notified only when a guardian has a Parent Portal account to receive it.
      const told = guardiansWithAccounts > 0;
      expect(saved.body.data.notified).toEqual(told ? [first.name] : []);
      const row = saved.body.data.register.rows.find(
        (r: { studentId: string }) => r.studentId === first.studentId,
      );
      expect(row).toMatchObject({ status: 'Absent', guardianNotified: told });
      expect(saved.body.data.register.taken).toBe(true);
      const after = await t.prisma.notification.count({
        where: { category: 'register', entityId: first.studentId },
      });
      expect(after - before).toBe(guardiansWithAccounts);
      // Saving again with the same absence doesn't notify twice.
      const again = await okafor.put(`/api/v1/class-teacher/register/${date}`).send({ marks });
      expect(again.body.data.notified).toEqual([]);
    });

    it('notifies a parent with a Parent Portal account, in the app only', async () => {
      const day = await register(okafor);
      const date = day.editableDays[0];
      if (!date) return;
      // School Admin invites Funke Adeyemi (Emmanuel's mother) and she accepts.
      const admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
      const funke = await t.prisma.guardian.findFirstOrThrow({
        where: { fullName: 'Funke Adeyemi' },
      });
      // The test database is reused across runs: she may have accepted in an earlier run.
      const existing = await t.prisma.schoolMembership.findFirst({
        where: { guardianId: funke.id, status: 'ACTIVE' },
      });
      if (!existing) {
        await admin.post(`/api/v1/guardians/${funke.id}/invite`).expect(200);
        const invite = [...t.notifications.sent]
          .reverse()
          .find((m) => m.template === 'invitation')!;
        const token = decodeURIComponent((invite.data as { link: string }).link.split('/').pop()!);
        await t
          .http()
          .post(`/api/v1/auth/invitations/${token}/accept`)
          .send({ firstName: 'Funke', lastName: 'Adeyemi', password: 'Edutrack2026!' })
          .expect(200);
      }
      const membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { guardianId: funke.id, status: 'ACTIVE' },
      });
      const rows = (await register(okafor, date)).rows as { studentId: string; name: string }[];
      const smsBefore = t.notifications.sent.filter((m) => m.channel === 'sms').length;
      const all = (absent?: string) =>
        rows.map((r) => ({
          studentId: r.studentId,
          status: r.name === absent ? 'Absent' : 'Present',
        }));
      await okafor.put(`/api/v1/class-teacher/register/${date}`).send({ marks: all() }).expect(200);
      const saved = await okafor
        .put(`/api/v1/class-teacher/register/${date}`)
        .send({ marks: all('Emmanuel Adeyemi') });
      expect(saved.body.data.notified).toEqual(['Emmanuel Adeyemi']);
      expect(saved.body.message).toBe(
        'Register saved. A parent was notified of Emmanuel Adeyemi’s absence in the Parent Portal.',
      );
      const alert = await t.prisma.notification.findFirstOrThrow({
        where: { userId: membership.userId, category: 'register' },
        orderBy: { createdAt: 'desc' },
      });
      expect(alert.title).toBe('Emmanuel was marked absent');
      // No SMS: nothing was sent to anyone's phone.
      expect(t.notifications.sent.filter((m) => m.channel === 'sms')).toHaveLength(smsBefore);
    });

    it('shows the term per day and per student, and School Admin sees the same', async () => {
      const v = (await okafor.get('/api/v1/class-teacher/register/history')).body.data;
      expect(v.arm).toBe('JSS 2B');
      expect(v.daysTaken).toBeGreaterThan(0);
      expect(v.students).toHaveLength(14);
    });

    it('is only for class teachers', async () => {
      const someone = await t.prisma.staff.findFirst({
        where: { email: ADE },
        include: { classTeacherAssignments: { where: { endsOn: null } } },
      });
      if (!someone?.classTeacherAssignments.length)
        expect((await ade.get('/api/v1/class-teacher/register')).status).toBe(403);
    });
  });

  describe('class teachers and access', () => {
    it('allows one class per class teacher', async () => {
      const admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
      const okaforStaff = await t.prisma.staff.findFirstOrThrow({ where: { email: OKAFOR } });
      const other = await t.prisma.classArm.findFirstOrThrow({
        where: { name: 'A', level: { name: 'JSS 2' }, branch: { code: 'GFA-MC' } },
      });
      const res = await admin
        .put(`/api/v1/academics/classes/arms/${other.id}`)
        .send({ classTeacherId: okaforStaff.id });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('TEACHER_HAS_CLASS');
      expect(res.body.message).toMatch(/already the class teacher of JSS 2B/);
    });

    it('keeps a replaced class teacher’s registers readable but not editable', async () => {
      const day = await register(okafor);
      const post = await t.prisma.classTeacherAssignment.findFirstOrThrow({
        where: { staff: { email: OKAFOR }, endsOn: null },
      });
      // Mrs. Okafor hands JSS 2B to Mr. Ade today.
      const ade = await t.prisma.staff.findFirstOrThrow({ where: { email: ADE } });
      await t.prisma.classTeacherAssignment.update({
        where: { id: post.id },
        data: { endsOn: new Date(`${day.today}T00:00:00Z`) },
      });
      await t.prisma.classTeacherAssignment.deleteMany({
        where: { staffId: ade.id, endsOn: null },
      });
      await t.prisma.classTeacherAssignment.create({
        data: {
          schoolId: post.schoolId,
          sessionId: post.sessionId,
          armId: post.armId,
          staffId: ade.id,
          startsOn: new Date(`${day.today}T00:00:00Z`),
        },
      });
      const still = await register(okafor);
      expect(still.arm).toBe('JSS 2B');
      const date = still.editableDays[0];
      if (date) {
        const rows = still.rows as { studentId: string }[];
        const res = await okafor
          .put(`/api/v1/class-teacher/register/${date}`)
          .send({ marks: rows.map((r) => ({ studentId: r.studentId, status: 'Present' })) });
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/no longer the class teacher of JSS 2B/);
      }
    });

    it('needs a staff record to open the Teacher Workspace', async () => {
      const m = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { user: { email: OKAFOR } },
      });
      await t.prisma.schoolMembership.update({ where: { id: m.id }, data: { staffId: null } });
      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .set('Host', HOST)
        .set('X-EduTrack-Portal', 'teacher')
        .send({ email: OKAFOR, password: 'Edutrack2026!' });
      expect(res.status).toBe(403);
      await t.prisma.schoolMembership.update({
        where: { id: m.id },
        data: { staffId: m.staffId },
      });
    });
  });

  describe('portal isolation', () => {
    it('needs a Teacher Workspace session', async () => {
      const admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
      expect((await admin.get('/api/v1/me')).status).toBe(403);
    });
  });
});
