import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

/**
 * Academics, Phase 3a: subjects and curriculum, teacher assignments, timetable, assessment and
 * grading, attendance and their Setup Center steps. Greenfield is seeded with the Nigerian
 * curriculum, this term's assignments, JSS 2B's published timetable and registers; Crestview is
 * new and empty.
 */

type Api = ReturnType<typeof authed>;
const GF = 'adaeze.okonkwo@greenfield.edu.ng';
const CV = 'e.udo@crestviewcollege.ng';
const A = '/api/v1/academics';

interface Assignment {
  id: string;
  teacherId: string;
  teacher: string;
  subject: string;
  armId: string;
  arm: string;
  type: string;
  periods: number;
}
interface AssignmentsView {
  term: string;
  assignments: Assignment[];
  teachers: {
    id: string;
    name: string;
    periods: number;
    maxPeriods: number;
    qualified: string[];
    branches: string[];
    classTeacherOf: string[];
  }[];
  gaps: { subject: string; arms: { id: string; name: string }[] }[];
  armsWithoutClassTeacher: { id: string; name: string }[];
  arms: { id: string; name: string; branch: string; branchId: string; subjects: string[] }[];
}
interface TimetableView {
  armId: string;
  arm: string;
  status: string;
  version: number;
  publishedVersion: number | null;
  periods: { id: string; label: string; isBreak: boolean }[];
  grid: Record<string, string>;
  palette: { code: string; teacherId: string | null; need: number }[];
  busy: Record<string, Record<string, string>>;
  history: { title: string }[];
}

