import { randomUUID } from 'node:crypto';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

interface Row {
  id: string;
  name: string;
  admissionNo: string;
  gender: string;
  className: string;
  branch: string;
  guardianName: string | null;
  status: string;
  awaitingEnrollment: boolean;
}

const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%demo\n').toString('base64')}`;

/** Users these tests give a student sign-in (removed again afterwards). */
const STUDENT_LOGINS = ['e2e.samuel@students.test', 'e2e.kelechi@students.test'];

describe('School Admin students (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let cv: Api;
  let gfSchool: string;
  const ids = new Map<string, string>();

  const id = (name: string) => ids.get(name)!;
  const all = async (api: Api = admin, query = '') =>
    (await api.get(`/api/v1/students?pageSize=50${query}`)).body as {
      data: Row[];
      meta: { total: number; totalPages: number };
    };
  const arm = (level: string, name: string, branch = 'GFA-MC') =>
    t.prisma.classArm.findFirstOrThrow({
      where: {
        schoolId: gfSchool,
        name,
        level: { name: level },
        branch: { code: branch },
      },
    });

  /** The seed's bursar with the School Admin role taken away: students.view only. */
  async function bursarOnly(): Promise<Api> {
    const user = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'kunle.bakare@greenfield.edu.ng' },
    });
    const membership = await t.prisma.schoolMembership.findFirstOrThrow({
      where: { schoolId: gfSchool, userId: user.id },
    });
    await t.prisma.schoolMembership.update({
      where: { id: membership.id },
      data: { status: 'ACTIVE' },
    });
    // The seed's bursar has an expired password (expiry demo).
    await t.prisma.user.update({
      where: { id: user.id },
      data: { passwordChangedAt: t.clock.now() },
    });
    const api = authed(t, (await signIn(t, 'kunle.bakare@greenfield.edu.ng')).token);
    const adminRole = await t.prisma.schoolRole.findFirstOrThrow({
      where: { schoolId: gfSchool, key: 'school_admin' },
    });
    await t.prisma.membershipRole.deleteMany({
      where: { membershipId: membership.id, roleId: adminRole.id },
    });
    return api;
  }

  /** A student sign-in with a live session, as the student portal will create them. */
  async function studentLogin(studentId: string, email: string, status: 'ACTIVE' | 'INVITED') {
    const user = await t.prisma.user.create({
      data: { email, firstName: 'E2E', lastName: 'Student' },
    });
    const membership = await t.prisma.schoolMembership.create({
      data: { schoolId: gfSchool, userId: user.id, kind: 'STUDENT', status, studentId },
    });
    const session = await t.prisma.authSession.create({
      data: {
        userId: user.id,
        portal: 'STUDENT',
        schoolId: gfSchool,
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(t.clock.now().getTime() + 86_400_000),
      },
    });
    return { user, membership, session };
  }

  async function cleanup() {
    const users = await t.prisma.user.findMany({
      where: { email: { in: STUDENT_LOGINS } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await t.prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await t.prisma.schoolMembership.deleteMany({ where: { userId: { in: userIds } } });
    await t.prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    await cleanup();
    gfSchool = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    cv = authed(t, (await signIn(t, 'e.udo@crestviewcollege.ng')).token);
    for (const s of await t.prisma.student.findMany({ where: { schoolId: gfSchool } }))
      ids.set(`${s.firstName} ${s.surname}`, s.id);
  });

  afterAll(async () => {
    await cleanup();
    await t.reseed();
    await t.close();
  });

  describe('list', () => {
    it('lists the seeded students with the mock’s row shape', async () => {
      const res = await admin.get('/api/v1/students?pageSize=50');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Students loaded.');
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 50, total: 27, totalPages: 1 });
      const rows = res.body.data as Row[];
      expect(rows.find((r) => r.name === 'Emmanuel Adeyemi')).toMatchObject({
        admissionNo: 'STU-2025-0042',
        gender: 'Male',
        className: 'JSS 2B',
        branch: 'Main Campus',
        guardianName: 'Mrs. Funke Adeyemi',
        balance: 0,
        status: 'Active',
        awaitingEnrollment: false,
        admittedToday: false,
      });
      expect(rows.find((r) => r.name === 'Grace Akpan')).toMatchObject({
        status: 'Transferred',
        className: 'SSS 1A (until 14 Nov 2026)',
      });
      expect(rows.find((r) => r.name === 'Aisha Lawal')).toMatchObject({
        status: 'Incomplete profile',
        guardianName: null,
      });
      expect(rows.find((r) => r.name === 'Ruth Alabi')).toMatchObject({
        className: '',
        awaitingEnrollment: true,
      });
      // By surname.
      expect(rows[0]!.name).toBe('Yusuf Abdullahi');
    });

    it('filters, searches and pages', async () => {
      expect((await all(admin, '&status=Transferred')).data.map((r) => r.name)).toEqual([
        'Grace Akpan',
      ]);
      expect((await all(admin, '&className=JSS%202B')).meta.total).toBe(14);
      expect((await all(admin, '&className=JSS%202')).meta.total).toBe(14);
      const girls = await all(admin, '&gender=Female');
      expect(girls.data.every((r) => r.gender === 'Female')).toBe(true);
      expect((await all(admin, '&search=funke')).data.map((r) => r.name).sort()).toEqual([
        'Emmanuel Adeyemi',
        'Michael Adeyemi',
      ]);
      expect((await all(admin, '&search=STU-2026-124')).meta.total).toBe(4);
      const page2 = await admin.get('/api/v1/students?page=2&pageSize=10');
      expect(page2.body.data).toHaveLength(10);
      expect(page2.body.meta).toMatchObject({ page: 2, total: 27, totalPages: 3 });
    });

    it('rejects unknown filters', async () => {
      const bad = await admin.get('/api/v1/students?status=Expelled');
      expect(bad.status).toBe(422);
      expect(bad.body.message).toBe('Unknown student status.');
      expect((await admin.get('/api/v1/students?pageSize=7')).status).toBe(422);
    });
  });

  describe('student page', () => {
    it('shows the record, class history, guardians, documents and timeline', async () => {
      const res = await admin.get(`/api/v1/students/${id('Emmanuel Adeyemi')}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Student loaded.');
      const s = res.body.data;
      expect(s).toMatchObject({
        name: 'Emmanuel Adeyemi',
        firstName: 'Emmanuel',
        surname: 'Adeyemi',
        dateOfBirth: '2013-03-14',
        stateOfOrigin: 'Oyo',
        address: '22 Opebi Road, Ikeja, Lagos',
        medicalNotes: 'Mild asthma · inhaler with nurse',
        admittedOn: '5 Sep 2025',
        admissionType: 'New intake',
        admittedInto: '2025/2026 · JSS 1B',
        previousSchool: 'Corona School, Ikeja',
        section: 'Junior Secondary',
        classTeacher: 'Not assigned',
        enrolledSince: '14 Sep 2026',
        financeKey: id('Emmanuel Adeyemi'),
        exit: null,
      });
      expect(typeof s.age).toBe('number');
      expect(s.enrollments).toEqual([
        {
          session: '2026/2027',
          className: 'JSS 2B',
          branch: 'Main Campus',
          status: 'Active',
          outcome: 'In progress · First Term results pending',
        },
        expect.objectContaining({ session: '2025/2026', className: 'JSS 1B', status: 'Promoted' }),
      ]);
      expect(s.guardians).toEqual([
        expect.objectContaining({
          name: 'Mrs. Funke Adeyemi',
          relationship: 'Mother',
          primary: true,
          paysFees: true,
          phone: '0803 555 0161',
          email: 'funke.adeyemi@gmail.com',
          otherChildren: ['Michael Adeyemi · Primary 5B'],
        }),
        expect.objectContaining({ name: 'Mr. Tayo Adeyemi', primary: false, paysFees: false }),
      ]);
      expect(s.documents.map((d: { name: string; status: string }) => [d.name, d.status])).toEqual([
        ['Birth certificate', 'Verified'],
        ['Passport photograph', 'Verified'],
        ['Previous school report', 'Verified'],
        ['Medical form', 'Missing'],
        ['Transfer letter', 'Optional'],
      ]);
      expect(s.activity.map((a: { title: string }) => a.title)).toContain('Promoted to JSS 2');
    });

    it('shows a leaver’s exit', async () => {
      const res = await admin.get(`/api/v1/students/${id('Grace Akpan')}`);
      expect(res.body.data.exit).toEqual({
        kind: 'Transfer',
        date: '14 Nov 2026',
        reason: 'Change of school',
        destination: 'Loyola Jesuit College',
      });
      expect(res.body.data.enrollments[0]).toMatchObject({
        status: 'Transferred',
        outcome: 'Transfer · 14 Nov 2026',
      });
    });

    it('answers 404 for unknown ids', async () => {
      expect((await admin.get(`/api/v1/students/${randomUUID()}`)).status).toBe(404);
      const bad = await admin.get('/api/v1/students/not-an-id');
      expect(bad.status).toBe(404);
      expect(bad.body.message).toBe('This student doesn’t exist');
    });
  });

  describe('enrollment', () => {
    it('lists the arms with places used and the students awaiting one', async () => {
      const res = await admin.get('/api/v1/enrollment/options');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Enrollment options loaded.');
      const o = res.body.data;
      expect(o.session).toBe('2026/2027');
      expect(o.branch.name).toBe('Main Campus');
      expect(o.branches.map((b: { name: string }) => b.name)).toEqual([
        'Main Campus',
        'Lekki Campus',
      ]);
      expect(o.sections.map((s: { name: string }) => s.name)).toEqual([
        'Nursery',
        'Primary',
        'Junior Secondary',
        'Senior Secondary',
      ]);
      const jss = o.sections.find((s: { name: string }) => s.name === 'Junior Secondary');
      expect(jss.levels[0]).toEqual({
        level: 'JSS 1',
        arms: [
          { arm: 'A', used: 1, capacity: 35 },
          { arm: 'B', used: 0, capacity: 35 },
          { arm: 'C', used: 0, capacity: 35 },
        ],
      });
      expect(o.awaiting.map((a: { name: string }) => a.name)).toEqual([
        'Ruth Alabi',
        'Tunde Bakare',
        'Ngozi Ike',
        'Bola Tinubu-Ade',
      ]);
      const lekki = o.branches[1].id as string;
      const lk = (await admin.get(`/api/v1/enrollment/options?branch=${lekki}`)).body.data;
      expect(lk.branch.name).toBe('Lekki Campus');
      expect(lk.awaiting).toEqual([]);
    });

    it('places students in an arm of their level', async () => {
      const res = await admin
        .post('/api/v1/enrollments')
        .send({ level: 'JSS 1', arm: 'A', studentIds: [id('Ruth Alabi'), id('Tunde Bakare')] });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(
        '2 students enrolled in JSS 1A for 2026/2027. Their teachers can see them now.',
      );
      expect(res.body.data).toEqual({ enrolled: 2, className: 'JSS 1A' });
      const ruth = (await admin.get(`/api/v1/students/${id('Ruth Alabi')}`)).body.data;
      expect(ruth.className).toBe('JSS 1A');
      expect(ruth.awaitingEnrollment).toBe(false);
      expect(ruth.activity[0].title).toBe('Enrolled in 2026/2027 · JSS 1A');
      const o = (await admin.get('/api/v1/enrollment/options')).body.data;
      expect(o.awaiting).toHaveLength(2);

      const again = await admin
        .post('/api/v1/enrollments')
        .send({ level: 'JSS 1', arm: 'B', studentIds: [id('Ruth Alabi')] });
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('Some of these students are already enrolled this session.');
    });

    it('checks the arm, the level and capacity', async () => {
      const ngozi = id('Ngozi Ike');
      const bola = id('Bola Tinubu-Ade');
      const wrongLevel = await admin
        .post('/api/v1/enrollments')
        .send({ level: 'JSS 2', arm: 'A', studentIds: [ngozi] });
      expect(wrongLevel.status).toBe(422);
      expect(wrongLevel.body.message).toBe(
        'Only students admitted into JSS 2 can be enrolled in JSS 2A.',
      );
      const noArm = await admin
        .post('/api/v1/enrollments')
        .send({ level: 'JSS 1', arm: 'Z', studentIds: [ngozi] });
      expect(noArm.body.message).toBe('Choose a class arm.');
      const none = await admin
        .post('/api/v1/enrollments')
        .send({ level: 'JSS 1', arm: 'C', studentIds: [] });
      expect(none.status).toBe(422);
      expect(none.body.message).toBe('Choose at least one student.');
      const jss1c = await arm('JSS 1', 'C');
      await t.prisma.classArm.update({ where: { id: jss1c.id }, data: { capacity: 1 } });
      const full = await admin
        .post('/api/v1/enrollments')
        .send({ level: 'JSS 1', arm: 'C', studentIds: [ngozi, bola] });
      expect(full.status).toBe(409);
      expect(full.body.message).toBe(
        'JSS 1C would be over capacity (2 of 1). Split the group across arms, or raise capacity in Classes & Arms.',
      );
      await t.prisma.classArm.update({ where: { id: jss1c.id }, data: { capacity: 35 } });
      const emmanuel = await admin
        .post('/api/v1/enrollments')
        .send({ level: 'JSS 2', arm: 'A', studentIds: [id('Emmanuel Adeyemi')] });
      expect(emmanuel.status).toBe(409);
    });
  });

  describe('arms', () => {
    it('moves students of one level to another arm', async () => {
      const res = await admin
        .post('/api/v1/students/assign-arm')
        .send({ studentIds: [id('Favour Okeke'), id('Chiamaka Eze')], arm: 'A' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('2 students moved to JSS 2A.');
      expect(res.body.data).toEqual({ moved: 2 });
      const favour = (await admin.get(`/api/v1/students/${id('Favour Okeke')}`)).body.data;
      expect(favour.className).toBe('JSS 2A');
      expect(favour.activity[0].title).toBe('Moved from JSS 2B to JSS 2A');
    });

    it('refuses mixed levels, unknown arms and full arms', async () => {
      const mixed = await admin
        .post('/api/v1/students/assign-arm')
        .send({ studentIds: [id('David Nwosu'), id('Michael Adeyemi')], arm: 'A' });
      expect(mixed.status).toBe(422);
      expect(mixed.body.message).toBe(
        'Choose students from one class level to move them to another arm.',
      );
      const unknown = await admin
        .post('/api/v1/students/assign-arm')
        .send({ studentIds: [id('David Nwosu')], arm: 'Q' });
      expect(unknown.body.message).toBe('JSS 2 has no arm Q.');
      const jss2a = await arm('JSS 2', 'A');
      await t.prisma.classArm.update({ where: { id: jss2a.id }, data: { capacity: 2 } });
      const full = await admin
        .post('/api/v1/students/assign-arm')
        .send({ studentIds: [id('David Nwosu')], arm: 'A' });
      expect(full.status).toBe(409);
      expect(full.body.message).toBe(
        'JSS 2A would have 3 of 2 places. Move fewer students or raise capacity in Classes & Arms.',
      );
      await t.prisma.classArm.update({ where: { id: jss2a.id }, data: { capacity: 35 } });
      const leaver = await admin
        .post('/api/v1/students/assign-arm')
        .send({ studentIds: [id('Grace Akpan')], arm: 'B' });
      expect(leaver.status).toBe(409);
      expect(leaver.body.message).toBe('Grace Akpan has left the school.');
    });
  });

  describe('transfers and withdrawals', () => {
    it('checks the form like the mock', async () => {
      const url = `/api/v1/students/${id('Samuel Olatunji')}/transfer`;
      const kind = await admin.post(url).send({ kind: 'Expelled', date: '2026-11-20' });
      expect(kind.status).toBe(422);
      expect(kind.body.message).toBe('Choose transfer or withdrawal.');
      const date = await admin.post(url).send({ kind: 'Withdrawal', date: '' });
      expect(date.body.message).toBe('Choose the effective date.');
      const where = await admin
        .post(url)
        .send({ kind: 'Transfer', date: '2026-11-20', reason: 'Relocation', destination: '' });
      expect(where.status).toBe(422);
      expect(where.body.message).toBe('Enter the destination school.');
      const letter = await admin.post(url).send({
        kind: 'Transfer',
        date: '2026-11-20',
        reason: 'Relocation',
        destination: 'Kings College',
        document: null,
      });
      expect(letter.status).toBe(422);
      expect(letter.body.message).toBe(
        'Upload the transfer letter. Your school settings require it.',
      );
      const early = await admin
        .post(url)
        .send({ kind: 'Withdrawal', date: '2020-01-01', reason: 'Relocation' });
      expect(early.status).toBe(422);
    });

    it('records a transfer out and closes the student’s own sign-in', async () => {
      const samuel = id('Samuel Olatunji');
      const login = await studentLogin(samuel, STUDENT_LOGINS[0]!, 'ACTIVE');
      const res = await admin.post(`/api/v1/students/${samuel}/transfer`).send({
        kind: 'Transfer',
        date: '2026-11-20',
        reason: 'Relocation',
        destination: 'Kings College, Lagos',
        notes: 'Records sent by courier',
        document: PDF,
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Transfer recorded for Samuel Olatunji.');
      expect(res.body.data).toMatchObject({
        status: 'Transferred',
        className: 'JSS 2B (until 20 Nov 2026)',
      });
      const membership = await t.prisma.schoolMembership.findUniqueOrThrow({
        where: { id: login.membership.id },
      });
      expect(membership.status).toBe('DEACTIVATED');
      const session = await t.prisma.authSession.findUniqueOrThrow({
        where: { id: login.session.id },
      });
      expect(session.revokedAt).not.toBeNull();
      expect(session.revokedReason).toBe('access_lost');
      const row = await t.prisma.student.findUniqueOrThrow({ where: { id: samuel } });
      expect(row).toMatchObject({ exitKind: 'TRANSFER', exitDestination: 'Kings College, Lagos' });
      expect(row.leftOn?.toISOString().slice(0, 10)).toBe('2026-11-20');
      const enrollment = await t.prisma.enrollment.findFirstOrThrow({
        where: { studentId: samuel, session: { name: '2026/2027' } },
      });
      expect(enrollment).toMatchObject({ status: 'LEFT', outcome: 'TRANSFER' });
      // Guardians stay linked (their read-only access is theirs to keep).
      expect(await t.prisma.studentGuardian.count({ where: { studentId: samuel } })).toBe(1);

      const detail = (await admin.get(`/api/v1/students/${samuel}`)).body.data;
      expect(detail.exit).toMatchObject({ kind: 'Transfer', destination: 'Kings College, Lagos' });
      const letter = detail.documents.find((d: { name: string }) => d.name === 'Transfer letter');
      expect(letter.status).toBe('Verified');
      expect(letter.uploaded).toMatch(/PDF/);
      expect(detail.activity[0].title).toBe('Transferred to Kings College, Lagos');

      const twice = await admin
        .post(`/api/v1/students/${samuel}/transfer`)
        .send({ kind: 'Withdrawal', date: '2026-11-21' });
      expect(twice.status).toBe(409);
      expect(twice.body.message).toBe('Samuel Olatunji already has a transfer recorded.');
    });

    it('records a withdrawal and withdraws a pending student invitation', async () => {
      const kelechi = id('Kelechi Obi');
      const login = await studentLogin(kelechi, STUDENT_LOGINS[1]!, 'INVITED');
      const res = await admin
        .post(`/api/v1/students/${kelechi}/transfer`)
        .send({ kind: 'Withdrawal', date: '2026-11-18', reason: 'Family relocation' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Withdrawal recorded for Kelechi Obi.');
      expect(res.body.data.status).toBe('Withdrawn');
      const membership = await t.prisma.schoolMembership.findUniqueOrThrow({
        where: { id: login.membership.id },
      });
      expect(membership.status).toBe('REVOKED');
      const exits = await all(admin, '&status=Withdrawn');
      expect(exits.data.map((r) => r.name).sort()).toEqual(['Ahmed Sani', 'Kelechi Obi']);
    });

    it('moves a student to another branch', async () => {
      const halima = id('Halima Garba');
      const res = await admin
        .post(`/api/v1/students/${halima}/transfer`)
        .send({ kind: 'Branch', branchId: await branchId('GFA-LK'), arm: 'A' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Halima Garba moved to Lekki Campus (SSS 1A).');
      expect(res.body.data).toMatchObject({
        branch: 'Lekki Campus',
        className: 'SSS 1A',
        status: 'Active',
      });
      const detail = (await admin.get(`/api/v1/students/${halima}`)).body.data;
      expect(detail.enrollments[0].branch).toBe('Lekki Campus');
      expect(detail.activity[0].title).toBe('Moved to Lekki Campus');

      const noLevel = await admin
        .post(`/api/v1/students/${id('David Nwosu')}/transfer`)
        .send({ kind: 'Branch', branchId: await branchId('GFA-LK') });
      expect(noLevel.status).toBe(422);
      expect(noLevel.body.message).toBe('Lekki Campus doesn’t run JSS 2.');
      const noArm = await admin
        .post(`/api/v1/students/${id('Tobi Adesanya')}/transfer`)
        .send({ kind: 'Branch', branchId: await branchId('GFA-LK'), arm: 'B' });
      expect(noArm.body.message).toBe('Nursery 2 has no arm B at Lekki Campus.');
      const same = await admin
        .post(`/api/v1/students/${id('Tobi Adesanya')}/transfer`)
        .send({ kind: 'Branch', branchId: await branchId('GFA-MC') });
      expect(same.body.message).toBe('Tobi Adesanya is already at Main Campus.');
    });
  });

  describe('permissions', () => {
    it('lets Academics edit but not record exits, and shows them medical notes', async () => {
      const eze = authed(t, (await signIn(t, 'c.eze@greenfield.edu.ng')).token);
      const s = await eze.get(`/api/v1/students/${id('Emmanuel Adeyemi')}`);
      expect(s.body.data.medicalNotes).toBe('Mild asthma · inhaler with nurse');
      const exit = await eze
        .post(`/api/v1/students/${id('Precious Udoh')}/transfer`)
        .send({ kind: 'Withdrawal', date: '2026-11-20' });
      expect(exit.status).toBe(403);
      expect(exit.body.message).toBe(
        'Recording a transfer or withdrawal needs the students.archive permission.',
      );
    });

    it('lets a Bursar read students but not see medical notes or change anything', async () => {
      const bursar = await bursarOnly();
      expect((await bursar.get('/api/v1/students')).status).toBe(200);
      const s = await bursar.get(`/api/v1/students/${id('Emmanuel Adeyemi')}`);
      expect(s.status).toBe(200);
      expect(s.body.data.medicalNotes).toBeNull();
      expect((await bursar.get('/api/v1/enrollment/options')).status).toBe(200);
      const precious = id('Precious Udoh');
      expect(
        (
          await bursar
            .post(`/api/v1/students/${precious}/transfer`)
            .send({ kind: 'Withdrawal', date: '2026-11-20' })
        ).status,
      ).toBe(403);
      expect(
        (
          await bursar
            .post('/api/v1/students/assign-arm')
            .send({ studentIds: [precious], arm: 'A' })
        ).status,
      ).toBe(403);
      expect(
        (
          await bursar
            .post('/api/v1/enrollments')
            .send({ level: 'JSS 1', arm: 'B', studentIds: [id('Ngozi Ike')] })
        ).status,
      ).toBe(403);
    });

    it('keeps teacher-portal sessions out', async () => {
      const teacher = await signIn(t, 'g.okafor@greenfield.edu.ng', {
        host: 'greenfield.localhost',
      });
      const res = await authed(t, teacher.token, { host: 'greenfield.localhost' }).get(
        '/api/v1/students',
      );
      expect(res.status).toBe(403);
    });
  });

  describe('tenant isolation', () => {
    it('never shows or changes another school’s students', async () => {
      const list = await cv.get('/api/v1/students');
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(0);
      const precious = id('Precious Udoh');
      expect((await cv.get(`/api/v1/students/${precious}`)).status).toBe(404);
      expect(
        (
          await cv
            .post(`/api/v1/students/${precious}/transfer`)
            .send({ kind: 'Withdrawal', date: '2026-11-20' })
        ).status,
      ).toBe(404);
      expect(
        (await cv.post('/api/v1/students/assign-arm').send({ studentIds: [precious], arm: 'A' }))
          .status,
      ).toBe(404);
      expect(
        (
          await cv
            .post('/api/v1/enrollments')
            .send({ level: 'JSS 1', arm: 'A', studentIds: [id('Ngozi Ike')] })
        ).status,
      ).toBe(404);
      const options = (await cv.get('/api/v1/enrollment/options')).body.data;
      expect(options).toMatchObject({ session: '', sections: [], awaiting: [] });
      const gfLekki = await branchId('GFA-LK');
      expect((await cv.get(`/api/v1/enrollment/options?branch=${gfLekki}`)).status).toBe(404);
      const untouched = await t.prisma.student.findUniqueOrThrow({ where: { id: precious } });
      expect(untouched.status).toBe('ACTIVE');
    });
  });

  describe('setup center', () => {
    it('describes the Students step from the enrollments', async () => {
      const gf = (await admin.get('/api/v1/setup')).body.data;
      const step = gf.steps.find((s: { id: string }) => s.id === 'students');
      expect(step).toMatchObject({ auto: true, done: true, to: { name: 'students' } });
      expect(step.description).toMatch(/^\d+ enrolled for 2026\/2027$/);
      const fresh = (await cv.get('/api/v1/setup')).body.data;
      expect(fresh.steps.find((s: { id: string }) => s.id === 'students')).toMatchObject({
        auto: true,
        done: false,
        description: 'Admit students or import them from a spreadsheet',
      });
      const refused = await cv.post('/api/v1/setup/steps/students/complete');
      expect(refused.status).toBe(422);
      expect(refused.body.message).toBe('Admit or import at least one student first.');
    });
  });

  async function branchId(code: string) {
    return (
      await t.prisma.branch.findUniqueOrThrow({
        where: { schoolId_code: { schoolId: gfSchool, code } },
      })
    ).id;
  }
});
