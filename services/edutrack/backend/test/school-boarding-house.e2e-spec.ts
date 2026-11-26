import {
  authed,
  createTestApp,
  login,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const B = '/api/v1/boarding';
const S = '/api/v1/staff-boarding';
const P = '/api/v1/parent/boarding';
const HOUR = 3_600_000;

/** "2026-11-26T15:00" in Lagos time, as the screens send it. */
const lagos = (ms: number) => new Date(ms + HOUR).toISOString().slice(0, 16);

/**
 * Running the boarding house: a parent approves pickup people and asks for an exeat; the house
 * master approves it in the staff workspace; the gate signs the boarder out to an approved person
 * and back in; roll calls mark exeats and the sick bay automatically and alert parents about
 * absences; the nurse records sick bay visits; incidents shared with parents and visiting days
 * show in the Parent Portal; and each step is limited to the right staff.
 */
describe('Boarding house management (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let okafor: Api;
  let funke: Api;
  let schoolId: string;
  let emmanuel: string;
  let hostelId: string;
  let exeatId: string;
  let pickupId: string;

  /** Whether a boarding alert with this title went out (in-app). */
  const notified = async (title: RegExp) =>
    (
      await t.prisma.notification.findMany({
        where: { schoolId, category: 'boarding' },
        select: { title: true },
      })
    ).some((n) => title.test(n.title));

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    const student = await t.prisma.student.findFirstOrThrow({
      where: { schoolId, admissionNo: 'STU-2025-0042' },
    });
    emmanuel = student.id;
    const session = await t.prisma.academicSession.findFirstOrThrow({
      where: { schoolId, status: 'ACTIVE' },
    });
    const e = await t.prisma.enrollment.findFirstOrThrow({
      where: { studentId: emmanuel, sessionId: session.id },
      include: { level: true },
    });
    await admin.put(`${B}/settings`).send({
      campuses: [
        { branchId: e.branchId, sections: [{ sectionId: e.level.sectionId, boarding: true }] },
      ],
    });
    const h = (
      await admin
        .post(`${B}/hostels`)
        .send({ branchId: e.branchId, name: 'Test House', gender: 'Boys' })
    ).body.data;
    hostelId = h.id;
    const room = (
      await admin.post(`${B}/hostels/${hostelId}/rooms`).send({ name: 'Room 1', capacity: 4 })
    ).body.data.rooms[0];
    const staff = await t.prisma.staff.findFirstOrThrow({
      where: { schoolId, membership: { user: { email: 'g.okafor@greenfield.edu.ng' } } },
    });
    await admin
      .put(`${B}/hostels/${hostelId}/staff`)
      .send({ entries: [{ staffId: staff.id, role: 'House master / mistress' }] });
    await admin.put(`${B}/students/${emmanuel}`).send({ boarding: true });
    await admin.put(`${B}/allocations`).send({ studentId: emmanuel, roomId: room.id });

    okafor = authed(t, (await signIn(t, 'g.okafor@greenfield.edu.ng', { host: HOST })).token, {
      host: HOST,
    });
    const res = await login(t, 'funke.adeyemi@gmail.com', PASSWORD, {
      portal: 'parent',
      host: HOST,
    });
    funke = authed(t, res.body.data.accessToken as string, { host: HOST });
  });

  afterAll(async () => {
    await t.prisma.notification.deleteMany({ where: { schoolId, category: 'boarding' } });
    await t.prisma.rollCall.deleteMany({ where: { schoolId } });
    await t.prisma.exeat.deleteMany({ where: { schoolId } });
    await t.prisma.pickupPerson.deleteMany({ where: { schoolId } });
    await t.prisma.gateVisitor.deleteMany({ where: { schoolId } });
    await t.prisma.sickBayVisit.deleteMany({ where: { schoolId } });
    await t.prisma.hostelIncident.deleteMany({ where: { schoolId } });
    await t.prisma.visitingDay.deleteMany({ where: { schoolId } });
    await t.prisma.propertyCheck.deleteMany({ where: { schoolId } });
    await t.prisma.boardingChecklistItem.deleteMany({ where: { schoolId } });
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

  it('tells the staff workspace what the house master may do', async () => {
    const me = (await okafor.get('/api/v1/me')).body.data;
    expect(me.boarding).toMatchObject({
      houseStaff: true,
      view: true,
      rollcall: true,
      exeats: true,
      gate: false,
    });
    expect(me.teaches).toBe(true);
  });

  it('lets a parent approve a pickup person and ask for an exeat, which the house master approves', async () => {
    const added = await funke.post(`${P}/${emmanuel}/pickups`).send({
      name: 'Mr. Tunde Bakare',
      relationship: 'Uncle',
      phone: '0803 555 0101',
      note: 'Blue Corolla',
    });
    expect(added.status).toBe(201);
    pickupId = added.body.data[0].id;

    const now = t.clock.now().getTime();
    const bad = await funke
      .post(`${P}/${emmanuel}/exeats`)
      .send({ kind: 'Weekend', leaveAt: lagos(now + 5 * HOUR), returnBy: lagos(now + 2 * HOUR) });
    expect(bad.body.error.fields.returnBy).toBeTruthy();

    const asked = await funke.post(`${P}/${emmanuel}/exeats`).send({
      kind: 'Weekend',
      leaveAt: lagos(now + 2 * HOUR),
      returnBy: lagos(now + 50 * HOUR),
      pickupPersonId: pickupId,
    });
    expect(asked.status).toBe(201);
    exeatId = asked.body.data.id;
    expect(asked.body.data).toMatchObject({ status: 'Requested', requestedBy: 'Parent' });

    const inbox = (await okafor.get(`${S}/exeats?status=Requested`)).body.data;
    expect(inbox.exeats.map((x: { id: string }) => x.id)).toContain(exeatId);
    const declineNoReason = await okafor
      .post(`${S}/exeats/${exeatId}/decide`)
      .send({ approve: false });
    expect(declineNoReason.body.error.fields.note).toBeTruthy();
    const ok = await okafor.post(`${S}/exeats/${exeatId}/decide`).send({ approve: true });
    expect(ok.body.data.status).toBe('Approved');
    expect(await notified(/Exeat approved/)).toBe(true);
    // A house master can't work the gate.
    expect((await okafor.get(`${S}/gate`)).status).toBe(403);
  });

  it('signs the boarder out to an approved person and back in at the gate', async () => {
    const gate = (await admin.get(`${B}/gate`)).body.data;
    const leaving = gate.leaving.find((x: { id: string }) => x.id === exeatId);
    expect(leaving.collectors.map((c: { key: string }) => c.key)).toEqual([`pickup:${pickupId}`]);
    const wrong = await admin
      .post(`${B}/exeats/${exeatId}/sign-out`)
      .send({ collector: 'guardian:nobody' });
    expect(wrong.body.error.fields.collector).toBeTruthy();
    const out = await admin
      .post(`${B}/exeats/${exeatId}/sign-out`)
      .send({ collector: `pickup:${pickupId}` });
    expect(out.body.data).toMatchObject({ status: 'Out', collectedBy: 'Mr. Tunde Bakare (Uncle)' });
    expect(await notified(/has left school/)).toBe(true);

    // At roll call he's marked On exeat automatically.
    const sheet = (await okafor.get(`${S}/roll-calls/${hostelId}?slot=Night`)).body.data;
    expect(
      sheet.boarders.find((b: { studentId: string }) => b.studentId === emmanuel),
    ).toMatchObject({
      automatic: 'On exeat',
    });
    const dash = (await admin.get(`${B}/dashboard`)).body.data;
    expect(dash.exeats.out).toBe(1);

    const back = await admin.post(`${B}/exeats/${exeatId}/sign-in`);
    expect(back.body.data.status).toBe('Returned');
    expect(await notified(/is back at school/)).toBe(true);
  });

  it('takes a roll call and alerts the parents of a missing boarder', async () => {
    const sheet = (await okafor.get(`${S}/roll-calls/${hostelId}?slot=Morning`)).body.data;
    expect(sheet.slots).toEqual(['Morning', 'Night']);
    const unmarked = await okafor
      .put(`${S}/roll-calls/${hostelId}`)
      .send({ slot: 'Morning', marks: [] });
    expect(unmarked.body.error.fields.marks).toContain('Mark everyone');
    const saved = await okafor.put(`${S}/roll-calls/${hostelId}`).send({
      slot: 'Morning',
      marks: sheet.boarders.map((b: { studentId: string }) => ({
        studentId: b.studentId,
        mark: b.studentId === emmanuel ? 'Absent' : 'Present',
        note: b.studentId === emmanuel ? 'Not in his bed' : '',
      })),
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ taken: true, counts: { absent: 1 } });
    expect(await notified(/missed roll call/)).toBe(true);
    const day = (await admin.get(`${B}/roll-calls`)).body.data;
    const house = day.hostels.find((h: { id: string }) => h.id === hostelId);
    expect(house.slots.find((s: { slot: string }) => s.slot === 'Morning')).toMatchObject({
      taken: true,
      absent: 1,
    });
  });

  it('records a sick bay admission, shown at roll call, and discharges', async () => {
    // House staff can't see sick bay records; the nurse (or the Head of boarding) can.
    expect((await okafor.get(`${S}/sick-bay`)).status).toBe(403);
    const visit = await admin.post(`${B}/sick-bay`).send({
      studentId: emmanuel,
      complaint: 'Fever and headache',
      treatment: 'Rest, fluids',
      medication: 'Paracetamol 500mg',
      outcome: 'Admitted',
    });
    expect(visit.status).toBe(201);
    expect(visit.body.data).toMatchObject({ inSickBay: true, outcome: 'Admitted' });
    expect(await notified(/visited the sick bay/)).toBe(true);
    const twice = await admin
      .post(`${B}/sick-bay`)
      .send({ studentId: emmanuel, complaint: 'Again', outcome: 'Admitted' });
    expect(twice.body.error.code).toBe('ALREADY_ADMITTED');
    const sheet = (await okafor.get(`${S}/roll-calls/${hostelId}?slot=Night`)).body.data;
    expect(
      sheet.boarders.find((b: { studentId: string }) => b.studentId === emmanuel).automatic,
    ).toBe('Sick bay');
    const out = await admin
      .post(`${B}/sick-bay/${visit.body.data.id}/discharge`)
      .send({ note: 'Better' });
    expect(out.body.data.inSickBay).toBe(false);
  });

  it('shows the parent shared incidents, visiting days, sick bay visits and property checks', async () => {
    await okafor.post(`${S}/incidents`).send({
      studentId: emmanuel,
      category: 'Lateness',
      description: 'Late back from prep three times this week.',
      action: 'Spoke with him; extra duty.',
      shareWithParent: true,
    });
    await okafor
      .post(`${S}/incidents`)
      .send({ studentId: emmanuel, category: 'Untidiness', description: 'Bed not made.' });
    const day = new Date(t.clock.now().getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
    const visiting = await admin
      .post(`${B}/visiting-days`)
      .send({ date: day, startsAt: '10:00', endsAt: '16:00', note: 'Bring provisions' });
    expect(visiting.status).toBe(201);
    const checklist = (await okafor.get(`${S}/checklist`)).body.data as { name: string }[];
    const check = await okafor.put(`${S}/students/${emmanuel}/property`).send({
      kind: 'Check-in',
      items: checklist.map((i) => ({ item: i.name, present: i.name !== 'Bucket', quantity: 1 })),
    });
    expect(check.body.data.checkIn.items).toHaveLength(checklist.length);

    const view = (await funke.get(`${P}/${emmanuel}`)).body.data;
    expect(view.boarder).toBe(true);
    expect(view.incidents.map((i: { category: string }) => i.category)).toEqual(['Lateness']);
    expect(view.visitingDays[0]).toMatchObject({ date: day, startsAt: '10:00' });
    expect(view.sickBay[0]).toMatchObject({ complaint: 'Fever and headache' });
    expect(view.exeats[0]).toMatchObject({ id: exeatId, status: 'Returned' });
    expect(
      view.property.checkIn.items.find((i: { item: string }) => i.item === 'Bucket').present,
    ).toBe(false);
  });

  it('sends every boarder home for a term break, collected by any parent or approved person', async () => {
    const e = await t.prisma.enrollment.findFirstOrThrow({ where: { studentId: emmanuel } });
    const now = t.clock.now().getTime();
    // House staff can't send everyone home; the Head of boarding (or admin) can.
    expect(
      (
        await okafor.post(`${S}/exeats/term-break`).send({
          branchId: e.branchId,
          leaveAt: lagos(now + HOUR),
          returnBy: lagos(now + 240 * HOUR),
        })
      ).status,
    ).toBe(403);
    const sent = await admin.post(`${B}/exeats/term-break`).send({
      branchId: e.branchId,
      leaveAt: lagos(now + HOUR),
      returnBy: lagos(now + 240 * HOUR),
      reason: 'Mid-term break',
    });
    expect(sent.body.data.created).toBeGreaterThanOrEqual(1);
    const mine = (await funke.get(`${P}/${emmanuel}`)).body.data.exeats.find(
      (x: { kind: string }) => x.kind === 'Term break',
    );
    const guardian = await t.prisma.guardian.findFirstOrThrow({
      where: { schoolId, fullName: { contains: 'Funke Adeyemi' } },
    });
    const out = await admin
      .post(`${B}/exeats/${mine.id}/sign-out`)
      .send({ collector: `guardian:${guardian.id}` });
    expect(out.body.data.status).toBe('Out');
  });
});