describe('School academics, Phase 3a (e2e)', () => {
  let t: TestApp;
  let gf: Api;
  let cv: Api;

  const assignments = async () => (await gf.get(`${A}/assignments`)).body.data as AssignmentsView;
  const armNamed = async (name: string, branch = 'Main Campus') =>
    (await assignments()).arms.find((a) => a.name === name && a.branch === branch)!;
  const timetable = async (armId: string) =>
    (await gf.get(`${A}/timetable?arm=${armId}`)).body.data as TimetableView;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    gf = authed(t, (await signIn(t, GF)).token);
    cv = authed(t, (await signIn(t, CV)).token);
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  /* ---------------- Subjects & curriculum ---------------- */

  describe('Subjects & curriculum', () => {
    it('lists subjects, what each class offers, elective groups and levels by section', async () => {
      const res = await gf.get(`${A}/curriculum`);
      expect(res.status).toBe(200);
      const v = res.body.data;
      expect(v.subjects.find((s: { code: string }) => s.code === 'MTH')).toMatchObject({
        name: 'Mathematics',
        category: 'Core',
        status: 'Active',
        periods: 5,
        hasScores: false,
      });
      expect(v.curriculum['Junior Secondary']['JSS 1']).toMatchObject({ MTH: 'C', FRE: 'E' });
      expect(v.groups.map((g: { name: string }) => g.name)).toEqual(
        expect.arrayContaining(['Religious Studies', 'Science track']),
      );
      expect(
        v.levels.find((l: { section: string }) => l.section === 'Junior Secondary').levels,
      ).toEqual(['JSS 1', 'JSS 2', 'JSS 3']);
    });

    it('adds, edits and deletes an unused subject, with the mock’s rules', async () => {
      const base = { name: 'Music', category: 'Arts', status: 'Active', periods: 2 };
      expect((await gf.post(`${A}/subjects`).send({ ...base, code: 'mu' })).body.message).toBe(
        'Use 2–4 capitals for the code, e.g. MTH.',
      );
      expect((await gf.post(`${A}/subjects`).send({ ...base, code: 'MTH' })).body.message).toBe(
        'The code MTH is already used by Mathematics.',
      );
      expect(
        (await gf.post(`${A}/subjects`).send({ ...base, code: 'MUS', name: 'mathematics' })).body
          .message,
      ).toBe('mathematics already exists.');
      expect(
        (await gf.post(`${A}/subjects`).send({ ...base, code: 'MUS', periods: 11 })).body.message,
      ).toBe('Lessons per week must be between 1 and 10.');
      const created = await gf.post(`${A}/subjects`).send({ ...base, code: 'MUS' });
      expect(created.status).toBe(201);
      expect(created.body.message).toBe('Music added.');
      const edited = await gf.put(`${A}/subjects/MUS`).send({ ...base, code: 'MUS', periods: 3 });
      expect(
        edited.body.data.subjects.find((s: { code: string }) => s.code === 'MUS').periods,
      ).toBe(3);
      expect((await gf.delete(`${A}/subjects/MUS`)).status).toBe(200);
      expect((await gf.delete(`${A}/subjects/MUS`)).status).toBe(404);
    });

    it('refuses to delete or deactivate a subject teachers are assigned to', async () => {
      const del = await gf.delete(`${A}/subjects/MTH`);
      expect(del.status).toBe(409);
      expect(del.body.error.code).toBe('SUBJECT_ASSIGNED');
      const off = await gf.put(`${A}/subjects/MTH`).send({
        code: 'MTH',
        name: 'Mathematics',
        category: 'Core',
        status: 'Inactive',
        periods: 5,
      });
      expect(off.status).toBe(409);
    });

    it('validates elective groups and clears assignments when a class stops offering a subject', async () => {
      const v = (await gf.get(`${A}/curriculum`)).body.data;
      const bad = await gf.put(`${A}/curriculum`).send({
        curriculum: v.curriculum,
        groups: [{ name: 'Tiny', section: 'Junior Secondary', subjects: ['FRE'], min: 1, max: 1 }],
      });
      expect(bad.body.message).toBe('Tiny: pick at least 2 subjects.');
      const tooMany = await gf.put(`${A}/curriculum`).send({
        curriculum: v.curriculum,
        groups: [
          { name: 'Langs', section: 'Junior Secondary', subjects: ['FRE', 'YOR'], min: 1, max: 3 },
        ],
      });
      expect(tooMany.body.message).toBe('Langs: students can’t choose 3 of 2 subjects.');

      const before = await assignments();
      const jss3 = before.assignments.filter(
        (a) => a.arm.startsWith('JSS 3') && a.subject === 'CMP',
      );
      const curriculum = structuredClone(v.curriculum);
      delete curriculum['Junior Secondary']['JSS 3'].CMP;
      const saved = await gf.put(`${A}/curriculum`).send({ curriculum, groups: v.groups });
      expect(saved.status).toBe(200);
      expect(saved.body.data.cleared).toBe(jss3.length);
      expect(saved.body.data.curriculum['Junior Secondary']['JSS 3'].CMP).toBeUndefined();
      // Elective groups keep their ids.
      expect(saved.body.data.groups.map((g: { id: string }) => g.id).sort()).toEqual(
        v.groups.map((g: { id: string }) => g.id).sort(),
      );
      const after = await assignments();
      expect(after.assignments.some((a) => a.arm.startsWith('JSS 3') && a.subject === 'CMP')).toBe(
        false,
      );
      // Put it back for the tests below.
      await gf
        .put(`${A}/curriculum`)
        .send({ curriculum: v.curriculum, groups: v.groups })
        .expect(200);
    });
  });

  /* ---------------- Teacher assignments ---------------- */

  describe('Teacher assignments', () => {
    it('shows assignments, loads, gaps and arms without a class teacher', async () => {
      const v = await assignments();
      expect(v.term).toBe('First Term');
      const jss2b = v.assignments.filter((a) => a.arm === 'JSS 2B');
      expect(jss2b.find((a) => a.subject === 'ENG')!.teacher).toBe('Mrs. Grace Okafor');
      expect(jss2b.find((a) => a.subject === 'MTH')!.teacher).toBe('Mr. Samuel Ade');
      const okafor = v.teachers.find((x) => x.name === 'Mrs. Grace Okafor')!;
      expect(okafor.classTeacherOf).toContain('JSS 2B');
      expect(okafor.periods).toBe(
        v.assignments.filter((a) => a.teacherId === okafor.id).reduce((n, a) => n + a.periods, 0),
      );
      expect(v.gaps.length).toBeGreaterThan(0);
      expect(v.armsWithoutClassTeacher.some((a) => a.name === 'SSS 1C')).toBe(true);
      // The header's branch narrows it.
      const lekki = (await gf.get(`${A}/assignments?branch=Lekki%20Campus`)).body
        .data as AssignmentsView;
      expect(lekki.arms.every((a) => a.branch === 'Lekki Campus')).toBe(true);
    });

    it('warns about branch, curriculum, workload and qualification before saving', async () => {
      const v = await assignments();
      const lekkiArm = v.arms.find(
        (a) => a.branch === 'Lekki Campus' && a.subjects.includes('MTH'),
      )!;
      const mainOnly = v.teachers.find(
        (x) =>
          x.branches.length === 1 &&
          !x.branches.includes(lekkiArm.branchId) &&
          x.name === 'Mrs. Grace Okafor',
      )!;
      const branch = await gf
        .post(`${A}/assignments/check`)
        .send({ teacherId: mainOnly.id, subject: 'MTH', armId: lekkiArm.id });
      expect(branch.body.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'branch', tone: 'error' })]),
      );
      const blocked = await gf
        .post(`${A}/assignments`)
        .send({ teacherId: mainOnly.id, subject: 'MTH', armId: lekkiArm.id });
      expect(blocked.status).toBe(422);
      expect(blocked.body.message).toBe(`Mrs. Grace Okafor doesn’t work at Lekki Campus.`);

      const sss = await armNamed('SSS 1A');
      const notOffered = await gf
        .post(`${A}/assignments/check`)
        .send({ teacherId: mainOnly.id, subject: 'BSC', armId: sss.id });
      expect(notOffered.body.data[0].text).toBe(
        'SSS 1 doesn’t offer Basic Science. Add it to the curriculum first.',
      );

      const chioma = v.teachers.find(
        (x) => x.name === 'Mrs. Chioma Eze' || x.name.includes('Chioma'),
      )!;
      const jss1a = await armNamed('JSS 1A');
      const heavy = await gf
        .post(`${A}/assignments/check`)
        .send({ teacherId: chioma.id, subject: 'MTH', armId: jss1a.id });
      const kinds = (heavy.body.data as { kind: string }[]).map((w) => w.kind);
      expect(kinds).toContain('qualification');
      if (chioma.periods + 5 > chioma.maxPeriods) expect(kinds).toContain('workload');
    });

    it('assigns, reassigns (lessons follow the teacher), and removes', async () => {
      const v = await assignments();
      const gap = v.gaps.find((g) =>
        g.arms.some((a) => v.arms.find((x) => x.id === a.id)?.branch === 'Main Campus'),
      )!;
      const armId = gap.arms.find(
        (a) => v.arms.find((x) => x.id === a.id)?.branch === 'Main Campus',
      )!.id;
      const arm = v.arms.find((x) => x.id === armId)!;
      const teacher = v.teachers
        .filter((x) => x.branches.includes(arm.branchId))
        .sort((a, b) => a.periods - b.periods)[0]!;
      const res = await gf
        .post(`${A}/assignments`)
        .send({ teacherId: teacher.id, subject: gap.subject, armId, type: 'Temporary' });
      expect(res.status).toBe(201);
      const made = (res.body.data as AssignmentsView).assignments.find(
        (a) => a.armId === armId && a.subject === gap.subject,
      )!;
      expect(made).toMatchObject({ teacherId: teacher.id, type: 'Temporary' });

      const removed = await gf.delete(`${A}/assignments/${made.id}`);
      expect(removed.status).toBe(200);
      expect((removed.body.data as AssignmentsView).assignments.some((a) => a.id === made.id)).toBe(
        false,
      );
      expect((await gf.delete(`${A}/assignments/${made.id}`)).status).toBe(404);
    });

    it('copies nothing when the previous term had no assignments', async () => {
      const res = await gf.post(`${A}/assignments/copy-previous`);
      expect(res.status).toBe(200);
      expect(res.body.data.copied).toBe(0);
      expect(res.body.message).toBe('0 assignments copied from the previous term.');
    });
  });

  /* ---------------- Timetable ---------------- */

  describe('Timetable', () => {
    it('lists arms with their status and shows JSS 2B’s published grid', async () => {
      const arms = (await gf.get(`${A}/timetable/arms?branch=Main%20Campus`)).body.data as {
        id: string;
        name: string;
        status: string;
      }[];
      expect(arms.find((a) => a.name === 'JSS 2B')!.status).toBe('Published');
      expect(arms.find((a) => a.name === 'JSS 1A')!.status).toBe('Not started');
      const jss2b = arms.find((a) => a.name === 'JSS 2B')!;
      const v = await timetable(jss2b.id);
      expect(v).toMatchObject({
        arm: 'JSS 2B',
        status: 'Published',
        version: 1,
        publishedVersion: 1,
      });
      expect(v.periods.map((p) => p.label)).toEqual([
        '1',
        '2',
        '3',
        'Break',
        '4',
        '5',
        '6',
        'Lunch',
        '7',
        '8',
      ]);
      expect(v.periods[0]!.id).toBe('P1');
      expect(
        Object.keys(v.grid).every((k) =>
          /^(Monday|Tuesday|Wednesday|Thursday|Friday)-P\d+$/.test(k),
        ),
      ).toBe(true);
      expect(v.palette.find((p) => p.code === 'MTH')!.need).toBe(5);
    });

    it('locks a published timetable until a revision starts', async () => {
      const arm = await armNamed('JSS 2B');
      const v = await timetable(arm.id);
      const locked = await gf.put(`${A}/timetable`).send({ armId: arm.id, grid: v.grid });
      expect(locked.status).toBe(409);
      expect(locked.body.message).toBe(
        'Published timetables are locked. Start a revision to change it.',
      );
      const revised = await gf.post(`${A}/timetable/revise`).send({ armId: arm.id });
      expect(revised.status).toBe(200);
      expect(revised.body.data).toMatchObject({ status: 'Draft', version: 2, publishedVersion: 1 });
      expect(revised.body.message).toBe(
        'Revision v2 started. The published version stays until you publish this one.',
      );
      expect(revised.body.data.history[0].title).toBe('Revision v2 started');
    });

    it('checks breaks, lesson counts, runs of one subject and teacher clashes', async () => {
      const jss2b = await armNamed('JSS 2B');
      const v = await timetable(jss2b.id);
      const brk = await gf
        .put(`${A}/timetable`)
        .send({ armId: jss2b.id, grid: { ...v.grid, 'Monday-P4': 'MTH' } });
      expect(brk.status).toBe(422);
      expect(brk.body.error.code).toBe('TIMETABLE_SLOT');

      const six: Record<string, string> = {};
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach(
        (d) => (six[`${d}-P1`] = 'MTH'),
      );
      six['Monday-P2'] = 'MTH';
      const count = await gf.put(`${A}/timetable`).send({ armId: jss2b.id, grid: six });
      expect(count.body.message).toBe('Mathematics has 6 lessons; it needs 5.');

      const run = await gf.put(`${A}/timetable`).send({
        armId: jss2b.id,
        grid: { 'Monday-P1': 'MTH', 'Monday-P2': 'MTH', 'Monday-P3': 'MTH' },
      });
      expect(run.body.message).toBe('More than 2 consecutive Mathematics lessons on Monday.');

      // Mr. Ade teaches JSS 2B Mathematics on Monday in some period; give him JSS 1A Maths and
      // try to put that lesson at the same time.
      const mth = v.palette.find((p) => p.code === 'MTH')!;
      const slot = Object.entries(v.grid).find(([, c]) => c === 'MTH')![0];
      const jss1a = await armNamed('JSS 1A');
      // He's near his weekly limit: free one of his other classes first.
      const his = (await assignments()).assignments.find(
        (a) => a.teacherId === mth.teacherId && a.arm !== 'JSS 2B',
      );
      if (his) await gf.delete(`${A}/assignments/${his.id}`).expect(200);
      await gf
        .post(`${A}/assignments`)
        .send({ teacherId: mth.teacherId, subject: 'MTH', armId: jss1a.id })
        .expect(201);
      const other = await timetable(jss1a.id);
      expect(other.busy[mth.teacherId!]![slot]).toBe('JSS 2B · Mathematics');
      const clash = await gf
        .put(`${A}/timetable`)
        .send({ armId: jss1a.id, grid: { [slot]: 'MTH' } });
      expect(clash.status).toBe(409);
      expect(clash.body.error.code).toBe('TIMETABLE_CLASH');
      expect(clash.body.message).toMatch(
        /^Mr\. Samuel Ade is already teaching JSS 2B · Mathematics on \w+ period \d\.$/,
      );
    });

    it('saves a draft, refuses review while lessons are missing, then reviews and publishes', async () => {
      const jss2b = await armNamed('JSS 2B');
      const v = await timetable(jss2b.id);
      const saved = await gf.put(`${A}/timetable`).send({ armId: jss2b.id, grid: v.grid });
      expect(saved.status).toBe(200);
      const partial = Object.fromEntries(Object.entries(v.grid).slice(1));
      await gf.put(`${A}/timetable`).send({ armId: jss2b.id, grid: partial }).expect(200);
      const early = await gf.post(`${A}/timetable/review`).send({ armId: jss2b.id });
      expect(early.status).toBe(422);
      expect(early.body.error.code).toBe('TIMETABLE_INCOMPLETE');
      // Fill what's empty.
      const filled = await gf.post(`${A}/timetable/suggest`).send({ armId: jss2b.id });
      expect(filled.status).toBe(200);
      const left = (filled.body.data as TimetableView).palette.reduce(
        (n, p) =>
          n +
          p.need -
          Object.values((filled.body.data as TimetableView).grid).filter((c) => c === p.code)
            .length,
        0,
      );
      if (left === 0) {
        await gf.post(`${A}/timetable/review`).send({ armId: jss2b.id }).expect(200);
        const pub = await gf.post(`${A}/timetable/publish`).send({ armId: jss2b.id });
        expect(pub.status).toBe(200);
        expect(pub.body.data).toMatchObject({ status: 'Published', publishedVersion: 2 });
        expect(pub.body.message).toBe('Version 2 published. Teachers and students see it now.');
      }
    });

    it('answers 404 for an unknown arm', async () => {
      const res = await gf.get(`${A}/timetable?arm=00000000-0000-7000-8000-000000000000`);
      expect(res.status).toBe(404);
    });
  });

  /* ---------------- Assessment & grading ---------------- */

  describe('Assessment & grading', () => {
    it('shows a scheme per section, with position per section', async () => {
      const v = (await gf.get(`${A}/assessment`)).body.data;
      expect(v.same).toBe(false);
      expect(v.missing).toEqual([]);
      expect(v.schemes['Senior Secondary'].scale[0]).toMatchObject({
        grade: 'A1',
        min: 75,
        max: 100,
      });
      expect(v.schemes['Junior Secondary'].components).toEqual([
        { name: 'CA 1', max: 20, weight: 20, when: 'Week 5' },
        { name: 'CA 2', max: 20, weight: 20, when: 'Week 9' },
        { name: 'Examination', max: 100, weight: 60, when: 'Weeks 11–12' },
      ]);
      expect(v.schemes['Junior Secondary'].showPosition).toBe(true);
      expect(v.schemes.Primary.showPosition).toBe(false);
      expect(v.schemes.Nursery.mode).toBe('descriptive');
      expect(v.passMark).toBe(40);
      expect(v.rounding).toBe('Whole number');
    });

    it('validates weights and bands, and saves position per section', async () => {
      const v = (await gf.get(`${A}/assessment`)).body.data;
      const body = { same: false, schemes: v.schemes, rounding: v.rounding, passMark: v.passMark };
      const broken = structuredClone(body);
      broken.schemes.Primary.components[0].weight = 30;
      expect((await gf.put(`${A}/assessment`).send(broken)).body.message).toBe(
        'Primary: weights add up to 110%. They must total 100%.',
      );
      const gap = structuredClone(body);
      gap.schemes['Junior Secondary'].scale[1].min = 61;
      expect((await gf.put(`${A}/assessment`).send(gap)).body.message).toBe(
        'Junior Secondary: there is a gap between C and B.',
      );
      const ok = structuredClone(body);
      ok.schemes.Primary.showPosition = true;
      ok.schemes.Primary.components = [
        { name: 'Continuous assessment', max: 40, weight: 40, when: 'Through the term' },
        { name: 'Examination', max: 100, weight: 60, when: 'Weeks 11–12' },
      ];
      ok.passMark = 45;
      const saved = await gf.put(`${A}/assessment`).send(ok);
      expect(saved.status).toBe(200);
      expect(saved.body.data.schemes.Primary.showPosition).toBe(true);
      expect(saved.body.data.schemes.Primary.components).toHaveLength(2);
      expect(saved.body.data.passMark).toBe(45);
      expect(saved.body.data.schemes['Junior Secondary'].showPosition).toBe(true);
    });

    it('can use one scheme for every section', async () => {
      const v = (await gf.get(`${A}/assessment`)).body.data;
      const res = await gf.put(`${A}/assessment`).send({
        same: true,
        schemes: { '*': v.schemes['Junior Secondary'] },
        rounding: '1 decimal place',
        passMark: 40,
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ same: true, rounding: '1 decimal place', missing: [] });
      expect(Object.keys(res.body.data.schemes)).toEqual(['*']);
    });
  });

  /* ---------------- Attendance ---------------- */

  describe('Attendance', () => {
    it('shows each arm’s registers this term and JSS 2B’s detail', async () => {
      const v = (await gf.get(`${A}/attendance?branch=Main%20Campus`)).body.data;
      expect(v.empty).toBeNull();
      expect(v.schoolDays).toBeGreaterThan(0);
      const row = v.rows.find((r: { arm: string }) => r.arm === 'JSS 2B');
      expect(row.daysTaken).toBeGreaterThan(0);
      expect(row.students).toBe(14);
      expect(row.classTeacher).toBe('Mrs. Grace Okafor');
      expect(row.rate).toBeGreaterThan(80);
      const detail = (await gf.get(`${A}/attendance/${row.armId}`)).body.data;
      expect(detail.students).toHaveLength(14);
      expect(detail.days.filter((d: { taken: boolean }) => d.taken).length).toBe(row.daysTaken);
      const student = detail.students[0];
      expect(Object.values(student.marks).length).toBe(student.marked);
    });
  });

  /* ---------------- Setup Center & class page ---------------- */

  describe('Setup Center and class page', () => {
    it('describes the four steps from live data', async () => {
      const steps = (await gf.get('/api/v1/setup')).body.data.steps as {
        id: string;
        description: string;
        to: { name: string };
      }[];
      const step = (id: string) => steps.find((s) => s.id === id)!;
      expect(step('subjects-curriculum').description).toMatch(
        /^\d+ subjects · \d+ elective groups$/,
      );
      expect(step('teacher-assignments').description).toMatch(/^\d+ of \d+ subject slots assigned/);
      expect(step('teacher-assignments').to.name).toBe('teacher-assignments');
      expect(step('timetable').description).toMatch(/published this term/);
    });

    it('lists the class’s subjects and timetable on its page', async () => {
      const arm = await armNamed('JSS 2B');
      const res = await gf.get(`${A}/classes/${arm.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.subjects.find((s: { code: string }) => s.code === 'ENG')).toMatchObject({
        type: 'Compulsory',
        teacher: 'Mrs. Grace Okafor',
      });
      expect(res.body.data.timetable.arm).toBe('JSS 2B');
    });
  });

  /* ---------------- Tenant isolation ---------------- */

  describe('Tenant isolation', () => {
    it('keeps Crestview’s academics separate', async () => {
      const curr = (await cv.get(`${A}/curriculum`)).body.data;
      expect(curr.subjects).toEqual([]);
      const jss2b = await armNamed('JSS 2B');
      expect((await cv.get(`${A}/timetable?arm=${jss2b.id}`)).status).toBe(404);
      expect((await cv.get(`${A}/attendance/${jss2b.id}`)).status).toBe(404);
      const a = (await assignments()).assignments[0]!;
      expect((await cv.delete(`${A}/assignments/${a.id}`)).status).toBe(404);
    });
  });
});
