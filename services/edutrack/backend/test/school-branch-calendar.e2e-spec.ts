import { hashPassword } from '../src/auth/password.js';
import { authed, createTestApp, PASSWORD, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const A = '/api/v1/academics';
const LEKKI = { 'X-EduTrack-Branch': 'Lekki%20Campus' };
const MAIN = { 'X-EduTrack-Branch': 'Main%20Campus' };
const DAY = 86_400_000;

interface Day {
  date: string;
  kind: string;
  note: string;
}

/**
 * Branch calendars: sessions and terms are the school's, but a campus can add its own holidays,
 * breaks and events and shift its term dates. Registers and attendance follow the class's campus.
 */
describe('Branch calendars (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  let lekkiArm: string;
  let mainArm: string;
  let termId: string;
  let day: string;
  let userId: string;

  const weekdayAfter = (iso: string, days: number) => {
    let d = new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + DAY);
    return d.toISOString().slice(0, 10);
  };
  const armDays = async (armId: string) =>
    (await admin.get(`${A}/attendance/${armId}`)).body.data.days as Day[];

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    lekkiArm = (
      await t.prisma.classArm.findFirstOrThrow({ where: { schoolId, branch: { code: 'GFA-LK' } } })
    ).id;
    mainArm = (
      await t.prisma.classArm.findFirstOrThrow({ where: { schoolId, branch: { code: 'GFA-MC' } } })
    ).id;
    const term = await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } });
    termId = term.id;
    const today = new Date(t.clock.now()).toISOString().slice(0, 10);
    const from =
      today > term.startsOn.toISOString().slice(0, 10)
        ? today
        : term.startsOn.toISOString().slice(0, 10);
    day = weekdayAfter(from, 3);
  });

  afterAll(async () => {
    await t.prisma.calendarEvent.deleteMany({
      where: { schoolId, title: { startsWith: 'Lekki' } },
    });
    await t.prisma.branchTermDates.deleteMany({ where: { schoolId } });
    if (userId) {
      await t.prisma.schoolMembership.deleteMany({ where: { userId } });
      await t.prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await t.reseed();
    await t.close();
  });

  it('adds a holiday for one campus only', async () => {
    const res = await admin.post(`${A}/calendar/events`).send({
      title: 'Lekki inter-house sports',
      type: 'Holiday',
      start: day,
      end: day,
      branch: 'Lekki Campus',
    });
    expect(res.status).toBe(201);
    const bad = await admin
      .post(`${A}/calendar/events`)
      .send({ title: 'x', type: 'Event', start: day, end: day, branch: 'Atlantis' });
    expect(bad.body.message).toBe('Choose one of the school’s active branches.');

    const lekki = (await admin.get(`${A}/calendar`).set(LEKKI)).body.data;
    expect(lekki.branch).toBe('Lekki Campus');
    expect(lekki.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Lekki inter-house sports', branch: 'Lekki Campus' }),
      ]),
    );
    const main = (await admin.get(`${A}/calendar`).set(MAIN)).body.data;
    expect(main.events.some((e: { title: string }) => e.title === 'Lekki inter-house sports')).toBe(
      false,
    );
  });

  it('closes registers at that campus only', async () => {
    const lekki = (await armDays(lekkiArm)).find((d) => d.date === day)!;
    expect(lekki).toMatchObject({ kind: 'closed', note: 'Lekki inter-house sports' });
    const main = (await armDays(mainArm)).find((d) => d.date === day)!;
    expect(main.kind).not.toBe('closed');
  });

  it('shifts a campus’s term dates, and back', async () => {
    const term = await t.prisma.term.findUniqueOrThrow({ where: { id: termId } });
    const end = term.endsOn.toISOString().slice(0, 10);
    const earlier = new Date(term.endsOn.getTime() - 7 * DAY).toISOString().slice(0, 10);
    const bad = await admin
      .put(`${A}/calendar/branch-terms`)
      .send({ branch: 'Lekki Campus', termId, start: end, end: earlier });
    expect(bad.status).toBe(422);
    const res = await admin
      .put(`${A}/calendar/branch-terms`)
      .send({ branch: 'Lekki Campus', termId, end: earlier });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(`Lekki Campus · ${term.name} dates saved.`);
    const lekki = (await admin.get(`${A}/calendar`).set(LEKKI)).body.data;
    expect(lekki.branchTerms).toEqual([
      expect.objectContaining({ branch: 'Lekki Campus', end: earlier }),
    ]);
    const ends = lekki.events.find((e: { id: string }) => e.id === `${termId}-end`);
    expect(ends.start).toBe(earlier);
    const main = (await admin.get(`${A}/calendar`).set(MAIN)).body.data;
    expect(main.events.find((e: { id: string }) => e.id === `${termId}-end`).start).toBe(end);

    const reset = await admin
      .put(`${A}/calendar/branch-terms`)
      .send({ branch: 'Lekki Campus', termId, start: null, end: null });
    expect(reset.status).toBe(200);
    expect(await t.prisma.branchTermDates.count({ where: { schoolId } })).toBe(0);
  });

  it('lets a branch admin manage only their campus’s events', async () => {
    const roles = await t.prisma.schoolRole.findMany({
      where: { schoolId, key: { in: ['branch_admin', 'owner'] } },
    });
    const lekkiBranch = await t.prisma.branch.findFirstOrThrow({
      where: { schoolId, code: 'GFA-LK' },
    });
    const email = `lekki.cal.${Date.now()}@greenfield.edu.ng`;
    const user = await t.prisma.user.create({
      data: {
        email,
        firstName: 'Lekki',
        lastName: 'Calendar',
        status: 'ACTIVE',
        passwordHash: await hashPassword(PASSWORD),
        passwordChangedAt: new Date(),
      },
    });
    userId = user.id;
    await t.prisma.schoolMembership.create({
      data: {
        schoolId,
        userId,
        kind: 'STAFF',
        status: 'ACTIVE',
        scope: 'BRANCH',
        activatedAt: new Date(),
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
        branches: { create: { branchId: lekkiBranch.id } },
      },
    });
    const lekkiAdmin = authed(t, (await signIn(t, email)).token);
    const whole = await lekkiAdmin
      .post(`${A}/calendar/events`)
      .send({ title: 'Lekki open day', type: 'Event', start: day, end: day });
    expect(whole.status).toBe(422);
    expect(whole.body.message).toBe('Choose your branch: Lekki Campus.');
    const own = await lekkiAdmin.post(`${A}/calendar/events`).send({
      title: 'Lekki open day',
      type: 'Event',
      start: day,
      end: day,
      branch: 'Lekki Campus',
    });
    expect(own.status).toBe(201);
    const schoolEvent = await admin
      .post(`${A}/calendar/events`)
      .send({ title: 'Lekki-wide? no, school-wide', type: 'Event', start: day, end: day });
    const blocked = await lekkiAdmin.delete(`${A}/calendar/events/${schoolEvent.body.data.id}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Only whole-school admins can change whole-school events.');
  });
});
