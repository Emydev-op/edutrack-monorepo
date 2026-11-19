import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const DAY = 86_400_000;
const HOST = 'greenfield.localhost';

interface TermView {
  id: string;
  name: string;
  start: string;
  end: string;
  status: string;
}

/**
 * Academics › Sessions & Terms closing and the Academic calendar, on Greenfield's current
 * session: a term closes after its end date (then read-only, the next term active), a session
 * closes once it's Closing with every term closed, and school holidays close registers.
 */
describe('Term closing and the academic calendar (e2e)', () => {
  let t: TestApp;
  let admin: Api;

  const sessions = async () => (await admin.get('/api/v1/academics/sessions')).body.data;
  const current = async () => {
    const v = await sessions();
    return v.sessions.find((s: { id: string }) => s.id === v.currentId) as {
      id: string;
      name: string;
      status: string;
      terms: TermView[];
    };
  };
  // Moving the clock ends sessions, so sign in again on the new day.
  const at = async (iso: string) => {
    t.clock.set(Date.parse(`${iso}T09:00:00Z`));
    // Months later the password would have expired (the school asks every 90 days).
    await t.prisma.user.update({
      where: { email: 'adaeze.okonkwo@greenfield.edu.ng' },
      data: { passwordChangedAt: t.clock.now() },
    });
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  };
  const weekdayIn = (term: TermView, after: string) => {
    let d = new Date(`${after > term.start ? after : term.start}T00:00:00Z`);
    for (;;) {
      d = new Date(d.getTime() + DAY);
      const iso = d.toISOString().slice(0, 10);
      if (iso > term.end) return null;
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) return iso;
    }
  };

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    t.clock.set(Date.now());
    await t.reseed();
    await t.close();
  });

  describe('the calendar', () => {
    it('lists term dates, public holidays and school events', async () => {
      const v = (await admin.get('/api/v1/academics/calendar')).body.data;
      const s = await current();
      expect(v.session).toBe(s.name);
      expect(v.events.some((e: { source: string }) => e.source === 'term')).toBe(true);
      expect(v.events).toEqual(
        [...v.events].sort((a: { start: string }, b: { start: string }) =>
          a.start.localeCompare(b.start),
        ),
      );
    });

    it('adds a holiday that closes the register, and edits and removes it', async () => {
      const s = await current();
      const term = s.terms.find((x) => x.status === 'Active')!;
      const today = new Date(t.clock.now()).toISOString().slice(0, 10);
      const day = weekdayIn(term, today);
      if (!day) return; // No weekday left in the term.
      const bad = await admin
        .post('/api/v1/academics/calendar/events')
        .send({ title: 'Sports', type: 'Holiday', start: day, end: '2001-01-01' });
      expect(bad.status).toBe(422);
      expect(bad.body.message).toBe('The event ends before it starts.');
      const outside = await admin
        .post('/api/v1/academics/calendar/events')
        .send({ title: 'Sports', type: 'Event', start: '2001-01-01', end: '2001-01-01' });
      expect(outside.body.message).toMatch(/^Events must fall within/);

      const res = await admin.post('/api/v1/academics/calendar/events').send({
        title: 'Staff development day',
        type: 'Holiday',
        start: day,
        end: day,
        audience: 'Staff',
        notes: 'No classes.',
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Staff development day added to the calendar.');
      expect(res.body.data).toMatchObject({ source: 'custom', type: 'Holiday', audience: 'Staff' });
      const id = res.body.data.id as string;

      // The Teacher Workspace's register treats it as a day without school.
      await at(day);
      const okafor = authed(
        t,
        (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token,
        { host: HOST },
      );
      const reg = (await okafor.get(`/api/v1/class-teacher/register?date=${day}`)).body.data;
      expect(reg.lock?.code).toBe('NO_SCHOOL');
      await at(today);

      const edited = await admin
        .put(`/api/v1/academics/calendar/events/${id}`)
        .send({ title: 'Inter-house sports', type: 'Event', start: day, end: day });
      expect(edited.body.data).toMatchObject({ title: 'Inter-house sports', type: 'Event' });
      const termEvent = await admin
        .put(`/api/v1/academics/calendar/events/${s.terms[0]!.id}-end`)
        .send({ title: 'x', type: 'Event', start: day, end: day });
      expect(termEvent.status).toBe(404);
      expect((await admin.delete(`/api/v1/academics/calendar/events/${id}`)).body.data).toEqual({
        ok: true,
        title: 'Inter-house sports',
      });
    });
  });

  describe('closing', () => {
    it('only closes the active term, and only after its end date', async () => {
      const s = await current();
      const active = s.terms.find((x) => x.status === 'Active')!;
      const other = s.terms.find((x) => x.id !== active.id)!;
      expect((await admin.post(`/api/v1/academics/terms/${other.id}/close`)).body.error.code).toBe(
        'TERM_NOT_ACTIVE',
      );
      await at(active.start);
      const early = await admin.post(`/api/v1/academics/terms/${active.id}/close`);
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('TERM_NOT_READY');
      expect(early.body.message).toMatch(/^Available after/);
    });

    it('closes the term: read-only from then on, the next term active', async () => {
      const s = await current();
      const active = s.terms.find((x) => x.status === 'Active')!;
      const next = s.terms.find((x) => x.start > active.start && x.status === 'Upcoming');
      await at(new Date(Date.parse(`${active.end}T00:00:00Z`) + DAY).toISOString().slice(0, 10));
      const res = await admin.post(`/api/v1/academics/terms/${active.id}/close`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(
        next ? `Term closed. ${next.name} is now the active term.` : 'Term closed.',
      );
      const after = await current();
      expect(after.terms.find((x) => x.id === active.id)!.status).toBe('Closed');
      if (next) expect(after.terms.find((x) => x.id === next.id)!.status).toBe('Active');

      // Its assignments are read-only now.
      const assign = await admin.post('/api/v1/academics/assignments').send({
        termId: active.id,
        staffId: '00000000-0000-7000-8000-000000000000',
        armId: '00000000-0000-7000-8000-000000000000',
        subject: 'ENG',
      });
      expect([404, 409, 422]).toContain(assign.status);
    });

    it('closes a session only once it is Closing with every term closed', async () => {
      const s = await current();
      const check = (await admin.get(`/api/v1/academics/sessions/${s.id}/close`)).body.data;
      expect(check.checklist.canClose).toBe(false);
      expect(check.checklist.reason).toBe(
        `${s.name} is active. A session closes after the next one starts.`,
      );
      expect((await admin.post(`/api/v1/academics/sessions/${s.id}/close`)).status).toBe(409);

      // Close the remaining terms, then the next session starts (it moves to Closing).
      for (const term of s.terms.filter((x) => x.status !== 'Closed')) {
        await at(new Date(Date.parse(`${term.end}T00:00:00Z`) + DAY).toISOString().slice(0, 10));
        const r = await admin.post(`/api/v1/academics/terms/${term.id}/close`);
        expect(r.status).toBe(200);
      }
      await t.prisma.academicSession.update({ where: { id: s.id }, data: { status: 'CLOSING' } });
      const ready = (await admin.get(`/api/v1/academics/sessions/${s.id}/close`)).body.data;
      expect(ready.checklist.items[0]).toMatchObject({ label: 'Terms closed', status: 'Complete' });
      expect(ready.checklist.canClose).toBe(true);

      const closed = await admin.post(`/api/v1/academics/sessions/${s.id}/close`);
      expect(closed.status).toBe(200);
      expect(closed.body.message).toBe(`${s.name} closed. It is now read-only.`);
      expect(closed.body.data.session.status).toBe('Closed');
      expect(
        await t.prisma.enrollment.count({ where: { sessionId: s.id, status: 'ACTIVE' } }),
      ).toBe(0);
      expect((await admin.post(`/api/v1/academics/sessions/${s.id}/close`)).status).toBe(409);
    });
  });
});
