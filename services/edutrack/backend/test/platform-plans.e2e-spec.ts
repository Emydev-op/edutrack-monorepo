import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

const definition = (name: string) => ({
  name,
  description: 'For testing',
  pricing: { model: 'flat', prices: { annual: 900000 } },
  trialDays: 7,
  setupFee: 50000,
  limits: { students: 800, branches: 3, users: 40, storage: 20 },
  smsCreditsPerTerm: 2000,
  modules: ['subjects', 'assess', 'results'],
  support: 'Standard',
});

describe('Platform plans (e2e)', () => {
  let t: TestApp;
  let api: ReturnType<typeof authed>;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    const { token } = await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' });
    api = authed(t, token);
  });

  afterAll(async () => {
    await t.close();
  });

  it('lists the seeded plans with school counts and history', async () => {
    const res = await api.get('/api/v1/platform/plans');
    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Starter', 'Growth', 'Enterprise']));
    const growth = (res.body as Record<string, unknown>[]).find((p) => p.name === 'Growth')!;
    expect(growth).toMatchObject({
      status: 'Active',
      pricing: { model: 'flat', prices: { annual: 1850000, term: 700000 } },
      limits: { students: 1500, branches: 5 },
      version: 1,
      history: [expect.objectContaining({ version: 1, summary: 'Created and published' })],
    });
    expect(growth.schools).toBeGreaterThanOrEqual(1);
  });

  it('creates a plan, always adding core modules', async () => {
    const res = await api
      .post('/api/v1/platform/plans')
      .send({ ...definition(`Pilot ${suffix}`), status: 'Draft' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'Draft', version: 1, schools: 0 });
    expect(res.body.modules).toEqual(expect.arrayContaining(['profile', 'users', 'results']));
    expect(res.body.history[0].summary).toBe('Created as draft');
  });

  it('refuses a duplicate name, a missing price, unknown modules and missing requirements', async () => {
    const dup = await api
      .post('/api/v1/platform/plans')
      .send({ ...definition('growth'), status: 'Draft' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('PLAN_NAME_TAKEN');

    const noPrice = await api.post('/api/v1/platform/plans').send({
      ...definition(`NoPrice ${suffix}`),
      pricing: { model: 'flat', prices: {} },
      status: 'Draft',
    });
    expect(noPrice.status).toBe(422);
    expect(noPrice.body.message).toBe('Set a price for at least one billing period.');

    const unknown = await api
      .post('/api/v1/platform/plans')
      .send({ ...definition(`Unknown ${suffix}`), modules: ['teleport'], status: 'Draft' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.message).toContain('Unknown module');

    const needs = await api
      .post('/api/v1/platform/plans')
      .send({ ...definition(`Needs ${suffix}`), modules: ['results'], status: 'Draft' });
    expect(needs.status).toBe(422);
    expect(needs.body.message).toMatch(/^Results & report cards needs /);

    const soon = await api
      .post('/api/v1/platform/plans')
      .send({ ...definition(`Soon ${suffix}`), modules: ['attendance'], status: 'Draft' });
    expect(soon.status).toBe(422);
    expect(soon.body.message).toBe('Attendance isn’t available yet.');

    const badLimit = await api.post('/api/v1/platform/plans').send({
      ...definition(`Limit ${suffix}`),
      limits: { students: 0, branches: null, users: null, storage: null },
      status: 'Draft',
    });
    expect(badLimit.status).toBe(422);
    expect(badLimit.body.message).toBe('Students must be at least 1, or unlimited.');
  });

  it('versions edits, skips no-op saves, and records publish/archive in history', async () => {
    const created = await api
      .post('/api/v1/platform/plans')
      .send({ ...definition(`Edit ${suffix}`), status: 'Draft' });
    const id = created.body.id as string;

    const same = await api.patch(`/api/v1/platform/plans/${id}`).send(definition(`Edit ${suffix}`));
    expect(same.status).toBe(200);
    expect(same.body.version).toBe(1);

    const edited = await api.patch(`/api/v1/platform/plans/${id}`).send({
      ...definition(`Edit ${suffix}`),
      pricing: { model: 'flat', prices: { annual: 950000 } },
      limits: { students: null, branches: 3, users: 40, storage: 20 },
    });
    expect(edited.status).toBe(200);
    expect(edited.body.version).toBe(2);
    expect(edited.body.limits.students).toBeNull();
    expect(edited.body.history[0]).toMatchObject({
      version: 2,
      summary: 'Price, Students changed',
      by: 'Tolu Bamidele',
    });

    const published = await api
      .post(`/api/v1/platform/plans/${id}/status`)
      .send({ status: 'Active' });
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('Active');
    expect(published.body.history[0].summary).toBe('Published');

    const archived = await api
      .post(`/api/v1/platform/plans/${id}/status`)
      .send({ status: 'Archived' });
    expect(archived.body.history.map((h: { summary: string }) => h.summary).slice(0, 2)).toEqual([
      'Archived',
      'Published',
    ]);
    const draftAgain = await api
      .post(`/api/v1/platform/plans/${id}/status`)
      .send({ status: 'Draft' });
    expect(draftAgain.status).toBe(422);
  });

  it('deletes only unused drafts', async () => {
    const plans = (await api.get('/api/v1/platform/plans')).body as { id: string; name: string }[];
    const growth = plans.find((p) => p.name === 'Growth')!;
    const inUse = await api.delete(`/api/v1/platform/plans/${growth.id}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('PLAN_IN_USE');

    const draft = await api
      .post('/api/v1/platform/plans')
      .send({ ...definition(`Delete ${suffix}`), status: 'Draft' });
    const del = await api.delete(`/api/v1/platform/plans/${draft.body.id}`);
    expect(del.status).toBe(200);
    expect((await api.get(`/api/v1/platform/plans/${draft.body.id}`)).status).toBe(404);
  });

  it('lists a plan’s schools with usage, and 404s unknown or malformed ids', async () => {
    const plans = (await api.get('/api/v1/platform/plans')).body as { id: string; name: string }[];
    const starter = plans.find((p) => p.name === 'Starter')!;
    const schools = await api.get(`/api/v1/platform/plans/${starter.id}/schools`);
    expect(schools.status).toBe(200);
    expect(schools.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Crestview College', branches: 1 })]),
    );
    expect((await api.get('/api/v1/platform/plans/not-a-plan')).status).toBe(404);
    expect(
      (await api.get('/api/v1/platform/plans/00000000-0000-4000-8000-000000000000')).body.message,
    ).toBe('That plan doesn’t exist.');
  });

  it('needs Subscriptions.Manage to change plans', async () => {
    const { token } = await signIn(t, 'ngozi@edutrack.ng', { portal: 'platform' });
    const support = authed(t, token);
    expect((await support.get('/api/v1/platform/plans')).status).toBe(200);
    const res = await support
      .post('/api/v1/platform/plans')
      .send({ ...definition(`Nope ${suffix}`), status: 'Draft' });
    expect(res.status).toBe(403);
  });
});
