import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
/** A real 1×1 PNG. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * A campus's own identity: the sections it runs (a section new to the school joins its list) and
 * its own logo and colour, used by School Admin while it's the working branch and on its report
 * cards.
 */
describe('Branch sections and branding (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let lekkiId: string;
  let schoolId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    lekkiId = (await t.prisma.branch.findFirstOrThrow({ where: { schoolId, code: 'GFA-LK' } })).id;
  });

  afterAll(async () => {
    // The branding changes' history would otherwise top Lekki's timeline in other files.
    await t.prisma.auditEvent.deleteMany({ where: { action: 'branch.branding' } });
    await t.reseed();
    await t.close();
  });

  it('offers every standard section for a branch', async () => {
    const list = (await admin.get('/api/v1/branches')).body.data;
    expect(list.offering).toEqual(
      expect.arrayContaining(['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary']),
    );
  });

  it('sets a campus’s colour and logo, and School Admin sees them for that branch', async () => {
    const bad = await admin.put(`/api/v1/branches/${lekkiId}/branding`).send({ brandColor: 'red' });
    expect(bad.status).toBe(422);
    const res = await admin
      .put(`/api/v1/branches/${lekkiId}/branding`)
      .send({ brandColor: '#1f6feb', logo: PNG });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Lekki Campus branding saved.');
    expect(res.body.data).toMatchObject({ brandColor: '#1F6FEB' });
    expect(res.body.data.logoUrl).toMatch(/^https:\/\/storage\.test\//);

    const o = (await admin.get('/api/v1/context-options')).body.data;
    const lekki = o.branches.find((b: { name: string }) => b.name === 'Lekki Campus');
    expect(lekki).toMatchObject({ brandColor: '#1F6FEB' });
    expect(lekki.logoUrl).toMatch(/\/public\/schools\/greenfield\/branches\/GFA-LK\/logo\?v=/);
    const main = o.branches.find((b: { name: string }) => b.name === 'Main Campus');
    expect(main).toMatchObject({ brandColor: null, logoUrl: null });

    // The stable address redirects to the stored logo.
    const logo = await t.http().get(lekki.logoUrl.split('?')[0]);
    expect(logo.status).toBe(302);

    // Back to the school's.
    const reset = await admin
      .put(`/api/v1/branches/${lekkiId}/branding`)
      .send({ brandColor: null, logo: null });
    expect(reset.body.data).toEqual({ brandColor: null, logoUrl: null, name: 'Lekki Campus' });
  });
});
