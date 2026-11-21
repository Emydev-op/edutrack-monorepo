import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';

/**
 * School Admin's header context: reads carry the working session, term and branch, so switching
 * to last session shows last session's records (seeded: 2025/2026 classes, JSS 1B's Third Term
 * registers and published results). Writes and the other portals ignore it.
 */
describe('School Admin working context (e2e)', () => {
  let t: TestApp;
  let admin: Api;

  const past = { 'X-EduTrack-Session': '2025%2F2026', 'X-EduTrack-Term': 'Third%20Term' };
  const get = (path: string, headers: Record<string, string> = {}) => admin.get(path).set(headers);

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  it('lists last session’s roll when switched to it', async () => {
    const now = (await get('/api/v1/students?pageSize=50')).body;
    const then = (await get('/api/v1/students?pageSize=50', past)).body;
    expect(now.success).toBe(true);
    expect(then.success).toBe(true);
    const names = (b: { data: { rows?: unknown[]; data?: unknown[] } }) =>
      JSON.stringify(b.data).match(/JSS \d ?[A-Z]?/g) ?? [];
    expect(JSON.stringify(then.data)).not.toEqual(JSON.stringify(now.data));
    expect(names(then)).toEqual(expect.arrayContaining([expect.stringMatching(/^JSS 1/)]));
  });

  it('shows last session’s published Third Term results', async () => {
    const now = (await get('/api/v1/academics/results?section=Junior%20Secondary')).body.data;
    const then = (await get('/api/v1/academics/results?section=Junior%20Secondary', past)).body
      .data;
    expect(then.term).toMatch(/Third Term/);
    expect(now.term).not.toMatch(/Third Term/);
    expect(JSON.stringify(then)).toMatch(/JSS 1/);
  });

  it('shows last session’s registers in attendance', async () => {
    const then = (await get('/api/v1/academics/attendance', past)).body.data;
    expect(then.session ?? then.term).toBeTruthy();
    expect(JSON.stringify(then)).toMatch(/2025\/2026|Third Term/);
  });

  it('keeps the defaults on the active session and lists the viewed session’s terms', async () => {
    const o = (await get('/api/v1/context-options', past)).body.data;
    expect(o.defaults.session).toBe('2026/2027');
    expect(o.terms).toContain('Third Term');
  });

  it('ignores the header on writes and in other portals', async () => {
    // A write lands in the active session whatever the header says.
    const before = await t.prisma.academicSession.findFirstOrThrow({
      where: { name: '2026/2027', school: { slug: 'greenfield' } },
    });
    const res = await admin
      .post('/api/v1/academics/calendar/events')
      .set(past)
      .send({ title: 'x', type: 'Event', start: '2001-01-01', end: '2001-01-01' });
    expect(res.body.message ?? '').toMatch(new RegExp(before.name.replace('/', '\\/')));
    // The Teacher Workspace has no switcher: the header changes nothing there.
    const okafor = authed(
      t,
      (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token,
      { host: HOST },
    );
    const a = (await okafor.get('/api/v1/dashboard')).body.data;
    const b = (await okafor.get('/api/v1/dashboard').set(past)).body.data;
    expect(b.termId).toBe(a.termId);
  });
});
