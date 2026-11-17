import { randomUUID } from 'node:crypto';
import type { StudentStatus } from '../src/generated/prisma/enums.js';
import type { InvitationData } from '../src/notifications/templates/templates.js';
import { FamilyAccessService } from '../src/school/guardians/family-access.service.js';
import { authed, createTestApp, login, nextIp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
interface GuardianRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  children: { id: string; name: string; className: string }[];
  relationship: string;
  paysFees: boolean;
  portal: string;
  balance: number;
}
interface Slip {
  studentId: string;
  name: string;
  className: string;
  admissionNo: string;
  schoolName: string;
  signInAddress: string;
  oneTimePassword: string;
}

const ADAEZE = 'adaeze.okonkwo@greenfield.edu.ng';
const UDO = 'e.udo@crestviewcollege.ng';
const KUNLE = 'kunle.bakare@greenfield.edu.ng';
const GREENFIELD = 'greenfield.localhost';
const CRESTVIEW = 'crestview.localhost';
const PARENT_PASSWORD = 'Parent#2026a';
const DAY = 86_400_000;

describe('School guardians and portal accounts (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let crest: Api;
  let greenfieldId: string;
  let crestviewId: string;
  let sessionId: string;

  // Unique per run (the test database is reused): the END of a uuid, never its timestamp start.
  const tag = randomUUID().replace(/-/g, '').slice(-8);
  const phoneBase = String(parseInt(tag.slice(0, 7), 16) % 1_000_000).padStart(6, '0');
  let seq = 0;
  /** A fresh Nigerian mobile number, local format: 090 + 8 digits. */
  const newPhone = () => `090${phoneBase}${String(++seq).padStart(2, '0')}`;
  const e164 = (local: string) => `+234${local.slice(1)}`;
  const surname = `Test${tag}`;

  const created = { students: [] as string[], guardians: [] as string[] };

  async function student(o: {
    first: string;
    schoolId?: string;
    level?: string;
    arm?: string;
    status?: StudentStatus;
    leftOn?: Date | null;
  }) {
    const schoolId = o.schoolId ?? greenfieldId;
    const arm = o.level
      ? await t.prisma.classArm.findFirstOrThrow({
          where: {
            schoolId,
            name: o.arm ?? 'A',
            level: { name: o.level },
            branch: { code: 'GFA-MC' },
          },
        })
      : null;
    const branchId =
      arm?.branchId ??
      (
        await t.prisma.branch.findFirstOrThrow({
          where: { schoolId },
          orderBy: { createdAt: 'asc' },
        })
      ).id;
    const s = await t.prisma.student.create({
      data: {
        schoolId,
        admissionNo: `T/${tag}/${++seq}`,
        firstName: o.first,
        surname,
        gender: 'FEMALE',
        admittedOn: new Date('2024-09-09'),
        branchId,
        status: o.status ?? 'ACTIVE',
        leftOn: o.leftOn ?? null,
      },
    });
    created.students.push(s.id);
    if (arm)
      await t.prisma.enrollment.create({
        data: {
          schoolId,
          studentId: s.id,
          sessionId,
          branchId: arm.branchId,
          levelId: arm.levelId,
          armId: arm.id,
          enrolledOn: new Date('2026-09-14'),
        },
      });
    return s;
  }

  /** A guardian record as imported data would have it (bypasses the duplicate check). */
  async function rawGuardian(o: {
    name: string;
    phone?: string | null;
    email?: string | null;
    children: string[];
    schoolId?: string;
  }) {
    const schoolId = o.schoolId ?? greenfieldId;
    const g = await t.prisma.guardian.create({
      data: {
        schoolId,
        fullName: o.name,
        phone: o.phone ? e164(o.phone) : null,
        email: o.email ?? null,
      },
    });
    created.guardians.push(g.id);
    for (const studentId of o.children) {
      const first = (await t.prisma.studentGuardian.count({ where: { studentId } })) === 0;
      await t.prisma.studentGuardian.create({
        data: {
          schoolId,
          studentId,
          guardianId: g.id,
          relationship: 'Mother',
          isPrimary: first,
          paysFees: true,
        },
      });
    }
    return g;
  }

  async function addGuardian(as: Api, body: Record<string, unknown>) {
    const res = await as.post('/api/v1/guardians').send({
      email: '',
      relationship: 'Mother',
      paysFees: true,
      invite: false,
      ...body,
    });
    if (res.status === 201) created.guardians.push(res.body.data.id);
    return res;
  }

  const tokenFrom = (to: string) =>
    decodeURIComponent(
      (t.notifications.find(to, 'invitation')!.data as InvitationData).link.split('/').pop()!,
    );

  const accept = (token: string, password = PARENT_PASSWORD) =>
    t
      .http()
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .set('X-Forwarded-For', nextIp())
      .send({ firstName: 'Parent', lastName: surname, password });

  const parentLogin = (id: string, host = GREENFIELD, password = PARENT_PASSWORD) =>
    login(t, id, password, { portal: 'parent', host });

  async function parentApi(id: string, host = GREENFIELD) {
    const res = await parentLogin(id, host);
    expect(res.status).toBe(200);
    return authed(t, res.body.data.accessToken as string, { host });
  }

  const guardian = async (id: string, as: Api = admin) =>
    (await as.get(`/api/v1/guardians/${id}`)).body.data as GuardianRow & Record<string, unknown>;

  /** Invites a guardian by SMS, accepts, and returns the parent's phone sign-in. */
  async function invitedParent(id: string, phone: string) {
    const res = await admin.post(`/api/v1/guardians/${id}/invite`);
    expect(res.status).toBe(200);
    expect((await accept(tokenFrom(e164(phone)))).status).toBe(200);
  }

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    greenfieldId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    crestviewId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'crestview' } })).id;
    sessionId = (
      await t.prisma.academicSession.findFirstOrThrow({
        where: { schoolId: greenfieldId, status: 'ACTIVE' },
      })
    ).id;
    admin = authed(t, (await signIn(t, ADAEZE)).token);
    crest = authed(t, (await signIn(t, UDO)).token);
  });

  afterAll(async () => {
    // The seed only restores its own rows: remove what these tests added.
    const memberships = await t.prisma.schoolMembership.findMany({
      where: {
        OR: [{ guardianId: { in: created.guardians } }, { studentId: { in: created.students } }],
      },
      select: { id: true, userId: true },
    });
    await t.prisma.schoolMembership.deleteMany({
      where: { id: { in: memberships.map((m) => m.id) } },
    });
    await t.prisma.user.deleteMany({
      where: {
        id: { in: memberships.map((m) => m.userId) },
        memberships: { none: {} },
        platformStaff: null,
      },
    });
    await t.prisma.studentGuardian.deleteMany({
      where: {
        OR: [{ studentId: { in: created.students } }, { guardianId: { in: created.guardians } }],
      },
    });
    await t.prisma.enrollment.deleteMany({ where: { studentId: { in: created.students } } });
    await t.prisma.guardian.updateMany({
      where: { id: { in: created.guardians } },
      data: { mergedIntoId: null },
    });
    await t.prisma.guardian.deleteMany({ where: { id: { in: created.guardians } } });
    await t.prisma.student.deleteMany({ where: { id: { in: created.students } } });
    await t.close();
  });

  /* ---------------- Guardians ---------------- */

  describe('guardians', () => {
    it('adds a guardian to children and shows them in the list and on their page', async () => {
      const a = await student({ first: 'Amara', level: 'JSS 1' });
      const b = await student({ first: 'Bisi', level: 'Primary 1', status: 'INCOMPLETE_PROFILE' });
      const phone = newPhone();
      const res = await addGuardian(admin, {
        name: `Mrs. Ngozi ${surname}`,
        phone,
        email: `ngozi.${tag}@example.com`,
        studentIds: [a.id, b.id],
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe(`Mrs. Ngozi ${surname} added.`);
      expect(res.body.data).toMatchObject({
        name: `Mrs. Ngozi ${surname}`,
        phone: `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`,
        email: `ngozi.${tag}@example.com`,
        relationship: 'Mother',
        paysFees: true,
        portal: 'No account',
        balance: 0,
      });
      expect(res.body.data.children).toEqual([
        { id: a.id, name: `Amara ${surname}`, className: 'JSS 1A' },
        { id: b.id, name: `Bisi ${surname}`, className: 'Primary 1A' },
      ]);
      // Linking a guardian completes an admission that had none.
      expect((await t.prisma.student.findUniqueOrThrow({ where: { id: b.id } })).status).toBe(
        'ACTIVE',
      );

      const list = await admin.get(`/api/v1/guardians?search=${surname}&pageSize=50`);
      expect(list.status).toBe(200);
      expect(list.body.message).toBe('Guardians loaded.');
      expect(list.body.data.data.map((g: GuardianRow) => g.id)).toContain(res.body.data.id);
      expect(list.body.data.meta).toMatchObject({ page: 1, pageSize: 50 });
      expect(Array.isArray(list.body.data.duplicates)).toBe(true);
      expect(typeof list.body.data.studentsWithoutGuardian).toBe('number');
      const byPhone = await admin.get(`/api/v1/guardians?search=${phone}`);
      expect(byPhone.body.data.data.map((g: GuardianRow) => g.id)).toEqual([res.body.data.id]);

      const detail = await admin.get(`/api/v1/guardians/${res.body.data.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data).toMatchObject({
        portalSince: '',
        paymentPlan: 'Full payment each term',
        invitation: null,
      });
      expect(detail.body.data.childrenDetail[0]).toMatchObject({
        id: a.id,
        className: 'JSS 1A',
        branch: 'Main Campus',
        status: 'Paid',
        relationship: 'Mother · pays fees',
      });
      expect(detail.body.data.notifications[0][0]).toBe('Results');
    });

    it('validates a new guardian as the mock does', async () => {
      const a = await student({ first: 'Chika', level: 'JSS 1' });
      const taken = newPhone();
      expect(
        (await addGuardian(admin, { name: 'Taken Phone', phone: taken, studentIds: [a.id] }))
          .status,
      ).toBe(201);
      const cases: [Record<string, unknown>, number, string][] = [
        [
          { name: '  ', phone: newPhone(), studentIds: [a.id] },
          422,
          'Enter the guardian’s full name.',
        ],
        [
          { name: 'X Y', phone: '12345', studentIds: [a.id] },
          422,
          'Enter a Nigerian phone number, e.g. 0803 555 0193',
        ],
        [
          { name: 'X Y', phone: newPhone(), email: 'nope', studentIds: [a.id] },
          422,
          'Enter a valid email.',
        ],
        [{ name: 'X Y', phone: newPhone(), studentIds: [] }, 422, 'Choose at least one child.'],
        [
          { name: 'X Y', phone: newPhone(), studentIds: [randomUUID()] },
          422,
          'Choose children who are at the school.',
        ],
        [
          { name: 'X Y', phone: taken, studentIds: [a.id] },
          409,
          'Taken Phone already uses this phone number or email. Open their record and link the child there.',
        ],
      ];
      for (const [body, status, message] of cases) {
        const res = await addGuardian(admin, body);
        expect([res.status, res.body.message]).toEqual([status, message]);
      }
      expect((await admin.get('/api/v1/guardians/not-an-id')).status).toBe(404);
      const missing = await admin.get(`/api/v1/guardians/${randomUUID()}`);
      expect([missing.status, missing.body.message]).toEqual([404, 'This guardian doesn’t exist']);
    });

    it('merges duplicate records: children move over and the duplicate is kept for history', async () => {
      const a = await student({ first: 'Dayo', level: 'JSS 1' });
      const b = await student({ first: 'Ebun', level: 'JSS 1', arm: 'B' });
      const phone = newPhone();
      const keep = await rawGuardian({
        name: `Mrs. Funke ${surname}`,
        phone,
        email: `funke.${tag}@example.com`,
        children: [a.id],
      });
      const dup = await rawGuardian({ name: `Funke ${surname}`, phone, children: [a.id, b.id] });

      const list = await admin.get(`/api/v1/guardians?search=${surname}&pageSize=50`);
      const pair = (list.body.data.duplicates as Record<string, string>[]).find(
        (d) => d.mergeId === dup.id,
      );
      expect(pair).toMatchObject({
        keepId: keep.id,
        keepLabel: `Mrs. Funke ${surname} · funke.${tag}@example.com`,
        mergeLabel: `Funke ${surname} · no email`,
      });
      expect(pair!.reason).toContain('share the phone number 090');
      expect(pair!.children).toBe(`Dayo ${surname} (JSS 1A), Ebun ${surname} (JSS 1B)`);

      const same = await admin
        .post('/api/v1/guardians/merge')
        .send({ keepId: keep.id, mergeId: keep.id });
      expect([same.status, same.body.message]).toEqual([
        422,
        'Choose two different guardian records.',
      ]);

      const res = await admin
        .post('/api/v1/guardians/merge')
        .send({ keepId: keep.id, mergeId: dup.id });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(
        'Guardians merged. Children and payment history are on one record now.',
      );
      expect(res.body.data.children.map((c: { id: string }) => c.id).sort()).toEqual(
        [a.id, b.id].sort(),
      );
      const merged = await t.prisma.guardian.findUniqueOrThrow({ where: { id: dup.id } });
      expect(merged.mergedIntoId).toBe(keep.id);
      expect(await t.prisma.studentGuardian.count({ where: { guardianId: dup.id } })).toBe(0);
      expect((await admin.get(`/api/v1/guardians/${dup.id}`)).status).toBe(404);
      const after = await admin.get(`/api/v1/guardians?search=${surname}&pageSize=50`);
      expect(after.body.data.data.map((g: GuardianRow) => g.id)).not.toContain(dup.id);
      expect(
        await t.prisma.auditEvent.count({ where: { action: 'guardian.merge', entityId: keep.id } }),
      ).toBe(1);
    });

    it('keeps reads to students.view and changes to students.edit / settings.users', async () => {
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: KUNLE } });
      const membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { schoolId: greenfieldId, userId: user.id, kind: 'STAFF' },
      });
      const adminRole = await t.prisma.schoolRole.findFirstOrThrow({
        where: { schoolId: greenfieldId, key: 'school_admin' },
      });
      await t.prisma.schoolMembership.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE' },
      });
      await t.prisma.user.update({
        where: { id: user.id },
        data: { passwordChangedAt: t.clock.now() },
      });
      await t.prisma.membershipRole.deleteMany({
        where: { membershipId: membership.id, roleId: adminRole.id },
      });
      const bursar = authed(t, (await signIn(t, KUNLE)).token);
      const a = await student({ first: 'Gbenga', level: 'JSS 1' });
      const g = await rawGuardian({ name: `Gift ${surname}`, phone: newPhone(), children: [a.id] });

      expect((await bursar.get('/api/v1/guardians')).status).toBe(200);
      expect((await bursar.get(`/api/v1/guardians/${g.id}`)).status).toBe(200);
      expect(
        (await addGuardian(bursar, { name: 'No Way', phone: newPhone(), studentIds: [a.id] }))
          .status,
      ).toBe(403);
      expect(
        (await bursar.post('/api/v1/guardians/merge').send({ keepId: g.id, mergeId: g.id })).status,
      ).toBe(403);
      expect((await bursar.post(`/api/v1/guardians/${g.id}/invite`)).status).toBe(403);
      expect((await bursar.post('/api/v1/guardians/invite').send({})).status).toBe(403);
      expect((await bursar.post('/api/v1/students/logins').send({})).status).toBe(403);
      expect((await bursar.get('/api/v1/students/logins')).status).toBe(403);

      const teacher = await signIn(t, 'g.okafor@greenfield.edu.ng', { host: GREENFIELD });
      expect(
        (await authed(t, teacher.token, { host: GREENFIELD }).get('/api/v1/guardians')).status,
      ).toBe(403);
    });

    it('never shows or changes another school’s guardians', async () => {
      const a = await student({ first: 'Hauwa', level: 'JSS 1' });
      const g = await rawGuardian({
        name: `Hadiza ${surname}`,
        phone: newPhone(),
        children: [a.id],
      });
      const theirs = await crest.get(`/api/v1/guardians?search=${surname}&pageSize=50`);
      expect(theirs.status).toBe(200);
      expect(theirs.body.data.data.map((r: GuardianRow) => r.id)).not.toContain(g.id);
      expect((await crest.get(`/api/v1/guardians/${g.id}`)).status).toBe(404);
      expect((await crest.post(`/api/v1/guardians/${g.id}/invite`)).status).toBe(404);
      expect((await crest.delete(`/api/v1/guardians/${g.id}/invite`)).status).toBe(404);
      const merge = await crest
        .post('/api/v1/guardians/merge')
        .send({ keepId: g.id, mergeId: g.id });
      expect(merge.status).toBe(422);
      const bulk = await crest.post('/api/v1/guardians/invite').send({ ids: [g.id] });
      expect(bulk.body.data).toEqual({ invited: 0, skipped: [] });
      const add = await addGuardian(crest, {
        name: 'Cross School',
        phone: newPhone(),
        studentIds: [a.id],
      });
      expect([add.status, add.body.message]).toEqual([
        422,
        'Choose children who are at the school.',
      ]);
      expect((await guardian(g.id)).portal).toBe('No account');
    });
  });

  /* ---------------- Parent accounts ---------------- */

  /** The parent invited at both schools (they keep current children throughout). */
  let parentPhone = '';
  let parentEmail = '';

  describe('parent accounts', () => {
    let gfGuardianId: string;
    let gfChildId: string;

    it('invites a guardian by SMS and email; they accept and sign in on the school’s address', async () => {
      const a = await student({ first: 'Ifeoma', level: 'JSS 2', arm: 'B' });
      gfChildId = a.id;
      parentPhone = newPhone();
      parentEmail = `parent.${tag}@example.com`;
      const g = await addGuardian(admin, {
        name: `Mrs. Ijeoma ${surname}`,
        phone: parentPhone,
        email: parentEmail,
        studentIds: [a.id],
      });
      gfGuardianId = g.body.data.id;
      t.notifications.clear();

      const res = await admin.post(`/api/v1/guardians/${gfGuardianId}/invite`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(
        `Invitation sent to ${res.body.data.phone} and ${parentEmail}.`,
      );
      expect(res.body.data.portal).toBe('Invited');
      const sms = t.notifications.find(e164(parentPhone), 'invitation')!;
      const mail = t.notifications.find(parentEmail, 'invitation')!;
      expect(sms.channel).toBe('sms');
      expect(mail.channel).toBe('email');
      const data = mail.data as InvitationData;
      expect(data.position).toBe('Parent of Ifeoma');
      expect(data.organisation).toBe('Greenfield Academy');
      expect(data.link).toMatch(/^http:\/\/greenfield\.localhost\/parent\/accept-invitation\//);
      const detail = await guardian(gfGuardianId);
      expect(detail.invitation).toMatchObject({ sentBy: 'SMS and email', expired: false });

      // Resending issues a new link.
      const again = await admin.post(`/api/v1/guardians/${gfGuardianId}/invite`);
      expect(again.body.message).toContain('Invitation resent to');
      const token = tokenFrom(parentEmail);
      const lookup = await t
        .http()
        .get(`/api/v1/auth/invitations/${token}`)
        .set('X-Forwarded-For', nextIp());
      expect(lookup.body.data).toMatchObject({
        kind: 'guardian',
        schoolName: 'Greenfield Academy',
      });
      expect((await accept(token)).status).toBe(200);
      expect((await guardian(gfGuardianId)).portal).toBe('Active');

      for (const id of [parentPhone, parentEmail]) {
        const signIn = await parentLogin(id);
        expect(signIn.status).toBe(200);
        expect(signIn.body.data.school).toMatchObject({ slug: 'greenfield' });
        expect(signIn.body.data.user).toMatchObject({
          displayName: `Mrs. Ijeoma ${surname}`,
          phone: e164(parentPhone),
        });
        expect(signIn.headers['set-cookie']?.[0]).toMatch(/^et_rt_parent=/);
      }
      const api = await parentApi(parentPhone);
      const children = await api.get('/api/v1/parent/children');
      expect(children.status).toBe(200);
      expect(children.body.data).toEqual([
        expect.objectContaining({ id: a.id, className: 'JSS 2B', access: 'full', leftOn: null }),
      ]);
      const me = await api.get('/api/v1/auth/me');
      expect(me.body.data).toMatchObject({ portal: 'parent', school: { slug: 'greenfield' } });

      // Only on this school's address, and only the Parent Portal.
      expect((await parentLogin(parentPhone, CRESTVIEW)).body.error.code).toBe('NO_ACCESS');
      const teacher = await login(t, parentPhone, PARENT_PASSWORD, {
        portal: 'teacher',
        host: GREENFIELD,
      });
      expect(teacher.body.error.code).toBe('NO_ACCESS');
      const crossHost = await authed(t, (await parentLogin(parentPhone)).body.data.accessToken, {
        host: CRESTVIEW,
      }).get('/api/v1/parent/children');
      expect(crossHost.body.error.code).toBe('TENANT_MISMATCH');
      // School Admin routes stay closed to parents.
      expect((await api.get('/api/v1/guardians')).status).toBe(403);
      // Already active: nothing to send.
      const active = await admin.post(`/api/v1/guardians/${gfGuardianId}/invite`);
      expect([active.status, active.body.error.code]).toEqual([409, 'ALREADY_ACTIVE']);
    });

    it('reuses the same login when another school invites the same parent, scoped to that school', async () => {
      const c = await student({ first: 'Jide', schoolId: crestviewId });
      const g = await addGuardian(crest, {
        name: `Mrs. Ijeoma ${surname}`,
        phone: parentPhone,
        studentIds: [c.id],
      });
      expect(g.status).toBe(201);
      t.notifications.clear();
      const res = await crest.post(`/api/v1/guardians/${g.body.data.id}/invite`);
      expect(res.status).toBe(200);
      expect(t.notifications.find(parentEmail, 'invitation')).toBeUndefined();

      const users = await t.prisma.user.findMany({ where: { phone: e164(parentPhone) } });
      expect(users).toHaveLength(1);
      const memberships = await t.prisma.schoolMembership.findMany({
        where: { userId: users[0]!.id, kind: 'GUARDIAN' },
        orderBy: { schoolId: 'asc' },
      });
      expect(memberships.map((m) => m.schoolId).sort()).toEqual([greenfieldId, crestviewId].sort());

      // An existing account confirms its password instead of choosing a new one.
      const token = tokenFrom(e164(parentPhone));
      const wrong = await accept(token, 'Another#2026b');
      expect(wrong.status).toBe(422);
      expect((await accept(token)).status).toBe(200);

      const atCrestview = await parentApi(parentPhone, CRESTVIEW);
      const kids = (await atCrestview.get('/api/v1/parent/children')).body.data as { id: string }[];
      expect(kids.map((k) => k.id)).toEqual([c.id]);
      const atGreenfield = await parentApi(parentEmail, GREENFIELD);
      const gfKids = (await atGreenfield.get('/api/v1/parent/children')).body.data as {
        id: string;
      }[];
      expect(gfKids.map((k) => k.id)).toEqual([gfChildId]);
      // Each school only sees its own guardian record.
      expect((await admin.get(`/api/v1/guardians/${g.body.data.id}`)).status).toBe(404);
    });

    it('invites in bulk: chosen guardians or everyone without an account in a class', async () => {
      const a = await student({ first: 'Kemi', level: 'JSS 3', arm: 'C' });
      const b = await student({ first: 'Lola', level: 'JSS 3', arm: 'C' });
      const other = await student({ first: 'Musa', level: 'SSS 1', arm: 'C' });
      const g1 = await rawGuardian({
        name: `Kehinde ${surname}`,
        phone: newPhone(),
        children: [a.id],
      });
      const g2 = await rawGuardian({
        name: `Lade ${surname}`,
        email: `lade.${tag}@example.com`,
        children: [b.id],
      });
      const none = await rawGuardian({ name: `Nocontact ${surname}`, children: [a.id] });
      const elsewhere = await rawGuardian({
        name: `Other ${surname}`,
        phone: newPhone(),
        children: [other.id],
      });

      const chosen = await admin.post('/api/v1/guardians/invite').send({ ids: [g1.id, none.id] });
      expect(chosen.status).toBe(200);
      expect(chosen.body.data).toEqual({
        invited: 1,
        skipped: [
          {
            id: none.id,
            name: `Nocontact ${surname}`,
            reason: 'No phone number or email to send the invitation to.',
          },
        ],
      });
      expect(chosen.body.message).toBe('1 invitation sent. 1 guardian skipped.');

      const byClass = await admin.post('/api/v1/guardians/invite').send({ className: 'JSS 3C' });
      expect(byClass.status).toBe(200);
      expect((await guardian(g2.id)).portal).toBe('Invited');
      expect((await guardian(g1.id)).portal).toBe('Invited');
      expect((await guardian(elsewhere.id)).portal).toBe('No account');

      const bad = await admin.post('/api/v1/guardians/invite').send({ branchId: 'main' });
      expect([bad.status, bad.body.message]).toEqual([422, 'Choose a branch.']);

      // Withdrawing a pending invitation kills its link.
      const token = tokenFrom(`lade.${tag}@example.com`);
      const revoked = await admin.delete(`/api/v1/guardians/${g2.id}/invite`);
      expect([revoked.status, revoked.body.message, revoked.body.data.portal]).toEqual([
        200,
        'Invitation withdrawn.',
        'No account',
      ]);
      const link = await t
        .http()
        .get(`/api/v1/auth/invitations/${token}`)
        .set('X-Forwarded-For', nextIp());
      expect(link.status).toBe(410);
      const twice = await admin.delete(`/api/v1/guardians/${g2.id}/invite`);
      expect(twice.body.error.code).toBe('NO_PENDING_INVITATION');
    });

    it('adds and invites in one step when asked', async () => {
      const a = await student({ first: 'Nneka', level: 'JSS 1' });
      const phone = newPhone();
      const res = await addGuardian(admin, {
        name: `Obi ${surname}`,
        phone,
        studentIds: [a.id],
        invite: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe(`Obi ${surname} added and invited to the parent portal.`);
      expect(res.body.data.portal).toBe('Invited');
      expect(t.notifications.find(e164(phone), 'invitation')?.channel).toBe('sms');
    });
  });

  /* ---------------- Leavers ---------------- */

  describe('leavers', () => {
    it('keeps a parent read-only for two years after a child left, then closes the account', async () => {
      const current = await student({ first: 'Ope', level: 'JSS 1' });
      const longGone = await student({
        first: 'Pelumi',
        status: 'GRADUATED',
        leftOn: new Date(t.clock.nowMs() - 3 * 365 * DAY),
      });
      const leaving = await student({ first: 'Qudus', level: 'JSS 1', arm: 'B' });
      const both = newPhone();
      const g = await rawGuardian({
        name: `Rita ${surname}`,
        phone: both,
        children: [current.id, longGone.id, leaving.id],
      });
      await invitedParent(g.id, both);
      const api = await parentApi(both);
      let kids = (await api.get('/api/v1/parent/children')).body.data as {
        id: string;
        access: string;
      }[];
      expect(kids.map((k) => [k.id, k.access])).toEqual([
        [current.id, 'full'],
        [leaving.id, 'full'],
      ]);

      // Qudus leaves: read-only for two years.
      const leftOn = new Date(t.clock.nowMs() - 400 * DAY);
      await t.prisma.student.update({
        where: { id: leaving.id },
        data: { status: 'TRANSFERRED', leftOn },
      });
      kids = (await api.get('/api/v1/parent/children')).body.data;
      expect(kids.find((k) => k.id === leaving.id)).toMatchObject({
        access: 'read-only',
        status: 'Transferred',
        leftOn: leftOn.toISOString().slice(0, 10),
      });
      const page = await guardian(g.id);
      expect(
        (page.childrenDetail as { id: string; status: string; note: string }[]).find(
          (c) => c.id === leaving.id,
        ),
      ).toMatchObject({
        status: 'Left',
        note: expect.stringContaining('parent can view past records until'),
      });

      // Ope leaves too and both are past two years: the parent's access ends.
      await t.prisma.student.updateMany({
        where: { id: { in: [current.id, leaving.id] } },
        data: { status: 'WITHDRAWN', leftOn: new Date(t.clock.nowMs() - 800 * DAY) },
      });
      const ended = await api.get('/api/v1/parent/children');
      expect([ended.status, ended.body.error.code]).toEqual([403, 'PARENT_ACCESS_ENDED']);
      expect((await parentLogin(both)).body.error.code).toBe('PARENT_ACCESS_ENDED');

      const job = await t.app.get(FamilyAccessService).closeEndedAccess();
      expect(job.parentsClosed).toBeGreaterThanOrEqual(1);
      const m = await t.prisma.schoolMembership.findFirstOrThrow({ where: { guardianId: g.id } });
      expect(m.status).toBe('DEACTIVATED');
      expect((await guardian(g.id)).portal).toBe('Closed');
      const after = await api.get('/api/v1/parent/children');
      expect(after.status).toBe(401);
      const refused = await parentLogin(both);
      expect(refused.body.error.code).toBe('ACCOUNT_DEACTIVATED');
      // A parent with a current child keeps their account.
      const kept = await t.prisma.user.findUniqueOrThrow({ where: { phone: e164(parentPhone) } });
      expect(
        (
          await t.prisma.schoolMembership.findMany({ where: { userId: kept.id, kind: 'GUARDIAN' } })
        ).every((x) => x.status === 'ACTIVE'),
      ).toBe(true);
    });
  });

  /* ---------------- Student logins ---------------- */

  describe('student logins', () => {
    it('stores Student Portal logins per section (JSS and SSS on by default) and saves the toggle', async () => {
      const res = await admin.get('/api/v1/academics/sections');
      const sections = res.body.data.sections as {
        id: string;
        name: string;
        code: string;
        description: string;
        studentLogins: boolean;
      }[];
      expect(Object.fromEntries(sections.map((s) => [s.code, s.studentLogins]))).toEqual({
        NUR: false,
        PRI: false,
        JSS: true,
        SSS: true,
      });
      const crestSections = (await crest.get('/api/v1/academics/sections')).body.data.sections as {
        code: string;
        studentLogins: boolean;
      }[];
      expect(crestSections.every((s) => s.studentLogins)).toBe(true);

      const body = (on: (code: string, current: boolean) => boolean | undefined) => ({
        sections: sections.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          description: s.description,
          ...(on(s.code, s.studentLogins) !== undefined && {
            studentLogins: on(s.code, s.studentLogins),
          }),
        })),
      });
      const on = await admin
        .put('/api/v1/academics/sections')
        .send(body((c, v) => (c === 'PRI' ? true : v)));
      expect(on.status).toBe(200);
      expect(
        on.body.data.sections.find((s: { code: string }) => s.code === 'PRI').studentLogins,
      ).toBe(true);
      // Older clients don't send the flag: it stays as it is.
      const kept = await admin.put('/api/v1/academics/sections').send(body(() => undefined));
      expect(
        kept.body.data.sections.find((s: { code: string }) => s.code === 'PRI').studentLogins,
      ).toBe(true);
      const off = await admin
        .put('/api/v1/academics/sections')
        .send(body((c, v) => (c === 'PRI' ? false : v)));
      expect(
        off.body.data.sections.find((s: { code: string }) => s.code === 'PRI').studentLogins,
      ).toBe(false);
    });

    it('creates logins only in enabled sections, with slips; the first sign-in changes the password', async () => {
      const jss = await student({ first: 'Sade', level: 'SSS 2', arm: 'B' });
      const pri = await student({ first: 'Tobi', level: 'Primary 2', arm: 'B' });
      const res = await admin
        .post('/api/v1/students/logins')
        .send({ studentIds: [jss.id, pri.id] });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(
        '1 login slip ready. Print them now: the passwords are shown once.',
      );
      expect(res.body.data).toMatchObject({
        created: 1,
        reissued: 0,
        skipped: [
          { id: pri.id, name: `Tobi ${surname}`, reason: 'Student logins are off for Primary.' },
        ],
      });
      const slip = res.body.data.slips[0] as Slip;
      expect(slip).toMatchObject({
        studentId: jss.id,
        name: `Sade ${surname}`,
        className: 'SSS 2B',
        admissionNo: jss.admissionNo,
        schoolName: 'Greenfield Academy',
        signInAddress: 'http://greenfield.localhost/student',
      });
      expect(slip.oneTimePassword).toMatch(/^[A-Z]{4}-\d{4}$/);
      const stored = await t.prisma.user.findFirstOrThrow({
        where: { memberships: { some: { studentId: jss.id } } },
      });
      expect(stored.passwordHash).not.toContain(slip.oneTimePassword);
      expect(stored.mustChangePassword).toBe(true);

      const view = await admin.get('/api/v1/students/logins?className=SSS 2B');
      expect(view.status).toBe(200);
      expect(view.body.data.students.find((s: { id: string }) => s.id === jss.id)).toMatchObject({
        login: 'Not signed in yet',
        enabled: true,
        section: 'Senior Secondary',
      });

      const first = await login(t, jss.admissionNo, slip.oneTimePassword, {
        portal: 'student',
        host: GREENFIELD,
      });
      expect([first.status, first.body.error.code]).toEqual([403, 'PASSWORD_EXPIRED']);
      const changed = await t
        .http()
        .post('/api/v1/auth/password/expired')
        .set('Host', GREENFIELD)
        .set('X-Forwarded-For', nextIp())
        .send({
          portal: 'student',
          email: jss.admissionNo,
          current: slip.oneTimePassword,
          next: 'Learner#2026',
        });
      expect(changed.status).toBe(200);
      expect(changed.body.data.user).toMatchObject({
        admissionNo: jss.admissionNo,
        displayName: `Sade ${surname}`,
      });
      const again = await login(t, jss.admissionNo.toLowerCase(), 'Learner#2026', {
        portal: 'student',
        host: GREENFIELD,
      });
      expect(again.status).toBe(200);
      const wrong = await login(t, jss.admissionNo, slip.oneTimePassword, {
        portal: 'student',
        host: GREENFIELD,
      });
      expect(wrong.body.message).toContain(
        'The admission number or password you entered is incorrect.',
      );
      expect(
        (await login(t, jss.admissionNo, 'Learner#2026', { portal: 'student', host: CRESTVIEW }))
          .status,
      ).toBe(401);
      const view2 = await admin.get('/api/v1/students/logins?className=SSS 2B');
      expect(view2.body.data.students.find((s: { id: string }) => s.id === jss.id).login).toBe(
        'Active',
      );

      // A login already exists: skipped, unless new passwords are asked for.
      const twice = await admin.post('/api/v1/students/logins').send({ studentIds: [jss.id] });
      expect(twice.body.data.skipped[0].reason).toBe('Already has a login.');
      const reissue = await admin
        .post('/api/v1/students/logins')
        .send({ studentIds: [jss.id], reissue: true });
      expect(reissue.body.data).toMatchObject({ created: 0, reissued: 1 });
      expect(
        (await login(t, jss.admissionNo, 'Learner#2026', { portal: 'student', host: GREENFIELD }))
          .status,
      ).toBe(401);
      const fresh = (reissue.body.data.slips[0] as Slip).oneTimePassword;
      expect(
        (await login(t, jss.admissionNo, fresh, { portal: 'student', host: GREENFIELD })).body.error
          .code,
      ).toBe('PASSWORD_EXPIRED');

      // Crestview can't make logins for Greenfield students.
      const cross = await crest.post('/api/v1/students/logins').send({ studentIds: [jss.id] });
      expect([cross.status, cross.body.message]).toEqual([422, 'No current students match.']);
    });

    it('refuses a student who has left, and the nightly job closes their login', async () => {
      const s = await student({ first: 'Uche', level: 'JSS 3', arm: 'B' });
      const res = await admin.post('/api/v1/students/logins').send({ studentIds: [s.id] });
      const otp = (res.body.data.slips[0] as Slip).oneTimePassword;
      await t
        .http()
        .post('/api/v1/auth/password/expired')
        .set('Host', GREENFIELD)
        .set('X-Forwarded-For', nextIp())
        .send({ portal: 'student', email: s.admissionNo, current: otp, next: 'Learner#2026' })
        .expect(200);

      await t.prisma.student.update({
        where: { id: s.id },
        data: { status: 'WITHDRAWN', leftOn: t.clock.now() },
      });
      const refused = await login(t, s.admissionNo, 'Learner#2026', {
        portal: 'student',
        host: GREENFIELD,
      });
      expect([refused.status, refused.body.error.code]).toEqual([403, 'STUDENT_LEFT']);
      await t.app.get(FamilyAccessService).closeEndedAccess();
      const m = await t.prisma.schoolMembership.findFirstOrThrow({ where: { studentId: s.id } });
      expect(m.status).toBe('DEACTIVATED');
      // Their class's section turned off: refused too.
      const other = await student({ first: 'Vera', level: 'JSS 3', arm: 'B' });
      const made = await admin.post('/api/v1/students/logins').send({ studentIds: [other.id] });
      const jssSection = await t.prisma.section.findFirstOrThrow({
        where: { schoolId: greenfieldId, code: 'JSS' },
      });
      await t.prisma.section.update({
        where: { id: jssSection.id },
        data: { studentLogins: false },
      });
      try {
        const off = await login(
          t,
          other.admissionNo,
          (made.body.data.slips[0] as Slip).oneTimePassword,
          {
            portal: 'student',
            host: GREENFIELD,
          },
        );
        expect(off.body.error.code).toBe('STUDENT_LOGINS_OFF');
      } finally {
        await t.prisma.section.update({
          where: { id: jssSection.id },
          data: { studentLogins: true },
        });
      }
    });
  });
});
