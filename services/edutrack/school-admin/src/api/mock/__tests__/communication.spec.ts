import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  AnnouncementDetail,
  AnnouncementList,
  AudiencePreview,
  CommsSettings,
  DeliveryDetail,
  DeliveryList,
  LoginResponse,
  TemplateDetail,
} from '@/types';

import { installMockApi } from '..';
import { smsLength } from '../comms-catalog';
import { commsFor, dispatch, smsCreditOf } from '../comms-db';

const PASSWORD = 'Edutrack2026!';

async function signIn(email: string): Promise<AxiosInstance> {
  const client = axios.create({ baseURL: '/api' });
  installMockApi(client);
  const { data } = await client.post<LoginResponse>('/v1/auth/login', {
    email,
    password: PASSWORD,
  });
  client.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
  return client;
}

async function failure(request: Promise<unknown>) {
  try {
    await request;
  } catch (e) {
    if (isAxiosError(e))
      return {
        status: e.response?.status,
        message: String(e.response?.data?.message ?? e.response?.data?.error ?? ''),
      };
  }
  throw new Error('Expected the request to fail');
}

const pad = (n: number) => String(n).padStart(2, '0');
const inMinutes = (m: number) => {
  const d = new Date(Date.now() + m * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const parents = { kind: 'parents', classes: [], branchId: null } as const;

describe('communication', () => {
  let gf: AxiosInstance;
  let cv: AxiosInstance;
  beforeAll(async () => {
    gf = await signIn('adaeze.okonkwo@greenfield.edu.ng');
    cv = await signIn('e.udo@crestviewcollege.ng');
  });

  it('counts SMS pages the way networks do', () => {
    expect(smsLength('a'.repeat(160)).pages).toBe(1);
    expect(smsLength('a'.repeat(161)).pages).toBe(2);
    expect(smsLength('₦'.repeat(70))).toMatchObject({ unicode: true, pages: 1 });
    expect(smsLength('[]').length).toBe(4);
  });

  it('seeds Greenfield history from live data and leaves Crestview empty', async () => {
    const list = (await gf.get<AnnouncementList>('/v1/comms/announcements')).data;
    expect(list.counts.All).toBeGreaterThanOrEqual(8);
    expect(list.counts.Draft).toBeGreaterThan(0);
    expect(list.counts.Withdrawn).toBe(1);
    const log = (
      await gf.get<DeliveryList>('/v1/comms/deliveries', { params: { event: 'invoice.issued' } })
    ).data;
    expect(log.meta.total).toBeGreaterThan(0);
    expect((await cv.get<AnnouncementList>('/v1/comms/announcements')).data.counts.All).toBe(0);
    expect((await cv.get<DeliveryList>('/v1/comms/deliveries')).data.meta.total).toBe(0);
    // Seeded history doesn't spend today's credit.
    expect(smsCreditOf('greenfield').units).toBe(18420);
  });

  it('counts real recipients and what each channel reaches', async () => {
    const pv = (
      await gf.post<AudiencePreview>('/v1/comms/announcements/preview', {
        audience: parents,
        channels: ['In-app', 'Email', 'SMS'],
        smsText: 'Greenfield: PTA meeting Wed 18 Nov, 10am.',
      })
    ).data;
    expect(pv.recipients).toBeGreaterThan(500);
    expect(pv.reach.SMS).toBeLessThanOrEqual(pv.recipients);
    expect(pv.smsUnits).toBe(pv.reach.SMS);
    expect(pv.smsCost).toBe(pv.smsUnits * 4);
    const everyone = (
      await gf.post<AudiencePreview>('/v1/comms/announcements/preview', {
        audience: { kind: 'everyone', classes: [], branchId: null },
        channels: ['In-app'],
        smsText: '',
      })
    ).data;
    expect(everyone.recipients).toBeGreaterThan(pv.recipients);
    expect(everyone.byRole.map((b) => b.role).sort()).toEqual([
      'Parent',
      'Staff',
      'Student',
      'Teacher',
    ]);
  });

  it('validates announcements before they go out', async () => {
    const post = (body: object) => gf.post('/v1/comms/announcements', body);
    const base = {
      title: 'Test',
      body: 'Hello',
      smsText: '',
      audience: parents,
      channels: ['In-app'],
      scheduledFor: null,
      expiresOn: null,
    };
    expect((await failure(post({ ...base, title: ' ', action: 'draft' }))).status).toBe(422);
    expect((await failure(post({ ...base, channels: [], action: 'send' }))).message).toMatch(
      /channel/,
    );
    expect((await failure(post({ ...base, channels: ['SMS'], action: 'send' }))).message).toMatch(
      /SMS version/,
    );
    expect(
      (
        await failure(
          post({
            ...base,
            audience: { kind: 'students', classes: [], branchId: null },
            channels: ['Email'],
            action: 'send',
          }),
        )
      ).message,
    ).toMatch(/In-app/);
    expect(
      (await failure(post({ ...base, action: 'schedule', scheduledFor: inMinutes(1) }))).message,
    ).toMatch(/5 minutes/);
    expect(
      (
        await failure(
          post({
            ...base,
            audience: { kind: 'classes', classes: ['ZZZ 9'], branchId: null },
            action: 'send',
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (await failure(post({ ...base, action: 'send', expiresOn: '2020-01-01' }))).message,
    ).toMatch(/expiry/);
  });

  it('blocks SMS the credit can’t cover', async () => {
    const c = commsFor('greenfield');
    const saved = c.credit;
    c.credit = 10;
    try {
      const res = await failure(
        gf.post('/v1/comms/announcements', {
          title: 'Fees',
          body: 'Reminder',
          smsText: 'Reminder',
          audience: parents,
          channels: ['SMS'],
          scheduledFor: null,
          expiresOn: null,
          action: 'send',
        }),
      );
      expect(res.message).toMatch(/SMS units/);
    } finally {
      c.credit = saved;
    }
  });

  it('sends, withdraws, duplicates and deletes', async () => {
    const before = smsCreditOf('greenfield').units;
    const sent = (
      await gf.post<AnnouncementDetail>('/v1/comms/announcements', {
        title: 'Sports day moved',
        body: 'Sports day moves to Friday.',
        smsText: 'Sports day moves to Friday.',
        audience: { kind: 'classes', classes: ['JSS 2B'], branchId: null },
        channels: ['In-app', 'SMS'],
        scheduledFor: null,
        expiresOn: null,
        action: 'send',
      })
    ).data;
    expect(sent.status).toBe('Sent');
    expect(sent.recipients).toBeGreaterThan(0);
    const sms = sent.stats.find((s) => s.channel === 'SMS')!;
    // Quiet hours may hold SMS; otherwise credit is spent per page sent.
    const spent = before - smsCreditOf('greenfield').units;
    expect(spent).toBe(sent.smsUnits);
    expect(sms.recipients).toBeGreaterThan(0);

    const delivery = (await gf.get<DeliveryDetail>(`/v1/comms/deliveries/${sent.messageId}`)).data;
    expect(delivery.stats.map((s) => s.channel)).toEqual(['In-app', 'SMS']);
    // Students only get the in-app copy.
    expect(
      delivery.rows
        .filter((r) => r.role === 'Student')
        .every((r) => r.outcomes.every((o) => o.channel === 'In-app')),
    ).toBe(true);

    const withdrawn = (
      await gf.post<AnnouncementDetail>(`/v1/comms/announcements/${sent.id}/withdraw`, {
        reason: 'Changed again',
      })
    ).data;
    expect(withdrawn.status).toBe('Withdrawn');
    expect((await failure(gf.post(`/v1/comms/announcements/${sent.id}/withdraw`, {}))).status).toBe(
      409,
    );
    expect(
      (await failure(gf.put(`/v1/comms/announcements/${sent.id}`, { action: 'draft', title: 'x' })))
        .status,
    ).toBe(409);

    const copy = (await gf.post<AnnouncementDetail>(`/v1/comms/announcements/${sent.id}/duplicate`))
      .data;
    expect(copy.status).toBe('Draft');
    expect((await failure(gf.delete(`/v1/comms/announcements/${sent.id}`))).status).toBe(409);
    await gf.delete(`/v1/comms/announcements/${copy.id}`);
    expect((await failure(gf.get(`/v1/comms/announcements/${copy.id}`))).status).toBe(404);
  });

  it('schedules, edits and cancels', async () => {
    const when = inMinutes(60 * 24);
    const a = (
      await gf.post<AnnouncementDetail>('/v1/comms/announcements', {
        title: 'Open day',
        body: 'Open day on Saturday.',
        smsText: '',
        audience: parents,
        channels: ['In-app', 'Email'],
        scheduledFor: when,
        expiresOn: null,
        action: 'schedule',
      })
    ).data;
    expect(a).toMatchObject({ status: 'Scheduled', scheduledFor: when, canCancel: true });
    const cancelled = (await gf.post<AnnouncementDetail>(`/v1/comms/announcements/${a.id}/cancel`))
      .data;
    expect(cancelled.status).toBe('Draft');
    // A scheduled post whose time has come goes out on the next read.
    const c = commsFor('greenfield');
    const rec = c.announcements.find((x) => x.id === a.id)!;
    Object.assign(rec, { status: 'Scheduled', scheduledFor: inMinutes(-1) });
    const after = (await gf.get<AnnouncementDetail>(`/v1/comms/announcements/${a.id}`)).data;
    expect(after.status).toBe('Sent');
    expect(after.recipients).toBeGreaterThan(0);
  });

  it('retries only failures that can go through', async () => {
    const list = (
      await gf.get<DeliveryList>('/v1/comms/deliveries', {
        params: { channel: 'SMS', status: 'Failed', pageSize: 50 },
      })
    ).data;
    expect(list.rows.length).toBeGreaterThan(0);
    const { retryable } = list.summary;
    expect(retryable).toBeGreaterThan(0);
    const res = (
      await gf.post<{ retried: number; stillFailed: number }>('/v1/comms/deliveries/retry-failed')
    ).data;
    expect(res.retried).toBe(retryable);
    expect(res.stillFailed).toBeLessThan(retryable);

    // Missing or invalid numbers aren't retried: they point to the record to fix.
    const msg = dispatch('greenfield', {
      event: 'payment.details',
      title: 'Test',
      audience: 'Test',
      by: 'Test',
      recipients: [
        {
          key: 'a',
          name: 'No Phone',
          role: 'Parent',
          email: '',
          phone: '',
          portal: true,
          branchId: null,
          fix: { name: 'parents' },
        },
        {
          key: 'b',
          name: 'Bad Phone',
          role: 'Parent',
          email: 'b@x.ng',
          phone: '+234 803 555',
          portal: true,
          branchId: null,
          fix: null,
        },
      ],
    })!;
    const d = (
      await gf.get<DeliveryDetail>(`/v1/comms/deliveries/${msg.id}`, { params: { channel: 'SMS' } })
    ).data;
    const sms = d.rows.map((r) => r.outcomes.find((o) => o.channel === 'SMS')!);
    expect(sms.map((o) => [o.status, o.retryable])).toEqual([
      ['Failed', false],
      ['Failed', false],
    ]);
    expect(sms[0]!.detail).toMatch(/No phone/);
    expect(sms[0]!.fix).toEqual({ name: 'parents' });
    expect(sms[1]!.detail).toMatch(/Invalid phone/);
    expect((await failure(gf.post(`/v1/comms/deliveries/${msg.id}/retry`))).status).toBe(409);
  });

  it('validates templates and notification settings', { timeout: 30000 }, async () => {
    const t = (await gf.get<TemplateDetail>('/v1/comms/templates/invoice.issued')).data;
    expect(t.variables.map((v) => v.name)).toContain('invoice_no');
    expect(
      (
        await failure(
          gf.put('/v1/comms/templates/invoice.issued', {
            SMS: { subject: '', body: 'Pay [pay_link] now' },
          }),
        )
      ).message,
    ).toMatch(/pay_link/);
    expect(
      (
        await failure(
          gf.put('/v1/comms/templates/invoice.issued', { Email: { subject: '', body: 'x' } }),
        )
      ).message,
    ).toMatch(/subject/);
    const saved = (
      await gf.put<TemplateDetail>('/v1/comms/templates/invoice.issued', {
        SMS: { subject: '', body: '[school_name]: invoice [invoice_no] is [amount].' },
      })
    ).data;
    expect(saved.customised).toBe(true);
    expect(
      (await gf.post<TemplateDetail>('/v1/comms/templates/invoice.issued/reset')).data.customised,
    ).toBe(false);

    expect(
      (
        await failure(
          gf.put('/v1/comms/settings/events', {
            'staff.invitation': { active: false, channels: ['Email'] },
          }),
        )
      ).message,
    ).toMatch(/can’t be switched off/);
    expect(
      (
        await failure(
          gf.put('/v1/comms/settings/events', { 'invoice.issued': { active: true, channels: [] } }),
        )
      ).message,
    ).toMatch(/at least one channel/);
    const s = (
      await gf.put<CommsSettings>('/v1/comms/settings/events', {
        'refund.paid': { active: false, channels: ['Email'] },
      })
    ).data;
    expect(s.events.find((e) => e.key === 'refund.paid')?.active).toBe(false);
    expect(s.history[0]?.what).toMatch(/Refund processed/);
    await gf.put('/v1/comms/settings/events', {
      'refund.paid': { active: true, channels: ['Email'] },
    });

    expect((await failure(gf.post('/v1/comms/settings/sender-id', { name: '1ABC' }))).status).toBe(
      422,
    );
    expect(
      (await failure(gf.post('/v1/comms/settings/sender-id', { name: 'greenfield' }))).status,
    ).toBe(409);
    expect(
      (
        await failure(
          gf.put('/v1/comms/settings/quiet-hours', { enabled: true, start: '21:00', end: '21:00' }),
        )
      ).status,
    ).toBe(422);
  });

  it('sends automatic messages from finance', async () => {
    const before = (
      await gf.get<DeliveryList>('/v1/comms/deliveries', { params: { event: 'payment.details' } })
    ).data.meta.total;
    const students = (
      await gf.get<{ studentKey: string; payer: string | null }[]>('/v1/finance/students', {
        params: { search: 'Emmanuel' },
      })
    ).data;
    const key = students[0]!.studentKey;
    await gf.post(`/v1/finance/students/${key}/send-details`);
    const after = (
      await gf.get<DeliveryList>('/v1/comms/deliveries', { params: { event: 'payment.details' } })
    ).data;
    expect(after.meta.total).toBeGreaterThan(before);
    expect(after.rows[0]?.recipient).toBe('Mrs. Funke Adeyemi');
  });

  it('keeps the inbox per school', async () => {
    const inbox = (await gf.get<{ unread: number; total: number }>('/v1/comms/inbox')).data;
    expect(inbox.total).toBeGreaterThan(0);
    await gf.post('/v1/notifications/read-all');
    expect((await gf.get<{ unread: number }>('/v1/comms/inbox')).data.unread).toBe(0);
    expect((await cv.get<{ total: number }>('/v1/comms/inbox')).data.total).toBe(1);
    expect((await failure(gf.post('/v1/notifications/nope/read'))).status).toBe(404);
  });
});
