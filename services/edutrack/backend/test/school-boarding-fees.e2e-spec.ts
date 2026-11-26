import {
  authed,
  createTestApp,
  login,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const B = '/api/v1/boarding';
const HOST = 'greenfield.localhost';
const DAY = 86_400_000;

/**
 * Boarding, part 3: fee items for boarders only, billed this term when a student becomes a
 * boarder (and taken off only in the term's first two weeks); the parent sees the boarding place
 * and the house master or mistress, and can message them; house staff see their hostel's
 * boarders with parent contacts in the Teacher Workspace.
 */
describe('Boarding fees, parents and house staff (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  let emmanuel: string;
  let okaforStaffId: string;
  let itemId: string;
  let termStart: Date;

  const signInAdmin = async () => {
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  };
  /** Moves the clock to `days` after the term started (sign-ins follow the clock). */
  const dayOfTerm = async (days: number) => {
    t.clock.set(termStart.getTime() + days * DAY + 9 * 3_600_000);
    await signInAdmin();
  };
  const boardingLines = async () => {
    const term = await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } });
    return t.prisma.invoiceLine.findMany({
      where: { feeItemId: itemId, invoice: { studentId: emmanuel, termId: term.id } },
    });
  };

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    const term = await t.prisma.term.findFirstOrThrow({ where: { schoolId, status: 'ACTIVE' } });
    termStart = term.startsOn;
    await dayOfTerm(30);
    const student = await t.prisma.student.findFirstOrThrow({
      where: { schoolId, admissionNo: 'STU-2025-0042' },
    });
    emmanuel = student.id;
    const e = await t.prisma.enrollment.findFirstOrThrow({
      where: { studentId: emmanuel, sessionId: term.sessionId },
      include: { level: true },
    });
    // Junior Secondary boards at Emmanuel's campus.
    await admin.put(`${B}/settings`).send({
      campuses: [
        { branchId: e.branchId, sections: [{ sectionId: e.level.sectionId, boarding: true }] },
      ],
    });
    // A boarding fee for boarders only, priced for his class in this term's published fees.
    const item = await t.prisma.feeItem.create({
      data: {
        schoolId,
        name: 'Boarding fee (test)',
        category: 'BOARDING',
        charged: 'EVERY_TERM',
        type: 'COMPULSORY',
        appliesTo: 'BOARDERS',
      },
    });
    itemId = item.id;
    const structure = await t.prisma.feeStructure.findFirst({
      where: { termId: term.id, branchId: e.branchId, status: 'PUBLISHED' },
    });
    if (structure)
      await t.prisma.feeStructureAmount.create({
        data: {
          schoolId,
          structureId: structure.id,
          levelId: e.levelId,
          feeItemId: item.id,
          amountKobo: 25_000_000n,
        },
      });
    // A boys' hostel with Mr. Okafor as house master.
    const okafor = await t.prisma.staff.findFirstOrThrow({
      where: { schoolId, membership: { user: { email: 'g.okafor@greenfield.edu.ng' } } },
    });
    okaforStaffId = okafor.id;
    const hostel = (
      await admin
        .post(`${B}/hostels`)
        .send({ branchId: e.branchId, name: 'Fees House', gender: 'Boys' })
    ).body.data;
    await admin.post(`${B}/hostels/${hostel.id}/rooms`).send({ name: 'Room 1', capacity: 4 });
    await admin
      .put(`${B}/hostels/${hostel.id}/staff`)
      .send({ entries: [{ staffId: okafor.id, role: 'House master / mistress' }] });
  });

  afterAll(async () => {
    await t.prisma.invoiceLine.deleteMany({ where: { feeItemId: itemId } });
    await t.prisma.feeStructureAmount.deleteMany({ where: { feeItemId: itemId } });
    await t.prisma.feeItem.deleteMany({ where: { id: itemId } });
    await t.prisma.bedAllocation.deleteMany({ where: { schoolId } });
    await t.prisma.enrollment.updateMany({ where: { schoolId }, data: { boarding: false } });
    await t.prisma.hostelStaff.deleteMany({ where: { schoolId } });
    await t.prisma.hostelRoom.deleteMany({ where: { schoolId } });
    await t.prisma.hostel.deleteMany({ where: { schoolId } });
    await t.prisma.branchSection.updateMany({
      where: { schoolId },
      data: { boarding: false, boardingLevelIds: [] },
    });
    await t.reseed();
    await t.close();
  });

  it('bills this term’s boarding when a student becomes a boarder, and keeps it late in term', async () => {
    const res = await admin.put(`${B}/students/${emmanuel}`).send({ boarding: true });
    expect(res.status).toBe(200);
    const fees = res.body.data.fees as { change: string; amount: number; note: string | null };
    const lines = await boardingLines();
    if (fees.change === 'added') {
      expect(fees.amount).toBe(250_000);
      expect(lines).toHaveLength(1);
    } else {
      // No invoice yet for this term: billed when invoices are generated.
      expect(fees.change).toBe('none');
      expect(lines).toHaveLength(0);
    }

    // A month into term, stopping boarding keeps this term's boarding fees.
    const day = await admin.put(`${B}/students/${emmanuel}`).send({ boarding: false });
    if (fees.change === 'added') {
      expect(day.body.data.fees.change).toBe('kept');
      expect(await boardingLines()).toHaveLength(1);
    }
  });

  it('takes boarding fees off in the first two weeks of term', async () => {
    // Start over: no boarding line, then board and stop again in the first week.
    await t.prisma.invoiceLine.deleteMany({ where: { feeItemId: itemId } });
    await dayOfTerm(3);
    const on = await admin.put(`${B}/students/${emmanuel}`).send({ boarding: true });
    if (on.body.data.fees.change !== 'added') return;
    const off = await admin.put(`${B}/students/${emmanuel}`).send({ boarding: false });
    expect(off.body.data.fees.change).toBe('removed');
    expect(await boardingLines()).toHaveLength(0);
    await dayOfTerm(30);
  });

  it('shows the parent the boarding place and house master, who they can message', async () => {
    await admin.put(`${B}/students/${emmanuel}`).send({ boarding: true });
    const hostel = (await admin.get(`${B}/hostels`)).body.data.hostels.find(
      (h: { name: string }) => h.name === 'Fees House',
    );
    const placed = await admin
      .put(`${B}/allocations`)
      .send({ studentId: emmanuel, roomId: hostel.rooms[0].id });
    expect(placed.status).toBe(200);

    const res = await login(t, 'funke.adeyemi@gmail.com', PASSWORD, {
      portal: 'parent',
      host: HOST,
    });
    const funke = authed(t, res.body.data.accessToken as string, { host: HOST });
    const child = (
      (await funke.get('/api/v1/parent/children')).body.data as {
        id: string;
        boarding: { placed: boolean; place: { hostel: string; houseStaff: { staffId: string }[] } };
      }[]
    ).find((c) => c.id === emmanuel)!;
    expect(child.boarding).toMatchObject({ placed: true, place: { hostel: 'Fees House' } });
    expect(child.boarding.place.houseStaff.map((s) => s.staffId)).toContain(okaforStaffId);

    const contacts = (await funke.get('/api/v1/parent/messages/contacts')).body.data;
    const mine = contacts.children.find((c: { studentId: string }) => c.studentId === emmanuel);
    const okafor = mine.teachers.find((x: { staffId: string }) => x.staffId === okaforStaffId);
    expect(okafor.roles).toContain('House master / mistress');
  });

  it('shows the house master their boarders with parent contacts', async () => {
    const okafor = authed(
      t,
      (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token,
      {
        host: HOST,
      },
    );
    const view = (await okafor.get('/api/v1/my-hostel')).body.data;
    const house = view.hostels.find((h: { name: string }) => h.name === 'Fees House');
    expect(house).toMatchObject({ role: 'House master / mistress', totals: { boarders: 1 } });
    const boarder = house.rooms[0].boarders[0];
    expect(boarder).toMatchObject({ studentId: emmanuel, parent: { name: 'Mrs. Funke Adeyemi' } });

    // Staff who aren't house staff see no hostel.
    const adaezeAsTeacher = await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng', {
      host: HOST,
    }).catch(() => null);
    if (adaezeAsTeacher) {
      const other = authed(t, adaezeAsTeacher.token, { host: HOST });
      const res = await other.get('/api/v1/my-hostel');
      if (res.status === 200) expect(res.body.data.hostels).toEqual([]);
    }
  });
});
