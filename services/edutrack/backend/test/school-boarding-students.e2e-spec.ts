import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const B = '/api/v1/boarding';

interface Boarding {
  boarding: boolean;
  eligible: boolean;
  status: string;
  place: { hostel: string; room: string; bed: string | null } | null;
}

/**
 * Boarders: a student becomes a boarder only where their campus and class take boarders; a
 * boarder gets a room and bed (a full room or a taken bed is refused, a hostel for the other
 * gender is a warning to confirm); becoming a day student frees the bed; hostels fill
 * automatically; and rooms with boarders can't be removed or shrunk below their boarders.
 */
describe('Boarders and beds (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  let branchId: string;
  let girlsId: string;
  let boysId: string;
  let room2: string;
  let girls: { id: string; levelId: string }[];
  let boys: { id: string; levelId: string }[];
  let dayOnly: string;

  const boarding = async (id: string) =>
    (await admin.get(`${B}/students/${id}`)).body.data as Boarding;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    const branch = await t.prisma.branch.findFirstOrThrow({
      where: { schoolId, name: 'Main Campus' },
    });
    branchId = branch.id;
    const senior = await t.prisma.section.findFirstOrThrow({
      where: { schoolId, name: 'Senior Secondary' },
    });
    // Senior Secondary boards at Main Campus.
    await admin.put(`${B}/settings`).send({
      campuses: [{ branchId, sections: [{ sectionId: senior.id, boarding: true }] }],
    });
    const session = await t.prisma.academicSession.findFirstOrThrow({
      where: { schoolId, status: 'ACTIVE' },
    });
    const enrolled = await t.prisma.enrollment.findMany({
      where: {
        schoolId,
        sessionId: session.id,
        branchId,
        status: 'ACTIVE',
        level: { sectionId: senior.id },
        student: { status: 'ACTIVE' },
      },
      include: { student: { select: { id: true, gender: true } } },
    });
    girls = enrolled
      .filter((e) => e.student.gender === 'FEMALE')
      .map((e) => ({ id: e.studentId, levelId: e.levelId }));
    boys = enrolled
      .filter((e) => e.student.gender === 'MALE')
      .map((e) => ({ id: e.studentId, levelId: e.levelId }));
    const junior = await t.prisma.enrollment.findFirstOrThrow({
      where: {
        schoolId,
        sessionId: session.id,
        status: 'ACTIVE',
        level: { section: { name: 'Junior Secondary' } },
        student: { status: 'ACTIVE' },
      },
    });
    dayOnly = junior.studentId;

    const g = (
      await admin
        .post(`${B}/hostels`)
        .send({ branchId, name: 'Queen Amina House', gender: 'Girls' })
    ).body.data;
    girlsId = g.id;
    const withRooms = (
      await admin
        .post(`${B}/hostels/${girlsId}/rooms/generate`)
        .send({ count: 2, prefix: 'Room', capacity: 1, bedStyle: 'letters' })
    ).body.data;
    room2 = withRooms.rooms[1].id;
    const b = (
      await admin
        .post(`${B}/hostels`)
        .send({ branchId, name: 'Ahmadu Bello House', gender: 'Boys' })
    ).body.data;
    boysId = b.id;
    await admin.post(`${B}/hostels/${boysId}/rooms`).send({ name: 'Dorm 1', capacity: 20 });
  });

  afterAll(async () => {
    await t.prisma.bedAllocation.deleteMany({ where: { schoolId } });
    await t.prisma.enrollment.updateMany({ where: { schoolId }, data: { boarding: false } });
    await t.prisma.hostelRoom.deleteMany({ where: { schoolId } });
    await t.prisma.hostel.deleteMany({ where: { schoolId } });
    await t.prisma.branchSection.updateMany({
      where: { schoolId },
      data: { boarding: false, boardingLevelIds: [] },
    });
    await t.reseed();
    await t.close();
  });

  it('only lets students board where their campus and class take boarders', async () => {
    expect(await boarding(dayOnly)).toMatchObject({
      eligible: false,
      boarding: false,
      status: 'Day',
    });
    const no = await admin.put(`${B}/students/${dayOnly}`).send({ boarding: true });
    expect(no.status).toBe(422);
    expect(no.body.error.fields.boarding).toContain('doesn’t take boarders');

    const girl = girls[0]!.id;
    const yes = await admin.put(`${B}/students/${girl}`).send({ boarding: true });
    expect(yes.status).toBe(200);
    expect(yes.body.data).toMatchObject({ boarding: true, status: 'Boarder', place: null });
    const list = (await admin.get('/api/v1/students?boarding=Boarder&pageSize=50')).body.data as {
      id: string;
      boarder: boolean;
    }[];
    expect(list.map((r) => r.id)).toEqual([girl]);
  });

  it('places a boarder in a room and bed, refusing a full room and warning on gender', async () => {
    const girl = girls[0]!.id;
    const rooms = (await admin.get(`${B}/hostels/${girlsId}`)).body.data.rooms as { id: string }[];
    const placed = await admin
      .put(`${B}/allocations`)
      .send({ studentId: girl, roomId: rooms[0]!.id });
    expect(placed.status).toBe(200);
    expect(placed.body.data.place).toMatchObject({
      hostel: 'Queen Amina House',
      room: 'Room 1',
      bed: 'A',
    });

    if (girls[1]) {
      await admin.put(`${B}/students/${girls[1].id}`).send({ boarding: true });
      const full = await admin
        .put(`${B}/allocations`)
        .send({ studentId: girls[1].id, roomId: rooms[0]!.id });
      expect(full.status).toBe(409);
      expect(full.body.error.code).toBe('ROOM_FULL');
    }

    if (boys[0]) {
      const boy = boys[0].id;
      await admin.put(`${B}/students/${boy}`).send({ boarding: true });
      const warn = await admin.put(`${B}/allocations`).send({ studentId: boy, roomId: room2 });
      expect(warn.status).toBe(409);
      expect(warn.body.error.code).toBe('ALLOCATION_WARNING');
      expect(warn.body.error.fields.warnings).toContain('girls’ hostel');
      const forced = await admin
        .put(`${B}/allocations`)
        .send({ studentId: boy, roomId: room2, confirm: true });
      expect(forced.status).toBe(200);
      // Taken out again for the auto-allocation test.
      await admin.delete(`${B}/allocations/${boy}`);
    }

    const occ = (await admin.get(`${B}/hostels/${girlsId}/occupancy`)).body.data;
    expect(occ.totals).toMatchObject({ places: 2, taken: 1, free: 1 });
    expect(occ.rooms[0].occupants[0]).toMatchObject({ studentId: girl, bed: 'A' });
    // A room with a boarder can't be removed, nor drop below its boarders.
    expect(
      (await admin.delete(`${B}/hostels/${girlsId}/rooms/${rooms[0]!.id}`)).body.error.code,
    ).toBe('ROOM_OCCUPIED');
    expect((await admin.delete(`${B}/hostels/${girlsId}`)).body.error.code).toBe('HOSTEL_OCCUPIED');
  });

  it('fills a hostel with waiting boarders of its gender', async () => {
    const ids = boys.slice(0, 3).map((b) => b.id);
    if (!ids.length) return;
    const marked = await admin.post(`${B}/students/mark`).send({ studentIds: ids, boarding: true });
    expect(marked.status).toBe(200);
    expect(marked.body.data.changed).toBe(ids.length);
    const auto = await admin
      .post(`${B}/hostels/${boysId}/auto-allocate`)
      .send({ keepClassmates: true });
    expect(auto.status).toBe(200);
    expect(auto.body.data.placed).toBe(ids.length);
    const list = (await admin.get(`${B}/boarders?hostelId=${boysId}`)).body.data;
    expect(list.totals.boarders).toBe(ids.length);
    // Boys aren't put in the girls' hostel.
    const girlsOcc = (await admin.get(`${B}/hostels/${girlsId}/occupancy`)).body.data;
    expect(
      girlsOcc.rooms
        .flatMap((r: { occupants: { gender: string }[] }) => r.occupants)
        .every((o: { gender: string }) => o.gender === 'Female'),
    ).toBe(true);
  });

  it('frees the bed when a boarder becomes a day student, and keeps boarders’ classes boarding', async () => {
    const girl = girls[0]!.id;
    const day = await admin.put(`${B}/students/${girl}`).send({ boarding: false });
    expect(day.body.data).toMatchObject({ boarding: false, place: null });
    const occ = (await admin.get(`${B}/hostels/${girlsId}/occupancy`)).body.data;
    expect(occ.totals.taken).toBe(0);

    // Boarding can't be turned off for a section that still has boarders.
    const senior = await t.prisma.section.findFirstOrThrow({
      where: { schoolId, name: 'Senior Secondary' },
    });
    if (boys.length) {
      const off = await admin.put(`${B}/settings`).send({
        campuses: [{ branchId, sections: [{ sectionId: senior.id, boarding: false }] }],
      });
      expect(off.status).toBe(409);
      expect(off.body.error.code).toBe('BOARDERS_REMAIN');
    }
  });
});
