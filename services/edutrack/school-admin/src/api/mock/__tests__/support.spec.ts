import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type { LoginResponse, TicketDetail, TicketList } from '@/types';

import { installMockApi } from '..';
import { addWorkingHours, slaOf, tickets, workingMsBetween } from '../support-db';

async function signIn(email: string): Promise<AxiosInstance> {
  const client = axios.create({ baseURL: '/api' });
  installMockApi(client);
  const { data } = await client.post<LoginResponse>('/v1/auth/login', {
    email,
    password: 'Edutrack2026!',
  });
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

const HOUR = 3_600_000;
/** A WAT wall-clock moment as a UTC timestamp. */
const wat = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m - 1, d, h - 1, min);

describe('support working-hours clock', () => {
  it('counts only Mon–Fri 08:00–17:00 WAT', () => {
    // Friday 15:00 + 4 working hours = Monday 10:00.
    expect(addWorkingHours(wat(2026, 11, 6, 15), 4)).toBe(wat(2026, 11, 9, 10));
    // Saturday evening starts counting on Monday 08:00.
    expect(addWorkingHours(wat(2026, 11, 7, 20), 1)).toBe(wat(2026, 11, 9, 9));
    // Before opening on a weekday.
    expect(addWorkingHours(wat(2026, 11, 10, 6), 2)).toBe(wat(2026, 11, 10, 10));
    expect(workingMsBetween(wat(2026, 11, 6, 16), wat(2026, 11, 9, 9))).toBe(2 * HOUR);
  });

  it('marks first replies met, late or overdue', () => {
    const base = tickets.find((t) => t.id === 'SUP-1049')!;
    const created = new Date(wat(2026, 11, 10, 9)).toISOString();
    const t = { ...base, createdAt: created, priority: 'Normal' as const, firstReplyAt: null };
    expect(slaOf(t, wat(2026, 11, 10, 10)).state).toBe('ok');
    expect(slaOf(t, wat(2026, 11, 10, 12, 30)).state).toBe('soon');
    expect(slaOf(t, wat(2026, 11, 10, 14)).state).toBe('over');
    expect(slaOf({ ...t, firstReplyAt: new Date(wat(2026, 11, 10, 11)).toISOString() }).state).toBe(
      'met',
    );
    expect(
      slaOf({
        ...t,
        priority: 'Urgent',
        firstReplyAt: new Date(wat(2026, 11, 10, 11)).toISOString(),
      }).state,
    ).toBe('late');
  });
});

