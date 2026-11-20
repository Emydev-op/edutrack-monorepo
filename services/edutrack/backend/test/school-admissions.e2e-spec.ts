import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

/** Students these tests add (removed again afterwards). */
const CREATED: [string, string][] = [
  ['Kamsi', 'Nwosu'],
  ['Chidi', 'Nwosu'],
  ['Ebube', 'Nwosu'],
  ['Tamuno', 'Briggs'],
  ['Ladi', 'Kwaghbee'],
  ['Chiamaka', 'Ibekwe'],
  ['Somto', 'Ibekwe'],
  ['Halima', 'Bako'],
  ['Femi', 'Oyelaran'],
  ['Adaora', 'Obiora'],
  ['Musa', 'Garba'],
  ['Tobi', 'Uchendu'],
  ['Ene', 'Ochai'],
];
/** Guardians these tests add, by phone or email. */
const PHONES = ['+2348095550193', '+2348095550177', '+2348095550201', '+2348095550301'];
const EMAILS = ['obinna.nwosu@example.ng', 'amaka.obiora@example.ng'];
const NO_PHONE_GUARDIANS = ['Mrs. Funke Oyelaran'];

const PATTERN = 'STU-[YYYY]-[####]';
const header =
  'surname,first_name,other_names,gender,date_of_birth,class_level,arm,guardian_name,guardian_phone,guardian_email,relationship,state_of_origin,previous_school';

