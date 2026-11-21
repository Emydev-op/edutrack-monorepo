import { CommsJobsService } from '../src/school/communication/comms-jobs.service.js';
import type { AnnouncementData } from '../src/notifications/templates/templates.js';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

/**
 * School Admin › Communication on the API, at Greenfield (Growth plan: 5,000 SMS units a term;
 * quiet hours 21:00–07:00; sender ID "GREENFIELD" waiting for approval). Announcements to JSS 2B
 * reach its guardians (in-app for Funke Adeyemi, who has a Parent Portal account; email and SMS
 * from their contact details) and students; SMS uses units page by page; the back office tops up
 * units and approves sender IDs; absence alerts follow the school's template and switches.
 */

type Api = ReturnType<typeof authed>;
interface Preview {
  recipients: number;
  reach: Record<'In-app' | 'Email' | 'SMS', number>;
  smsPages: number;
  smsUnits: number;
  credit: number;
  enough: boolean;
  smsSendable: number;
  sender: string;
  senderNote: string;
  quietHoursNote: string;
}

const C = '/api/v1/comms';
const ADMIN = 'adaeze.okonkwo@greenfield.edu.ng';
const OKAFOR = 'g.okafor@greenfield.edu.ng';
const HOST = 'greenfield.localhost';
const FUNKE_EMAIL = 'funke.adeyemi@gmail.com';
const FUNKE_PHONE = '+2348035550161';
// Fri 20 Nov 2026, 10:00 in Lagos.
const DAY = Date.parse('2026-11-20T09:00:00.000Z');
const JSS2B = { kind: 'classes', classes: ['JSS 2B'], branchId: null };