describe('support tickets API', () => {
  let greenfield: AxiosInstance;
  let crestview: AxiosInstance;
  beforeAll(async () => {
    greenfield = await signIn('adaeze.okonkwo@greenfield.edu.ng');
    crestview = await signIn('e.udo@crestviewcollege.ng');
  });

  it('lists the school’s tickets by tab and flags the ones waiting on the school', async () => {
    const open = (await greenfield.get<TicketList>('/v1/support/tickets')).data;
    expect(open.counts).toEqual({ open: 3, closed: 2, all: 5 });
    expect(open.rows.map((r) => r.status)).not.toContain('Closed');
    expect(open.attention.map((a) => a.id).sort()).toEqual(['SUP-1042', 'SUP-1046']);
    const closed = (
      await greenfield.get<TicketList>('/v1/support/tickets', { params: { tab: 'closed' } })
    ).data;
    expect(closed.rows.map((r) => r.id).sort()).toEqual(['SUP-0998', 'SUP-1046']);
    const found = (
      await greenfield.get<TicketList>('/v1/support/tickets', {
        params: { tab: 'all', search: 'mtn' },
      })
    ).data;
    expect(found.rows.map((r) => r.id)).toEqual(['SUP-1031']);

    const empty = (
      await crestview.get<TicketList>('/v1/support/tickets', { params: { tab: 'all' } })
    ).data;
    expect(empty.rows).toEqual([]);
    expect(empty.counts.all).toBe(0);
  });

  it('hides internal notes and other schools’ tickets', async () => {
    const t = (await greenfield.get<TicketDetail>('/v1/support/tickets/SUP-1042')).data;
    expect(t.messages.map((m) => m.from)).toEqual(['school', 'support']);
    expect(JSON.stringify(t)).not.toContain('Classic template');
    expect(await failure(crestview.get('/v1/support/tickets/SUP-1042'))).toMatchObject({
      status: 404,
    });
  });

  it('validates a new ticket and its attachments', async () => {
    const ok = {
      category: 'Fees & payments',
      priority: 'High',
      subject: 'Receipts not emailed',
      description: 'Parents who paid on Monday did not get an emailed receipt.',
      attachments: [],
    };
    const bad = async (patch: object) =>
      (await failure(crestview.post('/v1/support/tickets', { ...ok, ...patch }))).message;
    expect(await bad({ subject: '  ' })).toMatch(/subject/);
    expect(await bad({ description: 'Too short' })).toMatch(/at least 20/);
    expect(await bad({ category: 'Billing' })).toMatch(/category/);
    expect(await bad({ subject: 'x'.repeat(121) })).toMatch(/120/);
    const file = { name: 'a.png', type: 'image/png', bytes: 1000, dataUrl: null };
    expect(await bad({ attachments: [file, file, file, file] })).toMatch(/up to 3/);
    expect(
      await bad({ attachments: [{ ...file, name: 'a.docx', type: 'application/msword' }] }),
    ).toMatch(/isn’t supported/);
    expect(await bad({ attachments: [{ ...file, bytes: 11 * 1024 * 1024 }] })).toMatch(/10 MB/);

    const created = (
      await crestview.post<TicketDetail>('/v1/support/tickets', { ...ok, attachments: [file] })
    ).data;
    expect(created).toMatchObject({
      status: 'Open',
      team: 'Tier 1 Support',
      assignee: null,
      priority: 'High',
      can: { reply: true, close: true, confirm: false, reopen: false, followUp: false },
    });
    expect(created.id).toMatch(/^SUP-\d{4}$/);
    expect(created.sla.targetHours).toBe(2);
    expect(created.messages[0]!.attachments).toHaveLength(1);
    // The same ticket submitted again straight away is refused.
    expect(await failure(crestview.post('/v1/support/tickets', ok))).toMatchObject({ status: 409 });
  });

  it('moves a ticket back to support when the school replies', async () => {
    const t = (
      await greenfield.post<TicketDetail>('/v1/support/tickets/SUP-1042/replies', {
        text: 'We use the Classic template. PDF attached.',
        attachments: [{ name: 'jss2.pdf', type: 'application/pdf', bytes: 200_000, dataUrl: null }],
      })
    ).data;
    expect(t.status).toBe('In progress');
    expect(t.needsYou).toBe(false);
    expect(t.messages).toHaveLength(3);
    expect(
      (await failure(greenfield.post('/v1/support/tickets/SUP-1042/replies', { text: ' ' })))
        .message,
    ).toMatch(/message/);
  });

  it('confirms or reopens a resolved ticket, and only follows up closed ones', async () => {
    expect(
      (await failure(greenfield.post('/v1/support/tickets/SUP-1046/replies', { text: 'Hello' })))
        .status,
    ).toBe(409);
    expect(
      (await failure(greenfield.post('/v1/support/tickets/SUP-1046/reopen', { reason: 'no' })))
        .message,
    ).toMatch(/at least 10/);
    const reopened = (
      await greenfield.post<TicketDetail>('/v1/support/tickets/SUP-1046/reopen', {
        reason: 'Lekki receipts still show the old address.',
      })
    ).data;
    expect(reopened).toMatchObject({ status: 'Open', reopenCount: 1 });

    expect(
      (await failure(greenfield.post('/v1/support/tickets/SUP-1031/confirm', { rating: 5 })))
        .status,
    ).toBe(409);

    const closed = (
      await greenfield.post<TicketDetail>('/v1/support/tickets/SUP-1031/close', {
        reason: 'Provider fixed the route',
      })
    ).data;
    expect(closed).toMatchObject({ status: 'Closed', can: { reply: false, followUp: true } });
    expect(
      (
        await failure(
          greenfield.post('/v1/support/tickets/SUP-1031/reopen', {
            reason: 'It is back again today',
          }),
        )
      ).message,
    ).toMatch(/follow-up/);

    const desc = 'The MTN failures are back for this week’s reminder.';
    expect(
      (
        await failure(
          greenfield.post('/v1/support/tickets', {
            category: 'Communication',
            priority: 'Normal',
            subject: 'Follow-up',
            description: desc,
            followUpOf: 'SUP-1042',
          }),
        )
      ).status,
    ).toBe(409);
    const follow = (
      await greenfield.post<TicketDetail>('/v1/support/tickets', {
        category: 'Communication',
        priority: 'Normal',
        subject: 'Follow-up: Bulk SMS to parents not delivered on MTN numbers',
        description: desc,
        followUpOf: 'SUP-1031',
      })
    ).data;
    expect(follow.followUpOf).toBe('SUP-1031');
    const original = (await greenfield.get<TicketDetail>('/v1/support/tickets/SUP-1031')).data;
    expect(original.followUps).toContain(follow.id);
  });

  it('closes a resolved ticket by itself after 7 days without an answer', async () => {
    const t = tickets.find((x) => x.id === 'SUP-0998')!;
    const copy = {
      ...t,
      id: 'SUP-9001',
      status: 'Resolved' as const,
      resolvedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      closedAt: null,
      events: [],
      messages: [...t.messages],
    };
    tickets.push(copy);
    const view = (await greenfield.get<TicketDetail>('/v1/support/tickets/SUP-9001')).data;
    expect(view.status).toBe('Closed');
    expect(view.events[0]!.title).toMatch(/Closed automatically/);
  });
});
