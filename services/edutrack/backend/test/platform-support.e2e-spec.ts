import { DailyChecksService } from '../src/platform/alerts/daily-checks.service.js';
import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

// The smallest valid PNG (1×1, transparent).
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('Platform support desk (e2e)', () => {
  let t: TestApp;
  let tolu: Api;
  let ngozi: Api;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    tolu = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
    ngozi = authed(t, (await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' })).token);
    for (const email of ['tolu', 'ngozi', 'ibrahim', 'funmi', 'kemi'])
      ids[email] = (
        await t.prisma.user.findUniqueOrThrow({ where: { email: `${email}@edutrack.ng` } })
      ).id;
  });

  afterAll(async () => {
    await t.close();
  });

  describe('reading', () => {
    it('lists agents with their team and load, and the summary counts', async () => {
      const agents = await tolu.get('/api/v1/platform/support/agents');
      // Other test files leave extra active staff in the shared test database.
      expect(agents.body).toEqual(
        expect.arrayContaining([
          { id: ids.funmi, name: 'Funmi Adebayo', team: 'Billing', open: 1 },
          { id: ids.ibrahim, name: 'Ibrahim Yusuf', team: 'Technical', open: 3 },
          { id: ids.ngozi, name: 'Ngozi Okafor', team: 'Tier 1 Support', open: 2 },
          { id: ids.tolu, name: 'Tolu Bamidele', team: 'Tier 1 Support', open: 0 },
        ]),
      );
      expect(agents.body.some((a: { id: string }) => a.id === ids.kemi)).toBe(false);

      const summary = await ngozi.get('/api/v1/platform/support/summary');
      expect(summary.body).toMatchObject({
        open: 8,
        unassigned: 2,
        escalated: 1,
        ratings: expect.any(Number),
        views: { open: 8, unassigned: 2, mine: 2 },
      });
      expect(summary.body.satisfaction).toBeGreaterThan(3);
      expect(summary.body.weeklyVolume).toHaveLength(5);
      expect(summary.body.weeklyVolume[0].label).toMatch(/^Wk \d+$/);
      expect(summary.body.topSchools[0]).toEqual({
        label: expect.any(String),
        value: expect.any(Number),
      });
    });

    it('filters by view, owner, priority, school and text', async () => {
      const list = (q: string) => tolu.get(`/api/v1/platform/support/issues?pageSize=50&${q}`);
      const numbers = (res: { body: { data: { id: string }[] } }) => res.body.data.map((i) => i.id);

      expect((await list('')).body.meta.total).toBe(8);
      expect(numbers(await list('view=unassigned')).sort()).toEqual(['SUP-1171', 'SUP-1174']);
      expect(numbers(await list('view=waiting')).sort()).toEqual(['SUP-1031', 'SUP-1179']);
      expect(numbers(await list('view=escalated'))).toEqual(['SUP-1180']);
      expect(numbers(await list('view=resolved'))).toEqual(['SUP-1170']);
      expect((await list('view=all')).body.meta.total).toBe(47);
      expect(numbers(await list('assignee=Ibrahim%20Yusuf')).sort()).toEqual([
        'SUP-1031',
        'SUP-1176',
        'SUP-1179',
      ]);
      expect(numbers(await list('assignee=Unassigned'))).toHaveLength(2);
      expect(numbers(await list('priority=Urgent'))).toEqual(['SUP-1182']);
      expect(numbers(await list('search=paystack'))).toEqual(['SUP-1180']);
      const greenfield = await t.prisma.school.findFirstOrThrow({ where: { slug: 'greenfield' } });
      expect(numbers(await list(`schoolId=${greenfield.id}`)).sort()).toEqual([
        'SUP-1031',
        'SUP-1042',
        'SUP-1171',
      ]);
      // Overdue is worked out from the SLA clocks; every overdue ticket is open.
      const overdue = await list('view=overdue');
      expect(overdue.status).toBe(200);
      expect(
        overdue.body.data.every(
          (i: { sla: { firstReply: { state: string }; resolution: { state: string } } }) =>
            i.sla.firstReply.state === 'over' || i.sla.resolution.state === 'over',
        ),
      ).toBe(true);
      expect((await list('view=lunch')).status).toBe(422);
    });

    it('shows a ticket with its conversation and timeline', async () => {
      const res = await tolu.get('/api/v1/platform/support/issues/sup-1182');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 'SUP-1182',
        schoolName: 'Kingsway International School',
        status: 'In Progress',
        priority: 'Urgent',
        assignee: 'Ngozi Okafor',
        assigneeId: ids.ngozi,
        team: 'Tier 1 Support',
        sla: { firstReply: { state: 'met' }, targets: [1, 8] },
      });
      expect(res.body.messages.map((m: { kind: string }) => m.kind)).toEqual([
        'school',
        'agent',
        'note',
        'agent',
      ]);
      expect(res.body.messages[0].authorRole).toBe('School Admin · Kingsway International School');
      expect(res.body.events[1]).toMatchObject({
        title: 'Priority High → Urgent',
        detail: 'Ngozi Okafor · internal',
        tone: 'warning',
      });
      const escalated = await tolu.get('/api/v1/platform/support/issues/SUP-1180');
      expect(escalated.body).toMatchObject({
        escalatedTo: 'Billing specialist',
        escalatedFrom: 'Tolu Bamidele',
      });
      expect((await tolu.get('/api/v1/platform/support/issues/SUP-9999')).status).toBe(404);
    });
  });

  describe('working a ticket', () => {
    let number: string;
    const path = () => `/api/v1/platform/support/issues/${number}`;
    const move = (api: Api, body: object) => api.post(`${path()}/transitions`).send(body);

    it('raises a ticket for a school, with an attachment, and alerts the desk', async () => {
      const kingsway = await t.prisma.school.findFirstOrThrow({ where: { slug: 'kingsway' } });
      const base = {
        schoolId: kingsway.id,
        requester: 'Mr. Femi Adeyemi · Bursar',
        subject: 'Fee reminders sent twice',
        description: 'Parents got the same fee reminder twice this morning.',
        category: 'Billing',
        priority: 'Urgent',
        assignee: null,
      };
      const bad = await tolu.post('/api/v1/platform/support/issues').send({
        ...base,
        attachment: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`,
      });
      expect(bad.status).toBe(422);
      expect(bad.body.code).toBe('ATTACHMENT_TYPE');
      const notAgent = await tolu
        .post('/api/v1/platform/support/issues')
        .send({ ...base, assignee: ids.kemi });
      expect(notAgent.body.code).toBe('NOT_AN_AGENT');

      const res = await tolu
        .post('/api/v1/platform/support/issues')
        .send({ ...base, attachment: PNG, attachmentName: 'screenshot.png' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: 'SUP-1183',
        status: 'Open',
        team: 'Billing',
        assignee: null,
        requester: 'Mr. Femi Adeyemi · Bursar',
        sla: { targets: [1, 8] },
      });
      number = res.body.id as string;

      const detail = await tolu.get(path());
      expect(detail.body.messages).toEqual([
        expect.objectContaining({
          kind: 'school',
          author: 'Mr. Femi Adeyemi',
          authorRole: 'Bursar · Kingsway International School',
          attachments: [
            {
              name: 'screenshot.png',
              url: expect.stringMatching(/^https:\/\/storage\.test\/schools\/.+\.png$/),
            },
          ],
        }),
      ]);
      expect(detail.body.events[0].detail).toBe(
        'Raised by Tolu Bamidele for Mr. Femi Adeyemi · routed to Billing',
      );

      const alerted = await t.prisma.notification.findMany({
        where: {
          entityId: (await t.prisma.supportTicket.findUniqueOrThrow({ where: { number } })).id,
        },
        select: { userId: true, category: true },
      });
      expect(alerted).toEqual(
        expect.arrayContaining([
          { userId: ids.ngozi, category: 'issue.created' },
          { userId: ids.ngozi, category: 'issue.urgent' },
        ]),
      );
      expect(alerted.some((a) => a.userId === ids.tolu)).toBe(false);
    });

    it('a first reply picks the ticket up; notes change nothing', async () => {
      const note = await ngozi
        .post(`${path()}/messages`)
        .send({ kind: 'note', text: 'Probably the retry job.' });
      expect(note.status).toBe(200);
      expect((await ngozi.get(path())).body.status).toBe('Open');

      await ngozi.post(`${path()}/messages`).send({ kind: 'agent', text: 'Looking into it now.' });
      const after = await ngozi.get(path());
      expect(after.body).toMatchObject({
        status: 'In Progress',
        assignee: 'Ngozi Okafor',
        team: 'Tier 1 Support',
        sla: { firstReply: { state: 'met', label: 'Met' } },
      });
      expect(after.body.events).toContainEqual(
        expect.objectContaining({ title: 'Picked up by Ngozi Okafor · first reply sent' }),
      );
      expect(
        (await ngozi.post(`${path()}/messages`).send({ kind: 'agent', text: '  ' })).status,
      ).toBe(422);
    });

    it('waits for the school, escalates to the least-busy specialist, and resolves', async () => {
      expect((await move(ngozi, { to: 'Waiting for School' })).status).toBe(422);
      const waiting = await move(ngozi, {
        to: 'Waiting for School',
        note: 'Which classes got two reminders?',
      });
      expect(waiting.body).toMatchObject({
        status: 'Waiting for School',
        sla: { resolution: { state: 'paused' } },
      });
      expect((await move(ngozi, { to: 'Escalated', option: 'Technical', note: 'x' })).status).toBe(
        409,
      );
      await move(ngozi, { to: 'In Progress' });

      const escalated = await move(ngozi, {
        to: 'Escalated',
        option: 'Technical',
        note: 'Duplicate sends from the scheduler',
      });
      expect(escalated.body).toMatchObject({
        status: 'Escalated',
        assignee: 'Ibrahim Yusuf',
        team: 'Technical',
        escalatedTo: 'Tier 2 · Technical',
        escalatedFrom: 'Ngozi Okafor',
      });

      expect((await move(ngozi, { to: 'Resolved', note: 'Fixed' })).status).toBe(422);
      const resolved = await move(ngozi, {
        to: 'Resolved',
        option: 'Fixed',
        note: 'Duplicate scheduler job removed.',
      });
      expect(resolved.body).toMatchObject({
        status: 'Resolved',
        resolution: 'Duplicate scheduler job removed.',
        resolutionType: 'Fixed',
        sla: { resolution: { state: 'met' } },
      });
      const row = await t.prisma.supportTicket.findUniqueOrThrow({ where: { number } });
      expect(row.autoCloseAt!.getTime() - row.resolvedAt!.getTime()).toBe(7 * 86_400_000);
      expect((await move(ngozi, { to: 'In Progress' })).status).toBe(409);

      const detail = await ngozi.get(path());
      expect(detail.body.messages).toContainEqual(
        expect.objectContaining({ kind: 'agent', text: 'Duplicate scheduler job removed.' }),
      );
    });

    it('reopens, and closes without resolving only with a reason', async () => {
      expect((await move(tolu, { to: 'Reopened' })).status).toBe(422);
      const reopened = await move(tolu, { to: 'Reopened', note: 'Happened again today' });
      expect(reopened.body).toMatchObject({
        status: 'Reopened',
        reopenCount: 1,
        resolution: null,
        escalatedTo: null,
      });
      expect((await move(tolu, { to: 'Closed', note: 'x' })).status).toBe(422);
      const closed = await move(tolu, {
        to: 'Closed',
        option: 'Duplicate',
        note: 'Tracked in SUP-1182.',
      });
      expect(closed.body).toMatchObject({ status: 'Closed', resolutionType: 'Duplicate' });
      const reply = await tolu.post(`${path()}/messages`).send({ kind: 'agent', text: 'Hi' });
      expect(reply.body.code).toBe('ISSUE_CLOSED');
      expect((await tolu.patch(path()).send({ assignee: ids.ngozi })).body.code).toBe('ISSUE_DONE');
    });

    it('escalating to a team nobody is in leaves it in that team’s queue', async () => {
      const res = await move(ngozi, {
        to: 'Escalated',
        option: 'Engineering',
        note: 'Needs a code change',
      });
      // SUP-1182 is In Progress with Ngozi.
      expect(res.status).toBe(409);
      const ok = await ngozi
        .post('/api/v1/platform/support/issues/SUP-1182/transitions')
        .send({ to: 'Escalated', option: 'Engineering', note: 'Needs a code change' });
      expect(ok.body).toMatchObject({
        assignee: null,
        team: 'Engineering',
        escalatedTo: 'Engineering',
      });
    });
  });

  describe('assigning and triage', () => {
    const path = '/api/v1/platform/support/issues/SUP-1174';

    it('assigns, needs a reason to reassign, and changes priority and category', async () => {
      expect((await tolu.patch(path).send({ assignee: ids.kemi })).body.code).toBe('NOT_AN_AGENT');
      const assigned = await tolu.patch(path).send({ assignee: ids.funmi });
      expect(assigned.body).toMatchObject({
        status: 'Assigned',
        assignee: 'Funmi Adebayo',
        team: 'Billing',
      });
      expect((await tolu.patch(path).send({ assignee: ids.ngozi })).status).toBe(422);
      const moved = await tolu
        .patch(path)
        .send({ assignee: ids.ngozi, reason: 'Needs account context' });
      expect(moved.body).toMatchObject({ assignee: 'Ngozi Okafor', team: 'Tier 1 Support' });

      const triaged = await tolu.patch(path).send({ priority: 'Urgent', category: 'Subscription' });
      expect(triaged.body).toMatchObject({ priority: 'Urgent', category: 'Subscription' });
      const events = (await tolu.get(path)).body.events as { title: string; detail: string }[];
      expect(events.map((e) => e.title)).toEqual(
        expect.arrayContaining([
          'Assigned to Funmi Adebayo · Billing',
          'Reassigned from Funmi Adebayo to Ngozi Okafor · Tier 1 Support · Needs account context',
          'Priority Normal → Urgent',
          'Category Billing → Subscription',
        ]),
      );
      expect(events.find((e) => e.title.startsWith('Priority'))?.detail).toBe(
        'Tolu Bamidele · internal',
      );
      const audit = await t.prisma.auditEvent.findFirst({
        where: { action: 'issue.reassign' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.summary).toBe('Ticket reassigned · SUP-1174');
      expect(
        await t.prisma.notification.count({
          where: { userId: ids.ngozi, category: 'issue.urgent', title: 'SUP-1174 is now urgent' },
        }),
      ).toBe(1);
    });

    it('needs Support.Edit to work tickets', async () => {
      const viewer = await t.prisma.platformRole.create({
        data: {
          name: `Support viewer ${Date.now()}`,
          description: 'Test',
          permissions: { Support: ['View'] },
        },
      });
      const funmi = await t.prisma.platformStaff.findUniqueOrThrow({
        where: { userId: ids.funmi },
      });
      await t.prisma.platformStaff.update({ where: { id: funmi.id }, data: { roleId: viewer.id } });
      try {
        const api = authed(t, (await signIn(t, 'funmi@edutrack.ng', { portal: 'platform' })).token);
        expect((await api.get('/api/v1/platform/support/issues')).status).toBe(200);
        expect((await api.patch(path).send({ priority: 'Low' })).status).toBe(403);
        expect((await api.post('/api/v1/platform/support/issues').send({})).status).toBe(403);
        // Without Support.Edit she is no longer someone tickets can be given to.
        const agents = await tolu.get('/api/v1/platform/support/agents');
        expect(agents.body.some((a: { id: string }) => a.id === ids.funmi)).toBe(false);
      } finally {
        await t.prisma.platformStaff.update({
          where: { id: funmi.id },
          data: { roleId: funmi.roleId },
        });
        await t.prisma.platformRole.delete({ where: { id: viewer.id } });
      }
    });
  });

  describe('staff teams and the daily checks', () => {
    it('sets a staff member’s support team', async () => {
      const user = (await tolu.get(`/api/v1/platform/users/${ids.ibrahim}`)).body;
      expect(user.supportTeam).toBe('Technical');
      const details = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        roleId: user.roleId,
      };
      const bad = await tolu
        .patch(`/api/v1/platform/users/${ids.ibrahim}`)
        .send({ ...details, supportTeam: 'Lunch' });
      expect(bad.status).toBe(422);
      const moved = await tolu
        .patch(`/api/v1/platform/users/${ids.ibrahim}`)
        .send({ ...details, supportTeam: 'Engineering' });
      expect(moved.body.supportTeam).toBe('Engineering');
      // Leaving it out keeps it.
      const kept = await tolu.patch(`/api/v1/platform/users/${ids.ibrahim}`).send(details);
      expect(kept.body.supportTeam).toBe('Engineering');
      const audit = await t.prisma.auditEvent.findFirst({
        where: { action: 'user.support_team' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.summary).toBe('Support team changed · Ibrahim Yusuf to Engineering');
      await tolu
        .patch(`/api/v1/platform/users/${ids.ibrahim}`)
        .send({ ...details, supportTeam: 'Technical' });
    });

    it('closes resolved tickets the school didn’t answer', async () => {
      await t.prisma.supportTicket.update({
        where: { number: 'SUP-1170' },
        data: { autoCloseAt: new Date(Date.now() - 60_000) },
      });
      const result = await t.app.get(DailyChecksService).run();
      expect(result.ticketsClosed).toBeGreaterThanOrEqual(1);
      const res = await tolu.get('/api/v1/platform/support/issues/SUP-1170');
      expect(res.body.status).toBe('Closed');
      expect(res.body.events).toContainEqual(
        expect.objectContaining({
          title: 'Closed automatically · no reply from the school in 7 days',
          detail: 'EduTrack · school can see',
        }),
      );
    });
  });
});
