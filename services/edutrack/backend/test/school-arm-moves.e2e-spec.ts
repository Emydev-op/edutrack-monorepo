import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';

/**
 * A student moved to another arm during the term keeps their days in the old arm (registers,
 * attendance) and is on the new arm's roll from the day of the move, never on both.
 */
describe('Class moves during a term (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let okafor: Api;

  const register = async (date?: string) =>
    (await okafor.get(`/api/v1/class-teacher/register${date ? `?date=${date}` : ''}`)).body.data;
  const history = async () =>
    (await okafor.get('/api/v1/class-teacher/register/history')).body.data;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    okafor = authed(t, (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token, {
      host: HOST,
    });
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  it('keeps past days with the old class and puts the student on the new roll from today', async () => {
    const before = await history();
    const past = before.days.find(
      (d: { taken: boolean; date: string }) => d.taken && d.date < before.today,
    );
    expect(past).toBeTruthy();
    const pastRows = (await register(past.date)).rows as { studentId: string; name: string }[];
    const mover = pastRows[0]!;
    const rowBefore = before.students.find(
      (s: { studentId: string }) => s.studentId === mover.studentId,
    );

    const moved = await admin
      .post('/api/v1/students/assign-arm')
      .send({ studentIds: [mover.studentId], arm: 'A' });
    expect(moved.status).toBe(200);
    expect(
      await t.prisma.armMove.count({ where: { enrollment: { studentId: mover.studentId } } }),
    ).toBe(1);

    // The past register still lists them, with their mark.
    const again = (await register(past.date)).rows as { studentId: string }[];
    expect(again.some((r) => r.studentId === mover.studentId)).toBe(true);

    // Today they're not on JSS 2B's roll (when today is a school day).
    const today = await register(before.today);
    if (!today.lock || today.lock.code !== 'NO_SCHOOL')
      expect(
        (today.rows as { studentId: string }[]).some((r) => r.studentId === mover.studentId),
      ).toBe(false);

    // The history keeps their days in JSS 2B and says they moved; the day counts don't change.
    const after = await history();
    const row = after.students.find((s: { studentId: string }) => s.studentId === mover.studentId);
    expect(row).toBeTruthy();
    expect(row.note).toMatch(/Moved to another class on/);
    expect(row.present + row.absent + row.late + row.excused).toBe(
      rowBefore.present + rowBefore.absent + rowBefore.late + rowBefore.excused,
    );
    expect(row.schoolDays).toBeLessThanOrEqual(rowBefore.schoolDays);
    const pastDay = after.days.find((d: { date: string }) => d.date === past.date);
    expect(pastDay.students).toBe(past.students);

    // School Admin's view of JSS 2A has them without any of JSS 2B's marks.
    const arms = (await admin.get('/api/v1/academics/attendance')).body.data;
    const jss2a = (arms.rows as { arm: string; armId: string; branch: string }[]).find(
      (a) => a.arm === 'JSS 2A' && a.branch === after.branchName,
    );
    expect(jss2a).toBeTruthy();
    const detail = (await admin.get(`/api/v1/academics/attendance/${jss2a!.armId}`)).body.data;
    const there = detail.students.find((s: { id: string }) => s.id === mover.studentId);
    expect(there).toBeTruthy();
    expect(Object.keys(there.marks).every((d) => d >= after.today)).toBe(true);
  });
});
