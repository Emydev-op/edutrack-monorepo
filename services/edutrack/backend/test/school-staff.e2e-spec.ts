import { authed, createTestApp, login, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

/** People these tests add (removed again afterwards). */
const CREATED: [string, string][] = [
  ['Bimpe', 'Ajayi'],
  ['Segun', 'Alao'],
  ['Rita', 'Ndukwe'],
  ['Tayo', 'Fadeyi'],
  ['Kemi', 'Ojo'],
];

const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%demo\n').toString('base64')}`;
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface Row {
  id: string;
  name: string;
  staffNumber: string;
  email: string;
  account: string;
  status: string;
  branch: string;
  branchIds: string[];
  group: string;
  kind: string;
  isYou: boolean;
}

describe('School Admin staff (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let branches: { id: string; name: string }[];

  const payload = (over: Record<string, unknown> = {}) => ({
    title: 'Mrs.',
    firstName: 'Bimpe',
    lastName: 'Ajayi',
    gender: 'Female',
    phone: '0803 555 0991',
    email: 'b.ajayi@greenfield.edu.ng',
    address: '3 Opebi Road, Ikeja',
    emergencyContact: 'Spouse · 0803 555 0144',
    kind: 'Teaching',
    position: 'Teacher',
    department: 'Arts & Humanities',
    employment: 'Full-time',
    since: '2026-09-14',
    branchIds: [branches[0]!.id],
    qualified: [],
    maxPeriods: 28,
    access: false,
    role: '',
    ...over,
  });

  const directory = async (api: Api = admin, query = '') =>
    (await api.get(`/api/v1/staff${query}`)).body.data as {
      rows: Row[];
      counts: Record<string, number>;
      total: number;
      deactivated: number;
    };
  const byEmail = async (email: string) => (await directory()).rows.find((r) => r.email === email)!;

  /** The staff number the next added person gets (`GFA-ST-` + the highest number + 1). */
  let nextNumber: (offset: number) => string;

  /** The seed's bursar has an expired password (expiry demo); renew it to sign in. */
  const freshPassword = (email: string) =>
    t.prisma.user.update({ where: { email }, data: { passwordChangedAt: t.clock.now() } });

  /** Removes what these tests add (the seed only restores its own rows). */
  async function cleanup() {
    const schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } }))
      .id;
    const added = await t.prisma.staff.findMany({
      where: {
        schoolId,
        OR: CREATED.map(([firstName, lastName]) => ({ firstName, lastName })),
      },
      select: { id: true },
    });
    const ids = added.map((s) => s.id);
    const yakubu = await t.prisma.staff.findMany({
      where: { schoolId, firstName: 'Musa', lastName: 'Yakubu' },
      select: { id: true },
    });
    await t.prisma.schoolMembership.deleteMany({
      where: { schoolId, staffId: { in: [...ids, ...yakubu.map((s) => s.id)] } },
    });
    await t.prisma.schoolMembership.deleteMany({
      where: { schoolId, staffId: null, kind: 'STAFF', status: 'REVOKED' },
    });
    await t.prisma.staffDocument.deleteMany({ where: { staffId: { in: ids } } });
    await t.prisma.staff.deleteMany({ where: { id: { in: ids } } });
    await t.prisma.department.deleteMany({ where: { schoolId, name: 'Arts & Humanities' } });
    await t.prisma.numberSequence.deleteMany({ where: { schoolId, kind: 'STAFF' } });
  }

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    await cleanup();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    branches = (await admin.get('/api/v1/staff/form-options')).body.data.branches;
    const numbers = await t.prisma.staff.findMany({
      where: { school: { slug: 'greenfield' } },
      select: { staffNumber: true },
    });
    const max = Math.max(...numbers.map((n) => Number(/(\d+)$/.exec(n.staffNumber)?.[1] ?? 0)));
    nextNumber = (offset) => `GFA-ST-${String(max + 1 + offset).padStart(4, '0')}`;
  });

  afterAll(async () => {
    await cleanup();
    await t.reseed();
    await t.close();
  });

  describe('directory', () => {
    it('lists the school’s staff with the mock’s shape, counts and filters', async () => {
      const res = await admin.get('/api/v1/staff');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Staff loaded.');
      const list = res.body.data;
      const names = (list.rows as Row[]).map((r) => r.name);
      expect(names).toContain('Mrs. Grace Okafor');
      expect(names).toContain('Mr. Peter Adamu');
      expect(names).not.toContain('Mr. Emem Udo');
      // Active first, then the deactivated.
      const firstGone = (list.rows as Row[]).findIndex((r) => r.status === 'Deactivated');
      expect((list.rows as Row[]).slice(firstGone).every((r) => r.status === 'Deactivated')).toBe(
        true,
      );
      expect(list.deactivated).toBe(2);
      expect(list.counts.All).toBe(list.total);

      const me = (list.rows as Row[]).find((r) => r.email === 'adaeze.okonkwo@greenfield.edu.ng')!;
      expect(me).toMatchObject({ isYou: true, account: 'Active', group: 'Administrative' });
      const ade = (list.rows as Row[]).find((r) => r.email === 's.ade@greenfield.edu.ng')!;
      expect(ade).toMatchObject({
        branch: 'All branches',
        kind: 'Teaching',
        staffNumber: 'GFA-ST-0117',
        load: { periods: 0, max: 28, subjects: 0, classes: 0 },
      });
      const lawal = (list.rows as Row[]).find((r) => r.email === 'kemi.lawal@greenfield.edu.ng')!;
      expect(lawal).toMatchObject({ account: 'Invited', group: 'Finance' });
      const adamu = (list.rows as Row[]).find((r) => r.name === 'Mr. Peter Adamu')!;
      expect(adamu).toMatchObject({ account: 'No account', group: 'Operations', email: '' });

      const finance = await directory(admin, '?group=Finance');
      expect(finance.rows.every((r) => r.group === 'Finance')).toBe(true);
      const noAccess = await directory(admin, '?group=No%20access');
      expect(noAccess.rows.every((r) => r.account === 'No account')).toBe(true);
      const search = await directory(admin, '?search=okafor');
      expect(search.rows.map((r) => r.name)).toEqual(['Mrs. Grace Okafor']);
      const gone = await directory(admin, '?status=Deactivated');
      expect(gone.rows.every((r) => r.status === 'Deactivated')).toBe(true);
      expect((await admin.get('/api/v1/staff?group=Nope')).status).toBe(422);
    });

    it('answers a profile with documents, account and history', async () => {
      const okafor = await byEmail('g.okafor@greenfield.edu.ng');
      const res = await admin.get(`/api/v1/staff/${okafor.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        title: 'Mrs.',
        firstName: 'Grace',
        gender: 'Female',
        since: '2018-09-10',
        address: 'Ikeja, Lagos',
        maxPeriods: 28,
        user: { email: 'g.okafor@greenfield.edu.ng', status: 'Active', roles: ['Teacher'] },
        teaching: { assignments: [], classTeacherOf: [] },
      });
      const kinds = (res.body.data.documents as { kind: string; status: string }[]).map(
        (d) => `${d.kind}:${d.status}`,
      );
      expect(kinds).toEqual([
        'Employment letter:Verified',
        'Teaching certificate (TRCN):Verified',
        'Guarantor form:Missing',
      ]);
      expect(res.body.data.history.at(-1)).toMatchObject({ title: 'Joined as English Teacher' });

      expect((await admin.get('/api/v1/staff/not-a-uuid')).status).toBe(404);
      const missing = await admin.get('/api/v1/staff/00000000-0000-4000-8000-000000000000');
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe('This staff member doesn’t exist');
    });

    it('lists teachers and form options', async () => {
      const teachers = await admin.get('/api/v1/staff/teachers');
      expect(teachers.status).toBe(200);
      const rows = teachers.body.data as { name: string; account: string }[];
      expect(rows.map((r) => r.name)).toContain('Mr. Samuel Ade');
      expect(rows.map((r) => r.name)).not.toContain('Mr. Tunde Ojo');

      const options = (await admin.get('/api/v1/staff/form-options')).body.data;
      expect(options.positions).toContain('Bursar');
      expect(options.departments).toEqual(expect.arrayContaining(['Academics', 'Vocational']));
      expect(options.roles.map((r: { name: string }) => r.name)).not.toContain('Owner');
      expect(options.roleForPosition.Bursar).toBe('Bursar');
      expect(options.branches.map((b: { name: string }) => b.name)).toEqual([
        'Main Campus',
        'Lekki Campus',
      ]);
    });
  });

  describe('add and edit', () => {
    it('adds a staff member with the next staff ID and records it', async () => {
      const res = await admin.post('/api/v1/staff').send(payload());
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Mrs. Bimpe Ajayi added.');
      expect(res.body.data).toMatchObject({
        name: 'Mrs. Bimpe Ajayi',
        staffNumber: nextNumber(0),
        department: 'Arts & Humanities',
        group: 'Teaching',
        account: 'No account',
        phone: '0803 555 0991',
        branch: 'Main Campus',
      });
      const detail = (await admin.get(`/api/v1/staff/${res.body.data.id}`)).body.data;
      expect(detail.history[0]).toMatchObject({
        title: 'Added as Teacher',
        detail: 'Adaeze Okonkwo · No portal access',
      });
      const next = await admin.post('/api/v1/staff').send(
        payload({
          firstName: 'Segun',
          lastName: 'Alao',
          title: 'Mr.',
          gender: 'Male',
          email: '',
          phone: '',
          kind: 'Non-teaching',
          position: 'Security',
          maxPeriods: 0,
          branchIds: branches.map((b) => b.id),
        }),
      );
      expect(next.body.data).toMatchObject({
        staffNumber: nextNumber(1),
        group: 'Operations',
        branch: 'All branches',
        load: null,
      });
    });

    it('checks phone and email formats, duplicates, branches, dates and roles', async () => {
      const send = (over: Record<string, unknown>) =>
        admin
          .post('/api/v1/staff')
          .send(payload({ email: 'x.new@greenfield.edu.ng', phone: '', ...over }));
      const cases: [Record<string, unknown>, string, string?][] = [
        [{ phone: '12345' }, 'Use a Nigerian mobile number, e.g. 0803 555 0161.', 'phone'],
        [{ phone: '+234 805 221 9087' }, 'This phone number is already used by Mrs. Grace Okafor.'],
        [{ email: 'not-an-email' }, 'Enter a valid email, e.g. name@school.ng.', 'email'],
        [
          { email: 'G.Okafor@greenfield.edu.ng' },
          'This email is already used by Mrs. Grace Okafor.',
        ],
        [
          { email: '', access: true, role: 'Teacher' },
          'An email is needed to send the invitation.',
        ],
        [{ position: '' }, 'Choose a position.'],
        [{ branchIds: [] }, 'Choose at least one branch.'],
        [{ branchIds: ['nope'] }, 'Choose active branches only.'],
        [{ since: '14/09/2026' }, 'Enter the start date as a date.'],
        [{ since: '2030-01-01' }, 'The start date is more than a year away. Check the date.'],
        [{ maxPeriods: 50 }, 'Maximum periods per week is between 1 and 40.'],
        [{ access: true, role: 'Owner' }, 'Choose what they can do in Edutrack.'],
        [{ qualified: ['ZZZ'] }, 'Choose subjects from the list.'],
        [{ firstName: '' }, 'Enter a first name.'],
        [{ kind: 'Sometimes' }, 'Choose teaching or non-teaching.'],
      ];
      for (const [over, message, field] of cases) {
        const res = await send(over);
        expect({ over, status: res.status, message: res.body.message }).toEqual({
          over,
          status: 422,
          message,
        });
        if (field) expect(res.body.error.fields[field]).toBe(message);
      }
      // A deactivated person's phone and email can be used again.
      const reuse = await send({ email: 'tunde.ojo@greenfield.edu.ng', phone: '0803 555 0179' });
      expect(reuse.status).toBe(201);
    });

    it('adds with portal access: account, invitation email and a working accept page', async () => {
      const res = await admin.post('/api/v1/staff').send(
        payload({
          firstName: 'Rita',
          lastName: 'Ndukwe',
          email: 'r.ndukwe@greenfield.edu.ng',
          phone: '0803 555 0777',
          access: true,
          role: 'Teacher',
        }),
      );
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Invitation sent to r.ndukwe@greenfield.edu.ng.');
      expect(res.body.data.account).toBe('Invited');
      const mail = t.notifications.find('r.ndukwe@greenfield.edu.ng', 'invitation');
      expect(mail).toBeDefined();
      const link = (mail!.data as { link: string }).link;
      const token = link.split('/').pop()!;
      const lookup = await t.http().get(`/api/v1/auth/invitations/${token}`);
      expect(lookup.status).toBe(200);
      expect(lookup.body.data).toMatchObject({
        firstName: 'Rita',
        roleName: 'Teacher',
        position: 'Teacher',
        schoolName: 'Greenfield Academy',
      });
      const detail = (await admin.get(`/api/v1/staff/${res.body.data.id}`)).body.data;
      expect(detail.user).toMatchObject({ status: 'Invited', roles: ['Teacher'] });
      expect(detail.user.invited).toMatch(/\d{4}$/);
    });

    it('edits: position, branches and cancelling or re-sending an invitation', async () => {
      const rita = await byEmail('r.ndukwe@greenfield.edu.ng');
      const detail = (await admin.get(`/api/v1/staff/${rita.id}`)).body.data;
      const base = {
        ...payload(),
        title: detail.title,
        firstName: detail.firstName,
        lastName: detail.lastName,
        email: detail.email,
        phone: detail.phone,
      };
      // A new address on a pending invitation sends a new one.
      t.notifications.clear();
      const moved = await admin.put(`/api/v1/staff/${rita.id}`).send({
        ...base,
        email: 'rita.ndukwe@greenfield.edu.ng',
        access: true,
        position: 'Head of Department',
      });
      expect(moved.status).toBe(200);
      expect(moved.body.message).toBe('Changes saved.');
      expect(moved.body.data).toMatchObject({ position: 'Head of Department', account: 'Invited' });
      expect(moved.body.data.cleared).toEqual({ removed: 0, classes: 0 });
      expect(t.notifications.find('rita.ndukwe@greenfield.edu.ng', 'invitation')).toBeDefined();

      // Access off withdraws it.
      const off = await admin
        .put(`/api/v1/staff/${rita.id}`)
        .send({ ...base, email: 'rita.ndukwe@greenfield.edu.ng', access: false });
      expect(off.body.data.account).toBe('No account');
      const history = (await admin.get(`/api/v1/staff/${rita.id}`)).body.data.history;
      expect(history[0].detail).toContain('Invitation cancelled');

      // Unknown and other schools' records are 404s; deactivated ones must be reactivated first.
      expect(
        (await admin.put('/api/v1/staff/00000000-0000-4000-8000-000000000000').send(base)).status,
      ).toBe(404);
      const ojo = (await directory(admin, '?status=Deactivated')).rows.find(
        (r) => r.name === 'Mr. Tunde Ojo',
      )!;
      const locked = await admin.put(`/api/v1/staff/${ojo.id}`).send(base);
      expect(locked.status).toBe(409);
      expect(locked.body.message).toBe('Reactivate this staff member before editing.');
    });

    it('stores a photo checked by its bytes', async () => {
      const rita = await byEmail('rita.ndukwe@greenfield.edu.ng');
      const detail = (await admin.get(`/api/v1/staff/${rita.id}`)).body.data;
      const body = {
        ...payload(),
        firstName: 'Rita',
        lastName: 'Ndukwe',
        email: detail.email,
        phone: detail.phone,
      };
      const fake = await admin.put(`/api/v1/staff/${rita.id}`).send({
        ...body,
        photo: `data:image/png;base64,${Buffer.from('nope').toString('base64')}`,
      });
      expect(fake.status).toBe(422);
      expect(fake.body.error.code).toBe('FILE_TYPE');
      const ok = await admin.put(`/api/v1/staff/${rita.id}`).send({ ...body, photo: PNG });
      expect(ok.status).toBe(200);
      const after = (await admin.get(`/api/v1/staff/${rita.id}`)).body.data;
      expect(after.photoUrl).toMatch(
        /^https:\/\/storage\.test\/schools\/.+\/staff\/.+\/photo\/.+\.png$/,
      );
    });
  });

  describe('documents', () => {
    it('uploads (checked by bytes), replaces and verifies documents', async () => {
      const okafor = await byEmail('g.okafor@greenfield.edu.ng');
      const url = `/api/v1/staff/${okafor.id}/documents`;
      const fake = await admin.post(url).send({
        kind: 'Guarantor form',
        name: 'g.pdf',
        file: `data:application/pdf;base64,${Buffer.from('hello').toString('base64')}`,
      });
      expect(fake.status).toBe(422);
      expect(fake.body.message).toBe('Use a PDF, JPG or PNG file.');
      const big = await admin.post(url).send({
        kind: 'Guarantor form',
        name: 'g.pdf',
        file: `data:application/pdf;base64,${Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(5 * 1024 * 1024)]).toString('base64')}`,
      });
      expect(big.status).toBe(422);
      expect(big.body.error.code).toBe('FILE_TOO_LARGE');
      expect(
        (await admin.post(url).send({ kind: '', name: 'g.pdf', file: PDF })).body.message,
      ).toBe('Choose the document type.');

      const up = await admin
        .post(url)
        .send({ kind: 'Guarantor form', name: 'guarantor.pdf', file: PDF });
      expect(up.status).toBe(200);
      expect(up.body.message).toBe('Guarantor form uploaded. Verify it once you’ve checked it.');
      const doc = (
        up.body.data as { id: string; kind: string; status: string; url: string; name: string }[]
      ).find((d) => d.kind === 'Guarantor form')!;
      expect(doc).toMatchObject({ status: 'Pending', name: 'guarantor.pdf' });
      expect(doc.url).toMatch(
        /^https:\/\/storage\.test\/schools\/.+\/staff\/.+\/documents\/.+\.pdf$/,
      );
      const key = doc.url.replace('https://storage.test/', '');
      expect(t.storage.objects.get(key)?.contentType).toBe('application/pdf');

      // Same kind replaces the file (the old object is removed).
      const again = await admin
        .post(url)
        .send({ kind: 'Guarantor form', name: 'guarantor-2.png', file: PNG });
      const replaced = (again.body.data as { id: string; kind: string; url: string }[]).filter(
        (d) => d.kind === 'Guarantor form',
      );
      expect(replaced).toHaveLength(1);
      expect(replaced[0]!.id).toBe(doc.id);
      expect(t.storage.objects.has(key)).toBe(false);

      const verified = await admin.post(`${url}/${doc.id}/verify`);
      expect(verified.status).toBe(200);
      expect(verified.body.message).toBe('Guarantor form verified.');
      expect(
        (verified.body.data as { id: string; status: string }[]).find((d) => d.id === doc.id)!
          .status,
      ).toBe('Verified');
      const twice = await admin.post(`${url}/${doc.id}/verify`);
      expect(twice.status).toBe(409);
      expect(twice.body.message).toBe('Only a pending document can be verified.');
      expect((await admin.post(`${url}/00000000-0000-4000-8000-000000000000/verify`)).status).toBe(
        404,
      );
    });
  });

  describe('invitations', () => {
    it('invites with the usual role, resends pending ones and skips the rest', async () => {
      const list = await directory();
      const yakubu = list.rows.find((r) => r.name === 'Mr. Musa Yakubu')!;
      const adamu = list.rows.find((r) => r.name === 'Mr. Peter Adamu')!;
      const lawal = list.rows.find((r) => r.email === 'kemi.lawal@greenfield.edu.ng')!;
      const okafor = list.rows.find((r) => r.email === 'g.okafor@greenfield.edu.ng')!;
      t.notifications.clear();
      const res = await admin
        .post('/api/v1/staff/invite')
        .send({ ids: [yakubu.id, adamu.id, lawal.id, okafor.id] });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        invited: 2,
        skipped: ['Mr. Peter Adamu', 'Mrs. Grace Okafor'],
      });
      expect(res.body.message).toBe('2 invitations sent.');
      expect(t.notifications.find('m.yakubu@greenfield.edu.ng', 'invitation')).toBeDefined();
      expect(t.notifications.find('kemi.lawal@greenfield.edu.ng', 'invitation')).toBeDefined();
      const detail = (await admin.get(`/api/v1/staff/${yakubu.id}`)).body.data;
      expect(detail.user).toMatchObject({ status: 'Invited', roles: ['Inventory Officer'] });

      const none = await admin.post('/api/v1/staff/invite').send({ ids: [adamu.id] });
      expect(none.body).toMatchObject({ message: 'Nobody to invite.', data: { invited: 0 } });
    });
  });

  describe('deactivate and reactivate', () => {
    it('ends the person’s access: sessions revoked, sign-in refused', async () => {
      await freshPassword('kunle.bakare@greenfield.edu.ng');
      const bakare = await signIn(t, 'kunle.bakare@greenfield.edu.ng');
      const bakareApi = authed(t, bakare.token);
      expect((await bakareApi.get('/api/v1/staff')).status).toBe(200);

      const row = await byEmail('kunle.bakare@greenfield.edu.ng');
      const res = await admin.post(`/api/v1/staff/${row.id}/deactivate`).send({});
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Mr. Kunle Bakare deactivated.');
      expect(res.body.data).toMatchObject({ status: 'Deactivated', account: 'Deactivated' });
      expect(res.body.data.leftOn).toMatch(/^\w{3} \d{4}$/);

      const after = await bakareApi.get('/api/v1/staff');
      expect(after.status).toBe(401);
      expect((await login(t, 'kunle.bakare@greenfield.edu.ng')).status).not.toBe(200);

      const again = await admin.post(`/api/v1/staff/${row.id}/deactivate`).send({});
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('Already deactivated.');

      const back = await admin.post(`/api/v1/staff/${row.id}/reactivate`);
      expect(back.status).toBe(200);
      expect(back.body.message).toBe('Mr. Kunle Bakare reactivated.');
      expect(back.body.data).toMatchObject({
        status: 'Active',
        leftOn: null,
        account: 'Deactivated',
      });
      const history = (await admin.get(`/api/v1/staff/${row.id}`)).body.data.history;
      expect(history.slice(0, 2).map((h: { title: string }) => h.title)).toEqual([
        'Reactivated',
        'Deactivated',
      ]);
      expect((await admin.post(`/api/v1/staff/${row.id}/reactivate`)).status).toBe(409);
    });

    it('withdraws a pending invitation, refuses yourself and the only top post holder', async () => {
      const nnamdi = await byEmail('c.nnamdi@greenfield.edu.ng');
      const res = await admin.post(`/api/v1/staff/${nnamdi.id}/deactivate`).send({});
      expect(res.body.data.account).toBe('No account');
      const lookup = await t.http().get('/api/v1/auth/invitations/GFA-INV-7Q2K');
      expect(lookup.body.error.code).toBe('INVITATION_REVOKED');

      const me = await byEmail('adaeze.okonkwo@greenfield.edu.ng');
      const self = await admin.post(`/api/v1/staff/${me.id}/deactivate`).send({});
      expect(self.status).toBe(409);
      expect(self.body.message).toBe('You can’t deactivate yourself.');

      const okoro = await byEmail('chidi.okoro@greenfield.edu.ng');
      const schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } }))
        .id;
      const top = await t.prisma.position.create({ data: { schoolId, title: 'Test Head' } });
      await t.prisma.positionHolder.create({
        data: { schoolId, positionId: top.id, staffId: okoro.id },
      });
      try {
        const only = await admin.post(`/api/v1/staff/${okoro.id}/deactivate`).send({});
        expect(only.status).toBe(409);
        expect(only.body.message).toBe(
          'Mr. Chidi Okoro is the only Test Head. Assign someone else in the Organogram first.',
        );
      } finally {
        await t.prisma.position.delete({ where: { id: top.id } });
      }
    });
  });

  describe('import', () => {
    const csv = [
      'first_name,last_name,email,phone,type,position,branch,portal_access,role',
      'Tayo,Fadeyi,t.fadeyi@greenfield.edu.ng,08035550401,Teaching,Teacher,Main Campus,yes,Teacher',
      'Kemi,Ojo,,08035550402,Non-teaching,Gardener,Lekki Campus,no,',
      'Bad,Row,g.okafor@greenfield.edu.ng,123,Sometimes,,Ajah Annex,yes,Wizard',
    ].join('\n');

    it('previews every row with its problems, then commits the valid ones', async () => {
      const bad = await admin
        .post('/api/v1/staff/import')
        .send({ fileName: 'x.csv', text: 'a,b\n1,2' });
      expect(bad.status).toBe(422);
      expect(bad.body.message).toBe(
        'Missing columns: first_name, last_name, type, position, branch. Download the template.',
      );
      expect(
        (await admin.post('/api/v1/staff/import').send({ fileName: 'x.csv', text: 'first_name' }))
          .body.message,
      ).toBe('The file has no staff rows. Use the template’s columns.');

      const preview = await admin
        .post('/api/v1/staff/import')
        .send({ fileName: 'staff.csv', text: csv });
      expect(preview.status).toBe(200);
      const rows = preview.body.data.rows as {
        line: number;
        errors: string[];
        warnings: string[];
      }[];
      expect(rows.map((r) => r.line)).toEqual([2, 3, 4]);
      expect(rows[0]!.errors).toEqual([]);
      expect(rows[1]!.warnings).toEqual(['no portal access', 'position not in the standard list']);
      expect(rows[2]!.errors).toEqual([
        'type must be Teaching or Non-teaching',
        'position is required',
        'unknown branch “Ajah Annex”',
        'email already used',
        'phone is not a Nigerian mobile number',
        'unknown role “Wizard”',
      ]);

      t.notifications.clear();
      const commit = await admin.post(`/api/v1/staff/import/${preview.body.data.id}/commit`);
      expect(commit.status).toBe(200);
      expect(commit.body.data).toEqual({ imported: 2, invites: 1, skipped: 1 });
      expect(commit.body.message).toBe('2 staff imported. 1 invitation sent.');
      expect(t.notifications.find('t.fadeyi@greenfield.edu.ng', 'invitation')).toBeDefined();
      const fadeyi = await byEmail('t.fadeyi@greenfield.edu.ng');
      expect(fadeyi).toMatchObject({ account: 'Invited', kind: 'Teaching', branch: 'Main Campus' });
      expect(fadeyi.staffNumber).toMatch(/^GFA-ST-\d{4}$/);

      const twice = await admin.post(`/api/v1/staff/import/${preview.body.data.id}/commit`);
      expect(twice.status).toBe(404);
      expect(twice.body.message).toBe('This import has expired. Upload the file again.');
    });
  });

  describe('permissions', () => {
    it('lets Academics read (academics.view) but not change staff', async () => {
      const eze = authed(t, (await signIn(t, 'c.eze@greenfield.edu.ng')).token);
      expect((await eze.get('/api/v1/staff')).status).toBe(200);
      expect((await eze.get('/api/v1/staff/teachers')).status).toBe(200);
      const res = await eze
        .post('/api/v1/staff')
        .send(payload({ email: 'z@greenfield.edu.ng', phone: '' }));
      expect(res.status).toBe(403);
      const okafor = await byEmail('g.okafor@greenfield.edu.ng');
      expect((await eze.post(`/api/v1/staff/${okafor.id}/deactivate`).send({})).status).toBe(403);
      expect((await eze.post('/api/v1/staff/invite').send({ ids: [okafor.id] })).status).toBe(403);
    });

    it('refuses roles with neither settings.users nor academics.view', async () => {
      const schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } }))
        .id;
      const user = await t.prisma.user.findUniqueOrThrow({
        where: { email: 'kunle.bakare@greenfield.edu.ng' },
      });
      const membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { schoolId, userId: user.id },
      });
      const adminRole = await t.prisma.schoolRole.findFirstOrThrow({
        where: { schoolId, key: 'school_admin' },
      });
      await t.prisma.schoolMembership.update({
        where: { id: membership.id },
        data: { status: 'ACTIVE' },
      });
      await freshPassword('kunle.bakare@greenfield.edu.ng');
      const bursar = authed(t, (await signIn(t, 'kunle.bakare@greenfield.edu.ng')).token);
      await t.prisma.membershipRole.delete({
        where: { membershipId_roleId: { membershipId: membership.id, roleId: adminRole.id } },
      });
      expect((await bursar.get('/api/v1/staff')).status).toBe(403);
      expect((await bursar.get('/api/v1/staff/form-options')).status).toBe(403);
    });

    it('keeps teacher-portal sessions out', async () => {
      const teacher = await signIn(t, 'g.okafor@greenfield.edu.ng', {
        host: 'greenfield.localhost',
      });
      const res = await authed(t, teacher.token, { host: 'greenfield.localhost' }).get(
        '/api/v1/staff',
      );
      expect(res.status).toBe(403);
    });
  });

  describe('tenant isolation', () => {
    it('Crestview’s admin can’t read or change Greenfield staff by id', async () => {
      const udo = authed(t, (await signIn(t, 'e.udo@crestviewcollege.ng')).token);
      const theirs = await directory(udo);
      expect(theirs.rows.map((r) => r.name)).toEqual(['Mr. Emem Udo']);
      expect(theirs.rows[0]).toMatchObject({ staffNumber: 'CCV-ST-0001', isYou: true });

      const okafor = await byEmail('g.okafor@greenfield.edu.ng');
      const docs = (await admin.get(`/api/v1/staff/${okafor.id}`)).body.data.documents as {
        id: string;
      }[];
      const attempts = [
        udo.get(`/api/v1/staff/${okafor.id}`),
        udo.put(`/api/v1/staff/${okafor.id}`).send(payload({ branchIds: [] })),
        udo.post(`/api/v1/staff/${okafor.id}/deactivate`).send({ coverArranged: true }),
        udo.post(`/api/v1/staff/${okafor.id}/reactivate`),
        udo
          .post(`/api/v1/staff/${okafor.id}/documents`)
          .send({ kind: 'CV', name: 'cv.pdf', file: PDF }),
        udo.post(`/api/v1/staff/${okafor.id}/documents/${docs[0]!.id}/verify`),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('STAFF_NOT_FOUND');
      }
      const invite = await udo.post('/api/v1/staff/invite').send({ ids: [okafor.id] });
      expect(invite.body.data).toEqual({ invited: 0, skipped: [] });
      const after = (await admin.get(`/api/v1/staff/${okafor.id}`)).body.data;
      expect(after).toMatchObject({ status: 'Active', account: 'Active' });

      // An import batch belongs to its school too.
      const preview = await admin.post('/api/v1/staff/import').send({
        fileName: 'a.csv',
        text: 'first_name,last_name,type,position,branch\nA,B,Teaching,Teacher,Main Campus',
      });
      const commit = await udo.post(`/api/v1/staff/import/${preview.body.data.id}/commit`);
      expect(commit.status).toBe(404);
    });
  });
});
