import {
  authed,
  createTestApp,
  login,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

type Api = ReturnType<typeof authed>;

const ADAEZE = 'adaeze.okonkwo@greenfield.edu.ng';
// Inventory officer: School Admin without settings.* or academics.configure.
const MUSA = 'm.yakubu@greenfield.edu.ng';
const FEMI = 'femi.adebayo@greenfield.edu.ng';
const NEW_PASSWORD = 'Fresh-Settings-2026!';

interface Change {
  id: string;
  area: string;
  setting: string;
  from: string;
  to: string;
  by: string;
  at: string;
}

/**
 * School Admin › Settings on the API: numbering, the academic and finance switches, the plan and
 * modules (read-only), the admin's own password and devices, the staff sign-in rules (which
 * sign-in enforces) and the change history.
 */
describe('School settings (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let officer: Api;
  let schoolId: string;

  const api = (path: string) => `/api/v1/settings${path}`;
  const history = async (area: string) =>
    (await admin.get(api(`/history?area=${area}`))).body.data as Change[];

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, ADAEZE)).token);
    officer = authed(t, (await signIn(t, MUSA)).token);
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  describe('School tab', () => {
    it('shows localisation, numbering with the next numbers, billing prefixes and setup', async () => {
      const res = await admin.get(api('/school'));
      expect(res.status).toBe(200);
      const v = res.body.data;
      expect(v.localisation).toEqual({
        country: 'Nigeria',
        currency: 'Nigerian Naira (₦, NGN)',
        timezone: 'Africa/Lagos (WAT, UTC+1)',
        dateFormat: 'DD/MM/YYYY',
        addressFormat: 'Street → City → LGA → State',
      });
      expect(v.numbering.map((n: { kind: string }) => n.kind)).toEqual(['admission', 'staff']);
      const [admission, staff] = v.numbering;
      expect(admission).toMatchObject({ label: 'Admission number', pattern: 'STU-[YYYY]-[####]' });
      expect(admission.next).toMatch(/^STU-\d{4}-\d{4}$/);
      expect(staff).toMatchObject({ label: 'Staff ID', pattern: 'GFA-ST-[####]' });
      // Never a number already handed out.
      const staffNumbers = await t.prisma.staff.findMany({
        where: { schoolId },
        select: { staffNumber: true },
      });
      expect(staffNumbers.map((s) => s.staffNumber)).not.toContain(staff.next);
      expect(staff.next).toBe(`GFA-ST-${String(staff.nextSeq).padStart(4, '0')}`);
      expect(v.invoicePrefix).toBe('INV');
      expect(v.receiptPrefix).toBe('RCT');
      expect(v.setup.total).toBeGreaterThan(0);
      expect(v.setup.done).toBeLessThanOrEqual(v.setup.total);
      expect(typeof v.setup.finished).toBe('boolean');
    });

    it('saves numbering formats (upper-cased), logs them, and new staff get the new format', async () => {
      const res = await admin.put(api('/numbering')).send({ staff: 'gfa/st/[yy]/[###]' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Numbering formats saved.');
      const staff = res.body.data.numbering[1];
      expect(staff.pattern).toBe('GFA/ST/[YY]/[###]');
      expect(staff.next).toMatch(/^GFA\/ST\/\d{2}\/\d{3,}$/);
      const row = await t.prisma.schoolSettings.findUniqueOrThrow({ where: { schoolId } });
      expect(row.staffNumberPattern).toBe('GFA/ST/[YY]/[###]');
      expect(row.admissionNumberPattern).toBe('STU-[YYYY]-[####]');

      const [latest] = await history('School');
      expect(latest).toMatchObject({
        area: 'School',
        setting: 'Staff ID format',
        from: 'GFA-ST-[####]',
        to: 'GFA/ST/[YY]/[###]',
        by: 'Adaeze Okonkwo',
      });
    });

    it('rejects broken formats and admission numbers that look like staff IDs', async () => {
      const broken = await admin.put(api('/numbering')).send({ admission: 'STU-[####' });
      expect(broken.status).toBe(422);
      expect(broken.body.message).toBe(
        'Admission number: Include one running number, written [###] to [######].',
      );
      const code = await admin.put(api('/numbering')).send({ admission: 'STU-[MM]-[####]' });
      expect(code.status).toBe(422);
      expect(code.body.message).toBe(
        'Admission number: [MM] isn’t a format code. Use [YYYY], [YY] or [####].',
      );
      const same = await admin
        .put(api('/numbering'))
        .send({ admission: 'GFA-[####]', staff: 'GFA-[###]' });
      expect(same.status).toBe(422);
      expect(same.body.message).toBe(
        'Admission numbers and staff IDs need different prefixes so they can’t be confused.',
      );
      const extra = await admin.put(api('/numbering')).send({ invoice: 'INV-[####]' });
      expect(extra.status).toBe(422);
    });

    it('refuses a format whose next number is already in use (409)', async () => {
      const before = (await admin.get(api('/school'))).body.data.numbering[0];
      const student = await t.prisma.student.findFirstOrThrow({ where: { schoolId } });
      const clash = `OLD-${String(before.nextSeq).padStart(4, '0')}`;
      await t.prisma.student.update({ where: { id: student.id }, data: { admissionNo: clash } });
      try {
        const res = await admin.put(api('/numbering')).send({ admission: 'OLD-[####]' });
        expect(res.status).toBe(409);
        expect(res.body.message).toBe(
          `Admission number: ${clash} is already in use, so this format would repeat numbers. Add a prefix or a year to make it unique.`,
        );
      } finally {
        await t.prisma.student.update({
          where: { id: student.id },
          data: { admissionNo: student.admissionNo },
        });
      }
    });

    it('needs settings.profile to change numbering', async () => {
      expect((await officer.get(api('/school'))).status).toBe(200);
      expect((await officer.put(api('/numbering')).send({ staff: 'BUR-[####]' })).status).toBe(403);
    });
  });

  describe('Academic and Finance tabs', () => {
    it('shows the academic switches with the session, pass mark and schemes', async () => {
      const v = (await admin.get(api('/academic'))).body.data;
      expect(v).toMatchObject({
        reweightExempt: true,
        promotionSuggestions: true,
        blockPromotionOnFees: false,
        passMark: expect.any(Number),
      });
      expect(v.session === null || typeof v.session === 'string').toBe(true);
      expect(v.termsPerSession === null || v.termsPerSession > 0).toBe(true);
      for (const s of v.schemes) {
        expect(typeof s.section).toBe('string');
        expect(typeof s.summary).toBe('string');
      }
    });

    it('saves academic switches and logs each one', async () => {
      const res = await admin.put(api('/academic')).send({ blockPromotionOnFees: true });
      expect(res.status).toBe(200);
      expect(res.body.data.blockPromotionOnFees).toBe(true);
      expect(res.body.data.reweightExempt).toBe(true);
      const [latest] = await history('Academic');
      expect(latest).toMatchObject({
        setting: 'Block promotion when fees are outstanding',
        from: 'Off',
        to: 'On',
      });
      const bad = await admin.put(api('/academic')).send({ reweightExempt: 'yes' });
      expect(bad.status).toBe(422);
      expect(bad.body.message).toBe('Re-weight exempt components must be on or off.');
      expect((await officer.put(api('/academic')).send({ reweightExempt: false })).status).toBe(
        403,
      );
    });

    it('stores the finance switches', async () => {
      expect((await admin.get(api('/finance'))).body.data).toEqual({
        allowPartial: true,
        autoSibling: true,
        verifyTransfers: true,
      });
      const res = await admin.put(api('/finance')).send({ allowPartial: false });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        allowPartial: false,
        autoSibling: true,
        verifyTransfers: true,
      });
      const row = await t.prisma.financeSettings.findUniqueOrThrow({ where: { schoolId } });
      expect(row.allowPartial).toBe(false);
      const [latest] = await history('Finance');
      expect(latest).toMatchObject({ setting: 'Allow part payments', from: 'On', to: 'Off' });
      const bad = await admin.put(api('/finance')).send({ autoSibling: 1 });
      expect(bad.status).toBe(422);
      expect(bad.body.message).toBe('Apply the sibling discount automatically must be on or off.');
    });
  });

  describe('Subscription and Modules tabs', () => {
    it('shows the plan, renewal and usage from the subscription', async () => {
      const sub = await t.prisma.subscription.findUniqueOrThrow({
        where: { schoolId },
        include: { plan: true },
      });
      const v = (await admin.get(api('/subscription'))).body.data;
      expect(v).toMatchObject({
        plan: sub.plan.name,
        cycle: 'Annual',
        price: Number(sub.priceKobo) / 100,
        startedOn: sub.startedOn.toISOString().slice(0, 10),
        renewsOn: sub.renewsOn.toISOString().slice(0, 10),
        status: 'Active',
      });
      expect(v.daysToRenewal).toBeGreaterThan(30);
      expect(v.usage.students).toBeGreaterThan(0);
      expect(v.usage.branches).toBeGreaterThan(0);
      expect(v.usage.staffAccounts).toBeGreaterThan(0);
      expect(v.usage.senderIdStatus).toEqual(expect.any(String));
      const fees = v.modules.find((m: { name: string }) => m.name === 'Fees & invoices');
      expect(fees.included).toBe(sub.plan.modules.includes('fees'));
      expect(v.modules.some((m: { name: string }) => m.name === 'Library')).toBe(false);
    });

    it('says Overdue in the grace period and Restricted once lapsed', async () => {
      try {
        await t.prisma.subscription.update({
          where: { schoolId },
          data: { status: 'GRACE_PERIOD' },
        });
        expect((await admin.get(api('/subscription'))).body.data.status).toBe('Overdue');
        await t.prisma.subscription.update({ where: { schoolId }, data: { status: 'EXPIRED' } });
        expect((await admin.get(api('/subscription'))).body.data.status).toBe('Restricted');
      } finally {
        await t.prisma.subscription.update({ where: { schoolId }, data: { status: 'ACTIVE' } });
      }
    });

    it('lists every module with what the plan includes', async () => {
      const plan = (
        await t.prisma.subscription.findUniqueOrThrow({
          where: { schoolId },
          include: { plan: true },
        })
      ).plan;
      const rows = (await admin.get(api('/modules'))).body.data as {
        name: string;
        covers: string;
        status: string;
      }[];
      const status = (name: string) => rows.find((r) => r.name === name)?.status;
      expect(status('Users & roles')).toBe('Active');
      expect(status('Library')).toBe('Coming soon');
      expect(status('Payroll')).toBe(plan.modules.includes('payroll') ? 'Active' : 'Not on plan');
      expect(rows.every((r) => r.covers.length > 0)).toBe(true);
    });
  });

  describe('Security tab', () => {
    it('shows the account, devices (this one first) and sign-in rules', async () => {
      const other = await signIn(t, ADAEZE, {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
      });
      const v = (await admin.get(api('/security'))).body.data;
      expect(v.account).toMatchObject({
        name: 'Adaeze Okonkwo',
        email: ADAEZE,
        position: expect.any(String),
        role: expect.any(String),
        passwordChangedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        passwordExpiresOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(v.rules).toEqual({
        idleTimeoutMinutes: 30,
        lockoutAttempts: 5,
        lockoutMinutes: 15,
        passwordExpiryDays: 90,
      });
      expect(v.sessions[0].current).toBe(true);
      expect(v.sessions.length).toBeGreaterThan(1);

      // Sign out the other device; this one can't be ended here.
      const otherId = (await authed(t, other.token).get(api('/security'))).body.data.sessions[0]
        .id as string;
      const ended = await admin.delete(api(`/security/sessions/${otherId}`));
      expect(ended.status).toBe(200);
      expect(ended.body.data.sessions.map((s: { id: string }) => s.id)).not.toContain(otherId);
      expect((await authed(t, other.token).get(api('/security'))).status).toBe(401);
      const again = await admin.delete(api(`/security/sessions/${otherId}`));
      expect(again.status).toBe(404);
      expect(again.body.message).toBe('That session has already ended.');
      const self = await admin.delete(api(`/security/sessions/${v.sessions[0].id}`));
      expect(self.status).toBe(409);
      expect(self.body.message).toBe('Use Sign out in the account menu to end this session.');
      expect((await admin.delete(api('/security/sessions/not-a-session'))).status).toBe(404);
    });

    it('signs out every other device', async () => {
      const a = await signIn(t, ADAEZE);
      const b = await signIn(t, ADAEZE);
      const res = await admin.post(api('/security/sessions/sign-out-others'));
      expect(res.status).toBe(200);
      expect(res.body.data.sessions).toHaveLength(1);
      expect(res.body.data.sessions[0].current).toBe(true);
      for (const s of [a, b])
        expect((await authed(t, s.token).get(api('/security'))).status).toBe(401);
    });

    it('validates and saves sign-in rules, and logs them', async () => {
      const low = await admin.put(api('/security/rules')).send({ lockoutAttempts: 2 });
      expect(low.status).toBe(422);
      expect(low.body.message).toBe(
        'Failed attempts before lockout must be a whole number from 3 to 10 attempts.',
      );
      const expiry = await admin.put(api('/security/rules')).send({ passwordExpiryDays: 10 });
      expect(expiry.body.message).toBe(
        'Password expiry must be a whole number from 30 to 365 days, or 0 for never.',
      );
      const text = await admin.put(api('/security/rules')).send({ idleTimeoutMinutes: 'ten' });
      expect(text.status).toBe(422);
      expect((await officer.put(api('/security/rules')).send({ lockoutAttempts: 4 })).status).toBe(
        403,
      );

      const never = await admin.put(api('/security/rules')).send({ passwordExpiryDays: 0 });
      expect(never.status).toBe(200);
      expect(never.body.data.rules.passwordExpiryDays).toBe(0);
      expect(never.body.data.account.passwordExpiresOn).toBeNull();
      const [latest] = await history('Security');
      expect(latest).toMatchObject({
        setting: 'Password expiry',
        from: 'Every 90 days',
        to: 'Never',
      });
    });

    it('changes how sign-in locks accounts and expires passwords', async () => {
      const saved = await admin
        .put(api('/security/rules'))
        .send({ lockoutAttempts: 3, lockoutMinutes: 20, passwordExpiryDays: 30 });
      expect(saved.status).toBe(200);
      expect(saved.body.data.rules).toMatchObject({
        lockoutAttempts: 3,
        lockoutMinutes: 20,
        passwordExpiryDays: 30,
      });

      // Lockout after three wrong passwords, for twenty minutes.
      const first = await login(t, MUSA, 'Wrong-Password-1!');
      expect(first.body.message).toMatch(/2 attempts left/);
      await login(t, MUSA, 'Wrong-Password-1!');
      const third = await login(t, MUSA, 'Wrong-Password-1!');
      expect(third.body.message).toMatch(/paused for 20 minutes/);
      expect((await login(t, MUSA)).body.message).toMatch(/paused for 20 minutes/);

      // A password changed 40 days ago has expired under a 30-day rule…
      await t.prisma.user.update({
        where: { email: FEMI },
        data: { passwordChangedAt: new Date(t.clock.now().getTime() - 40 * 86_400_000) },
      });
      const expired = await login(t, FEMI);
      expect(expired.status).toBe(403);
      expect(expired.body.error.code).toBe('PASSWORD_EXPIRED');
      // …and not under a 90-day one.
      await admin.put(api('/security/rules')).send({ passwordExpiryDays: 90 });
      expect((await login(t, FEMI)).status).toBe(200);

      await admin
        .put(api('/security/rules'))
        .send({ lockoutAttempts: 5, lockoutMinutes: 15, passwordExpiryDays: 90 });
    });

    it('changes the password, keeping this device and ending the others', async () => {
      const other = await signIn(t, ADAEZE);
      const wrong = await admin
        .post(api('/security/password'))
        .send({ current: 'Not-My-Password-1!', next: NEW_PASSWORD });
      expect(wrong.status).toBe(422);
      expect(wrong.body.message).toBe('Your current password is incorrect.');
      const weak = await admin
        .post(api('/security/password'))
        .send({ current: PASSWORD, next: 'weakpass' });
      expect(weak.status).toBe(422);
      expect(weak.body.message).toMatch(/at least 8 characters/);
      const empty = await admin.post(api('/security/password')).send({ next: NEW_PASSWORD });
      expect(empty.status).toBe(422);
      expect(empty.body.message).toBe('Enter your current password.');

      const res = await admin
        .post(api('/security/password'))
        .send({ current: PASSWORD, next: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.signedOut).toBeGreaterThanOrEqual(1);
      expect(res.body.data.view.sessions).toHaveLength(1);
      expect(res.body.data.view.account.passwordChangedOn).toBe(
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(t.clock.now()),
      );
      expect((await authed(t, other.token).get(api('/security'))).status).toBe(401);
      expect((await login(t, ADAEZE)).status).toBe(401);
      expect((await login(t, ADAEZE, NEW_PASSWORD)).status).toBe(200);
      // Put it back for the rest of the suite.
      await admin.post(api('/security/password')).send({ current: NEW_PASSWORD, next: PASSWORD });
    });
  });

  describe('History', () => {
    it('lists settings changes newest first, by area', async () => {
      const all = (await admin.get(api('/history'))).body.data as Change[];
      expect(all.length).toBeGreaterThan(0);
      expect(new Set(all.map((c) => c.area))).toEqual(
        new Set(['School', 'Academic', 'Finance', 'Security']),
      );
      const times = all.map((c) => c.at);
      expect([...times].sort().reverse()).toEqual(times);
      expect((await history('Finance')).every((c) => c.area === 'Finance')).toBe(true);
      expect((await admin.get(api('/history?area=Payroll'))).status).toBe(422);
    });
  });
});
