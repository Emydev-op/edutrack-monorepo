import { RequestContext } from '../src/common/context/request-context.js';
import { BranchesService } from '../src/school/profile/branches.service.js';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

// The smallest valid PNG (1×1, transparent).
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64')}`;
const dataUrl = (type: string, bytes: Buffer) => `data:${type};base64,${bytes.toString('base64')}`;
const UNKNOWN_ID = '0193a3f2-6c1e-7a51-9d1a-2f4c8b6e7a10';

const BRANCH = {
  name: 'Ikoyi Campus',
  code: 'GFA-IK',
  street: '3 Bourdillon Road',
  city: 'Ikoyi',
  lga: 'Eti Osa',
  state: 'Lagos',
  phone: '0803 555 0199',
  email: 'ikoyi@greenfieldacademy.ng',
  headId: null as string | null,
  sections: ['Primary'],
  hasStore: false,
};

/** The editable part of a profile, as the edit screen sends it back. */
function payloadOf(p: Record<string, unknown>) {
  const keys = [
    'name',
    'motto',
    'founded',
    'logo',
    'email',
    'phone',
    'website',
    'street',
    'city',
    'lga',
    'state',
    'approvingBody',
    'approvalNumber',
    'cacNumber',
    'certificate',
  ];
  return Object.fromEntries(keys.map((k) => [k, p[k]]));
}