describe('Communication (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let platform: Api;
  let schoolId: string;
  let funkeUserId: string;

  const signInAdmin = async () => {
    admin = authed(t, (await signIn(t, ADMIN)).token);
  };
  /** Moves the clock and signs in again (access tokens follow the clock). */
  const at = async (iso: string | number) => {
    t.clock.set(typeof iso === 'number' ? iso : Date.parse(iso));
    await signInAdmin();
    platform = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
  };
  const settings = async () => (await admin.get(`${C}/settings`)).body.data;
  const balance = async () => (await settings()).credit.units as number;
  const preview = async (channels: string[], smsText = '', audience: object = JSS2B) => {
    const res = await admin
      .post(`${C}/announcements/preview`)
      .send({ audience, channels, smsText });
    expect(res.status).toBe(200);
    return res.body.data as Preview;
  };
  const announce = (over: Record<string, unknown> = {}) =>
    admin.post(`${C}/announcements`).send({
      title: 'Inter-house sports',
      body: 'Inter-house sports holds on Friday. Children should come in house colours.',
      smsText: '',
      audience: JSS2B,
      channels: ['In-app'],
      scheduledFor: null,
      expiresOn: null,
      action: 'send',
      ...over,
    });
  const sent = (channel: 'email' | 'sms') =>
    t.notifications.sent.filter((m) => m.channel === channel && m.template === 'announcement');
  const deliveriesOf = (messageId: string, channel: 'IN_APP' | 'EMAIL' | 'SMS') =>
    t.prisma.messageDelivery.findMany({ where: { messageId, channel } });

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    await at(DAY);
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    // Funke Adeyemi (Emmanuel's mother, JSS 2B) accepts her Parent Portal invitation.
    const funke = await t.prisma.guardian.findFirstOrThrow({
      where: { schoolId, fullName: 'Funke Adeyemi' },
    });
    let membership = await t.prisma.schoolMembership.findFirst({
      where: { guardianId: funke.id, status: 'ACTIVE' },
    });
    if (!membership) {
      await admin.post(`/api/v1/guardians/${funke.id}/invite`).expect(200);
      const invite = [...t.notifications.sent].reverse().find((m) => m.template === 'invitation')!;
      const token = decodeURIComponent((invite.data as { link: string }).link.split('/').pop()!);
      await t
        .http()
        .post(`/api/v1/auth/invitations/${token}/accept`)
        .send({ firstName: 'Funke', lastName: 'Adeyemi', password: 'Edutrack2026!' })
        .expect(200);
      membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { guardianId: funke.id, status: 'ACTIVE' },
      });
    }
    funkeUserId = membership.userId;
    await signInAdmin();
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  describe('options and settings', () => {
    it('lists branches, classes with students and the events', async () => {
      const res = await admin.get(`${C}/options`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Options loaded.');
      const o = res.body.data;
      expect(o.branches.length).toBeGreaterThan(0);
      const jss2b = o.classes.find((c: { label: string }) => c.label === 'JSS 2B');
      expect(jss2b).toMatchObject({ level: 'JSS 2', students: expect.any(Number) });
      expect(jss2b.students).toBeGreaterThan(0);
      expect(o.events.map((e: { key: string }) => e.key)).toEqual(
        expect.arrayContaining(['attendance.absent', 'result.published', 'announcement']),
      );
    });

    it('starts with the plan’s SMS units, quiet hours on and EDUTRACK as the sender', async () => {
      const s = await settings();
      expect(s.credit).toEqual({ units: 5000, usedThisTerm: 0, low: false });
      expect(s.senderId).toMatchObject({ name: 'GREENFIELD', status: 'Pending approval' });
      expect(s.sender).toBe('EDUTRACK');
      expect(s.quietHours).toEqual({ enabled: true, start: '21:00', end: '07:00' });
      const absent = s.events.find((e: { key: string }) => e.key === 'attendance.absent');
      expect(absent).toMatchObject({ active: true, channels: ['In-app'] });
      // Settings › Subscription shows the same balance.
      const sub = (await admin.get('/api/v1/settings/subscription')).body.data;
      expect(sub.usage).toMatchObject({ smsUnits: 5000, smsUsedThisTerm: 0 });
      const ledger = await t.prisma.smsCreditTransaction.findMany({ where: { schoolId } });
      expect(ledger).toEqual([expect.objectContaining({ kind: 'PLAN_ALLOWANCE', units: 5000 })]);
    });
  });

  describe('sending', () => {
    let pv: Preview;
    let announcementId: string;
    let messageId: string;
    // 170 GSM characters: two SMS pages per recipient.
    const longSms = `Greenfield: ${'Sports day is on Friday at the main field. '.repeat(4)}`.slice(
      0,
      170,
    );

    it('previews who an audience reaches and what SMS needs', async () => {
      pv = await preview(['In-app', 'Email', 'SMS'], longSms);
      expect(pv.recipients).toBeGreaterThan(10);
      expect(pv.reach.SMS).toBeGreaterThan(3);
      expect(pv.reach['In-app']).toBeGreaterThanOrEqual(1);
      expect(pv.smsPages).toBe(2);
      expect(pv).toMatchObject({
        smsUnits: pv.reach.SMS * 2,
        credit: 5000,
        enough: true,
        sender: 'EDUTRACK',
      });
      expect(pv.senderNote).toMatch(/GREENFIELD.*awaiting approval/);
      expect(pv.quietHoursNote).toBe('SMS isn’t sent during quiet hours (21:00–07:00).');
      // Unicode (₦ is made SMS-safe, an emoji isn't) switches to 70 characters a page.
      expect((await preview(['SMS'], `Fees are ₦40,000 ${'x'.repeat(60)}`)).smsPages).toBe(1);
      expect((await preview(['SMS'], `Well done 🎉 ${'x'.repeat(60)}`)).smsPages).toBe(2);
    });

    it('checks the audience and the message', async () => {
      const unknown = await admin
        .post(`${C}/announcements/preview`)
        .send({ audience: { kind: 'classes', classes: ['JSS 9Z'] }, channels: ['In-app'] });
      expect(unknown.status).toBe(422);
      expect(unknown.body.message).toBe('JSS 9Z has no active students in this branch.');
      const noSms = await announce({ channels: ['SMS'] });
      expect(noSms.status).toBe(422);
      expect(noSms.body.message).toBe('Write the SMS version of the message.');
      const students = await announce({
        audience: { kind: 'students', classes: [], branchId: null },
        channels: ['Email'],
      });
      expect(students.body.message).toBe(
        'Students only receive In-app messages. Add In-app, or choose another audience.',
      );
    });

    it('sends in-app, email and SMS, using two units per SMS', async () => {
      t.notifications.clear();
      const res = await announce({ channels: ['In-app', 'Email', 'SMS'], smsText: longSms });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe(`Sent to ${pv.recipients} recipients.`);
      const a = res.body.data;
      announcementId = a.id;
      messageId = a.messageId;
      expect(a).toMatchObject({
        status: 'Sent',
        recipients: pv.recipients,
        smsUnits: pv.reach.SMS * 2,
        canWithdraw: true,
        canEdit: false,
      });
      expect(a.history.map((h: { title: string }) => h.title)).toEqual(['Sent', 'Created']);
      // Email and SMS were handed to the transports; SMS as EDUTRACK until the ID is approved.
      expect(sent('email')).toHaveLength(pv.reach.Email);
      const funkeEmail = sent('email').find((m) => m.to === FUNKE_EMAIL)!;
      expect(funkeEmail.data).toMatchObject({ subject: 'Inter-house sports' });
      expect((funkeEmail.data as AnnouncementData).body).toMatch(/^Inter-house sports holds/);
      expect(sent('sms')).toHaveLength(pv.reach.SMS);
      expect(sent('sms').every((m) => m.senderId === 'EDUTRACK')).toBe(true);
      expect(sent('sms').find((m) => m.to === FUNKE_PHONE)?.data).toMatchObject({ body: longSms });
      // In the Parent Portal.
      const note = await t.prisma.notification.findFirst({
        where: { userId: funkeUserId, schoolId, category: 'announcements' },
      });
      expect(note).toMatchObject({ title: 'Inter-house sports', link: '/announcements' });
      // The ledger and the balance.
      expect(await balance()).toBe(5000 - pv.reach.SMS * 2);
      const usage = await t.prisma.smsCreditTransaction.findFirstOrThrow({
        where: { schoolId, kind: 'USAGE', messageId },
      });
      expect(usage.units).toBe(-pv.reach.SMS * 2);
      expect((await settings()).credit.usedThisTerm).toBe(pv.reach.SMS * 2);
    });

    it('shows the message in the delivery logs, per channel and per recipient', async () => {
      const list = (await admin.get(`${C}/deliveries`)).body.data;
      const rows = list.rows.filter((r: { messageId: string }) => r.messageId === messageId);
      expect(rows.map((r: { channel: string }) => r.channel)).toEqual(['In-app', 'Email', 'SMS']);
      const sms = rows.find((r: { channel: string }) => r.channel === 'SMS');
      expect(sms).toMatchObject({
        event: 'announcement',
        eventLabel: 'Announcement',
        status: 'Sent',
      });
      const detail = (await admin.get(`${C}/deliveries/${messageId}?pageSize=50`)).body.data;
      expect(detail).toMatchObject({
        title: 'Inter-house sports',
        sender: 'EDUTRACK',
        smsUnits: pv.reach.SMS * 2,
        source: { label: 'Announcement', to: `/communication/announcements/${announcementId}` },
        retryable: 0,
      });
      expect(detail.content.map((c: { channel: string }) => c.channel)).toEqual([
        'In-app',
        'Email',
        'SMS',
      ]);
      const funke = detail.rows.find((r: { name: string }) => r.name === 'Mrs. Funke Adeyemi');
      expect(funke.outcomes).toEqual([
        expect.objectContaining({
          channel: 'In-app',
          status: 'Delivered',
          address: 'Parent portal',
        }),
        expect.objectContaining({ channel: 'Email', status: 'Sent', address: FUNKE_EMAIL }),
        expect.objectContaining({ channel: 'SMS', status: 'Sent', address: FUNKE_PHONE }),
      ]);
      const filtered = (await admin.get(`${C}/deliveries?channel=SMS&event=announcement`)).body
        .data;
      expect(filtered.rows.every((r: { channel: string }) => r.channel === 'SMS')).toBe(true);
      expect((await admin.get(`${C}/deliveries/not-an-id`)).status).toBe(404);
      const nothing = await admin.post(`${C}/deliveries/${messageId}/retry`);
      expect(nothing.status).toBe(409);
      expect(nothing.body.error.code).toBe('NOTHING_TO_RETRY');
    });

    it('withdraws an in-app post from the portals, once', async () => {
      const res = await admin.post(`${C}/announcements/${announcementId}/withdraw`).send({
        reason: 'Date changed',
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'Withdrawn',
        withdrawReason: 'Date changed',
        canWithdraw: false,
      });
      expect(
        await t.prisma.notification.count({
          where: { userId: funkeUserId, category: 'announcements' },
        }),
      ).toBe(0);
      const again = await admin.post(`${C}/announcements/${announcementId}/withdraw`).send({});
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ANNOUNCEMENT_NOT_WITHDRAWABLE');
    });

    it('can’t recall email or SMS, edit a sent one or delete it; duplicates it as a draft', async () => {
      const email = (await announce({ title: 'Email only', channels: ['Email'] })).body.data;
      const recall = await admin.post(`${C}/announcements/${email.id}/withdraw`).send({});
      expect(recall.body.error.code).toBe('ANNOUNCEMENT_NOT_RECALLABLE');
      const edit = await admin.put(`${C}/announcements/${email.id}`).send({
        title: 'x',
        body: 'y',
        audience: JSS2B,
        channels: ['In-app'],
        action: 'draft',
      });
      expect(edit.body.error.code).toBe('ANNOUNCEMENT_NOT_EDITABLE');
      const del = await admin.delete(`${C}/announcements/${email.id}`);
      expect(del.body.error.code).toBe('ANNOUNCEMENT_NOT_DRAFT');
      const copy = await admin.post(`${C}/announcements/${email.id}/duplicate`);
      expect(copy.status).toBe(200);
      expect(copy.body.data).toMatchObject({
        status: 'Draft',
        title: 'Email only',
        channels: ['Email'],
        audience: JSS2B,
        recipients: null,
        canDelete: true,
      });
      expect(copy.body.data.history[0].title).toBe('Copied from “Email only”');
      expect((await admin.delete(`${C}/announcements/${copy.body.data.id}`)).status).toBe(200);
      expect((await admin.get(`${C}/announcements/${copy.body.data.id}`)).status).toBe(404);
    });

    it('lists announcements with counts and the units left', async () => {
      const draft = await announce({ title: 'Half-term notice', action: 'draft' });
      expect(draft.status).toBe(201);
      expect(draft.body.message).toBe('Saved as a draft.');
      const res = await admin.get(`${C}/announcements?status=Draft`);
      expect(res.status).toBe(200);
      const list = res.body.data;
      expect(list.rows.map((r: { title: string }) => r.title)).toEqual(['Half-term notice']);
      expect(list.rows[0].dateLabel).toMatch(/^Edited Today/);
      // The seed's staff announcement (lesson notes are due on Fridays) is sent too.
      expect(list.counts).toMatchObject({ All: 4, Draft: 1, Sent: 2, Withdrawn: 1 });
      expect(list.smsCredit).toBe(await balance());
      expect(list.sentThisTerm).toBe(3);
    });
  });

  describe('SMS units running out', () => {
    let messageId: string;
    let reach: number;

    it('warns before sending, then sends what the units cover; in-app and email still go', async () => {
      await t.prisma.communicationSettings.update({
        where: { schoolId },
        data: { smsBalanceUnits: 3 },
      });
      const pv = await preview(['In-app', 'Email', 'SMS'], 'Sports day is on Friday.');
      reach = pv.reach.SMS;
      expect(pv).toMatchObject({ smsUnits: reach, credit: 3, enough: false, smsSendable: 3 });
      t.notifications.clear();
      const res = await announce({
        title: 'Sports day',
        channels: ['In-app', 'Email', 'SMS'],
        smsText: 'Sports day is on Friday.',
      });
      expect(res.status).toBe(201);
      messageId = res.body.data.messageId;
      expect(res.body.data.history[0].detail).toMatch(
        new RegExp(`${reach - 3} SMS not sent: out of SMS units$`),
      );
      expect(sent('sms')).toHaveLength(3);
      expect(sent('email')).toHaveLength(pv.reach.Email);
      const sms = await deliveriesOf(messageId, 'SMS');
      const notSent = sms.filter((d) => d.status === 'FAILED');
      expect(notSent).toHaveLength(reach - 3);
      expect(notSent.every((d) => d.detail === 'Not sent · out of SMS units' && d.retryable)).toBe(
        true,
      );
      expect(await balance()).toBe(0);
      expect(
        await t.prisma.notification.count({
          where: { userId: funkeUserId, title: 'Sports day' },
        }),
      ).toBe(1);
      const logs = (await admin.get(`${C}/deliveries?status=Failed`)).body.data;
      expect(logs.summary.retryable).toBe(reach - 3);
      expect(logs.rows.some((r: { messageId: string }) => r.messageId === messageId)).toBe(true);
    });

    it('lets the back office top up, audited, and the school retries what wasn’t sent', async () => {
      const bad = await platform
        .post(`/api/v1/platform/schools/${schoolId}/sms/top-ups`)
        .send({ units: 0, note: 'x' });
      expect(bad.status).toBe(422);
      const audited = () =>
        t.prisma.auditEvent.count({ where: { schoolId, action: 'sms.top_up' } });
      const auditedBefore = await audited();
      const res = await platform
        .post(`/api/v1/platform/schools/${schoolId}/sms/top-ups`)
        .send({ units: 100, reference: 'PAY-2026-0418', note: 'Paid for 100 units' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('SMS units added.');
      expect(res.body.data).toMatchObject({ balance: 100, allowancePerTerm: 5000, plan: 'Growth' });
      expect(res.body.data.ledger.find((l: { kind: string }) => l.kind === 'Top-up')).toMatchObject(
        {
          kind: 'Top-up',
          units: 100,
          detail: 'Paid for 100 units · PAY-2026-0418',
          by: 'Tolu Bamidele',
        },
      );
      expect(await audited()).toBe(auditedBefore + 1);
      expect(
        await t.prisma.notification.count({
          where: { schoolId, title: '100 SMS units added' },
        }),
      ).toBeGreaterThan(0);
      expect(await balance()).toBe(100);

      t.notifications.clear();
      const retry = await admin.post(`${C}/deliveries/retry-failed`);
      expect(retry.status).toBe(200);
      expect(retry.body.data).toEqual({
        retried: reach - 3,
        stillFailed: 0,
        credit: 100 - (reach - 3),
      });
      expect(sent('sms')).toHaveLength(reach - 3);
      const sms = await deliveriesOf(messageId, 'SMS');
      expect(sms.every((d) => d.status === 'SENT')).toBe(true);
      // Not sending for lack of units wasn't an attempt.
      expect(sms.every((d) => d.attempts === 1)).toBe(true);
      const again = await admin.post(`${C}/deliveries/retry-failed`);
      expect(again.status).toBe(409);
    });

    it('marks a transport failure retryable and sends it again on retry', async () => {
      t.notifications.clear();
      t.notifications.failFor.add(FUNKE_EMAIL);
      const res = await announce({ title: 'PTA meeting', channels: ['Email'] });
      const id = res.body.data.messageId;
      const failed = (await deliveriesOf(id, 'EMAIL')).find((d) => d.address === FUNKE_EMAIL)!;
      expect(failed).toMatchObject({ status: 'FAILED', retryable: true });
      const detail = (await admin.get(`${C}/deliveries/${id}?status=Failed&search=funke`)).body
        .data;
      expect(detail.retryable).toBe(1);
      expect(detail.rows).toHaveLength(1);
      expect(detail.rows[0].outcomes[0]).toMatchObject({
        status: 'Failed',
        retryable: true,
        fix: null,
      });
      t.notifications.failFor.clear();
      const retry = await admin.post(`${C}/deliveries/${id}/retry`);
      expect(retry.body.data).toMatchObject({ retried: 1, stillFailed: 0 });
      expect(retry.body.message).toBe('1 message sent again.');
      expect(sent('email').filter((m) => m.to === FUNKE_EMAIL)).toHaveLength(1);
    });
  });

  describe('quiet hours and scheduling', () => {
    it('holds SMS during quiet hours and sends it when they end', async () => {
      await at('2026-11-20T21:30:00.000Z'); // 22:30 in Lagos
      const pv = await preview(['In-app', 'SMS'], 'Reminder: no school on Monday.');
      expect(pv.quietHoursNote).toMatch(/^It’s quiet hours \(21:00–07:00\)/);
      const before = await balance();
      t.notifications.clear();
      const res = await announce({
        title: 'No school Monday',
        channels: ['In-app', 'SMS'],
        smsText: 'Reminder: no school on Monday.',
      });
      const id = res.body.data.messageId;
      const held = await deliveriesOf(id, 'SMS');
      expect(held.length).toBe(pv.reach.SMS);
      expect(
        held.every(
          (d) =>
            d.status === 'QUEUED' &&
            d.detail === 'Held for quiet hours · goes out at 07:00' &&
            d.releaseAt?.toISOString() === '2026-11-21T06:00:00.000Z',
        ),
      ).toBe(true);
      expect(sent('sms')).toHaveLength(0);
      expect(await balance()).toBe(before);
      // Still quiet at 06:30: nothing goes.
      await at('2026-11-21T05:30:00.000Z');
      expect(await t.app.get(CommsJobsService).run()).toEqual({ announcements: 0, released: 0 });
      await at('2026-11-21T06:01:00.000Z');
      expect(await t.app.get(CommsJobsService).run()).toEqual({
        announcements: 0,
        released: pv.reach.SMS,
      });
      expect(sent('sms')).toHaveLength(pv.reach.SMS);
      expect((await deliveriesOf(id, 'SMS')).every((d) => d.status === 'SENT')).toBe(true);
      expect(await balance()).toBe(before - pv.reach.SMS);
    });

    it('schedules, cancels and sends a scheduled announcement when it is due', async () => {
      await at(DAY);
      const tooSoon = await announce({ action: 'schedule', scheduledFor: '2026-11-20T10:02' });
      expect(tooSoon.status).toBe(422);
      expect(tooSoon.body.message).toBe('Schedule it at least 5 minutes from now, or send it now.');
      const res = await announce({
        title: 'Open day',
        action: 'schedule',
        scheduledFor: '2026-11-20T12:00',
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Announcement scheduled.');
      const id = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'Scheduled',
        scheduledFor: '2026-11-20T12:00',
        canCancel: true,
      });
      const cancelled = await admin.post(`${C}/announcements/${id}/cancel`);
      expect(cancelled.body.data.status).toBe('Draft');
      expect((await admin.post(`${C}/announcements/${id}/cancel`)).status).toBe(409);
      const again = await admin.put(`${C}/announcements/${id}`).send({
        title: 'Open day',
        body: 'Our open day is on Saturday from 10am.',
        smsText: '',
        audience: JSS2B,
        channels: ['In-app'],
        scheduledFor: '2026-11-20T12:00',
        expiresOn: '2026-11-28',
        action: 'schedule',
      });
      expect(again.body.data.status).toBe('Scheduled');
      await at('2026-11-20T11:01:00.000Z');
      expect((await t.app.get(CommsJobsService).run()).announcements).toBe(1);
      const a = (await admin.get(`${C}/announcements/${id}`)).body.data;
      expect(a).toMatchObject({ status: 'Sent', expiresOn: '2026-11-28' });
      expect(a.history[0].title).toBe('Sent as scheduled');
      expect(
        await t.prisma.notification.count({
          where: { title: 'Scheduled announcement sent: Open day', entityId: id },
        }),
      ).toBe(1);
      // Past its expiry date it shows as Expired.
      await at('2026-11-29T09:00:00.000Z');
      expect((await admin.get(`${C}/announcements/${id}`)).body.data.status).toBe('Expired');
      await at(DAY);
    });
  });

  describe('templates and automatic messages', () => {
    let okafor: Api;
    let date: string;
    let rows: { studentId: string; name: string }[];

    const mark = async (absent?: string) => {
      const res = await okafor.put(`/api/v1/class-teacher/register/${date}`).send({
        marks: rows.map((r) => ({
          studentId: r.studentId,
          status: r.name === absent ? 'Absent' : 'Present',
        })),
      });
      expect(res.status).toBe(200);
      return res.body.data as { notified: string[] };
    };
    const absenceAlerts = (title?: string) =>
      t.prisma.notification.findMany({
        where: { userId: funkeUserId, category: 'register', ...(title && { title }) },
      });

    beforeAll(async () => {
      okafor = authed(t, (await signIn(t, OKAFOR, { host: HOST })).token, { host: HOST });
      const day = (await okafor.get('/api/v1/class-teacher/register')).body.data;
      date = day.editableDays[0];
      rows = (await okafor.get(`/api/v1/class-teacher/register?date=${date}`)).body.data.rows;
      await mark();
    });

    it('lists templates and checks edits', async () => {
      const list = (await admin.get(`${C}/templates`)).body.data;
      expect(list.find((x: { event: string }) => x.event === 'attendance.absent')).toEqual({
        event: 'attendance.absent',
        label: 'Absence alert',
        channels: ['In-app'],
        variables: ['parent_name', 'student_name', 'first_name', 'class', 'date'],
        customised: false,
      });
      expect(list.some((x: { event: string }) => x.event === 'announcement')).toBe(false);
      expect((await admin.get(`${C}/templates/announcement`)).status).toBe(404);
      const bad = await admin
        .put(`${C}/templates/attendance.absent`)
        .send({ 'In-app': { subject: '[child] missed school', body: 'x' } });
      expect(bad.status).toBe(422);
      expect(bad.body.message).toMatch(/^\[child\] isn’t a variable for this message/);
    });

    it('sends the absence alert with the edited wording', async () => {
      const res = await admin.put(`${C}/templates/attendance.absent`).send({
        'In-app': {
          subject: '[first_name] missed school',
          body: '[student_name] wasn’t in [class] on [date].',
        },
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ customised: true, updatedBy: 'Adaeze Okonkwo' });
      expect(res.body.data.templates['In-app'].subject).toBe('[first_name] missed school');
      const r = await mark('Emmanuel Adeyemi');
      expect(r.notified).toEqual(['Emmanuel Adeyemi']);
      const [alert] = await absenceAlerts('Emmanuel missed school');
      expect(alert).toMatchObject({ title: 'Emmanuel missed school', link: '/attendance' });
      expect(alert!.body).toMatch(/^Emmanuel Adeyemi wasn’t in JSS 2B on /);
      // In the delivery logs as an automatic message.
      const logs = (await admin.get(`${C}/deliveries?event=attendance.absent`)).body.data;
      expect(logs.rows[0]).toMatchObject({ eventLabel: 'Absence alert', channel: 'In-app' });
    });

    it('sends nothing when the school switches the event off', async () => {
      await mark();
      const off = await admin
        .put(`${C}/settings/events`)
        .send({ 'attendance.absent': { active: false, channels: ['In-app'] } });
      expect(off.status).toBe(200);
      expect(off.body.data.history[0]).toMatchObject({
        what: 'Absence alert notifications changed',
        detail: 'In-app → Off',
      });
      const same = await admin
        .put(`${C}/settings/events`)
        .send({ 'attendance.absent': { active: false, channels: ['In-app'] } });
      expect(same.body.error.code).toBe('NOTHING_CHANGED');
      const locked = await admin
        .put(`${C}/settings/events`)
        .send({ 'parent.invitation': { active: false, channels: ['Email'] } });
      expect(locked.status).toBe(422);
      const before = (await absenceAlerts()).length;
      expect((await mark('Emmanuel Adeyemi')).notified).toEqual([]);
      expect(await absenceAlerts()).toHaveLength(before);
    });

    it('texts guardians when the school turns SMS on, using units', async () => {
      await mark();
      await admin
        .put(`${C}/settings/events`)
        .send({ 'attendance.absent': { active: true, channels: ['In-app', 'SMS'] } })
        .expect(200);
      const before = await balance();
      t.notifications.clear();
      expect((await mark('Emmanuel Adeyemi')).notified).toEqual(['Emmanuel Adeyemi']);
      const sms = sent('sms').filter((m) => m.to === FUNKE_PHONE);
      expect(sms).toHaveLength(1);
      expect((sms[0]!.data as AnnouncementData).body).toMatch(
        /^Greenfield Academy: Emmanuel Adeyemi was marked absent from JSS 2B on /,
      );
      expect(await balance()).toBe(before - sent('sms').length);
    });

    it('resets the template to the default wording', async () => {
      const res = await admin.post(`${C}/templates/attendance.absent/reset`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ customised: false, updatedBy: '' });
      expect(res.body.data.templates['In-app'].subject).toBe('[first_name] was marked absent');
      const again = await admin.post(`${C}/templates/attendance.absent/reset`);
      expect(again.body.error.code).toBe('TEMPLATE_IS_DEFAULT');
      const before = (await absenceAlerts('Emmanuel was marked absent')).length;
      await mark();
      await mark('Emmanuel Adeyemi');
      expect(await absenceAlerts('Emmanuel was marked absent')).toHaveLength(before + 1);
    });
  });

  describe('sender ID', () => {
    it('is requested by the school and approved in the back office; SMS then uses it', async () => {
      const bad = await admin.post(`${C}/settings/sender-id`).send({ name: 'GF academy' });
      expect(bad.status).toBe(422);
      const pending = await admin.post(`${C}/settings/sender-id`).send({ name: 'greenfield' });
      expect(pending.body.error.code).toBe('SENDER_ID_PENDING');
      const res = await admin.post(`${C}/settings/sender-id`).send({ name: 'gfacademy' });
      expect(res.status).toBe(200);
      expect(res.body.data.senderId).toMatchObject({
        name: 'GFACADEMY',
        status: 'Pending approval',
      });
      expect(res.body.data.sender).toBe('EDUTRACK');

      const queue = (await platform.get('/api/v1/platform/sender-ids')).body.data;
      expect(queue).toEqual([
        expect.objectContaining({
          schoolId,
          school: 'Greenfield Academy',
          name: 'GFACADEMY',
          status: 'Pending approval',
          requestedBy: 'Adaeze Okonkwo',
        }),
      ]);
      const reject = await platform
        .post(`/api/v1/platform/schools/${schoolId}/sender-id/reject`)
        .send({});
      expect(reject.status).toBe(422);
      const ok = await platform
        .post(`/api/v1/platform/schools/${schoolId}/sender-id/approve`)
        .send({});
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({
        sender: 'GFACADEMY',
        senderId: { name: 'GFACADEMY', status: 'Approved' },
      });
      expect(ok.body.data.requests.map((r: { status: string }) => r.status)).toEqual([
        'Approved',
        'Rejected',
      ]);
      const twice = await platform
        .post(`/api/v1/platform/schools/${schoolId}/sender-id/approve`)
        .send({});
      expect(twice.body.error.code).toBe('NO_PENDING_SENDER_ID');
      expect(
        await t.prisma.notification.count({
          where: { schoolId, title: 'Sender ID “GFACADEMY” approved' },
        }),
      ).toBeGreaterThan(0);

      const s = await settings();
      expect(s).toMatchObject({ sender: 'GFACADEMY', senderId: { status: 'Approved' } });
      t.notifications.clear();
      await announce({ title: 'Uniform', channels: ['SMS'], smsText: 'New uniforms are in.' });
      expect(sent('sms').length).toBeGreaterThan(0);
      expect(sent('sms').every((m) => m.senderId === 'GFACADEMY')).toBe(true);
    });

    it('keeps the approved sender while a new name is rejected', async () => {
      await admin.post(`${C}/settings/sender-id`).send({ name: 'GFA' }).expect(200);
      expect((await settings()).sender).toBe('GFACADEMY');
      const res = await platform
        .post(`/api/v1/platform/schools/${schoolId}/sender-id/reject`)
        .send({ note: 'The networks need the school’s full name.' });
      expect(res.status).toBe(200);
      const s = await settings();
      expect(s.senderId).toMatchObject({
        name: 'GFA',
        status: 'Rejected',
        note: 'The networks need the school’s full name.',
      });
      expect(s.sender).toBe('GFACADEMY');
    });
  });

  describe('access', () => {
    it('lets section admins send only to classes in their sections', async () => {
      const membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { schoolId, user: { email: ADMIN } },
      });
      const primary = await t.prisma.section.findFirstOrThrow({
        where: { schoolId, name: 'Primary' },
      });
      await t.prisma.membershipSection.create({
        data: { schoolId, membershipId: membership.id, sectionId: primary.id },
      });
      try {
        const everyone = await announce({
          audience: { kind: 'everyone', classes: [], branchId: null },
        });
        expect(everyone.status).toBe(403);
        expect(everyone.body.error.code).toBe('SECTION_FORBIDDEN');
        const jss = await announce();
        expect(jss.status).toBe(403);
        expect(jss.body.message).toMatch(/can’t send to classes in Junior Secondary/);
        const quiet = await admin.put(`${C}/settings/quiet-hours`).send({ enabled: false });
        expect(quiet.body.error.code).toBe('SECTION_FORBIDDEN');
        // Viewing is fine.
        expect((await admin.get(`${C}/announcements`)).status).toBe(200);
      } finally {
        await t.prisma.membershipSection.deleteMany({ where: { membershipId: membership.id } });
      }
    });

    it('keeps each school’s messages to itself', async () => {
      const mine = await t.prisma.announcement.findFirstOrThrow({ where: { schoolId } });
      const message = await t.prisma.message.findFirstOrThrow({ where: { schoolId } });
      const crest = authed(t, (await signIn(t, 'e.udo@crestviewcollege.ng')).token);
      expect((await crest.get(`${C}/announcements/${mine.id}`)).status).toBe(404);
      expect((await crest.get(`${C}/deliveries/${message.id}`)).status).toBe(404);
      expect((await crest.post(`${C}/deliveries/${message.id}/retry`)).status).toBe(404);
      const list = (await crest.get(`${C}/announcements`)).body.data;
      expect(list.rows).toEqual([]);
      expect((await crest.get(`${C}/deliveries`)).body.data.rows).toEqual([]);
      // Crestview has its own units: none until its first term starts.
      expect((await crest.get(`${C}/settings`)).body.data.credit).toMatchObject({
        units: 0,
        usedThisTerm: 0,
      });
    });

    it('changes quiet hours for whole-school admins', async () => {
      const res = await admin
        .put(`${C}/settings/quiet-hours`)
        .send({ enabled: true, start: '20:00', end: '06:30' });
      expect(res.status).toBe(200);
      expect(res.body.data.quietHours).toEqual({ enabled: true, start: '20:00', end: '06:30' });
      const bad = await admin
        .put(`${C}/settings/quiet-hours`)
        .send({ enabled: true, start: '25:00' });
      expect(bad.status).toBe(422);
    });
  });
});
