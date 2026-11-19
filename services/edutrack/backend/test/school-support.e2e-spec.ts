import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

// The smallest valid PNG (1×1, transparent).
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const ADAEZE = 'adaeze.okonkwo@greenfield.edu.ng';

/**
 * School Admin › Support against the platform desk: Greenfield's admin raises and follows tickets,
 * EduTrack support answers from the back office, and each side hears about the other's moves.
 */
describe('School support tickets (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let kingsway: Api;
  let ngozi: Api;
  let adaezeId: string;
  let ngoziId: string;
  let number: string;

  const school = (path = '') => `/api/v1/support/tickets${path}`;
  const desk = (n: string) => `/api/v1/platform/support/issues/${n}`;
  const move = (n: string, body: object) => ngozi.post(`${desk(n)}/transitions`).send(body);
  const ticket = async (n: string) => (await admin.get(school(`/${n}`))).body.data;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, ADAEZE)).token);
    kingsway = authed(t, (await signIn(t, 'ifeoma.briggs@kingsway.edu.ng')).token);
    ngozi = authed(t, (await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' })).token);
    adaezeId = (await t.prisma.user.findUniqueOrThrow({ where: { email: ADAEZE } })).id;
    ngoziId = (await t.prisma.user.findUniqueOrThrow({ where: { email: 'ngozi@edutrack.ng' } })).id;
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  describe('reading', () => {
    it('lists the school’s tickets by tab, with what needs the school', async () => {
      const open = (await admin.get(school())).body.data;
      expect(open.counts).toEqual({ open: 3, closed: 6, all: 9 });
      expect(open.rows.map((r: { id: string }) => r.id).sort()).toEqual([
        'SUP-1031',
        'SUP-1042',
        'SUP-1171',
      ]);
      expect(open.attention).toEqual([
        { id: 'SUP-1170', subject: 'Change sibling discount rule', status: 'Resolved' },
      ]);
      const row = open.rows.find((r: { id: string }) => r.id === 'SUP-1042');
      expect(row).toMatchObject({
        status: 'Open',
        statusLabel: 'Awaiting support',
        needsYou: false,
      });
      expect(row.sla).toMatchObject({ state: expect.any(String), targetHours: expect.any(Number) });

      const closed = (await admin.get(school('?tab=closed'))).body.data;
      expect(closed.meta.total).toBe(6);
      expect(closed.rows.map((r: { id: string }) => r.id)).toEqual(
        expect.arrayContaining(['SUP-1170', 'SUP-1105']),
      );
      const found = (await admin.get(school('?tab=all&search=signature'))).body.data;
      expect(found.rows.map((r: { id: string }) => r.id)).toEqual(['SUP-1042']);
    });

    it('shows the conversation without the desk’s internal notes', async () => {
      const v = await ticket('SUP-1042');
      expect(v.messages.length).toBeGreaterThan(1);
      expect(
        v.messages.every((m: { from: string }) => ['school', 'support'].includes(m.from)),
      ).toBe(true);
      const notes = await t.prisma.supportTicketMessage.findMany({
        where: { ticket: { number: 'SUP-1042' }, kind: 'NOTE' },
      });
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes)
        expect(v.messages.some((m: { id: string }) => m.id === n.id)).toBe(false);
      expect(v.can).toEqual({
        reply: true,
        confirm: false,
        reopen: false,
        close: true,
        followUp: false,
      });
    });

    it('keeps tickets to their school and to School Admin', async () => {
      expect((await kingsway.get(school('/SUP-1042'))).status).toBe(404);
      const theirs = (await kingsway.get(school('?tab=all'))).body.data.rows;
      expect(theirs.some((r: { id: string }) => r.id === 'SUP-1042')).toBe(false);

      const teacher = authed(
        t,
        (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: 'greenfield.localhost' })).token,
        {
          host: 'greenfield.localhost',
        },
      );
      expect((await teacher.get(school())).status).toBe(403);
    });
  });

  describe('a ticket from start to finish', () => {
    const base = {
      category: 'Results & report cards',
      priority: 'High',
      subject: 'Positions missing on JSS 1 report cards',
      description: 'The JSS 1 report cards print without class positions since this morning.',
    };

    it('checks what the school sends', async () => {
      const bad = async (body: object) => (await admin.post(school()).send(body)).status;
      expect(await bad({ ...base, category: 'Billing' })).toBe(422);
      expect(await bad({ ...base, description: 'Too short' })).toBe(422);
      expect(await bad({ ...base, subject: 'x'.repeat(121) })).toBe(422);
      const fake = await admin.post(school()).send({
        ...base,
        attachments: [
          {
            name: 'shot.png',
            type: 'image/png',
            bytes: 10,
            dataUrl: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`,
          },
        ],
      });
      expect(fake.status).toBe(422);
      expect(fake.body.error.code).toBe('ATTACHMENT_TYPE');
      const four = Array.from({ length: 4 }, (_, i) => ({
        name: `${i}.png`,
        type: 'image/png',
        bytes: 68,
        dataUrl: PNG,
      }));
      expect(await bad({ ...base, attachments: four })).toBe(422);
    });

    it('raises a ticket with an attachment and alerts the desk', async () => {
      const res = await admin.post(school()).send({
        ...base,
        attachments: [{ name: 'report.png', type: 'image/png', bytes: 68, dataUrl: PNG }],
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Ticket raised. Support will reply here.');
      number = res.body.data.id;
      expect(number).toMatch(/^SUP-\d{4,}$/);
      expect(res.body.data).toMatchObject({
        status: 'Open',
        category: 'Results & report cards',
        priority: 'High',
        requester: 'Adaeze Okonkwo',
        needsYou: false,
        sla: { targetHours: 4 },
      });
      expect(res.body.data.messages).toEqual([
        expect.objectContaining({
          from: 'school',
          author: 'Adaeze Okonkwo',
          authorRole: expect.stringContaining('Greenfield Academy'),
          attachments: [expect.objectContaining({ name: 'report.png', type: 'image/png' })],
        }),
      ]);

      const row = await t.prisma.supportTicket.findUniqueOrThrow({ where: { number } });
      expect(row).toMatchObject({
        requesterUserId: adaezeId,
        topic: 'RESULTS_AND_REPORT_CARDS',
        category: 'ACADEMIC',
        priority: 'HIGH',
      });
      const alerted = await t.prisma.notification.findMany({
        where: { entityId: row.id, userId: ngoziId },
        select: { category: true },
      });
      expect(alerted).toContainEqual({ category: 'issue.created' });

      const onDesk = (await ngozi.get(desk(number))).body.data;
      expect(onDesk).toMatchObject({ status: 'Open', requester: 'Adaeze Okonkwo' });
    });

    it('refuses the same ticket twice in a row', async () => {
      const again = await admin.post(school()).send(base);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('TICKET_DUPLICATE');
    });

    it('tells the school when support replies, by notification and email', async () => {
      t.notifications.clear();
      await ngozi
        .post(`${desk(number)}/messages`)
        .send({ kind: 'agent', text: 'Which arms are affected?' });
      await ngozi
        .post(`${desk(number)}/messages`)
        .send({ kind: 'note', text: 'Check the rank job.' });

      const v = await ticket(number);
      expect(v.status).toBe('In progress');
      expect(v.sla.state).toBe('met');
      expect(v.messages.map((m: { from: string; text: string }) => [m.from, m.text])).toEqual([
        ['school', base.description],
        ['support', 'Which arms are affected?'],
      ]);

      const bell = (await admin.get('/api/v1/notifications')).body.data;
      expect(bell[0]).toMatchObject({
        title: expect.stringContaining(number),
        detail: expect.any(String),
        unread: true,
        to: `/support/${number}`,
      });
      expect(t.notifications.find(ADAEZE, 'support-update')).toBeTruthy();
    });

    it('waits for the school, then goes back to support when the school answers', async () => {
      await move(number, {
        to: 'Waiting for School',
        note: 'Please send one affected report card.',
      });
      const waiting = await ticket(number);
      expect(waiting).toMatchObject({
        status: 'Waiting for School',
        statusLabel: 'Waiting on you',
        needsYou: true,
      });
      expect((await admin.get('/api/v1/nav-counts')).body.data.support).toBe(2);

      expect((await admin.post(school(`/${number}/replies`)).send({ text: '  ' })).status).toBe(
        422,
      );
      const replied = await admin.post(school(`/${number}/replies`)).send({
        text: 'JSS 1A and 1C. One attached.',
        attachments: [{ name: 'jss1a.png', type: 'image/png', bytes: 68, dataUrl: PNG }],
      });
      expect(replied.status).toBe(200);
      expect(replied.body.data.status).toBe('In progress');
      expect(replied.body.data.events).toContainEqual(
        expect.objectContaining({ title: 'School replied · back with support' }),
      );

      const onDesk = (await ngozi.get(desk(number))).body.data;
      expect(onDesk.status).toBe('In Progress');
      const alert = await t.prisma.notification.findFirst({
        where: { userId: ngoziId, category: 'issue.school_reply', link: `/support/${number}` },
      });
      expect(alert?.title).toBe(`Greenfield Academy replied on ${number}`);
    });

    it('reopens a resolution that didn’t work, then confirms the next one', async () => {
      await move(number, {
        to: 'Resolved',
        option: 'Fixed',
        note: 'Positions job re-run for JSS 1.',
      });
      let v = await ticket(number);
      expect(v).toMatchObject({
        status: 'Resolved',
        needsYou: true,
        resolution: 'Positions job re-run for JSS 1.',
      });
      expect(v.autoCloseAt).toBeTruthy();
      expect(v.can).toMatchObject({ reply: false, confirm: true, reopen: true });
      expect(
        (await admin.post(school(`/${number}/replies`)).send({ text: 'Hi' })).body.error.code,
      ).toBe('TICKET_RESOLVED');

      expect((await admin.post(school(`/${number}/reopen`)).send({ reason: 'No' })).status).toBe(
        422,
      );
      const reopened = await admin
        .post(school(`/${number}/reopen`))
        .send({ reason: 'JSS 1C still prints without positions.' });
      expect(reopened.body.data).toMatchObject({
        status: 'Open',
        reopenCount: 1,
        resolution: null,
      });
      expect((await ngozi.get(desk(number))).body.data.status).toBe('Reopened');

      // On the desk, a reply picks a reopened ticket back up.
      await ngozi
        .post(`${desk(number)}/messages`)
        .send({ kind: 'agent', text: 'Re-running JSS 1C.' });
      await move(number, { to: 'Resolved', option: 'Fixed', note: 'JSS 1C re-ranked too.' });
      expect((await admin.post(school(`/${number}/confirm`)).send({ rating: 6 })).status).toBe(422);
      const done = await admin.post(school(`/${number}/confirm`)).send({ rating: 5 });
      expect(done.body.data).toMatchObject({ status: 'Closed', rating: 5 });
      expect(done.body.data.can).toEqual({
        reply: false,
        confirm: false,
        reopen: false,
        close: false,
        followUp: true,
      });
      expect((await ngozi.get(desk(number))).body.data.status).toBe('Closed');
      expect(
        (await admin.post(school(`/${number}/reopen`)).send({ reason: 'Again it broke today.' }))
          .body.error.code,
      ).toBe('TICKET_CLOSED');
    });

    it('follows up a closed ticket, never an open one', async () => {
      const early = await admin.post(school()).send({
        ...base,
        subject: 'Positions again',
        followUpOf: 'SUP-1171',
      });
      expect(early.body.error.code).toBe('TICKET_ACTIVE');
      expect((await kingsway.post(school()).send({ ...base, followUpOf: number })).status).toBe(
        404,
      );

      const res = await admin.post(school()).send({
        ...base,
        subject: 'Positions missing again on JSS 1',
        followUpOf: number,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.followUpOf).toBe(number);
      expect((await ticket(number)).followUps).toEqual([res.body.data.id]);
    });

    it('closes a ticket the school no longer needs', async () => {
      expect((await admin.post(school('/SUP-1171/close')).send({ reason: '' })).status).toBe(422);
      const closed = await admin
        .post(school('/SUP-1171/close'))
        .send({ reason: 'Sorted it ourselves' });
      expect(closed.body.data).toMatchObject({ status: 'Closed' });
      expect(closed.body.data.events).toContainEqual(
        expect.objectContaining({
          title: 'School closed the ticket',
          detail: 'Adaeze Okonkwo · Sorted it ourselves',
        }),
      );
      expect((await admin.post(school('/SUP-1171/close')).send({ reason: 'again' })).status).toBe(
        409,
      );
    });
  });

  describe('the inbox', () => {
    it('pages the notifications and marks them read', async () => {
      const inbox = (await admin.get('/api/v1/comms/inbox?filter=unread')).body.data;
      expect(inbox.unread).toBeGreaterThan(0);
      expect(inbox.rows.every((n: { unread: boolean }) => n.unread)).toBe(true);

      const first = inbox.rows[0].id;
      expect((await kingsway.post(`/api/v1/notifications/${first}/read`)).status).toBe(404);
      expect((await admin.post(`/api/v1/notifications/${first}/read`)).status).toBe(200);
      await admin.post('/api/v1/notifications/read-all');
      const after = (await admin.get('/api/v1/comms/inbox')).body.data;
      expect(after.unread).toBe(0);
      expect(after.total).toBeGreaterThan(0);
    });
  });
});
