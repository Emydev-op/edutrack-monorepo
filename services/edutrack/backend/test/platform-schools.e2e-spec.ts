import type { InvitationData } from '../src/notifications/templates/templates.js';
import { authed, createTestApp, login, nextIp, signIn, type TestApp } from './support/test-app.js';

type School = { id: string; name: string; status: string; [key: string]: unknown };

describe('Platform schools and subscriptions (e2e)', () => {
  let t: TestApp;
  let api: ReturnType<typeof authed>;
  const suffix = Date.now().toString(36);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    const { token } = await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' });
    api = authed(t, token);
    for (const s of await t.prisma.school.findMany({ select: { id: true, slug: true } }))
      ids[s.slug] = s.id;
  });

  afterAll(async () => {
    await t.close();
  });

  describe('access', () => {
    it('is for platform staff only', async () => {
      const { token } = await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng');
      const res = await authed(t, token).get('/api/v1/platform/schools');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PLATFORM_ONLY');
      expect((await t.http().get('/api/v1/platform/schools')).status).toBe(401);
    });

    it('checks each area’s permission', async () => {
      // Ngozi is Platform Support: can view schools, can't suspend them.
      const { token } = await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' });
      const support = authed(t, token);
      expect((await support.get('/api/v1/platform/schools')).status).toBe(200);
      const res = await support
        .post(`/api/v1/platform/schools/${ids.hillcrest}/suspend`)
        .send({ reason: 'test' });
      expect(res.status).toBe(403);
    });

    it('answers 404 for unknown and malformed school ids', async () => {
      const res = await api.get('/api/v1/platform/schools/greenfield');
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('That school doesn’t exist.');
    });
  });

  describe('reading', () => {
    it('lists schools with the back office’s fields, newest first', async () => {
      const res = await api.get('/api/v1/platform/schools?pageSize=50');
      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 50 });
      const greenfield = (res.body.data as School[]).find((s) => s.id === ids.greenfield)!;
      expect(greenfield).toMatchObject({
        name: 'Greenfield Academy',
        plan: 'Growth',
        status: 'Active',
        branches: 2,
        setupProgress: 81,
        currentStep: 'Fees',
        phone: '0809 120 4400',
        subdomain: 'greenfield.localhost',
        type: 'Private · Nursery, Primary & Secondary',
      });
      expect(greenfield.admin).toMatch(/^Adaeze Okonkwo/);
    });

    it('filters by status, plan, state and search', async () => {
      const statuses: [string, string][] = [
        ['Grace period', 'unity'],
        ['Restricted', 'royal'],
        ['Expiring', 'hillcrest'],
        ['Suspended', 'pinnacle'],
      ];
      for (const [status, slug] of statuses) {
        const res = await api.get(`/api/v1/platform/schools?status=${encodeURIComponent(status)}`);
        expect((res.body.data as School[]).map((s) => s.id)).toContain(ids[slug]);
        expect((res.body.data as School[]).every((s) => s.status === status)).toBe(true);
      }
      const onboarding = await api.get('/api/v1/platform/schools?status=Onboarding');
      expect((onboarding.body.data as School[]).map((s) => s.id)).toEqual(
        expect.arrayContaining([ids.crestview, ids.brookfield, ids.lagoon]),
      );
      const enterprise = await api.get('/api/v1/platform/schools?plan=Enterprise');
      expect((enterprise.body.data as School[]).map((s) => s.id)).toEqual([ids.kingsway]);
      const rivers = await api.get('/api/v1/platform/schools?state=Rivers');
      expect((rivers.body.data as School[]).map((s) => s.id)).toEqual([ids.kingsway]);
      const byAdmin = await api.get('/api/v1/platform/schools?search=briggs');
      expect((byAdmin.body.data as School[]).map((s) => s.id)).toEqual([ids.kingsway]);
      const bad = await api.get('/api/v1/platform/schools?status=Sleeping');
      expect(bad.status).toBe(422);
    });

    it('shows onboarding progress and a pending first administrator', async () => {
      const lagoon = await api.get(`/api/v1/platform/schools/${ids.lagoon}`);
      expect(lagoon.body).toMatchObject({
        status: 'Onboarding',
        setupProgress: 0,
        currentStep: 'Accept invitation',
        admin: 'Peter Okon (invited)',
      });
      const admins = await api.get(`/api/v1/platform/schools/${ids.lagoon}/administrators`);
      expect(admins.body).toEqual([
        expect.objectContaining({
          name: 'Peter Okon',
          role: 'Owner',
          scope: 'All branches',
          status: 'Invited',
          note: expect.stringMatching(/^Resent .* · expires in 1 day$/),
        }),
      ]);
    });

    it('returns usage, billing, activity and audit', async () => {
      const usage = await api.get(`/api/v1/platform/schools/${ids.greenfield}/usage`);
      expect(usage.body).toMatchObject({ storageLimitGb: 50 });
      expect(usage.body.activeStaff).toBeGreaterThan(0);

      const billing = await api.get(`/api/v1/platform/schools/${ids.unity}/billing`);
      expect(billing.body[0]).toMatchObject({ amount: '₦1,850,000', status: 'Overdue' });
      expect(billing.body.at(-1).status).toBe('Paid');

      const activity = await api.get(`/api/v1/platform/schools/${ids.pinnacle}/activity`);
      expect(activity.body[0]).toMatchObject({ tone: 'error', detail: 'by Tolu Bamidele' });
      expect(activity.body[0].title).toMatch(/^School suspended · Pinnacle/);

      const audit = await api.get(`/api/v1/platform/schools/${ids.pinnacle}/audit`);
      expect(audit.body[0]).toMatchObject({
        action: 'school.suspend',
        previousValue: 'Active',
        newValue: 'Suspended',
      });
    });
  });

  describe('changing schools', () => {
    it('edits details, validating phone and state, and audits the change', async () => {
      const bad = await api
        .patch(`/api/v1/platform/schools/${ids.hillcrest}`)
        .send({ name: 'Hillcrest', contactEmail: 'x@y.ng', phone: '12', state: 'Oyo' });
      expect(bad.status).toBe(422);
      const badState = await api.patch(`/api/v1/platform/schools/${ids.hillcrest}`).send({
        name: 'Hillcrest',
        contactEmail: 'x@y.ng',
        phone: '0803 111 2222',
        state: 'Texas',
      });
      expect(badState.body.message).toBe('Select a Nigerian state.');
      const taken = await api.patch(`/api/v1/platform/schools/${ids.hillcrest}`).send({
        name: 'greenfield academy',
        contactEmail: 'x@y.ng',
        phone: '0803 111 2222',
        state: 'Oyo',
      });
      expect(taken.status).toBe(409);

      const res = await api.patch(`/api/v1/platform/schools/${ids.hillcrest}`).send({
        name: 'Hillcrest Nursery & Primary School',
        contactEmail: 'Office@Hillcrest.edu.ng',
        phone: '0803 111 2222',
        state: 'Oyo',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Hillcrest Nursery & Primary School',
        contactEmail: 'office@hillcrest.edu.ng',
        phone: '0803 111 2222',
      });
      const audit = await api.get(`/api/v1/platform/schools/${ids.hillcrest}/audit`);
      expect(audit.body[0]).toMatchObject({ action: 'school.update', actor: 'Tolu Bamidele' });
      expect(audit.body[0].ipDevice).toMatch(/^10\.\d+\.\d+\.\d+ · /);
    });

    it('suspends a school: its staff are signed out and can’t sign back in; reactivating restores it', async () => {
      const staff = await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng');
      const reason = await api.post(`/api/v1/platform/schools/${ids.greenfield}/suspend`).send({});
      expect(reason.status).toBe(422);

      const res = await api
        .post(`/api/v1/platform/schools/${ids.greenfield}/suspend`)
        .send({ reason: 'Fraud investigation' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Suspended');
      const again = await api
        .post(`/api/v1/platform/schools/${ids.greenfield}/suspend`)
        .send({ reason: 'Again' });
      expect(again.body.code).toBe('ALREADY_SUSPENDED');

      expect((await authed(t, staff.token).get('/api/v1/auth/me')).status).toBe(401);
      const blocked = await login(t, 'adaeze.okonkwo@greenfield.edu.ng');
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('SCHOOL_SUSPENDED');

      const back = await api.post(`/api/v1/platform/schools/${ids.greenfield}/reactivate`);
      expect(back.status).toBe(200);
      expect(back.body.status).toBe('Active');
      expect((await login(t, 'adaeze.okonkwo@greenfield.edu.ng')).status).toBe(200);
      const notSuspended = await api.post(`/api/v1/platform/schools/${ids.greenfield}/reactivate`);
      expect(notSuspended.body.code).toBe('NOT_SUSPENDED');
    });

    it('returns an onboarding school to Onboarding when reactivated', async () => {
      await api.post(`/api/v1/platform/schools/${ids.crestview}/suspend`).send({ reason: 'Check' });
      const back = await api.post(`/api/v1/platform/schools/${ids.crestview}/reactivate`);
      expect(back.body.status).toBe('Onboarding');
    });

    it('bulk-suspends, skipping schools already suspended', async () => {
      const res = await api
        .post('/api/v1/platform/schools/bulk-suspend')
        .send({ ids: [ids.royal, ids.pinnacle], reason: 'Unpaid' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ suspended: 1 });
      const missing = await api
        .post('/api/v1/platform/schools/bulk-suspend')
        .send({ ids: ['00000000-0000-4000-8000-000000000000'], reason: 'x' });
      expect(missing.status).toBe(404);
      await api.post(`/api/v1/platform/schools/${ids.royal}/reactivate`);
    });

    it('emails renewal reminders to billing contacts, skipping suspended schools', async () => {
      const res = await api
        .post('/api/v1/platform/schools/reminders')
        .send({ ids: [ids.hillcrest, ids.pinnacle] });
      expect(res.body).toEqual({ queued: 1 });
      const mail = t.notifications.find('bola.ajayi@hillcrest.edu.ng', 'renewal-reminder');
      expect(mail?.data).toMatchObject({ plan: 'Starter', amount: '₦650,000' });
    });

    it('opens a read-only support session, but not on a suspended school', async () => {
      const res = await api
        .post(`/api/v1/platform/schools/${ids.kingsway}/support-sessions`)
        .send({ reason: 'SUP-1182 result publication' });
      expect(res.status).toBe(201);
      expect(res.body.expiresIn).toBe('30 minutes');
      const row = await t.prisma.supportSession.findUnique({ where: { id: res.body.sessionId } });
      expect(row).toMatchObject({ mode: 'READ_ONLY', endedAt: null });
      const suspended = await api
        .post(`/api/v1/platform/schools/${ids.pinnacle}/support-sessions`)
        .send({ reason: 'x' });
      expect(suspended.status).toBe(409);
    });

    it('invites and re-invites administrators', async () => {
      const email = `deputy.${suffix}@kingsway.edu.ng`;
      const wrongBranch = await api
        .post(`/api/v1/platform/schools/${ids.kingsway}/administrators`)
        .send({ name: 'Ada Deputy', email, role: 'School Admin', scope: 'Moon Campus' });
      expect(wrongBranch.status).toBe(422);

      const res = await api
        .post(`/api/v1/platform/schools/${ids.kingsway}/administrators`)
        .send({ name: 'Ada Deputy', email, role: 'School Admin', scope: 'GRA Campus' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Ada Deputy',
        scope: 'GRA Campus',
        status: 'Invited',
      });
      const mail = t.notifications.find(email, 'invitation');
      expect((mail!.data as InvitationData).organisation).toBe('Kingsway International School');

      const dup = await api
        .post(`/api/v1/platform/schools/${ids.kingsway}/administrators`)
        .send({ name: 'Ada Deputy', email, role: 'Owner', scope: 'All branches' });
      expect(dup.body.code).toBe('ALREADY_MEMBER');

      const resent = await api.post(
        `/api/v1/platform/schools/${ids.kingsway}/administrators/${res.body.id}/resend`,
      );
      expect(resent.status).toBe(200);
      expect(resent.body.note).toMatch(/^Resent /);

      const admins = await api.get(`/api/v1/platform/schools/${ids.kingsway}/administrators`);
      const active = (admins.body as { id: string; status: string }[]).find(
        (a) => a.status === 'Active',
      )!;
      const used = await api.post(
        `/api/v1/platform/schools/${ids.kingsway}/administrators/${active.id}/resend`,
      );
      expect(used.status).toBe(409);
    });
  });

  describe('provisioning', () => {
    const payload = (name: string, overrides: Record<string, unknown> = {}) => ({
      name,
      legalName: `${name} Ltd`,
      ownership: 'Private',
      registrationNumber: 'RC-12345',
      email: `info@${suffix}.school.ng`,
      phone: '0803 555 0199',
      state: 'Lagos',
      lga: 'Eti Osa',
      brandColor: '#1f6feb',
      sections: ['Primary', 'Nursery'],
      branches: [
        { name: 'Main Campus', address: '1 Admiralty Way' },
        { name: 'Ajah Campus', address: '' },
      ],
      plan: 'Growth',
      startDate: new Date().toISOString().slice(0, 10),
      admins: [
        {
          name: 'Funmi Ade',
          email: `funmi.${suffix}@school.ng`,
          phone: '0803 555 0101',
          position: 'Proprietress',
          scope: 'All branches',
        },
        {
          name: 'Kola Bayo',
          email: `kola.${suffix}@school.ng`,
          phone: '',
          position: '',
          scope: 'Ajah Campus',
        },
      ],
      ...overrides,
    });

    it('creates the school with everything it needs and invites its administrators', async () => {
      const name = `Bright Future ${suffix}`;
      const res = await api.post('/api/v1/platform/schools').send(payload(name));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name,
        status: 'Onboarding',
        plan: 'Growth',
        branches: 2,
        setupProgress: 0,
        currentStep: 'Accept invitation',
        type: 'Private · Nursery, Primary',
        brandColor: '#1F6FEB',
        admin: 'Funmi Ade (invited) +1',
      });
      const id = res.body.id as string;
      expect(res.body.subdomain).toBe(`bright-future-${suffix}.localhost`);

      const school = await t.prisma.school.findUniqueOrThrow({
        where: { id },
        include: {
          sections: true,
          branches: { include: { branchSections: true } },
          schoolRoles: true,
          subscription: true,
          platformInvoices: true,
          settings: true,
        },
      });
      expect(school.sections.map((s) => s.code)).toEqual(['NUR', 'PRI']);
      expect(school.branches.find((b) => b.isOriginal)?.name).toBe('Main Campus');
      expect(school.branches.every((b) => b.branchSections.length === 2)).toBe(true);
      expect(school.schoolRoles.map((r) => r.key)).toEqual(
        expect.arrayContaining(['owner', 'school_admin', 'teacher']),
      );
      expect(school.subscription).toMatchObject({
        status: 'ACTIVE',
        billingPeriod: 'ANNUAL',
        priceKobo: 185_000_000n,
      });
      expect(school.platformInvoices.map((i) => i.kind).sort()).toEqual([
        'NEW_SCHOOL',
        'SETUP_FEE',
      ]);
      expect(school.settings).not.toBeNull();

      const funmi = t.notifications.find(`funmi.${suffix}@school.ng`, 'invitation');
      expect(funmi?.data).toMatchObject({ organisation: name, position: 'Proprietress' });
      expect(t.notifications.find('+2348035550101', 'invitation')).toBeDefined();

      const admins = await api.get(`/api/v1/platform/schools/${id}/administrators`);
      expect(admins.body.map((a: { scope: string }) => a.scope)).toEqual([
        'All branches',
        'Ajah Campus',
      ]);

      // The invitation works: Funmi accepts and signs in to School Admin.
      const link = (funmi!.data as InvitationData).link;
      const token = decodeURIComponent(link.split('/').pop()!.split('?')[0]!);
      const accepted = await t
        .http()
        .post(`/api/v1/auth/invitations/${encodeURIComponent(token)}/accept`)
        .set('X-Forwarded-For', nextIp())
        .send({ firstName: 'Funmi', lastName: 'Ade', phone: '', password: 'Bright-Future-1' });
      expect(accepted.status).toBe(200);
      const signedIn = await login(t, `funmi.${suffix}@school.ng`, 'Bright-Future-1');
      expect(signedIn.status).toBe(200);
      expect(signedIn.body.school.name).toBe(name);

      const after = await api.get(`/api/v1/platform/schools/${id}`);
      expect(after.body).toMatchObject({ currentStep: 'School Profile', admin: 'Funmi Ade +1' });
    });

    it('refuses bad provisioning requests with field messages', async () => {
      const cases: [Record<string, unknown>, number, string][] = [
        [{ name: 'Greenfield Academy' }, 409, 'A school with this name already exists.'],
        [{ lga: 'Kano Municipal' }, 422, 'Kano Municipal isn’t an LGA in Lagos.'],
        [{ state: 'Texas' }, 422, 'Select a Nigerian state.'],
        [{ plan: 'Platinum' }, 422, 'Choose a plan.'],
        [
          {
            plan: 'Starter',
            branches: [{ name: 'Main Campus' }, { name: 'Ajah Campus' }, { name: 'Third' }],
          },
          422,
          'Starter allows 2 branches. Remove a branch or choose a bigger plan.',
        ],
        [
          { branches: [{ name: 'Main' }, { name: 'main' }] },
          422,
          'Give each branch a different name.',
        ],
        [
          { admins: [{ name: 'Only One', email: 'one@x.ng', scope: 'Main Campus' }] },
          422,
          'At least one administrator must manage all branches.',
        ],
        [
          {
            admins: [
              { name: 'A B', email: 'same@x.ng', scope: 'All branches' },
              { name: 'C D', email: 'same@x.ng', scope: 'All branches' },
            ],
          },
          422,
          'Each administrator needs a different email.',
        ],
        [
          {
            admins: [
              { name: 'A B', email: 'a@x.ng', scope: 'All branches' },
              { name: 'C D', email: 'c@x.ng', scope: 'Moon Campus' },
            ],
          },
          422,
          'Moon Campus isn’t one of the branches you added.',
        ],
        [{ startDate: '2020-01-01' }, 422, 'The start date can’t be more than a month ago.'],
        [{ admins: [] }, 422, 'Add at least one administrator.'],
      ];
      for (const [overrides, status, message] of cases) {
        const res = await api
          .post('/api/v1/platform/schools')
          .send(payload(`Reject ${suffix} ${Math.random().toString(36).slice(2, 6)}`, overrides));
        expect({ status: res.status, message: res.body.message }).toEqual({ status, message });
      }
    });

    it('gives a school whose subdomain is taken the next free one', async () => {
      const admin = (n: string) => [
        { name: 'Sam Port', email: `sam.${n}.${suffix}@school.ng`, scope: 'All branches' },
      ];
      const first = await api
        .post('/api/v1/platform/schools')
        .send(payload(`Twin ${suffix}`, { admins: admin('a') }));
      const second = await api
        .post('/api/v1/platform/schools')
        .send(payload(`Twin ${suffix}!`, { admins: admin('b') }));
      expect(first.body.subdomain).toBe(`twin-${suffix}.localhost`);
      expect(second.body.subdomain).toBe(`twin-${suffix}-2.localhost`);
    });
  });

  describe('subscriptions', () => {
    it('lists subscriptions of schools that aren’t suspended, soonest renewal first', async () => {
      const res = await api.get('/api/v1/platform/subscriptions?pageSize=50');
      expect(res.status).toBe(200);
      const rows = res.body.data as {
        schoolId: string;
        status: string;
        billing: string;
        studentUsage: string;
      }[];
      expect(rows.map((r) => r.schoolId)).not.toContain(ids.pinnacle);
      expect(rows.find((r) => r.schoolId === ids.unity)).toMatchObject({
        status: 'Grace period',
        billing: 'Overdue',
      });
      expect(rows.find((r) => r.schoolId === ids.kingsway)?.studentUsage).toMatch(/ \/ Unlimited$/);
      const grace = await api.get('/api/v1/platform/subscriptions?status=Grace%20period');
      expect(
        (grace.body.data as { status: string }[]).every((r) => r.status === 'Grace period'),
      ).toBe(true);
    });

    it('shows a school’s subscription', async () => {
      const res = await api.get(`/api/v1/platform/schools/${ids.kingsway}/subscription`);
      expect(res.body).toMatchObject({
        plan: 'Enterprise',
        price: '₦4,500,000 / year',
        studentLimit: 'Unlimited',
        payment: 'Paid',
        status: 'Active',
      });
      const brook = await api.get(`/api/v1/platform/schools/${ids.brookfield}/subscription`);
      expect(brook.body.status).toBe('Active');
    });

    it('runs every subscription action with its rules', async () => {
      const act = (body: Record<string, unknown>) =>
        api.post(`/api/v1/platform/schools/${ids.unity}/subscription/actions`).send(body);

      expect((await act({ action: 'extend', period: '1 month' })).status).toBe(422);
      const extended = await act({
        action: 'extend',
        period: '3 months',
        reason: 'Bank transfer confirmed',
      });
      expect(extended.status).toBe(200);
      expect(extended.body.status).toBe('Active');

      const same = await act({ action: 'change_plan', plan: 'Growth' });
      expect(same.body.code).toBe('SAME_PLAN');
      const changed = await act({ action: 'change_plan', plan: 'Starter' });
      expect(changed.body.plan).toBe('Starter');
      const sub = await api.get(`/api/v1/platform/schools/${ids.unity}/subscription`);
      expect(sub.body.price).toBe('₦650,000 / year');

      const grace = await act({ action: 'enter_grace' });
      expect(grace.body.status).toBe('Grace period');
      expect((await act({ action: 'enter_grace' })).body.code).toBe('ALREADY_IN_GRACE');
      expect((await act({ action: 'restrict', reason: 'Overdue' })).body.status).toBe('Restricted');
      expect((await act({ action: 'cancel', reason: 'Closing' })).body.status).toBe('Cancelled');
      expect((await act({ action: 'enter_grace' })).body.code).toBe('CANCELLED');
      expect((await act({ action: 'reactivate' })).body.status).toBe('Active');
      expect((await act({ action: 'reactivate' })).body.code).toBe('ALREADY_ACTIVE');
      expect((await act({ action: 'teleport' })).status).toBe(422);

      const audit = await api.get(`/api/v1/platform/schools/${ids.unity}/audit`);
      expect(audit.body.slice(0, 2).map((e: { action: string }) => e.action)).toEqual([
        'subscription.reactivate',
        'subscription.cancel',
      ]);
      expect(audit.body[0]).toMatchObject({
        previousValue: 'Starter · Cancelled',
        newValue: 'Starter · Active',
      });
    });

    it('needs Subscriptions.Suspend to restrict or cancel', async () => {
      // Make Ngozi Finance for this test: Finance can extend but not restrict.
      const finance = await t.prisma.platformRole.findUniqueOrThrow({ where: { key: 'finance' } });
      const ngozi = await t.prisma.user.findUniqueOrThrow({
        where: { email: 'ngozi@edutrack.ng' },
      });
      await t.prisma.platformStaff.update({
        where: { userId: ngozi.id },
        data: { roleId: finance.id },
      });
      try {
        const { token } = await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' });
        const fin = authed(t, token);
        const restrict = await fin
          .post(`/api/v1/platform/schools/${ids.hillcrest}/subscription/actions`)
          .send({ action: 'restrict', reason: 'x' });
        expect(restrict.status).toBe(403);
        const extend = await fin
          .post(`/api/v1/platform/schools/${ids.hillcrest}/subscription/actions`)
          .send({ action: 'extend', period: '1 month', reason: 'Goodwill' });
        expect(extend.status).toBe(200);
      } finally {
        const support = await t.prisma.platformRole.findUniqueOrThrow({
          where: { key: 'support' },
        });
        await t.prisma.platformStaff.update({
          where: { userId: ngozi.id },
          data: { roleId: support.id },
        });
      }
    });
  });

  describe('dashboard', () => {
    it('summarises the platform', async () => {
      const res = await api.get('/api/v1/platform/dashboard/summary');
      expect(res.body.greetingName).toBe('Tolu');
      expect(res.body.generatedAt).toMatch(/WAT$/);
      expect(res.body.totals.schools).toBeGreaterThanOrEqual(9);
      expect(res.body.totals.stalledOnboarding).toBeGreaterThanOrEqual(1);
    });

    it('charts revenue for each range, defaulting to 30 days', async () => {
      for (const [range, points] of [
        ['7d', 7],
        ['30d', 4],
        ['3m', 3],
        ['6m', 6],
        ['12m', 12],
      ] as const) {
        const res = await api.get(`/api/v1/platform/dashboard/revenue?range=${range}`);
        expect(res.status).toBe(200);
        expect(res.body.points).toHaveLength(points);
      }
      const fallback = await api.get('/api/v1/platform/dashboard/revenue?range=forever');
      expect(fallback.body.label).toBe('Last 30 days');
      const year = await api.get('/api/v1/platform/dashboard/revenue?range=12m');
      expect(year.body.total).toBeGreaterThan(0);
      expect(year.body.points.map((p: { label: string }) => p.label)).not.toContain('Sept');
      expect(year.body.stats.overdue).toBeGreaterThanOrEqual(1);
    });

    it('returns growth, subscription health, attention and onboarding', async () => {
      const growth = await api.get('/api/v1/platform/dashboard/growth?range=12m');
      expect(growth.body.months).toHaveLength(12);
      const health = await api.get('/api/v1/platform/dashboard/subscription-health');
      expect(health.body.map((h: { label: string }) => h.label)).toEqual([
        'Active',
        'Expiring soon',
        'Grace period',
        'Restricted',
        'Expired',
      ]);
      const attention = await api.get('/api/v1/platform/dashboard/attention');
      const statuses = attention.body.map((a: { status: string }) => a.status);
      expect(statuses).toEqual(expect.arrayContaining(['Onboarding', 'Pending']));
      const onboarding = await api.get('/api/v1/platform/dashboard/onboarding');
      expect(onboarding.body.every((s: { setupProgress: number }) => s.setupProgress < 100)).toBe(
        true,
      );
      const recent = await api.get('/api/v1/platform/activity/recent');
      expect(recent.body.length).toBeGreaterThan(0);
      expect(recent.body[0]).toHaveProperty('when');
    });
  });
});
