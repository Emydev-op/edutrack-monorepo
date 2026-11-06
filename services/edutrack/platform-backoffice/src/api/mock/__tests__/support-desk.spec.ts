import axios, { isAxiosError } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type { SupportIssue, SupportIssueDetail, SupportSummary } from '@/types';

import { installMockApi } from '..';

const api = axios.create({ baseURL: '/api' });
const get = async (id: string) =>
  (await api.get<SupportIssueDetail>(`/v1/support/issues/${id}`)).data;
const move = (id: string, body: object) =>
  api.post<SupportIssue>(`/v1/support/issues/${id}/transitions`, body);
const statusOf = async (request: Promise<unknown>) => {
  try {
    await request;
  } catch (e) {
    if (isAxiosError(e)) return e.response?.status;
  }
  throw new Error('Expected the request to fail');
};

describe('support desk workflow', () => {
  beforeAll(() => installMockApi(api));

  it('reports SLA clocks: overdue first replies, paused waits and met resolutions', async () => {
    const unowned = await get('SUP-1174'); // Normal, 30h old, no reply yet
    expect(unowned.sla.firstReply).toMatchObject({ state: 'over' });
    expect(unowned.sla.firstReply.label).toMatch(/^Overdue by /);
    expect((await get('SUP-1179')).sla.resolution).toEqual({
      state: 'paused',
      label: 'Paused · waiting for school',
    });
    expect((await get('SUP-1163')).sla.resolution.state).toBe('met');

    const { data } = await api.get<SupportSummary>('/v1/support/summary');
    expect(data.overdue).toBeGreaterThan(0);
    expect(data.escalated).toBe(1);
    expect(data.satisfaction).toBe(4.5);
  });

  it('lists views: unassigned, overdue and waiting / on hold', async () => {
    const ids = async (view: string) =>
      (await api.get('/v1/support/issues', { params: { view } })).data.data.map(
        (i: SupportIssue) => i.id,
      );
    expect(await ids('unassigned')).toEqual(['SUP-1174', 'SUP-1171']);
    expect(await ids('overdue')).toContain('SUP-1174');
    expect(await ids('waiting')).toEqual(['SUP-1179', 'SUP-1031']);
  });

  it(
    'runs a ticket from assignment to escalation, resolution, reopening and closing',
    { timeout: 30_000 },
    async () => {
      await api.patch('/v1/support/issues/SUP-1171', { assignee: 'Tolu Bamidele' });
      let t = await get('SUP-1171');
      expect(t).toMatchObject({ status: 'Assigned', team: 'Tier 1 Support' });

      // Reassigning needs a reason; the new owner's team follows.
      expect(
        await statusOf(api.patch('/v1/support/issues/SUP-1171', { assignee: 'Chidi Eze' })),
      ).toBe(422);
      await api.patch('/v1/support/issues/SUP-1171', {
        assignee: 'Chidi Eze',
        reason: 'Needs a permissions fix',
      });
      expect((await get('SUP-1171')).team).toBe('Technical');

      await move('SUP-1171', { to: 'In Progress' });
      t = await get('SUP-1171');
      expect(t.sla.firstReply.state).toBe('met');

      // Asking the school pauses the clock and sends the question.
      await move('SUP-1171', {
        to: 'Waiting for School',
        note: 'Which role does the bursar have?',
      });
      t = await get('SUP-1171');
      expect(t.sla.resolution.state).toBe('paused');
      expect(t.messages[0]?.kind).toBe('school');
      expect(t.messages[t.messages.length - 1]).toMatchObject({
        kind: 'agent',
        text: 'Which role does the bursar have?',
      });

      await move('SUP-1171', { to: 'In Progress' });
      await move('SUP-1171', { to: 'Escalated', option: 'Engineering', note: 'Looks like a bug' });
      t = await get('SUP-1171');
      expect(t).toMatchObject({
        status: 'Escalated',
        assignee: 'Engineering on-call',
        escalatedTo: 'Engineering',
        escalatedFrom: 'Chidi Eze',
      });

      expect(await statusOf(move('SUP-1171', { to: 'Resolved', option: 'Fixed' }))).toBe(422);
      await move('SUP-1171', { to: 'Resolved', option: 'Fixed', note: 'Permission restored.' });
      t = await get('SUP-1171');
      expect(t).toMatchObject({ status: 'Resolved', resolution: 'Permission restored.' });

      await move('SUP-1171', { to: 'Reopened', note: 'Still missing for one bursar' });
      t = await get('SUP-1171');
      expect(t).toMatchObject({ status: 'Reopened', reopenCount: 1, resolution: null });

      // Closing an unresolved ticket needs a reason; a closed one can't take replies.
      await move('SUP-1171', { to: 'Closed', option: 'Duplicate', note: 'Tracked in SUP-1174.' });
      expect((await get('SUP-1171')).status).toBe('Closed');
      expect(
        await statusOf(
          api.post('/v1/support/issues/SUP-1171/messages', { kind: 'agent', text: 'Hello' }),
        ),
      ).toBe(409);
    },
  );

  it('refuses steps the status doesn’t allow', async () => {
    expect(await statusOf(move('SUP-1174', { to: 'Resolved', option: 'Fixed', note: 'x' }))).toBe(
      409,
    );
  });

  it('picks up an unowned ticket on the first reply', async () => {
    await api.post('/v1/support/issues/SUP-1174/messages', { kind: 'agent', text: 'On it.' });
    expect(await get('SUP-1174')).toMatchObject({
      status: 'In Progress',
      assignee: 'Tolu Bamidele',
      sla: { firstReply: { state: 'met' } },
    });
  });
});