describe('School Admin profile and branches (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let crestview: Api;
  let academicHead: Api;
  let ids: Record<string, string>;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    crestview = authed(t, (await signIn(t, 'e.udo@crestviewcollege.ng')).token);
    // VP Academics: opens School Admin, but has no settings.* permission.
    academicHead = authed(t, (await signIn(t, 'c.eze@greenfield.edu.ng')).token);
    const schools = await t.prisma.school.findMany({
      where: { slug: { in: ['greenfield', 'crestview'] } },
    });
    ids = Object.fromEntries(schools.map((s) => [s.slug, s.id]));
  });

  afterAll(async () => {
    await t.close();
  });

  describe('school profile', () => {
    it('shows the seeded profile, plan and history', async () => {
      const res = await admin.get('/api/v1/school/profile');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('School profile loaded.');
      expect(res.body.data).toMatchObject({
        name: 'Greenfield Academy',
        legalName: 'Greenfield Academy Limited',
        ownership: 'Private',
        sections: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'],
        brandColor: '#9B403C',
        founded: '2009',
        logo: null,
        phone: '0809 120 4400',
        website: 'greenfieldacademy.ng',
        approvalNumber: 'LSMOE/PS/2009/0418',
        cacNumber: 'RC 1184206',
        certificate: { name: 'approval-certificate.pdf', size: '412 KB', dataUrl: null },
        plan: { name: 'Growth', students: 0, studentLimit: 1500, branchLimit: 5 },
      });
      expect(res.body.data.plan.renews).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
      expect(res.body.data.history).toContainEqual(
        expect.objectContaining({
          title: 'Updated school details',
          detail: 'Adaeze Okonkwo · approval number, CAC number, certificate',
          when: '2 Sep 2026',
        }),
      );
    });

    it('saves details, uploads, keeps and removes the logo, and records history', async () => {
      const current = (await admin.get('/api/v1/school/profile')).body.data;
      const res = await admin.put('/api/v1/school/profile').send({
        ...payloadOf(current),
        motto: 'Knowledge · Character · Service',
        brandColor: '#1f6feb',
        logo: { name: 'crest.png', size: '1 KB', dataUrl: PNG },
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('School details saved. Changes are live on all portals.');
      const saved = res.body.data;
      expect(saved).toMatchObject({
        motto: 'Knowledge · Character · Service',
        brandColor: '#1F6FEB',
        logo: { name: 'crest.png', size: '1 KB' },
        legalName: 'Greenfield Academy Limited',
      });
      expect(saved.logo.dataUrl).toMatch(
        new RegExp(`^https://storage\\.test/schools/${ids.greenfield}/logo/.+\\.png$`),
      );
      const key = (saved.logo.dataUrl as string).replace('https://storage.test/', '');
      expect(t.storage.objects.get(key)?.contentType).toBe('image/png');
      expect(saved.history[0]).toMatchObject({
        title: 'Updated school details',
        detail: 'Adaeze Okonkwo · motto, brand colour, logo',
      });
      const event = await t.prisma.auditEvent.findFirstOrThrow({
        where: { schoolId: ids.greenfield, action: 'profile.update' },
        orderBy: { createdAt: 'desc' },
      });
      expect(event).toMatchObject({ area: 'School', entityType: 'School' });

      // Sending the profile back as shown keeps the stored logo and certificate.
      const again = await admin.put('/api/v1/school/profile').send(payloadOf(saved));
      expect(again.status).toBe(200);
      expect(again.body.data.logo.dataUrl).toBe(saved.logo.dataUrl);
      expect(again.body.data.certificate.name).toBe('approval-certificate.pdf');
      expect(again.body.data.history[0].id).toBe(saved.history[0].id);

      // A new certificate (PDF) is stored; the old row is soft-deleted.
      const cert = await admin.put('/api/v1/school/profile').send({
        ...payloadOf(saved),
        certificate: { name: 'approval-2026.pdf', size: '1 KB', dataUrl: PDF },
      });
      expect(cert.body.data.certificate).toMatchObject({
        name: 'approval-2026.pdf',
        dataUrl: null,
      });

      const removed = await admin
        .put('/api/v1/school/profile')
        .send({ ...payloadOf(cert.body.data), logo: null });
      expect(removed.body.data.logo).toBeNull();
      expect(t.storage.objects.has(key)).toBe(false);
      const file = await t.prisma.storedFile.findFirstOrThrow({ where: { storageKey: key } });
      expect(file.deletedAt).not.toBeNull();

      // The public sign-in pages see the new colour.
      const pub = await t.http().get('/api/v1/public/school').set('Host', 'greenfield.localhost');
      expect(pub.body.data.brandColor).toBe('#1F6FEB');
    });

    it('validates the details and keeps the legal name locked', async () => {
      const base = payloadOf((await admin.get('/api/v1/school/profile')).body.data);
      const put = (patch: Record<string, unknown>) =>
        admin.put('/api/v1/school/profile').send({ ...base, ...patch });
      const cases: [Record<string, unknown>, string][] = [
        [{ name: '' }, 'Enter the name parents and staff will see.'],
        [{ name: 'GA' }, 'The name must be at least 3 characters.'],
        [{ email: 'not-an-email' }, 'Enter a valid school email.'],
        [{ phone: '12' }, 'Enter a Nigerian phone number.'],
        [{ state: 'Atlantis' }, 'Choose a Nigerian state.'],
        [{ approvalNumber: '' }, 'Enter the approval number.'],
        [{ founded: '1850' }, `Enter a year between 1900 and ${new Date().getFullYear()}.`],
        [{ cacNumber: '12' }, 'CAC numbers look like RC 1234567.'],
        [{ brandColor: 'red' }, 'Choose a colour like #1F6FEB.'],
      ];
      for (const [patch, message] of cases) {
        const res = await put(patch);
        expect(res.status, JSON.stringify(patch)).toBe(422);
        expect(res.body.message).toBe(message);
      }

      const locked = await put({ legalName: 'Greenfield Holdings Ltd' });
      expect(locked.status).toBe(422);
      expect(locked.body.error.code).toBe('LEGAL_NAME_LOCKED');
      expect(locked.body.message).toMatch(/Contact EduTrack support/);
      expect((await put({ legalName: 'Greenfield Academy Limited' })).status).toBe(200);

      const unknown = await put({ ownership: 'Public' });
      expect(unknown.status).toBe(422);
    });

    it('checks logo uploads by their bytes and size', async () => {
      const base = payloadOf((await admin.get('/api/v1/school/profile')).body.data);
      const logo = (dataUrl: string) =>
        admin
          .put('/api/v1/school/profile')
          .send({ ...base, logo: { name: 'x', size: '1 KB', dataUrl } });

      const fake = await logo(dataUrl('image/png', Buffer.from('not an image')));
      expect(fake.status).toBe(422);
      expect(fake.body).toMatchObject({
        message: 'Use a PNG or JPG image for the logo.',
        error: { code: 'LOGO_TYPE' },
      });
      // A PDF named as a PNG is still refused.
      expect((await logo(PDF.replace('application/pdf', 'image/png'))).body.error.code).toBe(
        'LOGO_TYPE',
      );
      expect((await logo('data:image/gif;base64,R0lGODlh')).body.error.code).toBe('LOGO_TYPE');
      const big = Buffer.alloc(1024 * 1024 + 10);
      big.set([0x89, 0x50, 0x4e, 0x47]);
      const tooBig = await logo(dataUrl('image/png', big));
      expect(tooBig.body).toMatchObject({
        message: 'The logo is larger than 1 MB.',
        error: { code: 'LOGO_TOO_LARGE' },
      });
      const jpeg = await logo(dataUrl('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16])));
      expect(jpeg.status).toBe(200);
      expect(jpeg.body.data.logo.dataUrl).toMatch(/\.jpg$/);
    });

    it('marks the School Profile setup step confirmed when saved', async () => {
      await t.prisma.setupStepState.deleteMany({
        where: { schoolId: ids.crestview, stepKey: 'school-profile' },
      });
      const current = (await crestview.get('/api/v1/school/profile')).body.data;
      expect(current).toMatchObject({
        name: 'Crestview College',
        sections: ['Junior Secondary', 'Senior Secondary'],
      });
      const res = await crestview.put('/api/v1/school/profile').send({
        ...payloadOf(current),
        approvalNumber: 'FCT/SEC/2015/0221',
        state: 'Akwa Ibom',
      });
      expect(res.status).toBe(200);
      const step = await t.prisma.setupStepState.findUnique({
        where: { schoolId_stepKey: { schoolId: ids.crestview, stepKey: 'school-profile' } },
      });
      expect(step?.confirmedAt).not.toBeNull();
    });
  });

  describe('branches', () => {
    it('lists the branches with the plan and the school’s sections', async () => {
      const res = await admin.get('/api/v1/branches');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Branches loaded.');
      expect(res.body.data).toMatchObject({
        planName: 'Growth',
        branchLimit: 5,
        offering: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'],
        codePrefix: 'GA-',
      });
      const branches = res.body.data.branches as Record<string, string>[];
      expect(branches.map((b) => b.code).sort((a, b) => a.localeCompare(b))).toEqual([
        'GFA-AJ',
        'GFA-LK',
        'GFA-MC',
      ]);
      expect(branches.find((b) => b.code === 'GFA-MC')).toMatchObject({
        name: 'Main Campus',
        headName: 'Mrs. Adaeze Okonkwo',
        phone: '0803 555 0142',
        sections: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'],
        status: 'Active',
        hasStore: true,
        canDelete: false,
      });
      expect(branches.find((b) => b.code === 'GFA-AJ')).toMatchObject({
        status: 'Inactive',
        sections: ['Nursery'],
        phone: '',
      });
    });

    it('shows one branch with its history', async () => {
      const list = (await admin.get('/api/v1/branches')).body.data.branches;
      const lekki = list.find((b: { code: string }) => b.code === 'GFA-LK');
      const res = await admin.get(`/api/v1/branches/${lekki.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        name: 'Lekki Campus',
        sections: ['Nursery', 'Primary', 'Senior Secondary'],
        scopedUsers: [],
        classes: [],
        finance: null,
      });
      expect(res.body.data.history[0]).toMatchObject({
        title: 'Senior Secondary added',
        when: '15 Aug 2026',
      });
      expect((await admin.get(`/api/v1/branches/${UNKNOWN_ID}`)).status).toBe(404);
      const bad = await admin.get('/api/v1/branches/not-an-id');
      expect(bad.status).toBe(404);
      expect(bad.body.message).toBe('This branch doesn’t exist');
    });

    it('validates new branches', async () => {
      const post = (patch: Record<string, unknown>) =>
        admin.post('/api/v1/branches').send({ ...BRANCH, ...patch });
      const cases: [Record<string, unknown>, string, string?][] = [
        [{ name: '' }, 'Enter a branch name.'],
        [{ name: 'Ab' }, 'Use at least 3 characters for the name.'],
        [{ name: 'main campus' }, 'A branch with this name already exists.', 'BRANCH_NAME_TAKEN'],
        [{ code: 'IKOYI' }, 'Use a short code like GA-IK.'],
        [{ code: 'GFA-LK' }, 'This code is already used by Lekki Campus.', 'BRANCH_CODE_TAKEN'],
        [{ street: ' ' }, 'Enter the street address.'],
        [{ city: '' }, 'Enter the town or city.'],
        [{ phone: '123' }, 'Enter a Nigerian phone number.'],
        [{ email: 'nope' }, 'Enter a valid email.'],
        [{ sections: [] }, 'Choose at least one section.'],
        [{ sections: ['University'] }, 'Only sections your school offers can be chosen.'],
        [{ headId: UNKNOWN_ID }, 'Choose a current member of staff as head of campus.'],
      ];
      for (const [patch, message, code] of cases) {
        const res = await post(patch);
        expect(res.status, JSON.stringify(patch)).toBe(422);
        expect(res.body.message).toBe(message);
        if (code) expect(res.body.error.code).toBe(code);
      }
    });

    it('creates, edits, deactivates, reactivates and deletes a branch', async () => {
      const created = await admin.post('/api/v1/branches').send({ ...BRANCH, code: 'gfa-ik' });
      expect(created.status).toBe(201);
      expect(created.body.message).toBe('Branch created. Next, set up its classes.');
      const branch = created.body.data;
      expect(branch).toMatchObject({
        name: 'Ikoyi Campus',
        code: 'GFA-IK',
        phone: '0803 555 0199',
        status: 'Active',
        students: 0,
        staff: 0,
        classArms: 0,
        canDelete: true,
      });

      const edited = await admin
        .patch(`/api/v1/branches/${branch.id}`)
        .send({ ...BRANCH, name: 'Ikoyi Annex', sections: ['Nursery', 'Primary'], hasStore: true });
      expect(edited.status).toBe(200);
      expect(edited.body.message).toBe('Branch saved.');
      expect(edited.body.data).toMatchObject({
        name: 'Ikoyi Annex',
        sections: ['Nursery', 'Primary'],
        hasStore: true,
      });
      const detail = (await admin.get(`/api/v1/branches/${branch.id}`)).body.data;
      expect(detail.history.map((h: { title: string }) => h.title)).toEqual([
        'Updated branch details',
        'Created branch',
      ]);
      expect(detail.history[0].detail).toBe('Adaeze Okonkwo · name, sections, hasStore');

      const noReason = await admin.post(`/api/v1/branches/${branch.id}/deactivate`).send({});
      expect(noReason.status).toBe(422);
      expect(noReason.body.message).toBe('Give a reason for deactivating.');
      const off = await admin
        .post(`/api/v1/branches/${branch.id}/deactivate`)
        .send({ reason: 'Renovation' });
      expect(off.status).toBe(200);
      expect(off.body).toMatchObject({
        message: 'Ikoyi Annex deactivated.',
        data: { status: 'Inactive' },
      });
      const twice = await admin
        .post(`/api/v1/branches/${branch.id}/deactivate`)
        .send({ reason: 'Again' });
      expect(twice.status).toBe(409);
      expect(twice.body.message).toBe('Ikoyi Annex is already inactive.');
      const on = await admin.post(`/api/v1/branches/${branch.id}/reactivate`).send({});
      expect(on.body).toMatchObject({
        message: 'Ikoyi Annex is active again.',
        data: { status: 'Active' },
      });

      const gone = await admin.delete(`/api/v1/branches/${branch.id}`);
      expect(gone.status).toBe(200);
      expect(gone.body).toMatchObject({ message: 'Ikoyi Annex deleted.', data: { ok: true } });
      expect((await admin.get(`/api/v1/branches/${branch.id}`)).status).toBe(404);
      const school = (await admin.get('/api/v1/school/profile')).body.data;
      expect(school.history[0]).toMatchObject({ title: 'Deleted branch Ikoyi Annex' });

      const main = (await admin.get('/api/v1/branches')).body.data.branches.find(
        (b: { code: string }) => b.code === 'GFA-MC',
      );
      const keep = await admin.delete(`/api/v1/branches/${main.id}`);
      expect(keep.status).toBe(409);
      expect(keep.body.error.code).toBe('BRANCH_NOT_DELETABLE');
    });

    it('enforces the plan’s branch limit and the last active branch', async () => {
      const a = await admin.post('/api/v1/branches').send({ ...BRANCH, code: 'GFA-IK' });
      const b = await admin
        .post('/api/v1/branches')
        .send({ ...BRANCH, name: 'Yaba Campus', code: 'GFA-YB' });
      expect([a.status, b.status]).toEqual([201, 201]);
      const full = await admin
        .post('/api/v1/branches')
        .send({ ...BRANCH, name: 'Surulere Campus', code: 'GFA-SU' });
      expect(full.status).toBe(409);
      expect(full.body).toMatchObject({
        message: 'Your Growth plan allows 5 branches, including inactive ones.',
        error: { code: 'BRANCH_LIMIT' },
      });
      await admin.delete(`/api/v1/branches/${a.body.data.id}`);
      await admin.delete(`/api/v1/branches/${b.body.data.id}`);

      // Crestview has one branch: it can't be deactivated.
      const [only] = (await crestview.get('/api/v1/branches')).body.data.branches;
      const last = await crestview
        .post(`/api/v1/branches/${only.id}/deactivate`)
        .send({ reason: 'Testing' });
      expect(last.status).toBe(409);
      expect(last.body.error.code).toBe('LAST_ACTIVE_BRANCH');
    });

    it('refuses to drop a section that has classes at the branch', async () => {
      const lekki = await t.prisma.branch.findFirstOrThrow({
        where: { schoolId: ids.greenfield, code: 'GFA-LK' },
      });
      const primary = await t.prisma.section.findFirstOrThrow({
        where: { schoolId: ids.greenfield, name: 'Primary' },
      });
      const level = await t.prisma.classLevel.create({
        data: { schoolId: ids.greenfield, sectionId: primary.id, name: 'Primary 1 (test)' },
      });
      await t.prisma.branchLevel.create({
        data: { schoolId: ids.greenfield, branchId: lekki.id, levelId: level.id },
      });
      try {
        const res = await admin.patch(`/api/v1/branches/${lekki.id}`).send({
          ...BRANCH,
          name: 'Lekki Campus',
          code: 'GFA-LK',
          sections: ['Nursery', 'Senior Secondary'],
        });
        expect(res.status).toBe(409);
        expect(res.body.message).toBe(
          'Primary has classes at Lekki Campus. Remove those class levels in Classes & Arms before removing the section.',
        );
        const detail = (await admin.get(`/api/v1/branches/${lekki.id}`)).body.data;
        expect(detail.classes).toEqual([
          { section: 'Primary', level: 'Primary 1 (test)', arms: '', students: 0 },
        ]);
      } finally {
        await t.prisma.branchLevel.deleteMany({ where: { levelId: level.id } });
        await t.prisma.classLevel.delete({ where: { id: level.id } });
      }
    });

    it('gives a branch-scoped head Branch Admin access when asked', async () => {
      const okafor = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { schoolId: ids.greenfield, user: { email: 'g.okafor@greenfield.edu.ng' } },
      });
      await t.prisma.schoolMembership.update({
        where: { id: okafor.id },
        data: { scope: 'BRANCH' },
      });
      try {
        const res = await admin
          .post('/api/v1/branches')
          .send({ ...BRANCH, headId: okafor.staffId, grantBranchAdmin: true });
        expect(res.status).toBe(201);
        expect(res.body.data.headName).toBe('Mrs. Grace Okafor');
        const roles = await t.prisma.membershipRole.findMany({
          where: { membershipId: okafor.id },
          include: { role: true },
        });
        expect(roles.map((r) => r.role.key ?? '').sort((a, b) => a.localeCompare(b))).toEqual([
          'branch_admin',
          'teacher',
        ]);
        const branches = await t.prisma.membershipBranch.findMany({
          where: { membershipId: okafor.id },
        });
        expect(branches.map((b) => b.branchId)).toEqual([res.body.data.id]);
        const detail = (await admin.get(`/api/v1/branches/${res.body.data.id}`)).body.data;
        expect(detail.scopedUsers).toEqual([
          { name: 'Mrs. Grace Okafor', roles: expect.arrayContaining(['Branch Admin', 'Teacher']) },
        ]);
        const saved = await admin
          .patch(`/api/v1/branches/${res.body.data.id}`)
          .send({ ...BRANCH, headId: okafor.staffId, grantBranchAdmin: true });
        expect(saved.body.message).toBe(
          'Branch saved. Mrs. Grace Okafor now has Branch Admin access.',
        );
        await admin.delete(`/api/v1/branches/${res.body.data.id}`);
      } finally {
        await t.prisma.schoolMembership.update({
          where: { id: okafor.id },
          data: { scope: 'SCHOOL' },
        });
        await t.reseed();
      }
    });

    it('describes the Setup Center’s Branches step', async () => {
      const service = t.app.get(BranchesService);
      const greenfield = await RequestContext.forSchool(ids.greenfield!, () =>
        service.branchesStepState(),
      );
      expect(greenfield).toEqual({ total: 3, active: 2, issues: [], confirmed: true });
      const crest = await RequestContext.forSchool(ids.crestview!, () =>
        service.branchesStepState(),
      );
      expect(crest).toMatchObject({
        total: 1,
        active: 1,
        issues: ['Main Campus (address incomplete)'],
      });
    });
  });

  describe('access', () => {
    it('refuses staff without the settings permissions', async () => {
      const lekki = await t.prisma.branch.findFirstOrThrow({
        where: { schoolId: ids.greenfield, code: 'GFA-LK' },
      });
      const calls = [
        academicHead.get('/api/v1/school/profile'),
        academicHead.put('/api/v1/school/profile').send({}),
        academicHead.get('/api/v1/branches'),
        academicHead.get(`/api/v1/branches/${lekki.id}`),
        academicHead.post('/api/v1/branches').send(BRANCH),
        academicHead.patch(`/api/v1/branches/${lekki.id}`).send(BRANCH),
        academicHead.post(`/api/v1/branches/${lekki.id}/deactivate`).send({ reason: 'x' }),
        academicHead.delete(`/api/v1/branches/${lekki.id}`),
      ];
      for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
    });

    it('keeps each school to its own branches', async () => {
      const own = (await crestview.get('/api/v1/branches')).body.data;
      expect(own.branches.map((b: { code: string }) => b.code)).toEqual(['CCV-MC']);
      expect(own).toMatchObject({ planName: 'Starter', branchLimit: 2, codePrefix: 'CC-' });

      const lekki = await t.prisma.branch.findFirstOrThrow({
        where: { schoolId: ids.greenfield, code: 'GFA-LK' },
      });
      const path = `/api/v1/branches/${lekki.id}`;
      expect((await crestview.get(path)).status).toBe(404);
      const patch = await crestview
        .patch(path)
        .send({ ...BRANCH, name: 'Taken over', code: 'CC-TO', sections: ['Junior Secondary'] });
      expect(patch.status).toBe(404);
      expect((await crestview.post(`${path}/deactivate`).send({ reason: 'x' })).status).toBe(404);
      expect((await crestview.post(`${path}/reactivate`).send({})).status).toBe(404);
      expect((await crestview.delete(path)).status).toBe(404);

      const after = await t.prisma.branch.findUniqueOrThrow({ where: { id: lekki.id } });
      expect(after).toMatchObject({ name: 'Lekki Campus', status: 'ACTIVE' });
      expect((await crestview.get('/api/v1/school/profile')).body.data.name).toBe(
        'Crestview College',
      );
    });
  });
});
