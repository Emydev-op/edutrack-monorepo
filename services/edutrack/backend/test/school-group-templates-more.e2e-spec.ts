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
const A = '/api/v1/group/announcements';

interface TemplateView {
  key: string;
  schools: { school: string; status: string | null }[];
}
interface Applied {
  results: { school: string; applied: boolean; notes: string[] }[];
}

/**
 * More group templates (term dates, subjects and curriculum, school policies, branding) and one
 * announcement sent in several of the group's schools. Greenfield is set up; Crestview is new
 * (no session, no class levels), so some parts are skipped there with a note.
 */
describe('Group templates: term dates, subjects, policies, branding; group announcements (e2e)', () => {
  let t: TestApp;
  let owner: Api;
  let tolu: Api;
  let greenfield: string;
  let crestview: string;
  let groupId: string;
  let staffId: string;
  const suffix = Date.now().toString(36);
  const EMAIL = `owner2.${suffix}@example.ng`;
  const TITLE = `Founder’s day ${suffix}`;
  let before: {
    gf: { brandColor: string | null; motto: string | null; logoFileId: string | null };
    cv: { brandColor: string | null; motto: string | null; logoFileId: string | null };
    cvSubjects: string[];
    settings: { schoolId: string }[];
  };

  const templates = async () => (await owner.get(T)).body.data.templates as TemplateView[];
  const statusAt = (list: TemplateView[], key: string, school: string) =>
    list.find((x) => x.key === key)!.schools.find((s) => s.school === school)!.status;
  const saveAndApply = async (key: string) => {
    expect((await owner.post(`${T}/${key}/save`).send({ schoolId: greenfield })).status).toBe(200);
    const res = await owner.post(`${T}/${key}/apply`).send({ schoolIds: [crestview] });
    expect(res.status).toBe(200);
    return (res.body.data as Applied).results[0]!;
  };

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    greenfield = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    crestview = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'crestview' } })).id;
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
    const pick = { brandColor: true, motto: true, logoFileId: true } as const;
    before = {
      gf: await t.prisma.school.findUniqueOrThrow({ where: { id: greenfield }, select: pick }),
      cv: await t.prisma.school.findUniqueOrThrow({ where: { id: crestview }, select: pick }),
      cvSubjects: (
        await t.prisma.subject.findMany({ where: { schoolId: crestview }, select: { id: true } })
      ).map((x) => x.id),
      settings: await t.prisma.schoolSettings.findMany({
        where: { schoolId: { in: [greenfield, crestview] } },
      }),
    };
    tolu = authed(t, (await signIn(t, 'tolu@edutrack.ng', { portal: 'platform' })).token);
    const g = (await tolu.post('/api/v1/platform/groups').send({ name: `More ${suffix}` })).body
      .data;
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
    // Crestview goes back to a new school: no session, its own subjects, branding and policies.
    const sessions = await t.prisma.academicSession.findMany({ where: { schoolId: crestview } });
    const ids = sessions.map((x) => x.id);
    await t.prisma.termEvent.deleteMany({ where: { term: { sessionId: { in: ids } } } });
    await t.prisma.term.deleteMany({ where: { sessionId: { in: ids } } });
    await t.prisma.curriculumEntry.deleteMany({ where: { sessionId: { in: ids } } });
    await t.prisma.academicSession.deleteMany({ where: { id: { in: ids } } });
    await t.prisma.subject.deleteMany({
      where: { schoolId: crestview, id: { notIn: before.cvSubjects } },
    });
    await t.prisma.school.update({ where: { id: greenfield }, data: before.gf });
    await t.prisma.school.update({ where: { id: crestview }, data: before.cv });
    await t.prisma.schoolSettings.deleteMany({
      where: { schoolId: { in: [greenfield, crestview] } },
    });
    if (before.settings.length)
      await t.prisma.schoolSettings.createMany({ data: before.settings as never });
    await t.reseed();
    await t.close();
  });

  it('lists the new template kinds', async () => {
    const keys = (await templates()).map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['calendar', 'subjects', 'policies', 'branding']));
  });

  it('copies branding', async () => {
    await t.prisma.school.update({
      where: { id: greenfield },
      data: { brandColor: '#1D4ED8', motto: `Light ${suffix}` },
    });
    const r = await saveAndApply('branding');
    expect(r.applied).toBe(true);
    const cv = await t.prisma.school.findUniqueOrThrow({ where: { id: crestview } });
    expect(cv).toMatchObject({ brandColor: '#1D4ED8', motto: `Light ${suffix}` });
    expect(statusAt(await templates(), 'branding', 'Crestview College')).toBe('Matches');
  });

  it('copies school policies', async () => {
    await t.prisma.schoolSettings.upsert({
      where: { schoolId: greenfield },
      create: { schoolId: greenfield, registerEditDays: 9, idleTimeoutMinutes: 45 },
      update: { registerEditDays: 9, idleTimeoutMinutes: 45 },
    });
    expect((await saveAndApply('policies')).applied).toBe(true);
    const cv = await t.prisma.schoolSettings.findUniqueOrThrow({ where: { schoolId: crestview } });
    expect(cv).toMatchObject({ registerEditDays: 9, idleTimeoutMinutes: 45 });
  });

  it('copies subjects, skipping class levels the school doesn’t have', async () => {
    const r = await saveAndApply('subjects');
    expect(r.applied).toBe(true);
    const gf = await t.prisma.subject.findMany({
      where: { schoolId: greenfield, status: 'ACTIVE', sectionId: null },
      select: { code: true },
    });
    const cv = new Set(
      (
        await t.prisma.subject.findMany({ where: { schoolId: crestview }, select: { code: true } })
      ).map((s) => s.code),
    );
    // Subjects for every section reach Crestview.
    expect(gf.every((s) => cv.has(s.code))).toBe(true);
    // Crestview has no session yet, so the curriculum isn't copied.
    expect(r.notes.join(' ')).toMatch(/no active session|No class level/);
  });

  it('copies term dates into a session of the same name', async () => {
    const gfSession = await t.prisma.academicSession.findFirstOrThrow({
      where: { schoolId: greenfield, status: 'ACTIVE' },
      include: { terms: { orderBy: { sequence: 'asc' } } },
    });
    // No session of that name at Crestview: reported, not applied.
    const missing = await saveAndApply('calendar');
    expect(missing.applied).toBe(false);
    expect(missing.notes[0]).toContain(`No ${gfSession.name} session yet`);

    await t.prisma.academicSession.create({
      data: {
        schoolId: crestview,
        name: gfSession.name,
        startsOn: gfSession.startsOn,
        endsOn: gfSession.endsOn,
        status: 'UPCOMING',
      },
    });
    const r = await owner.post(`${T}/calendar/apply`).send({ schoolIds: [crestview] });
    expect((r.body.data as Applied).results[0]).toMatchObject({ applied: true });
    const cvTerms = await t.prisma.term.findMany({
      where: { schoolId: crestview, session: { name: gfSession.name } },
      orderBy: { sequence: 'asc' },
    });
    expect(cvTerms.map((x) => [x.name, x.startsOn.toISOString(), x.endsOn.toISOString()])).toEqual(
      gfSession.terms.map((x) => [x.name, x.startsOn.toISOString(), x.endsOn.toISOString()]),
    );
    expect(statusAt(await templates(), 'calendar', 'Crestview College')).toBe('Matches');
  });

  it('sends one announcement in each chosen school', async () => {
    const preview = await owner
      .post(`${A}/preview`)
      .send({ audience: 'staff', channels: ['In-app'], schoolIds: [greenfield, crestview] });
    expect(preview.status).toBe(200);
    expect(preview.body.data.schools).toHaveLength(2);
    const gfPreview = preview.body.data.schools.find(
      (s: { schoolId: string }) => s.schoolId === greenfield,
    );
    expect(gfPreview.recipients).toBeGreaterThan(0);

    const bad = await owner
      .post(A)
      .send({ title: '', body: '', audience: 'staff', channels: [], schoolIds: [greenfield] });
    expect(bad.status).toBe(422);

    const sent = await owner.post(A).send({
      title: TITLE,
      body: 'All our schools close on Friday for Founder’s Day.',
      audience: 'staff',
      channels: ['In-app'],
      schoolIds: [greenfield, crestview],
    });
    expect(sent.status).toBe(200);
    expect(sent.body.data.results).toHaveLength(2);
    const gf = sent.body.data.results.find((x: { schoolId: string }) => x.schoolId === greenfield);
    expect(gf).toMatchObject({ sent: true });
    expect(
      await t.prisma.announcement.count({ where: { schoolId: greenfield, title: TITLE } }),
    ).toBe(1);
  });

  it('keeps branding and announcements to the owner', async () => {
    await tolu.put(`/api/v1/platform/groups/${groupId}/staff/${staffId}`).send({
      role: 'Group academic',
    });
    const academic = authed(t, (await login(t, EMAIL)).body.data.accessToken as string);
    const brand = await academic.post(`${T}/branding/apply`).send({ schoolIds: [crestview] });
    expect(brand.body.error.code).toBe('GROUP_ROLE_FORBIDDEN');
    const send = await academic.post(A).send({
      title: 'x',
      body: 'y',
      audience: 'staff',
      channels: ['In-app'],
      schoolIds: [greenfield],
    });
    expect(send.body.error.code).toBe('GROUP_ROLE_FORBIDDEN');
    // Term dates are academic: allowed.
    const dates = await academic.post(`${T}/calendar/apply`).send({ schoolIds: [crestview] });
    expect(dates.status).toBe(200);
  });
});
