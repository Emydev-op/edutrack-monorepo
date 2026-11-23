import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const G = '/api/v1/platform/groups';

/**
 * One bill per group: the group has one plan at one price for all its schools. Member schools
 * follow the group plan with no price of their own, EduTrack invoices the group, recording the
 * payment moves every school's renewal on, and a school leaving goes back to paying itself.
 */
describe('School group billing (e2e)', () => {
  let t: TestApp;
  let tolu: Api;
  let groupId: string;
  let greenfield: string;
  let crestview: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    tolu = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
    greenfield = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    crestview = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'crestview' } })).id;
    groupId = (await tolu.post(G).send({ name: `Billing Group ${suffix}` })).body.data.id;
    await tolu.post(`${G}/${groupId}/schools`).send({ schoolId: greenfield });
    await tolu.post(`${G}/${groupId}/schools`).send({ schoolId: crestview });
  });

  afterAll(async () => {
    await t.prisma.subscription.updateMany({
      where: { groupId: { not: null } },
      data: { groupId: null },
    });
    await t.prisma.platformInvoice.deleteMany({ where: { groupId: { not: null } } });
    await t.prisma.school.updateMany({
      where: { groupId: { not: null } },
      data: { groupId: null },
    });
    await t.prisma.auditEvent.deleteMany({ where: { entityId: groupId } });
    await t.prisma.schoolGroup.deleteMany({ where: { name: { contains: suffix } } });
    await t.reseed();
    await t.close();
  });

  it('puts every school on the group plan at one price', async () => {
    expect((await tolu.get(`${G}/${groupId}/billing`)).body.data.status).toBe('Not set');
    const bad = await tolu
      .put(`${G}/${groupId}/billing`)
      .send({ plan: 'Nope', period: 'Weekly', priceNaira: 100 });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['period', 'plan']);

    const res = await tolu
      .put(`${G}/${groupId}/billing`)
      .send({ plan: 'Growth', period: 'Annual', priceNaira: 2_400_000, renewsOn: '2027-09-30' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      plan: 'Growth',
      period: 'Annual',
      price: expect.stringContaining('/ year'),
      renewsOn: '2027-09-30',
      status: 'Active',
    });
    const subs = await t.prisma.subscription.findMany({
      where: { schoolId: { in: [greenfield, crestview] } },
      include: { plan: true },
    });
    expect(
      subs.every(
        (s) =>
          s.groupId === groupId &&
          s.plan.name === 'Growth' &&
          s.priceKobo === 0n &&
          s.renewsOn.toISOString().startsWith('2027-09-30'),
      ),
    ).toBe(true);

    // The school's own subscription shows the group, and its plan is changed on the group.
    const own = (await tolu.get(`/api/v1/platform/schools/${crestview}/subscription`)).body.data;
    expect(own.billedBy).toEqual({ id: groupId, name: `Billing Group ${suffix}` });
    const extend = await tolu
      .post(`/api/v1/platform/schools/${crestview}/subscription/actions`)
      .send({ action: 'extend', period: '1 month', reason: 'Goodwill' });
    expect(extend.status).toBe(409);
    expect(extend.body.error.code).toBe('GROUP_BILLED');
  });

  it('invoices the group and moves every renewal on when paid', async () => {
    const first = await tolu.post(`${G}/${groupId}/billing/invoices`);
    expect(first.status).toBe(201);
    const number = first.body.data.number as string;
    expect(first.body.data.invoices[0]).toMatchObject({ number, status: 'Due' });
    const inv = await t.prisma.platformInvoice.findUniqueOrThrow({ where: { number } });
    expect(inv).toMatchObject({ groupId, schoolId: null, amountKobo: 240_000_000n });
    // One open invoice at a time.
    expect((await tolu.post(`${G}/${groupId}/billing/invoices`)).body.error.code).toBe(
      'GROUP_INVOICE_OPEN',
    );
    await tolu
      .post(`${G}/${groupId}/billing/invoices/${number}/payment`)
      .send({ reference: 'TRF-1' });

    // The next invoice is the renewal: paying it moves the group and its schools a year on.
    const renewal = (await tolu.post(`${G}/${groupId}/billing/invoices`)).body.data.number;
    const paid = await tolu
      .post(`${G}/${groupId}/billing/invoices/${renewal}/payment`)
      .send({ reference: 'TRF-2' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.renewsOn).toBe('2028-09-30');
    const gf = await t.prisma.subscription.findUniqueOrThrow({ where: { schoolId: greenfield } });
    expect(gf.renewsOn.toISOString()).toMatch(/^2028-09-30/);
    expect(
      (await tolu.post(`${G}/${groupId}/billing/invoices/${renewal}/payment`).send({})).body.error
        .code,
    ).toBe('INVOICE_NOT_OPEN');
  });

  it('sends a school that leaves back to its own price', async () => {
    await tolu.delete(`${G}/${groupId}/schools/${crestview}`);
    const cv = await t.prisma.subscription.findUniqueOrThrow({ where: { schoolId: crestview } });
    expect(cv.groupId).toBeNull();
    expect(cv.priceKobo).toBeGreaterThan(0n);
    // It keeps the renewal date the group paid for.
    expect(cv.renewsOn.toISOString()).toMatch(/^2028-09-30/);

    const stopped = await tolu.delete(`${G}/${groupId}/billing`);
    expect(stopped.status).toBe(200);
    expect(stopped.body.data.status).toBe('Not set');
    const gf = await t.prisma.subscription.findUniqueOrThrow({ where: { schoolId: greenfield } });
    expect(gf.groupId).toBeNull();
    expect(gf.priceKobo).toBeGreaterThan(0n);
  });
});
