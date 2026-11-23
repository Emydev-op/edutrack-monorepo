import { hashPassword } from '../src/auth/password.js';
import {
  authed,
  createTestApp,
  login,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const T = '/api/v1/group/templates';
const EVENT = 'RESULT_PUBLISHED' as const;

interface TemplateView {
  key: string;
  saved: { from: string | null } | null;
  schools: { school: string; status: string | null }[];
}

/**
 * Group templates: the owner saves a school's setup as the group's template, sees which schools
 * match or differ, and applies it to the schools chosen (each gets its own copy). Roles limit who
 * may change which template.
 */
describe('Group templates (e2e)', () => {
  let t: TestApp;
  let owner: Api;
  let greenfield: string;
  let crestview: string;
  let groupId: string;
  let staffId: string;
  const suffix = Date.now().toString(36);
  const EMAIL = `owner.${suffix}@example.ng`;

  const templates = async () => (await owner.get(T)).body.data.templates as TemplateView[];
  const statusAt = (list: TemplateView[], key: string, school: string) =>
    list.find((x) => x.key === key)!.schools.find((s) => s.school === school)!.status;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    greenfield = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    crestview = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'crestview' } })).id;
    // A group owner who has already signed up.
    await t.prisma.user.create({
      data: {
        email: EMAIL,
        firstName: 'Group',
        lastName: 'Owner',
        status: 'ACTIVE',
        passwordHash: await hashPassword(PASSWORD),
        passwordChangedAt: new Date(),
      },
    });
    const tolu = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
    const g = (await tolu.post('/api/v1/platform/groups').send({ name: `Templates ${suffix}` }))
      .body.data;
    groupId = g.id;
    await tolu.post(`/api/v1/platform/groups/${g.id}/schools`).send({ schoolId: greenfield });
    await tolu.post(`/api/v1/platform/groups/${g.id}/schools`).send({ schoolId: crestview });
    const withStaff = await tolu
      .post(`/api/v1/platform/groups/${g.id}/staff`)
      .send({ name: 'Group Owner', email: EMAIL, role: 'Group owner' });
    staffId = withStaff.body.data.staff[0].id;
    owner = authed(t, (await login(t, EMAIL)).body.data.accessToken as string);
  });

  afterAll(async () => {
    await t.prisma.school.updateMany({ where: { groupId }, data: { groupId: null } });
    await t.prisma.schoolMembership.deleteMany({ where: { groupId } });
    await t.prisma.schoolGroup.deleteMany({ where: { id: groupId } });
    await t.prisma.user.deleteMany({ where: { email: EMAIL } });
    await t.prisma.messageTemplate.deleteMany({
      where: { schoolId: { in: [crestview, greenfield] } },
    });
    await t.reseed();
    await t.close();
  });

  it('lists the four templates, none saved yet', async () => {
    const list = await templates();
    expect(list.map((x) => x.key)).toEqual(['grading', 'fees', 'roles', 'messages']);
    expect(list.every((x) => x.saved === null)).toBe(true);
  });

  it('saves a school’s message wording as the template and shows who differs', async () => {
    const none = await owner.post(`${T}/messages/save`).send({ schoolId: greenfield });
    expect(none.body.error.code).toBe('NOTHING_TO_SAVE');
    await t.prisma.messageTemplate.create({
      data: {
        schoolId: greenfield,
        event: EVENT,
        channel: 'SMS',
        body: 'Dear parent, {{student}}’s results are out.',
      },
    });
    const res = await owner.post(`${T}/messages/save`).send({ schoolId: greenfield });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Message templates saved from Greenfield Academy.');
    const list = res.body.data.templates as TemplateView[];
    expect(statusAt(list, 'messages', 'Greenfield Academy')).toBe('Matches');
    expect(['Differs', 'Not set']).toContain(statusAt(list, 'messages', 'Crestview College'));

    const applied = await owner.post(`${T}/messages/apply`).send({ schoolIds: [crestview] });
    expect(applied.status).toBe(200);
    expect(applied.body.message).toBe('Message templates applied to 1 of 1 schools.');
    expect(statusAt(applied.body.data.templates, 'messages', 'Crestview College')).toBe('Matches');
  });

  it('copies the school’s own roles', async () => {
    await owner.post(`${T}/roles/save`).send({ schoolId: greenfield });
    const res = await owner.post(`${T}/roles/apply`).send({ schoolIds: [crestview] });
    expect(res.body.data.results[0]).toMatchObject({ applied: true });
    const names = async (schoolId: string) =>
      (
        await t.prisma.schoolRole.findMany({
          where: { schoolId, type: 'CUSTOM', archivedAt: null },
          select: { name: true },
        })
      )
        .map((r) => r.name)
        .sort();
    expect(await names(crestview)).toEqual(expect.arrayContaining(await names(greenfield)));
  });

  it('copies grading where it can, and says why it couldn’t', async () => {
    const saved = await owner.post(`${T}/grading/save`).send({ schoolId: greenfield });
    expect(saved.status).toBe(200);
    // Crestview is new: no session yet, so it isn't applied, with the reason.
    const res = await owner.post(`${T}/grading/apply`).send({ schoolIds: [crestview] });
    expect(res.body.data.results).toEqual([
      { school: 'Crestview College', applied: false, notes: ['No active session.'] },
    ]);
  });

  it('copies fee items, and skips amounts without an active term', async () => {
    const saved = await owner.post(`${T}/fees/save`).send({ schoolId: greenfield });
    expect(saved.status).toBe(200);
    const res = await owner.post(`${T}/fees/apply`).send({ schoolIds: [crestview] });
    expect(res.body.data.results[0]).toMatchObject({
      applied: true,
      notes: ['Amounts not copied: there’s no active term.'],
    });
    const gfItems = await t.prisma.feeItem.count({
      where: { schoolId: greenfield, status: 'ACTIVE' },
    });
    expect(await t.prisma.feeItem.count({ where: { schoolId: crestview, status: 'ACTIVE' } })).toBe(
      gfItems,
    );
  });

  it('refuses a school outside the group and a role that can’t change the template', async () => {
    const lagoon = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'lagoon' } })).id;
    const outside = await owner.post(`${T}/messages/save`).send({ schoolId: lagoon });
    expect(outside.body.error.code).toBe('NOT_IN_GROUP');
    const tolu = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
    await tolu
      .put(`/api/v1/platform/groups/${groupId}/staff/${staffId}`)
      .send({ role: 'Group finance' });
    const finance = authed(t, (await login(t, EMAIL)).body.data.accessToken as string);
    const res = await finance.post(`${T}/roles/save`).send({ schoolId: greenfield });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('GROUP_ROLE_FORBIDDEN');
    // Finance can still work on fees.
    expect((await finance.post(`${T}/fees/save`).send({ schoolId: greenfield })).status).toBe(200);
  });
});