describe('School Admin admissions and student import (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  let kamsiApplicationId: string;
  /** The admission number the n-th student these tests add gets (0-based). */
  let numberAt: (n: number) => string;
  let added = 0;
  const nextNumber = () => numberAt(added++);

  const admitPayload = (over: Record<string, unknown> = {}) => ({
    applicationId: null,
    surname: 'Nwosu',
    firstName: 'Kamsi',
    otherNames: 'Chidinma',
    gender: 'Female',
    dateOfBirth: '2014-05-12',
    stateOfOrigin: 'anambra',
    previousSchool: 'Little Angels School',
    guardian: {
      mode: 'new',
      name: 'Mr. Obinna Nwosu',
      phone: '0809 555 0193',
      email: 'obinna.nwosu@example.ng',
    },
    relationship: 'Father',
    paysFees: true,
    invite: true,
    branch: 'Main Campus',
    level: 'JSS 1',
    arm: 'A',
    admissionType: 'New intake',
    admissionDate: '',
    religious: 'CRS',
    elective: 'Computer Studies',
    documents: { birth: 'birth.pdf', photo: null, report: null },
    billing: 'full',
    siblingDiscount: false,
    ...over,
  });

  const options = async (api: Api = admin) => (await api.get('/api/v1/admissions/options')).body;
  const used = async (branch: string, level: string, arm: string) =>
    ((await options()).data.armsByBranch[branch][level] as { arm: string; used: number }[]).find(
      (a) => a.arm === arm,
    )!.used;

  /** Removes what these tests add (the seed only restores its own rows). */
  async function cleanup() {
    const students = await t.prisma.student.findMany({
      where: {
        schoolId,
        OR: CREATED.map(([firstName, surname]) => ({ firstName, surname })),
      },
      select: { id: true },
    });
    const ids = students.map((s) => s.id);
    await t.prisma.admissionApplication.updateMany({
      where: { schoolId, studentId: { in: ids } },
      data: { studentId: null, stage: 'OFFER_ACCEPTED' },
    });
    // Draft invoices made at admission (lines and discounts go with them).
    await t.prisma.invoice.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.studentSubject.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.studentGuardian.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.student.deleteMany({ where: { id: { in: ids } } });
    await t.prisma.guardian.deleteMany({
      where: {
        schoolId,
        OR: [
          { phone: { in: PHONES } },
          { email: { in: EMAILS } },
          { fullName: { in: NO_PHONE_GUARDIANS } },
        ],
      },
    });
    await t.prisma.numberSequence.deleteMany({ where: { schoolId, kind: 'ADMISSION' } });
    await t.prisma.schoolSettings.updateMany({
      where: { schoolId },
      data: { admissionNumberPattern: PATTERN },
    });
  }

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    await cleanup();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric' })
      .format(t.clock.now())
      .slice(0, 4);
    const numbers = await t.prisma.student.findMany({
      where: { schoolId },
      select: { admissionNo: true },
    });
    const max = Math.max(
      0,
      ...numbers.map((n) =>
        Number(new RegExp(`^STU-${year}-(\\d+)$`).exec(n.admissionNo)?.[1] ?? 0),
      ),
    );
    numberAt = (n) => `STU-${year}-${String(max + 1 + n).padStart(4, '0')}`;
    kamsiApplicationId = (
      await t.prisma.admissionApplication.findFirstOrThrow({
        where: { schoolId, firstName: 'Kamsi', surname: 'Nwosu' },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await t.reseed();
    await t.close();
  });

  describe('applications and options', () => {
    it('lists the school’s applications in the mock’s shape, newest first', async () => {
      const res = await admin.get('/api/v1/admissions');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Applications loaded.');
      const rows = res.body.data as { applicant: string; applied: string }[];
      expect(rows.map((r) => r.applicant)).toEqual([
        'Toluwani Ajayi',
        'Ifeanyi Okonkwo',
        'Zainab Bello',
        'Kamsi Nwosu',
        'Oghenekaro Edewor',
      ]);
      expect(rows[3]).toEqual({
        id: kamsiApplicationId,
        applicant: 'Kamsi Nwosu',
        note: 'Sister of David Nwosu (JSS 2B)',
        applyingFor: 'JSS 1 · Main Campus',
        type: 'Transfer in',
        applied: '28 Nov 2026',
        guardian: 'Mr. Obinna Nwosu',
        stage: 'Offer accepted',
        stageNote: '',
        studentId: null,
      });
    });

    it('answers what the wizard needs: session, branches, arms with places, documents', async () => {
      const body = await options();
      expect(body.message).toBe('Admission options loaded.');
      const o = body.data;
      expect(o).toMatchObject({
        session: '2026/2027',
        term: 'First Term',
        branches: ['Main Campus', 'Lekki Campus'],
        feesReady: true,
      });
      // This term's fees per branch and class, from Finance's published First Term structure.
      expect(o.feeLines['Main Campus|JSS 1']).toEqual({
        items: [
          ['Tuition', 220000],
          ['Development levy', 25000],
          ['Examination fee', 15000],
          ['ICT fee', 10000],
          ['PTA levy', 5000],
        ],
        once: [['Admission fee (one-time)', 25000]],
        sibling: 22000,
      });
      expect(o.feeLines['Lekki Campus|Nursery 1'].items[0]).toEqual(['Tuition', 120000]);
      expect(o.admissionFee).toBe(25000);
      expect(Object.keys(o.arms)).toContain('JSS 1');
      expect(o.arms['JSS 1'].map((a: { arm: string }) => a.arm)).toEqual(['A', 'B', 'C']);
      expect(o.arms['JSS 1'][0]).toMatchObject({ capacity: 35 });
      expect(o.armsByBranch['Lekki Campus']['JSS 1']).toBeUndefined();
      expect(o.armsByBranch['Lekki Campus']['Nursery 1']).toEqual([
        { arm: 'A', used: expect.any(Number), capacity: 25 },
      ]);
      expect(o.states).toContain('Anambra');
      expect(o.requiredDocuments.map((d: { key: string }) => d.key)).toEqual([
        'birth',
        'photo',
        'report',
      ]);
    });
  });

  describe('admitting', () => {
    it('admits from an application: next admission number, guardian, enrollment, no invite', async () => {
      const before = await used('Main Campus', 'JSS 1', 'A');
      t.notifications.clear();
      const res = await admin.post('/api/v1/admissions').send(
        admitPayload({
          applicationId: kamsiApplicationId,
          admissionType: 'Transfer in',
          documents: { birth: 'birth.pdf', photo: null, report: 'report.pdf' },
        }),
      );
      expect(res.status).toBe(200);
      const admissionNo = nextNumber();
      expect(res.body.data).toEqual({
        studentId: expect.any(String),
        name: 'Kamsi Nwosu',
        admissionNo,
        className: 'JSS 1A',
        branch: 'Main Campus',
        guardianName: 'Mr. Obinna Nwosu',
        invited: false,
        // First Term's fees for a new JSS 1 student, as a draft for Finance to issue.
        invoiceTotal: 300000,
      });
      expect(res.body.message).toBe(`Kamsi Nwosu admitted to JSS 1A as ${admissionNo}.`);
      const draft = await t.prisma.invoice.findFirstOrThrow({
        where: { studentId: res.body.data.studentId },
        include: { lines: true },
      });
      expect(draft).toMatchObject({ status: 'DRAFT', totalKobo: 30_000_000n });
      expect(draft.lines.map((l) => l.label)).toContain('Admission fee');

      const student = await t.prisma.student.findUniqueOrThrow({
        where: { id: res.body.data.studentId },
        include: {
          enrollments: { include: { session: true, arm: true, level: true } },
          guardians: { include: { guardian: true } },
          membership: true,
        },
      });
      expect(student).toMatchObject({
        status: 'ACTIVE',
        admissionType: 'TRANSFER_IN',
        otherNames: 'Chidinma',
        stateOfOrigin: 'Anambra',
        gender: 'FEMALE',
      });
      expect(student.dateOfBirth!.toISOString().slice(0, 10)).toBe('2014-05-12');
      expect(student.enrollments).toHaveLength(1);
      expect(student.enrollments[0]).toMatchObject({
        status: 'ACTIVE',
        session: { name: '2026/2027' },
        level: { name: 'JSS 1' },
        arm: { name: 'A' },
      });
      expect(student.guardians).toHaveLength(1);
      expect(student.guardians[0]).toMatchObject({
        relationship: 'Father',
        isPrimary: true,
        paysFees: true,
        guardian: {
          fullName: 'Mr. Obinna Nwosu',
          phone: '+2348095550193',
          email: 'obinna.nwosu@example.ng',
          contactConsentSource: 'admission_form',
        },
      });
      expect(student.guardians[0]!.guardian.contactConsentAt).not.toBeNull();
      expect(await used('Main Campus', 'JSS 1', 'A')).toBe(before + 1);

      // No parent or student accounts and no invitations.
      expect(student.membership).toBeNull();
      expect(
        await t.prisma.schoolMembership.count({
          where: { schoolId, guardianId: student.guardians[0]!.guardianId },
        }),
      ).toBe(0);
      expect(
        await t.prisma.invitation.count({
          where: { schoolId, email: 'obinna.nwosu@example.ng' },
        }),
      ).toBe(0);
      expect(t.notifications.sent).toEqual([]);

      const app = (await admin.get('/api/v1/admissions')).body.data.find(
        (a: { id: string }) => a.id === kamsiApplicationId,
      );
      expect(app).toMatchObject({
        stage: 'Admitted',
        stageNote: 'Now an active student',
        studentId: student.id,
      });
      const audit = await t.prisma.auditEvent.findFirst({
        where: { schoolId, action: 'student.admit', entityId: student.id },
      });
      expect(audit).toMatchObject({ area: 'Students', summary: 'Admitted to JSS 1A' });

      const twice = await admin
        .post('/api/v1/admissions')
        .send(admitPayload({ applicationId: kamsiApplicationId, firstName: 'Ebube' }));
      expect(twice.status).toBe(409);
      expect(twice.body.error.code).toBe('APPLICATION_ADMITTED');
    });

    it('finds siblings and existing guardians, and reuses the guardian', async () => {
      const kamsi = await t.prisma.student.findFirstOrThrow({
        where: { schoolId, firstName: 'Kamsi', surname: 'Nwosu' },
        include: { guardians: true },
      });
      const guardianId = kamsi.guardians[0]!.guardianId;

      const dup = await admin.get('/api/v1/admissions/matches?firstName=kamsi&surname=NWOSU');
      expect(dup.status).toBe(200);
      expect(dup.body.data.duplicate).toEqual({
        id: kamsi.id,
        name: 'Kamsi Nwosu',
        className: 'JSS 1A',
        admissionNo: kamsi.admissionNo,
      });
      expect(dup.body.data.sibling).toBeNull();

      const sib = (await admin.get('/api/v1/admissions/matches?firstName=Chidi&surname=Nwosu')).body
        .data;
      expect(sib.duplicate).toBeNull();
      expect(sib.sibling).toEqual({
        studentId: kamsi.id,
        studentName: 'Kamsi Nwosu',
        className: 'JSS 1A',
        guardianId,
        guardianName: 'Mr. Obinna Nwosu',
        guardianPhone: '0809 555 0193',
        relationship: 'Father',
      });

      // By the guardian's phone (any format) or email, even with another surname.
      for (const q of [
        'phone=%2B234%20809%20555%200193',
        'phone=08095550193',
        'email=OBINNA.NWOSU@example.ng',
      ]) {
        const m = (
          await admin.get(`/api/v1/admissions/matches?firstName=Tamuno&surname=Briggs&${q}`)
        ).body.data;
        expect(m.guardian).toMatchObject({
          id: guardianId,
          name: 'Mr. Obinna Nwosu',
          children: ['Kamsi Nwosu (JSS 1A)'],
        });
        expect(m.sibling).toMatchObject({ studentId: kamsi.id, guardianId });
      }

      // Linking the sibling's guardian.
      const chidi = await admin.post('/api/v1/admissions').send(
        admitPayload({
          firstName: 'Chidi',
          gender: 'Male',
          dateOfBirth: '2016-02-03',
          arm: 'B',
          guardian: { mode: 'link', guardianId },
        }),
      );
      expect(chidi.status).toBe(200);
      expect(chidi.body.data).toMatchObject({
        admissionNo: nextNumber(),
        className: 'JSS 1B',
        guardianName: 'Mr. Obinna Nwosu',
      });

      // The same parent typed in again (phone in another format, no title): reused, not doubled.
      const ebube = await admin.post('/api/v1/admissions').send(
        admitPayload({
          firstName: 'Ebube',
          dateOfBirth: '2017-08-21',
          arm: 'C',
          guardian: { mode: 'new', name: 'obinna nwosu', phone: '+234 809-555-0193', email: '' },
        }),
      );
      expect(ebube.status).toBe(200);
      expect(ebube.body.data).toMatchObject({
        admissionNo: nextNumber(),
        guardianName: 'Mr. Obinna Nwosu',
      });
      expect(await t.prisma.guardian.count({ where: { schoolId, phone: '+2348095550193' } })).toBe(
        1,
      );
      expect(await t.prisma.studentGuardian.count({ where: { guardianId } })).toBe(3);

      // Someone else with that phone is refused.
      const other = await admin.post('/api/v1/admissions').send(
        admitPayload({
          firstName: 'Tamuno',
          surname: 'Briggs',
          dateOfBirth: '2015-01-09',
          guardian: { mode: 'new', name: 'Mrs. Ibiere Briggs', phone: '08095550193', email: '' },
        }),
      );
      expect(other.status).toBe(409);
      expect(other.body.error.code).toBe('GUARDIAN_PHONE_TAKEN');
      expect(other.body.message).toBe(
        '0809 555 0193 belongs to Mr. Obinna Nwosu, already a guardian here. Link the existing guardian instead.',
      );
    });

    it('admits without a guardian (incomplete profile) and stores +234 phones as E.164', async () => {
      const skip = await admin.post('/api/v1/admissions').send(
        admitPayload({
          firstName: 'Tamuno',
          surname: 'Briggs',
          dateOfBirth: '2015-01-09',
          guardian: { mode: 'skip' },
        }),
      );
      expect(skip.status).toBe(200);
      expect(skip.body.data).toMatchObject({ admissionNo: nextNumber(), guardianName: null });
      const tamuno = await t.prisma.student.findUniqueOrThrow({
        where: { id: skip.body.data.studentId },
      });
      expect(tamuno.status).toBe('INCOMPLETE_PROFILE');

      const ladi = await admin.post('/api/v1/admissions').send(
        admitPayload({
          firstName: 'Ladi',
          surname: 'Kwaghbee',
          dateOfBirth: '2015-03-30',
          guardian: {
            mode: 'new',
            name: 'Mr. Terver Kwaghbee',
            phone: '+234 809 555 0177',
            email: '',
          },
        }),
      );
      expect(ladi.status).toBe(200);
      expect(ladi.body.data.admissionNo).toBe(nextNumber());
      expect(
        await t.prisma.guardian.findFirst({ where: { schoolId, phone: '+2348095550177' } }),
      ).toMatchObject({ fullName: 'Mr. Terver Kwaghbee', email: null });
    });

    it('follows the school’s numbering format', async () => {
      await t.prisma.schoolSettings.update({
        where: { schoolId },
        data: { admissionNumberPattern: '[BR]/[YY]/[###]' },
      });
      try {
        const res = await admin.post('/api/v1/admissions').send(
          admitPayload({
            firstName: 'Ene',
            surname: 'Ochai',
            dateOfBirth: '2015-06-01',
            guardian: { mode: 'skip' },
          }),
        );
        expect(res.status).toBe(200);
        const yy = numberAt(0).slice(6, 8);
        expect(res.body.data.admissionNo).toBe(`GFA-MC/${yy}/001`);
      } finally {
        await t.prisma.schoolSettings.update({
          where: { schoolId },
          data: { admissionNumberPattern: PATTERN },
        });
      }
    });

    it('checks the form: names, dates, documents, phones, emails, class arms', async () => {
      const cases: [Record<string, unknown>, number, string][] = [
        [{ surname: '' }, 422, 'Enter the surname.'],
        [{ firstName: '  ' }, 422, 'Enter the first name.'],
        [{ dateOfBirth: '' }, 422, 'Enter the date of birth.'],
        [{ dateOfBirth: '2014-02-31' }, 422, 'Enter a real date of birth.'],
        [{ dateOfBirth: '2099-01-01' }, 422, 'The date of birth can’t be in the future.'],
        [{ gender: 'Other' }, 422, 'Choose the gender.'],
        [
          { documents: { birth: null } },
          422,
          'Birth certificate is required by your school settings.',
        ],
        [
          { admissionType: 'Transfer in' },
          422,
          'Transfer-in students need their previous school report.',
        ],
        [
          { guardian: { mode: 'new', name: 'Mr. A B', phone: '12345', email: '' } },
          422,
          'Enter a Nigerian phone number, e.g. 0803 555 0193.',
        ],
        [
          { guardian: { mode: 'new', name: 'Mr. A B', phone: '0603 555 0193', email: '' } },
          422,
          'Enter a Nigerian phone number, e.g. 0803 555 0193.',
        ],
        [
          { guardian: { mode: 'new', name: '', phone: '08095550999', email: '' } },
          422,
          'Enter the guardian’s full name.',
        ],
        [
          { guardian: { mode: 'new', name: 'Mr. A B', phone: '08095550999', email: 'nope' } },
          422,
          'Enter a valid email.',
        ],
        [{ guardian: { mode: 'link', guardianId: '' } }, 422, 'Choose the guardian to link.'],
        [
          { guardian: { mode: 'link', guardianId: '0190a5f5-0000-7000-8000-000000000000' } },
          422,
          'Choose the guardian to link.',
        ],
        [{ arm: 'Z' }, 422, 'Choose a class arm.'],
        [{ level: 'JSS 1', branch: 'Lekki Campus' }, 422, 'Choose a class arm.'],
        [{ branch: 'Ajah Annex' }, 422, 'Choose a branch.'],
        [{ applicationId: 'nope' }, 404, 'This application doesn’t exist.'],
      ];
      for (const [over, status, message] of cases) {
        const res = await admin.post('/api/v1/admissions').send(
          admitPayload({
            firstName: 'Musa',
            surname: 'Garba',
            guardian: { mode: 'skip' },
            ...over,
          }),
        );
        expect([JSON.stringify(over), res.status, res.body.message]).toEqual([
          JSON.stringify(over),
          status,
          message,
        ]);
      }
      expect(
        await t.prisma.student.count({ where: { schoolId, firstName: 'Musa', surname: 'Garba' } }),
      ).toBe(0);
    });

    it('refuses duplicates, rejected applications and full arms', async () => {
      const same = await admin
        .post('/api/v1/admissions')
        .send(admitPayload({ firstName: 'KAMSI', guardian: { mode: 'skip' } }));
      expect(same.status).toBe(409);
      expect(same.body.error.code).toBe('DUPLICATE_STUDENT');
      expect(same.body.message).toMatch(
        /^Kamsi Nwosu \(born 12\/05\/2014\) is already a student here/,
      );

      const rejected = await t.prisma.admissionApplication.findFirstOrThrow({
        where: { schoolId, stage: 'REJECTED' },
      });
      const rej = await admin
        .post('/api/v1/admissions')
        .send(admitPayload({ applicationId: rejected.id, firstName: 'Musa', surname: 'Garba' }));
      expect(rej.status).toBe(409);
      expect(rej.body.error.code).toBe('APPLICATION_REJECTED');

      const arm = await t.prisma.classArm.findFirstOrThrow({
        where: { schoolId, name: 'B', level: { name: 'JSS 1' }, branch: { name: 'Main Campus' } },
      });
      const taken = await used('Main Campus', 'JSS 1', 'B');
      await t.prisma.classArm.update({ where: { id: arm.id }, data: { capacity: taken } });
      try {
        const full = await admin.post('/api/v1/admissions').send(
          admitPayload({
            firstName: 'Musa',
            surname: 'Garba',
            gender: 'Male',
            arm: 'B',
            guardian: { mode: 'skip' },
          }),
        );
        expect(full.status).toBe(409);
        expect(full.body.error.code).toBe('ARM_FULL');
        expect(full.body.message).toBe(
          `JSS 1B is at capacity (${taken} of ${taken}). Choose another arm.`,
        );
      } finally {
        await t.prisma.classArm.update({ where: { id: arm.id }, data: { capacity: 35 } });
      }
    });
  });

  describe('import', () => {
    const csv = () =>
      [
        header,
        // 2: valid, new guardian
        'Ibekwe,Chiamaka,,Female,12/05/2014,JSS 1,C,Mr. Ifeanyi Ibekwe,0809 555 0201,,Father,Imo,',
        // 3: class needs a fix
        'Ibekwe,Somto,,M,03/09/2015,JSS1,C,,,,,,',
        // 4: date that doesn't exist
        'Bako,Halima,,Female,31/02/2014,JSS 1,C,Hajia Amina Bako,0809 555 0301,,Mother,Kano,',
        // 5: same name and birthday as a student here
        'Nwosu,Kamsi,,Female,12/05/2014,JSS 1,C,,,,,,',
        // 6: no guardian phone
        'Oyelaran,Femi,,Male,01/01/2015,JSS 1,C,Mrs. Funke Oyelaran,,,Mother,Oyo,',
        // 7: guardian email matches an existing parent
        'Obiora,Adaora,,Female,14/07/2014,JSS 1,C,Mrs. Amaka Obiora,,obinna.nwosu@example.ng,Mother,,',
        // 8: errors that can't be fixed here
        'Garba,Musa,,X,05/05/2015,JSS 1,C,Mr. Sani Garba,12345,,Father,,',
        // 9: guardian phone matches an existing parent: linked
        'Uchendu,Tobi,,Male,09/09/2015,JSS 1,C,Mr. O. Nwosu,08095550193,,Uncle,,',
        // 10: same guardian as row 2 (siblings in the file)
        'Ochai,Ene,,Female,10/10/2014,JSS 1,C,Mr. Ifeanyi Ibekwe,+2348095550201,,Father,,',
      ].join('\n');

    it('refuses files it can’t read', async () => {
      const xlsx = await admin
        .post('/api/v1/imports')
        .send({ fileName: 'intake.xlsx', text: 'x', branch: 'Main Campus' });
      expect(xlsx.status).toBe(422);
      expect(xlsx.body.error.code).toBe('IMPORT_FORMAT');
      const columns = await admin
        .post('/api/v1/imports')
        .send({ fileName: 'a.csv', text: 'surname,first_name\nA,B', branch: 'Main Campus' });
      expect(columns.status).toBe(422);
      expect(columns.body.message).toBe(
        'Missing columns: gender, date_of_birth, class_level, arm. Download the template.',
      );
      const empty = await admin
        .post('/api/v1/imports')
        .send({ fileName: 'a.csv', text: header, branch: 'Main Campus' });
      expect(empty.body.message).toBe('The file has no student rows. Use the template’s columns.');
      const noBranch = await admin
        .post('/api/v1/imports')
        .send({ fileName: 'a.csv', text: `${header}\nA,B,,F,01/01/2015,JSS 1,A,,,,,,` });
      expect(noBranch.body.error.code).toBe('IMPORT_BRANCH');
    });

    it('previews every row with one issue each, then commits with the fixes', async () => {
      const kamsi = await t.prisma.student.findFirstOrThrow({
        where: { schoolId, firstName: 'Kamsi', surname: 'Nwosu' },
      });
      const preview = await admin
        .post('/api/v1/imports')
        .send({ fileName: 'jss1-intake.csv', text: csv(), branch: 'Main Campus' });
      expect(preview.status).toBe(200);
      expect(preview.body.message).toBe('File checked.');
      const batch = preview.body.data;
      expect(batch).toMatchObject({
        fileName: 'jss1-intake.csv',
        rows: 9,
        valid: 6,
        target: '2026/2027 · Main Campus · JSS 1 intake',
        // Rows 2 (+10) and 6, plus row 7's until the screen links it.
        guardiansNew: 3,
        guardiansLinked: 1,
      });
      expect(batch.issues).toEqual([
        {
          row: 3,
          student: 'Somto Ibekwe',
          kind: 'error',
          code: 'class',
          message: 'Class "JSS1 C" not found. Did you mean JSS 1C?',
          suggestion: 'JSS 1C',
        },
        {
          row: 4,
          student: 'Halima Bako',
          kind: 'error',
          code: 'dob',
          message: 'Date "31/02/2014" does not exist',
          value: '31/02/2014',
        },
        {
          row: 5,
          student: 'Kamsi Nwosu',
          kind: 'warning',
          code: 'duplicate',
          message: `Possible duplicate of ${kamsi.admissionNo} (JSS 1A, same name and date of birth)`,
        },
        {
          row: 6,
          student: 'Femi Oyelaran',
          kind: 'warning',
          code: 'no-guardian',
          message: 'No guardian phone. Mrs. Funke Oyelaran is added without a phone number.',
        },
        {
          row: 7,
          student: 'Adaora Obiora',
          kind: 'warning',
          code: 'guardian-match',
          message: 'Guardian email matches existing parent Mr. Obinna Nwosu',
        },
        {
          row: 8,
          student: 'Musa Garba',
          kind: 'error',
          code: 'invalid',
          message: 'Gender must be Female or Male; guardian phone is not a Nigerian mobile number',
        },
      ]);

      // Errors left and not excluded.
      const blocked = await admin.post(`/api/v1/imports/${batch.id}/commit`).send({
        resolutions: { '3': 'JSS 1C' },
        excludeErrors: false,
      });
      expect(blocked.status).toBe(422);
      expect(blocked.body.message).toBe(
        '2 rows have errors. Fix them or exclude them to continue.',
      );

      const before = await used('Main Campus', 'JSS 1', 'C');
      t.notifications.clear();
      const commit = await admin.post(`/api/v1/imports/${batch.id}/commit`).send({
        resolutions: { '3': 'JSS 1C', '4': '28/02/2014', '5': 'skip', '6': 'accept', '7': 'link' },
        excludeErrors: true,
      });
      expect(commit.status).toBe(200);
      expect(commit.body.data).toEqual({
        batchId: batch.id,
        imported: 7,
        guardiansNew: 3,
        guardiansLinked: 2,
      });
      expect(commit.body.message).toBe(
        '7 students imported into 2026/2027 · Main Campus · JSS 1 intake.',
      );
      expect(await used('Main Campus', 'JSS 1', 'C')).toBe(before + 7);
      expect(t.notifications.sent).toEqual([]);

      // Admission numbers continue the school's sequence, in file order.
      const imported = await t.prisma.student.findMany({
        where: {
          schoolId,
          OR: [
            ['Chiamaka', 'Ibekwe'],
            ['Somto', 'Ibekwe'],
            ['Halima', 'Bako'],
            ['Femi', 'Oyelaran'],
            ['Adaora', 'Obiora'],
            ['Tobi', 'Uchendu'],
            ['Ene', 'Ochai'],
          ].map(([firstName, surname]) => ({ firstName, surname })),
        },
        orderBy: { admissionNo: 'asc' },
        include: {
          guardians: { include: { guardian: true } },
          enrollments: { include: { arm: true } },
          membership: true,
        },
      });
      // Ene Ochai was also admitted by hand under another format; keep the imported one.
      const rows = imported.filter((s) => s.admissionNo.startsWith('STU-'));
      expect(rows.map((s) => s.admissionNo)).toEqual(
        [0, 1, 2, 3, 4, 5, 6].map((i) => numberAt(added + i)),
      );
      added += 7;
      expect(rows.map((s) => s.firstName)).toEqual([
        'Chiamaka',
        'Somto',
        'Halima',
        'Femi',
        'Adaora',
        'Tobi',
        'Ene',
      ]);
      expect(rows.every((s) => s.enrollments[0]?.arm?.name === 'C')).toBe(true);
      expect(rows.every((s) => s.membership === null)).toBe(true);
      const by = (first: string) => rows.find((s) => s.firstName === first)!;
      expect(by('Halima').dateOfBirth!.toISOString().slice(0, 10)).toBe('2014-02-28');
      expect(by('Somto').status).toBe('INCOMPLETE_PROFILE');
      expect(by('Chiamaka').guardians[0]!.guardian).toMatchObject({
        phone: '+2348095550201',
        contactConsentSource: 'import',
      });
      expect(by('Ene').guardians[0]!.guardianId).toBe(by('Chiamaka').guardians[0]!.guardianId);
      expect(by('Tobi').guardians[0]).toMatchObject({
        relationship: 'Uncle',
        guardian: { fullName: 'Mr. Obinna Nwosu' },
      });
      expect(by('Adaora').guardians[0]!.guardian.fullName).toBe('Mr. Obinna Nwosu');
      expect(by('Femi').guardians[0]!.guardian).toMatchObject({
        fullName: 'Mrs. Funke Oyelaran',
        phone: null,
      });
      expect(
        await t.prisma.schoolMembership.count({
          where: {
            schoolId,
            guardianId: { in: rows.flatMap((s) => s.guardians.map((g) => g.guardianId)) },
          },
        }),
      ).toBe(0);
      expect(
        await t.prisma.auditEvent.count({
          where: { schoolId, action: 'student.import', entityId: batch.id },
        }),
      ).toBe(1);

      const twice = await admin.post(`/api/v1/imports/${batch.id}/commit`).send({});
      expect(twice.status).toBe(404);
      expect(twice.body.message).toBe('This import has expired. Upload the file again.');
    });

    it('expires a checked file after 24 hours', async () => {
      const preview = await admin.post('/api/v1/imports').send({
        fileName: 'late.csv',
        text: `${header}\nGarba,Musa,,Male,05/05/2015,JSS 1,A,,,,,,`,
        branch: 'Main Campus',
      });
      expect(preview.status).toBe(200);
      await t.prisma.importBatch.update({
        where: { id: preview.body.data.id },
        data: { createdAt: new Date(t.clock.nowMs() - 25 * 3_600_000) },
      });
      const late = await admin.post(`/api/v1/imports/${preview.body.data.id}/commit`).send({});
      expect(late.status).toBe(404);
      expect(late.body.error.code).toBe('IMPORT_EXPIRED');
      expect(
        await t.prisma.student.count({ where: { schoolId, firstName: 'Musa', surname: 'Garba' } }),
      ).toBe(0);
    });
  });

  describe('permissions', () => {
    it('lets students.view read but not admit or import', async () => {
      const eze = authed(t, (await signIn(t, 'c.eze@greenfield.edu.ng')).token);
      expect((await eze.get('/api/v1/admissions')).status).toBe(200);
      expect((await eze.get('/api/v1/admissions/options')).status).toBe(200);
      expect((await eze.get('/api/v1/admissions/matches?surname=Nwosu')).status).toBe(200);
      const admit = await eze
        .post('/api/v1/admissions')
        .send(admitPayload({ firstName: 'Musa', surname: 'Garba', guardian: { mode: 'skip' } }));
      expect(admit.status).toBe(403);
      const imp = await eze.post('/api/v1/imports').send({
        fileName: 'a.csv',
        text: `${header}\nGarba,Musa,,Male,05/05/2015,JSS 1,A,,,,,,`,
        branch: 'Main Campus',
      });
      expect(imp.status).toBe(403);
    });

    it('keeps teacher-portal sessions out', async () => {
      const teacher = await signIn(t, 'g.okafor@greenfield.edu.ng', {
        host: 'greenfield.localhost',
      });
      const res = await authed(t, teacher.token, { host: 'greenfield.localhost' }).get(
        '/api/v1/admissions',
      );
      expect(res.status).toBe(403);
    });
  });

  describe('tenant isolation', () => {
    it('Crestview’s admin sees none of Greenfield’s applicants, guardians or imports', async () => {
      const udo = authed(t, (await signIn(t, 'e.udo@crestviewcollege.ng')).token);
      expect((await udo.get('/api/v1/admissions')).body.data).toEqual([]);
      const o = (await options(udo)).data;
      expect(o).toMatchObject({ session: '', term: '', branches: ['Main Campus'] });
      const m = (
        await udo.get('/api/v1/admissions/matches?firstName=Kamsi&surname=Nwosu&phone=08095550193')
      ).body.data;
      expect(m).toEqual({ duplicate: null, sibling: null, guardian: null });

      const greenfieldGuardian = await t.prisma.guardian.findFirstOrThrow({
        where: { schoolId, phone: '+2348095550193' },
      });
      const app = await udo
        .post('/api/v1/admissions')
        .send(
          admitPayload({ applicationId: kamsiApplicationId, firstName: 'Musa', surname: 'Garba' }),
        );
      expect(app.status).toBe(404);
      expect(app.body.error.code).toBe('APPLICATION_NOT_FOUND');
      const link = await udo.post('/api/v1/admissions').send(
        admitPayload({
          firstName: 'Musa',
          surname: 'Garba',
          guardian: { mode: 'link', guardianId: greenfieldGuardian.id },
        }),
      );
      expect(link.status).toBe(422);
      expect(link.body.message).toBe('Choose the guardian to link.');
      // Crestview hasn't started a session yet.
      const noSession = await udo
        .post('/api/v1/admissions')
        .send(admitPayload({ firstName: 'Musa', surname: 'Garba', guardian: { mode: 'skip' } }));
      expect(noSession.status).toBe(409);
      expect(noSession.body.error.code).toBe('NO_SESSION');

      // A checked import belongs to its school.
      const preview = await admin.post('/api/v1/imports').send({
        fileName: 'a.csv',
        text: `${header}\nGarba,Musa,,Male,05/05/2015,JSS 1,A,,,,,,`,
        branch: 'Main Campus',
      });
      expect(preview.status).toBe(200);
      const commit = await udo.post(`/api/v1/imports/${preview.body.data.id}/commit`).send({});
      expect(commit.status).toBe(404);
      expect(
        await t.prisma.student.count({ where: { schoolId, firstName: 'Musa', surname: 'Garba' } }),
      ).toBe(0);
      expect(
        await t.prisma.admissionApplication.count({
          where: { id: kamsiApplicationId, schoolId, stage: 'ADMITTED' },
        }),
      ).toBe(1);
    });
  });
});
