import type { InvitationData } from '../src/notifications/templates/templates.js';
import {
  authed,
  createTestApp,
  nextIp,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

type Api = ReturnType<typeof authed>;
type Curriculum = Record<string, Record<string, Record<string, 'C' | 'E'>>>;

/**
 * Curriculum v2 at Greenfield: subjects that belong to a section, lessons per week per class
 * level and arm, subjects only some arms take, co-teachers, and admins who manage only some
 * sections (e.g. the Primary admin can't change Junior Secondary).
 */
describe('Sections, per-arm curriculum and co-teachers (e2e)', () => {
  let t: TestApp;
  let admin: Api;
  let primaryAdmin: Api;
  const suffix = Date.now().toString(36);

  const curriculum = async (api: Api = admin) =>
    (await api.get('/api/v1/academics/curriculum')).body.data;
  const saveCurriculum = (api: Api, body: object) =>
    api.put('/api/v1/academics/curriculum').send(body);

  // Subjects this file adds (the demo seed leaves extra subjects in place).
  const ADDED = ['ENPX', 'ENJX', 'PRX', 'JSX', 'SHX'];
  const removeAdded = async () => {
    const ids = (
      await t.prisma.subject.findMany({ where: { code: { in: ADDED } }, select: { id: true } })
    ).map((s) => s.id);
    await t.prisma.teachingAssignment.deleteMany({ where: { subjectId: { in: ids } } });
    await t.prisma.curriculumEntry.deleteMany({ where: { subjectId: { in: ids } } });
    await t.prisma.subject.deleteMany({ where: { id: { in: ids } } });
  };

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    await removeAdded();
    admin = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);

    // A second admin who runs the Primary section only.
    const email = `primary.admin.${suffix}@example.com`;
    const invite = await admin.post('/api/v1/users/invitations').send({
      staffId: null,
      name: 'Mrs. Bisi Primary',
      email,
      roles: ['School Admin'],
      scope: 'School',
      branches: [],
      sections: ['Primary'],
    });
    expect(invite.status).toBe(201);
    expect(invite.body.data.sections).toEqual(['Primary']);
    const token = decodeURIComponent(
      (t.notifications.find(email, 'invitation')!.data as InvitationData).link
        .split('/')
        .pop()!
        .split('?')[0]!,
    );
    const accept = await t
      .http()
      .post(`/api/v1/auth/invitations/${token}/accept`)
      .set('X-Forwarded-For', nextIp())
      .send({ firstName: 'Bisi', lastName: 'Primary', password: PASSWORD });
    expect(accept.status).toBe(200);
    const session = await signIn(t, email);
    expect(session.body.data.user.sections).toEqual(['Primary']);
    primaryAdmin = authed(t, session.token);
  });

  afterAll(async () => {
    await removeAdded();
    await t.reseed();
    await t.close();
  });

  describe('subjects per section', () => {
    it('lets two sections each have English, but not twice in one', async () => {
      const add = (api: Api, body: object) =>
        api.post('/api/v1/academics/subjects').send({ category: 'Core', periods: 5, ...body });
      const pri = await add(admin, { code: 'ENPX', name: 'Oratory', section: 'Primary' });
      expect(pri.status).toBe(201);
      const again = await add(admin, { code: 'ENPY', name: 'Oratory', section: 'Primary' });
      expect(again.body.error.code).toBe('SUBJECT_NAME_TAKEN');
      const jss = await add(admin, { code: 'ENJX', name: 'Oratory', section: 'Junior Secondary' });
      expect(jss.status).toBe(201);
      const v = await curriculum();
      const phonics = v.subjects.filter((s: { name: string }) => s.name === 'Oratory');
      expect(phonics.map((s: { section: string }) => s.section).sort()).toEqual([
        'Junior Secondary',
        'Primary',
      ]);
    });

    it('keeps a section’s subject on its own classes', async () => {
      const v = await curriculum();
      const c: Curriculum = structuredClone(v.curriculum);
      const jss1 = Object.keys(c['Junior Secondary'] ?? {})[0]!;
      c['Junior Secondary']![jss1]!['ENPX'] = 'C';
      const res = await saveCurriculum(admin, { curriculum: c, groups: v.groups });
      expect(res.body.error.code).toBe('SUBJECT_IN_OTHER_SECTION');
    });
  });

  describe('section admins', () => {
    it('change their own section and nothing else', async () => {
      const add = (body: object) =>
        primaryAdmin
          .post('/api/v1/academics/subjects')
          .send({ category: 'Core', periods: 3, ...body });
      expect((await add({ code: 'PRX', name: 'Handwriting', section: 'Primary' })).status).toBe(
        201,
      );
      const theirs = await add({ code: 'JSX', name: 'Debate', section: 'Junior Secondary' });
      expect(theirs.status).toBe(403);
      expect(theirs.body.error.code).toBe('SECTION_FORBIDDEN');
      expect(theirs.body.message).toMatch(/can’t change subjects in Junior Secondary/);
      const shared = await add({ code: 'SHX', name: 'Assembly', section: null });
      expect(shared.body.message).toBe('Only a whole-school admin can change subjects.');

      // The curriculum view says what they may edit.
      const v = await curriculum(primaryAdmin);
      expect(v.mySections).toEqual(['Primary']);
      expect(v.levels.find((l: { section: string }) => l.section === 'Primary').canEdit).toBe(true);
      expect(
        v.levels.find((l: { section: string }) => l.section === 'Junior Secondary').canEdit,
      ).toBe(false);

      // Changing Junior Secondary's curriculum is refused; Primary's goes through.
      const c: Curriculum = structuredClone(v.curriculum);
      const jss1 = Object.keys(c['Junior Secondary'] ?? {})[0]!;
      const jssSubject = Object.keys(c['Junior Secondary']![jss1]!)[0]!;
      delete c['Junior Secondary']![jss1]![jssSubject];
      const refused = await saveCurriculum(primaryAdmin, { curriculum: c, groups: v.groups });
      expect(refused.status).toBe(403);
      const p: Curriculum = structuredClone(v.curriculum);
      const pri1 = Object.keys(p['Primary'] ?? {})[0]!;
      p['Primary']![pri1]!['PRX'] = 'C';
      const ok = await saveCurriculum(primaryAdmin, { curriculum: p, groups: v.groups });
      expect(ok.body.message ?? '').not.toMatch(/can’t change/);
      expect(ok.status).toBe(200);

      // School-wide things stay with whole-school admins.
      const sections = await primaryAdmin.put('/api/v1/academics/sections').send({ sections: [] });
      expect(sections.status).toBe(403);
    });
  });

  describe('lessons per week and arms', () => {
    it('sets lessons per week per level, and lets only some arms take a subject', async () => {
      const v = await curriculum();
      const sss1 = 'SSS 1';
      const offered = v.curriculum['Senior Secondary']?.[sss1] as Record<string, string>;
      expect(offered).toBeTruthy();
      const code = Object.keys(offered)[0]!;
      const arms = v.levels.find((l: { section: string }) => l.section === 'Senior Secondary').arms[
        sss1
      ] as { id: string; name: string; branch: string }[];
      const main = arms.filter((a) => a.branch === 'Main Campus');
      const [armA, armB] = [main.find((a) => a.name === 'A')!, main.find((a) => a.name === 'B')!];

      const res = await saveCurriculum(admin, {
        curriculum: v.curriculum,
        groups: v.groups,
        periods: { 'Senior Secondary': { [sss1]: { [code]: 8 } } },
        arms: { 'Senior Secondary': { [sss1]: { [code]: { [armA.id]: null } } } },
      });
      expect(res.status).toBe(200);
      const after = await curriculum();
      expect(after.periods['Senior Secondary'][sss1][code]).toBe(8);
      expect(after.arms['Senior Secondary'][sss1][code]).toEqual({ [armA.id]: null });

      // Teachers can only be given that subject in the arms that take it.
      const plan = (await admin.get('/api/v1/academics/assignments')).body.data;
      const branchId = (plan.arms as { id: string; branchId: string }[]).find(
        (a) => a.id === armA.id,
      )!.branchId;
      const teachers = (
        plan.teachers as { id: string; periods: number; maxPeriods: number; branches: string[] }[]
      )
        .filter((x) => x.branches.includes(branchId) && x.maxPeriods - x.periods > 20)
        .slice(0, 2);
      expect(teachers.length).toBe(2);
      const assign = (armId: string, teacherId: string, role?: string) =>
        admin
          .post('/api/v1/academics/assignments')
          .send({ teacherId, subject: code, armId, ...(role && { role }) });
      const wrongArm = await assign(armB.id, teachers[0]!.id);
      expect(wrongArm.status).toBe(422);
      expect(wrongArm.body.message).toMatch(/doesn’t take/);

      // A lead teacher and a co-teacher share SSS 1A; the lead's lessons are 8 a week.
      const lead = await assign(armA.id, teachers[0]!.id);
      expect(lead.body.message).toBe('Assignment saved.');
      const co = await assign(armA.id, teachers[1]!.id, 'Co-teacher');
      expect(co.status).toBe(201);
      const rows = (
        co.body.data.assignments as {
          id: string;
          teacherId: string;
          armId: string;
          subject: string;
          role: string;
          periods: number;
        }[]
      ).filter((r) => r.armId === armA.id && r.subject === code);
      expect(rows.map((r) => r.role).sort()).toEqual(['Co-teacher', 'Lead']);
      expect(rows.every((r) => r.periods === 8)).toBe(true);

      // Removing the lead hands the class to the co-teacher.
      const leadRow = rows.find((r) => r.role === 'Lead')!;
      const removed = await admin.delete(`/api/v1/academics/assignments/${leadRow.id}`);
      expect(removed.status).toBe(200);
      const left = (
        removed.body.data.assignments as {
          armId: string;
          subject: string;
          role: string;
          teacherId: string;
        }[]
      ).filter((r) => r.armId === armA.id && r.subject === code);
      expect(left).toEqual([expect.objectContaining({ role: 'Lead', teacherId: teachers[1]!.id })]);
    });
  });
});
