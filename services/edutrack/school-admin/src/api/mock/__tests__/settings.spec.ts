import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  AcademicSettings,
  FinanceSettings,
  FinanceToggles,
  LoginResponse,
  ModuleRow,
  PromotionView,
  ResultSheet,
  SchoolSettings,
  SecurityView,
  SettingsChange,
  SubscriptionView,
} from '@/types';

import { installMockApi } from '..';
import { subscriptionStatus } from '../handlers/settings';

const PASSWORD = 'Edutrack2026!';
const LONG = { timeout: 30_000 };

async function signIn(email: string, password = PASSWORD): Promise<AxiosInstance> {
  const client = axios.create({ baseURL: '/api' });
  installMockApi(client);
  const { data } = await client.post<LoginResponse>('/v1/auth/login', { email, password });
  client.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
  return client;
}

async function failure(request: Promise<unknown>) {
  try {
    await request;
  } catch (e) {
    if (isAxiosError(e))
      return { status: e.response?.status, message: String(e.response?.data?.message ?? '') };
  }
  throw new Error('Expected the request to fail');
}

describe('Settings', () => {
  let api: AxiosInstance;
  let crestview: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
    crestview = await signIn('e.udo@crestviewcollege.ng');
  });

  it(
    'validates numbering formats, previews the next number and logs the change',
    LONG,
    async () => {
      const { data } = await api.get<SchoolSettings>('/v1/settings/school');
      const admission = data.numbering.find((n) => n.kind === 'admission')!;
      expect(admission.pattern).toBe('STU-[YYYY]-[####]');
      expect(admission.next).toBe(`STU-${new Date().getFullYear()}-1249`);
      expect(data.numbering.find((n) => n.kind === 'staff')!.pattern).toBe('GFA-ST-[####]');

      for (const bad of ['STU-[YYYY]', 'STU-[####]-[####]', 'stu x [####]', 'STU-[MM]-[####]'])
        expect((await failure(api.put('/v1/settings/numbering', { admission: bad }))).status).toBe(
          422,
        );
      // Same prefix as staff IDs would make the two indistinguishable.
      expect(
        (await failure(api.put('/v1/settings/numbering', { admission: 'GFA-ST-[####]' }))).message,
      ).toMatch(/different prefixes/);

      const saved = await api.put<SchoolSettings>('/v1/settings/numbering', {
        admission: 'gfa/[yy]/[#####]',
      });
      expect(saved.data.numbering[0]).toMatchObject({
        pattern: 'GFA/[YY]/[#####]',
        next: `GFA/${String(new Date().getFullYear()).slice(-2)}/01249`,
      });
      const history = await api.get<SettingsChange[]>('/v1/settings/history', {
        params: { area: 'School' },
      });
      expect(history.data[0]).toMatchObject({
        setting: 'Admission number format',
        from: 'STU-[YYYY]-[####]',
        to: 'GFA/[YY]/[#####]',
        by: 'Adaeze Okonkwo',
      });
    },
  );

  it('academic switches change results totals and promotion rules', LONG, async () => {
    const sheet = () =>
      api.get<ResultSheet>('/v1/academics/results/sheets/arm-mc-jss2b/MTH').then((r) => r.data);
    const aisha = (s: ResultSheet) => s.rows.find((r) => r.studentId === 'aisha')!;
    const before = aisha(await sheet());
    expect(before.scores).toContain('EXM');
    expect(before.total).not.toBeNull();

    await api.put('/v1/settings/academic', { reweightExempt: false });
    const after = aisha(await sheet());
    expect(after.total!).toBeLessThan(before.total!);
    await api.put('/v1/settings/academic', { reweightExempt: true });
    expect(aisha(await sheet()).total).toBe(before.total);

    const pos = await api.put<AcademicSettings>('/v1/settings/academic', { showPosition: false });
    expect(pos.data.showPosition).toBe(false);
    const assessment = await api.get<{ showPosition: boolean }>('/v1/academics/assessment');
    expect(assessment.data.showPosition).toBe(false);
    await api.put('/v1/settings/academic', { showPosition: true });

    expect(
      (await failure(api.put('/v1/settings/academic', { reweightExempt: 'yes' }))).status,
    ).toBe(422);

    // Fees block: Musa Garba owes ₦120,000 and is suggested Promote.
    await api.put('/v1/settings/academic', { blockPromotionOnFees: true });
    const { data: view } = await api.get<PromotionView>('/v1/academics/promotion');
    expect(view.feesBlock).toBe(true);
    const musa = view.students.find((s) => s.id === 'musa')!;
    expect(musa.note).toMatch(/must be cleared/);
    await api.put(`/v1/academics/promotion/${view.classId}`, {
      decisions: view.students.map((s) => ({
        studentId: s.id,
        decision: s.suggestion,
        reason: '',
      })),
    });
    expect(
      (await failure(api.post(`/v1/academics/promotion/${view.classId}/apply`))).message,
    ).toMatch(/Musa Garba/);
    await api.put('/v1/settings/academic', { blockPromotionOnFees: false });

    // Without suggestions there is no rule to go against, so no exception reasons are needed.
    await api.put('/v1/settings/academic', { promotionSuggestions: false });
    const off = await api.get<PromotionView>('/v1/academics/promotion');
    expect(off.data.suggestions).toBe(false);
    await api.put(`/v1/academics/promotion/${view.classId}`, {
      decisions: [{ studentId: 'uche', decision: 'Promote', reason: '' }],
    });
    const applied = await api.post(`/v1/academics/promotion/${view.classId}/apply`);
    expect(applied.data.created).toBeGreaterThan(0);
    await api.put('/v1/settings/academic', { promotionSuggestions: true });

    const history = await api.get<SettingsChange[]>('/v1/settings/history', {
      params: { area: 'Academic' },
    });
    expect(history.data.map((h) => h.setting)).toContain(
      'Block promotion when fees are outstanding',
    );
  });

  it('finance switches are the same settings Fees → Billing uses', LONG, async () => {
    const t = await api.put<FinanceToggles>('/v1/settings/finance', { allowPartial: false });
    expect(t.data.allowPartial).toBe(false);
    const billing = await api.get<FinanceSettings>('/v1/finance/settings');
    expect(billing.data.allowPartial).toBe(false);
    await api.put('/v1/settings/finance', { allowPartial: true });
    expect((await failure(api.put('/v1/settings/finance', { autoSibling: 1 }))).status).toBe(422);
  });

  it('shows live subscription usage and plan modules', LONG, async () => {
    const { data } = await api.get<SubscriptionView>('/v1/settings/subscription');
    expect(data).toMatchObject({ plan: 'Growth', price: 1_850_000, status: 'Active' });
    expect(data.usage.students).toBeGreaterThan(1000);
    expect(data.usage.branchLimit).toBe(5);
    expect(data.usage.senderId).toBe('GREENFIELD');
    expect(data.modules.find((m) => m.name === 'Inventory')?.included).toBe(true);

    const empty = await crestview.get<SubscriptionView>('/v1/settings/subscription');
    expect(empty.data).toMatchObject({ plan: 'Starter' });
    expect(empty.data.usage.students).toBe(0);
    const modules = await crestview.get<ModuleRow[]>('/v1/settings/modules');
    expect(modules.data.find((m) => m.name === 'Inventory')?.status).toBe('Not on plan');
    // Attendance is live on every plan now that class teachers take registers.
    expect(modules.data.find((m) => m.name === 'Attendance')?.status).toBe('Active');
    expect(modules.data.find((m) => m.name === 'Transport')?.status).toBe('Coming soon');

    expect(subscriptionStatus(60)).toBe('Active');
    expect(subscriptionStatus(10)).toBe('Renewal due');
    expect(subscriptionStatus(-3)).toBe('Overdue');
    expect(subscriptionStatus(-20)).toBe('Restricted');
  });

  it(
    'changes the password, signs out other devices and validates sign-in rules',
    LONG,
    async () => {
      const { data } = await api.get<SecurityView>('/v1/settings/security');
      expect(data.sessions.filter((s) => !s.current).length).toBe(2);
      expect(data.account.passwordExpiresOn).toBe('2026-12-11');

      const pw = (current: string, next: string) =>
        failure(api.post('/v1/settings/security/password', { current, next }));
      expect((await pw('wrong', 'NewPass#2026x')).message).toMatch(/current password/);
      expect((await pw(PASSWORD, 'short1')).status).toBe(422);
      expect((await pw(PASSWORD, PASSWORD)).message).toMatch(/haven’t just used/);

      const one = await api.delete<SecurityView>('/v1/settings/security/sessions/ses-office');
      expect(one.data.sessions).toHaveLength(2);
      expect(
        (await failure(api.delete(`/v1/settings/security/sessions/${one.data.sessions[0]!.id}`)))
          .status,
      ).toBe(409);

      const done = await api.post<{ signedOut: number; view: SecurityView }>(
        '/v1/settings/security/password',
        { current: PASSWORD, next: 'NewPass#2026x' },
      );
      expect(done.data.signedOut).toBe(1);
      expect(done.data.view.sessions).toHaveLength(1);
      await signIn('adaeze.okonkwo@greenfield.edu.ng', 'NewPass#2026x');
      await api.post('/v1/settings/security/password', {
        current: 'NewPass#2026x',
        next: PASSWORD,
      });

      const rules = (body: object) => failure(api.put('/v1/settings/security/rules', body));
      expect((await rules({ lockoutAttempts: 2 })).status).toBe(422);
      expect((await rules({ passwordExpiryDays: 10 })).status).toBe(422);
      const saved = await api.put<SecurityView>('/v1/settings/security/rules', {
        ...data.rules,
        passwordExpiryDays: 0,
        lockoutAttempts: 4,
      });
      expect(saved.data.rules).toMatchObject({ passwordExpiryDays: 0, lockoutAttempts: 4 });
      expect(saved.data.account.passwordExpiresOn).toBeNull();
      const history = await api.get<SettingsChange[]>('/v1/settings/history', {
        params: { area: 'Security' },
      });
      expect(history.data[0]).toMatchObject({ from: 'Every 90 days', to: 'Never' });
    },
  );
});
