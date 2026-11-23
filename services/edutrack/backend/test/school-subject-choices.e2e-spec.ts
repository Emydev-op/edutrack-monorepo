import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

type Api = ReturnType<typeof authed>;

interface Subject {
  subjectId: string;
  code: string;
  name: string;
}
interface Group {
  id: string | null;
  name: string;
  minPicks: number;
  maxPicks: number;
  rule: string;
  subjects: Subject[];
}
interface Options {
  compulsory: Subject[];
  religious: Subject[];
  groups: Group[];
}

const PHONE = '+2348095550444';

/**
 * Subject choices: admission offers what the class level teaches (one religious subject and the
 * curriculum's elective groups, with their minimum and maximum picks); a student's subjects can
 * be changed later, optionally with a move to another arm; and a whole class's choices can be
 * reviewed and saved at once.
 */
describe('Subject choices (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let schoolId: string;
  let options: Options;
  let studentId: string;

  /** The fewest picks that meet every group's rule (at least one where a group allows it). */
  const validPicks = (o: Options, offset = 0) => ({
    religious: o.religious[0]?.subjectId ?? null,
    electives: o.groups.flatMap((g) => {
      const n = Math.max(g.minPicks, Math.min(1, g.maxPicks));
      const list = g.subjects.map((s) => s.subjectId);
      return Array.from({ length: n }, (_, i) => list[(i + offset) % list.length]!);
    }),
  });

  const admit = (subjects: unknown, firstName = 'Zara') =>
    admin.post('/api/v1/admissions').send({
      applicationId: null,
      surname: 'Ekpo',
      firstName,
      otherNames: '',
      gender: 'Female',
      dateOfBirth: '2011-03-02',
      stateOfOrigin: 'akwa ibom',
      previousSchool: '',
      guardian: { mode: 'new', name: 'Mrs. Idara Ekpo', phone: PHONE, email: '' },
      relationship: 'Mother',
      paysFees: true,
      invite: false,
      branch: 'Main Campus',
      level: 'SSS 1',
      arm: 'A',
      admissionType: 'New intake',
      admissionDate: '',
      documents: { birth: 'birth.pdf', photo: null, report: null },
      billing: 'defer',
      siblingDiscount: false,
      subjects,
    });

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    schoolId = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
  });

  afterAll(async () => {
    const students = await t.prisma.student.findMany({
      where: { schoolId, surname: 'Ekpo', firstName: { in: ['Zara', 'Yemi'] } },
      select: { id: true },
    });
    const ids = students.map((s) => s.id);
    await t.prisma.invoice.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.studentSubject.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.studentGuardian.deleteMany({ where: { studentId: { in: ids } } });
    await t.prisma.student.deleteMany({ where: { id: { in: ids } } });
    await t.prisma.guardian.deleteMany({ where: { schoolId, phone: PHONE } });
    await t.reseed();
    await t.close();
  });

  it('offers what the class level teaches, grouped with each group’s rule', async () => {
    const res = await admin
      .get('/api/v1/admissions/subject-options')
      .query({ branch: 'Main Campus', level: 'SSS 1' });
    expect(res.status).toBe(200);
    options = res.body.data as Options;
    expect(options.compulsory.length).toBeGreaterThan(0);
    expect(options.groups.length).toBeGreaterThan(0);
    for (const g of options.groups) {
      expect(g.subjects.length).toBeGreaterThan(0);
      expect(g.maxPicks).toBeGreaterThanOrEqual(g.minPicks);
      expect(g.rule).toMatch(/^choose /);
    }
    // Compulsory subjects never appear as electives.
    const electiveIds = new Set(options.groups.flatMap((g) => g.subjects.map((s) => s.subjectId)));
    expect(options.compulsory.some((s) => electiveIds.has(s.subjectId))).toBe(false);
  });

  it('admits a student with subjects that meet the rules, and refuses ones that don’t', async () => {
    const tooMany = {
      religious: options.religious[0]?.subjectId ?? null,
      electives: options.groups.flatMap((g) => g.subjects.map((s) => s.subjectId)),
    };
    const overLimit = options.groups.some((g) => g.subjects.length > g.maxPicks);
    if (overLimit) {
      const bad = await admit(tooMany);
      expect(bad.status).toBe(422);
      expect(bad.body.error.fields['subjects.electives']).toBeTruthy();
    }
    const unknown = await admit({ religious: null, electives: ['not-a-subject'] });
    expect(unknown.status).toBe(422);

    const picks = validPicks(options);
    const res = await admit(picks);
    expect(res.status).toBe(201);
    studentId = res.body.data.studentId;
    const saved = await t.prisma.studentSubject.findMany({ where: { studentId } });
    expect(saved.map((s) => s.subjectId).sort()).toEqual(
      [picks.religious, ...picks.electives].filter(Boolean).sort(),
    );
    // Electives remember their group.
    const grouped = options.groups.filter((g) => g.id);
    if (grouped.length)
      expect(saved.some((s) => grouped.some((g) => g.id === s.groupId))).toBe(true);
  });

  it('shows the student’s subjects and changes them, moving them to another arm', async () => {
    const view = (await admin.get(`/api/v1/students/${studentId}/subjects`)).body.data;
    expect(view).toMatchObject({ enrolled: true, editable: true, complete: true });
    expect(view.className).toBe('SSS 1A');
    const armB = (view.arms as { id: string; label: string }[]).find((a) => a.label === 'SSS 1B')!;

    // A group with a spare subject lets us swap one elective for another.
    const g = options.groups.find((x) => x.subjects.length > Math.max(x.minPicks, 1));
    const next = g ? validPicks(options, 1) : validPicks(options);
    const res = await admin.put(`/api/v1/students/${studentId}/subjects`).send({
      ...next,
      effectiveOn: '2026-11-23',
      armId: armB.id,
      reason: 'Moved from Arts to Science',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ className: 'SSS 1B', complete: true });
    expect(res.body.data.chosen.electives.sort()).toEqual([...next.electives].sort());
    const audit = await t.prisma.auditEvent.findFirst({
      where: { action: 'student.subjects', entityId: studentId },
    });
    expect(audit?.detail).toContain('Moved to SSS 1B');

    const bad = await admin
      .put(`/api/v1/students/${studentId}/subjects`)
      .send({ religious: null, electives: ['nope'] });
    expect(bad.status).toBe(422);
  });

  it('reviews and saves a whole class’s choices', async () => {
    const arm = await t.prisma.classArm.findFirstOrThrow({
      where: { schoolId, name: 'B', level: { name: 'SSS 1' }, branch: { name: 'Main Campus' } },
    });
    const res = await admin.get(`/api/v1/subject-choices/${arm.id}`);
    expect(res.status).toBe(200);
    const view = res.body.data as {
      className: string;
      students: { studentId: string; complete: boolean }[];
      needChoosing: number;
    };
    expect(view.className).toBe('SSS 1B');
    expect(view.students.find((s) => s.studentId === studentId)).toMatchObject({ complete: true });
    expect(view.needChoosing).toBe(view.students.filter((s) => !s.complete).length);

    const saved = await admin
      .put(`/api/v1/subject-choices/${arm.id}`)
      .send({ students: [{ studentId, ...validPicks(options) }] });
    expect(saved.status).toBe(200);
    expect(
      saved.body.data.students.find((s: { studentId: string }) => s.studentId === studentId),
    ).toMatchObject({ complete: true });

    const wrong = await admin
      .put(`/api/v1/subject-choices/${arm.id}`)
      .send({ students: [{ studentId, religious: null, electives: ['nope'] }] });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.fields['students.0']).toContain('Zara Ekpo');
  });
});
