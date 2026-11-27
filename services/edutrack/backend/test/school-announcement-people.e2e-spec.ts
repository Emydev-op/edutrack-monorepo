import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const C = '/api/v1/comms';
const HOST = 'greenfield.localhost';

interface Person {
  key: string;
  name: string;
  role: string;
  detail: string;
}

/**
 * Announcements to specific people: an admin searches parents, students and staff by name and
 * sends to the ones picked. Only they receive it; people no longer at the school are refused.
 */
describe('Announcements to specific people (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  it('finds parents, students and staff by name', async () => {
    expect((await admin.get(`${C}/people?q=a`)).body.data).toEqual([]);
    const res = await admin.get(`${C}/people?q=Adeyemi`);
    expect(res.status).toBe(200);
    const people = res.body.data as Person[];
    const funke = people.find((p) => p.name.includes('Funke Adeyemi'));
    expect(funke).toMatchObject({ role: 'Parent', detail: expect.stringContaining('Parent of') });
    expect(people.some((p) => p.role === 'Student')).toBe(true);
    const okafor = (await admin.get(`${C}/people?q=okafor`)).body.data as Person[];
    expect(okafor.some((p) => p.role === 'Teacher')).toBe(true);
  });

  it('sends only to the people chosen', async () => {
    const funke = (
      (await admin.get(`${C}/people`).query({ q: 'Funke Adeyemi' })).body.data as Person[]
    ).find((p) => p.role === 'Parent')!;
    const teacher = ((await admin.get(`${C}/people?q=okafor`)).body.data as Person[]).find(
      (p) => p.role === 'Teacher',
    )!;
    const audience = { kind: 'people', people: [funke.key, teacher.key] };

    const preview = await admin
      .post(`${C}/announcements/preview`)
      .send({ audience, channels: ['In-app', 'Email'], smsText: '' });
    expect(preview.status).toBe(200);
    expect(preview.body.data.recipients).toBe(2);
    expect(preview.body.data.label).toMatch(/^2 people/);

    const title = `Meeting about Emmanuel ${suffix}`;
    const sent = await admin.post(`${C}/announcements`).send({
      title,
      body: 'Please come in on Monday at 9am.',
      smsText: '',
      audience,
      channels: ['In-app', 'Email'],
      scheduledFor: null,
      expiresOn: null,
      action: 'send',
    });
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ status: 'Sent', recipients: 2 });
    expect(sent.body.data.audience).toMatchObject({ kind: 'people', people: audience.people });
    expect((sent.body.data.people as Person[]).map((p) => p.key)).toEqual(audience.people);
    const row = await t.prisma.announcement.findFirstOrThrow({ where: { schoolId, title } });
    expect(row.audiencePeople).toEqual(audience.people);

    // It is on their Announcements pages too, not just a notification.
    const parent = authed(
      t,
      (await signIn(t, 'funke.adeyemi@gmail.com', { portal: 'parent', host: HOST })).token,
      { host: HOST },
    );
    const feed = await parent.get('/api/v1/parent/announcements');
    expect(feed.status).toBe(200);
    const mine = (feed.body.data as { title: string; audience: string }[]).find(
      (a) => a.title === title,
    );
    expect(mine).toMatchObject({ audience: 'Sent to you' });
    const okafor = authed(
      t,
      (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token,
      { host: HOST },
    );
    const staffFeed = await okafor.get('/api/v1/announcements');
    expect(staffFeed.status).toBe(200);
    expect(JSON.stringify(staffFeed.body.data)).toContain(title);
    // Someone not chosen doesn't see it.
    const ade = authed(t, (await signIn(t, 's.ade@greenfield.edu.ng', { host: HOST })).token, {
      host: HOST,
    });
    expect(JSON.stringify((await ade.get('/api/v1/announcements')).body.data)).not.toContain(title);
  });

  it('refuses unknown people and an empty list', async () => {
    const empty = await admin
      .post(`${C}/announcements/preview`)
      .send({ audience: { kind: 'people', people: [] }, channels: ['In-app'] });
    expect(empty.status).toBe(422);
    const unknown = await admin.post(`${C}/announcements/preview`).send({
      audience: { kind: 'people', people: ['g:00000000-0000-7000-8000-000000000000'] },
      channels: ['In-app'],
    });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.fields['audience.people']).toContain('no longer at the school');
  });
});
