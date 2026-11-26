import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const B = '/api/v1/boarding';

interface Settings {
  enabled: boolean;
  campuses: {
    branchId: string;
    name: string;
    sections: {
      sectionId: string;
      name: string;
      boarding: boolean;
      levelIds: string[];
      levels: { id: string; name: string }[];
    }[];
  }[];
}
interface Hostel {
  id: string;
  name: string;
  gender: string;
  floors: { id: string; name: string; rooms: number; places: number }[];
  rooms: { id: string; name: string; floorId: string | null; capacity: number; beds: string[] }[];
  staff: { staffId: string; role: string; floorId: string | null }[];
  totals: { floors: number; rooms: number; places: number };
}

/**
 * Boarding set-up: switching boarding on per section at each campus (optionally only some
 * classes), and building hostels of any shape: floors or wings, rooms of any size with optional
 * bed labels (one by one, generated, copied or uploaded), and house staff.
 */
describe('Boarding set-up and hostels (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  let main: Settings['campuses'][number];
  let senior: Settings['campuses'][number]['sections'][number];
  let hostel: Hostel;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    await t.prisma.hostelStaff.deleteMany({ where: { schoolId } });
    await t.prisma.hostelRoom.deleteMany({ where: { schoolId } });
    await t.prisma.hostelFloor.deleteMany({ where: { schoolId } });
    await t.prisma.hostel.deleteMany({ where: { schoolId } });
    await t.prisma.importBatch.deleteMany({ where: { schoolId, kind: 'HOSTEL_ROOMS' } });
    await t.prisma.branchSection.updateMany({
      where: { schoolId },
      data: { boarding: false, boardingLevelIds: [] },
    });
    await t.reseed();
    await t.close();
  });

  it('turns boarding on for one section at a campus, for some of its classes', async () => {
    const before = (await admin.get(`${B}/settings`)).body.data as Settings;
    expect(before.enabled).toBe(false);
    main = before.campuses.find((c) => c.name === 'Main Campus')!;
    senior = main.sections.find((s) => s.name === 'Senior Secondary')!;
    const two = senior.levels.slice(1).map((l) => l.id);

    // A hostel can't go up before the campus takes boarders.
    const early = await admin
      .post(`${B}/hostels`)
      .send({ branchId: main.branchId, name: 'Early House', gender: 'Boys' });
    expect(early.status).toBe(422);
    expect(early.body.error.fields.branchId).toContain('doesn’t take boarders');

    const res = await admin.put(`${B}/settings`).send({
      campuses: [
        {
          branchId: main.branchId,
          sections: [{ sectionId: senior.sectionId, boarding: true, levelIds: two }],
        },
      ],
    });
    expect(res.status).toBe(200);
    const after = res.body.data as Settings;
    expect(after.enabled).toBe(true);
    const s = after.campuses
      .find((c) => c.branchId === main.branchId)!
      .sections.find((x) => x.sectionId === senior.sectionId)!;
    expect(s).toMatchObject({ boarding: true });
    expect(s.levelIds.sort()).toEqual([...two].sort());
    // Other sections stay day only.
    expect(after.campuses.flatMap((c) => c.sections).filter((x) => x.boarding)).toHaveLength(1);
  });

  it('builds a hostel with floors, generated rooms, a dorm and house staff', async () => {
    const created = await admin.post(`${B}/hostels`).send({
      branchId: main.branchId,
      name: 'Queen Amina House',
      gender: 'Girls',
    });
    expect(created.status).toBe(201);
    hostel = created.body.data as Hostel;
    expect(hostel.totals).toEqual({ floors: 0, rooms: 0, places: 0 });

    const dup = await admin
      .post(`${B}/hostels`)
      .send({ branchId: main.branchId, name: 'queen amina house', gender: 'Girls' });
    expect(dup.body.error.fields.name).toBeTruthy();

    hostel = (await admin.post(`${B}/hostels/${hostel.id}/floors`).send({ name: 'Ground floor' }))
      .body.data;
    const ground = hostel.floors[0]!;
    hostel = (
      await admin.post(`${B}/hostels/${hostel.id}/rooms/generate`).send({
        floorId: ground.id,
        count: 4,
        prefix: 'Room',
        startAt: 1,
        capacity: 10,
        bedStyle: 'letters',
      })
    ).body.data;
    expect(hostel.rooms.map((r) => r.name)).toEqual(['Room 1', 'Room 2', 'Room 3', 'Room 4']);
    expect(hostel.rooms[0]!.beds).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    expect(hostel.floors[0]).toMatchObject({ rooms: 4, places: 40 });

    const clash = await admin
      .post(`${B}/hostels/${hostel.id}/rooms/generate`)
      .send({ count: 2, prefix: 'Room', startAt: 4, capacity: 2 });
    expect(clash.body.error.fields.startAt).toContain('Room 4');

    // One big dormitory with no floor and places only counted.
    hostel = (
      await admin
        .post(`${B}/hostels/${hostel.id}/rooms`)
        .send({ name: 'Dormitory A', capacity: 20 })
    ).body.data;
    // A single prefect's room.
    const badBeds = await admin
      .post(`${B}/hostels/${hostel.id}/rooms`)
      .send({ name: 'Prefect room', capacity: 1, beds: ['A', 'B'] });
    expect(badBeds.body.error.fields.beds).toBeTruthy();
    hostel = (
      await admin
        .post(`${B}/hostels/${hostel.id}/rooms`)
        .send({ name: 'Prefect room', capacity: 1, floorId: ground.id })
    ).body.data;
    expect(hostel.totals).toEqual({ floors: 1, rooms: 6, places: 61 });

    const staff = await t.prisma.staff.findMany({
      where: { schoolId, status: 'ACTIVE' },
      take: 2,
      select: { id: true },
    });
    const noFloor = await admin.put(`${B}/hostels/${hostel.id}/staff`).send({
      entries: [{ staffId: staff[1]!.id, role: 'Floor master / mistress' }],
    });
    expect(noFloor.body.error.fields['entries.0']).toBeTruthy();
    hostel = (
      await admin.put(`${B}/hostels/${hostel.id}/staff`).send({
        entries: [
          { staffId: staff[0]!.id, role: 'House master / mistress' },
          { staffId: staff[1]!.id, role: 'Floor master / mistress', floorId: ground.id },
        ],
      })
    ).body.data;
    expect(hostel.staff.map((s) => s.role).sort()).toEqual([
      'Floor master / mistress',
      'House master / mistress',
    ]);
  });

  it('copies a hostel’s layout for the boys', async () => {
    const res = await admin
      .post(`${B}/hostels/${hostel.id}/copy`)
      .send({ name: 'Ahmadu Bello House', gender: 'Boys' });
    expect(res.status).toBe(201);
    const copy = res.body.data as Hostel;
    expect(copy).toMatchObject({ gender: 'Boys', totals: hostel.totals });
    expect(copy.staff).toEqual([]);
    expect(copy.rooms.filter((r) => r.floorId).length).toBe(5);
  });

  it('imports rooms from a file, adding new hostels and floors', async () => {
    const csv = [
      'campus,hostel,gender,floor,room,places,beds',
      'Main Campus,Queen Amina House,Girls,First floor,Room 10,4,numbers',
      'Main Campus,Sultan Bello House,Boys,,Dorm 1,30,',
      'Main Campus,Queen Amina House,Girls,Ground floor,Room 1,4,',
      'Lekki Campus,Lekki House,Boys,,Room 1,4,',
    ].join('\n');
    const check = await admin.post(`${B}/rooms/import`).send({ fileName: 'rooms.csv', text: csv });
    expect(check.status).toBe(200);
    const rows = check.body.data.rows as {
      room: string;
      newHostel: boolean;
      newFloor: boolean;
      errors: string[];
    }[];
    expect(rows[0]).toMatchObject({ newHostel: false, newFloor: true, errors: [] });
    expect(rows[1]).toMatchObject({ newHostel: true, errors: [] });
    expect(rows[2]!.errors[0]).toContain('already has Room 1');
    expect(rows[3]!.errors[0]).toContain('doesn’t take boarders');

    const done = await admin.post(`${B}/rooms/import/${check.body.data.id}/commit`);
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ imported: 2, hostels: 1 });
    const list = (await admin.get(`${B}/hostels`)).body.data as { hostels: Hostel[] };
    expect(list.hostels.map((h) => h.name).sort()).toEqual([
      'Ahmadu Bello House',
      'Queen Amina House',
      'Sultan Bello House',
    ]);
  });

  it('keeps boarding set-up to whole-school admins with the campuses permission', async () => {
    const okafor = authed(
      t,
      (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: 'greenfield.localhost' })).token,
      {
        host: 'greenfield.localhost',
      },
    );
    // A teacher's Teacher Workspace session can't reach School Admin routes at all.
    expect((await okafor.get(`${B}/settings`)).status).toBeGreaterThanOrEqual(400);
  });
});
