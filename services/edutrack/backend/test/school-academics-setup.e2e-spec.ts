import { authed, createTestApp, signIn, type TestApp } from './support/test-app.js';

/**
 * Academics structure (sections, sessions and terms, classes and arms), the Setup Center with
 * the first-sign-in foundation, and the header's context options. Greenfield is the set-up school;
 * Crestview is new and walks through the foundation.
 */

type Api = ReturnType<typeof authed>;
interface Level {
  id: string;
  branchId: string;
  section: string;
  name: string;
  next: string | null;
  arms: { id: string; name: string; arm: string; capacity: number; levelId: string }[];
}
interface Step {
  id: string;
  name: string;
  done: boolean;
  auto: boolean;
  description: string;
  to: { name: string; query?: Record<string, string> };
}

const GF = 'adaeze.okonkwo@greenfield.edu.ng';
const CV = 'e.udo@crestviewcollege.ng';
const A = '/api/v1/academics';

describe('School academics and setup (e2e)', () => {
  let t: TestApp;
  let gf: Api;
  let cv: Api;
  let gfSchool: string;
  let cvSchool: string;
  let mainId: string;
  let lekkiId: string;

  const classes = async (api: Api) =>
    (await api.get(`${A}/classes`)).body.data as {
      levels: Level[];
      branches: { id: string; name: string; sections: string[] }[];
      confirmed: boolean;
    };
  const level = async (api: Api, branchId: string, name: string) =>
    (await classes(api)).levels.find((l) => l.branchId === branchId && l.name === name)!;
  const setup = async (api: Api) =>
    (await api.get('/api/v1/setup')).body.data as {
      steps: Step[];
      finished: boolean;
      onboarding: boolean;
      foundationComplete: boolean;
      foundationSteps: string[];
    };
  const step = (s: { steps: Step[] }, id: string) => s.steps.find((x) => x.id === id)!;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    gf = authed(t, (await signIn(t, GF)).token);
    cv = authed(t, (await signIn(t, CV)).token);
    gfSchool = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'greenfield' } })).id;
    cvSchool = (await t.prisma.school.findUniqueOrThrow({ where: { slug: 'crestview' } })).id;
    const branches = await t.prisma.branch.findMany({ where: { schoolId: gfSchool } });
    mainId = branches.find((b) => b.code === 'GFA-MC')!.id;
    lekkiId = branches.find((b) => b.code === 'GFA-LK')!.id;
  });

  afterAll(async () => {
    await t.reseed();
    await t.close();
  });

  /* ---------------- Setup Center (seeded state) ---------------- */

  describe('Setup Center', () => {
    it('shows Greenfield set up, with live academic steps and the foundation complete', async () => {
      const res = await gf.get('/api/v1/setup');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Setup progress loaded.');
      const s = res.body.data;
      expect(s).toMatchObject({
        finished: false,
        onboarding: false,
        foundationComplete: true,
        foundationSteps: ['school-profile', 'academic-session', 'classes-arms'],
      });
      expect(s.steps).toHaveLength(16);
      expect(step(s, 'academic-sections')).toMatchObject({
        done: true,
        auto: true,
        description: 'Nursery (NUR), Primary (PRI), Junior Secondary (JSS), Senior Secondary (SSS)',
      });
      expect(step(s, 'academic-session').description).toBe(
        '2026/2027 is active · 14 Sept 2026 – 23 Jul 2027',
      );
      expect(step(s, 'terms').description).toBe('3 terms in 2026/2027 · 11 calendar events');
      expect(step(s, 'classes-arms')).toMatchObject({
        done: true,
        description: '40 arms across 25 class levels',
        to: { name: 'classes', query: { from: 'setup' } },
      });
      expect(step(s, 'school-profile')).toMatchObject({ done: true, auto: true });
      // Academics' Phase 3a steps describe themselves from live data.
      expect(step(s, 'assessment-grading')).toMatchObject({
        done: true,
        auto: true,
        description: 'Weights and grade scales set for every section',
      });
      // Finance's step: done once this term's fee structure is published.
      expect(step(s, 'fees')).toMatchObject({
        done: true,
        auto: true,
        description: expect.stringMatching(/^10 fee items · First Term published · /),
        to: { name: 'fees', query: { from: 'setup' } },
      });
      // Stored state for steps whose modules come later (seeded with the back office's demo).
      expect(step(s, 'notifications')).toMatchObject({ done: false, auto: false });
    });

    it('refuses to finish with required steps left', async () => {
      // Without a published fee structure for the term, the Fees step isn't done.
      const published = { schoolId: gfSchool, status: 'PUBLISHED' as const };
      const ids = (await t.prisma.feeStructure.findMany({ where: published })).map((x) => x.id);
      await t.prisma.feeStructure.updateMany({
        where: { id: { in: ids } },
        data: { status: 'DRAFT' },
      });
      try {
        expect(step(await setup(gf), 'fees')).toMatchObject({ done: false, auto: true });
        const res = await gf.post('/api/v1/setup/finish');
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('SETUP_STEPS_LEFT');
        expect(res.body.message).toBe('Finish the required steps first: Fees.');
      } finally {
        await t.prisma.feeStructure.updateMany({
          where: { id: { in: ids } },
          data: { status: 'PUBLISHED' },
        });
      }
    });

    it('marks a not-yet-built step done by hand, and knows unknown steps', async () => {
      const res = await gf.post('/api/v1/setup/steps/notifications/complete');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Notifications marked as done.');
      expect(res.body.data).toMatchObject({ id: 'notifications', done: true, auto: false });
      const stored = await t.prisma.setupStepState.findFirst({
        where: { schoolId: gfSchool, stepKey: 'notifications' },
      });
      expect(stored?.confirmedAt).toBeTruthy();
      const missing = await gf.post('/api/v1/setup/steps/teleport/complete');
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe('Setup step not found');
    });

    it('finishes once every required step is done', async () => {
      await gf.post('/api/v1/setup/steps/fees/complete').expect(200);
      const res = await gf.post('/api/v1/setup/finish');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ finished: true, foundationComplete: true });
      expect((await setup(gf)).finished).toBe(true);
    });

    it('starts Crestview in onboarding with the foundation to do', async () => {
      const s = await setup(cv);
      expect(s).toMatchObject({ onboarding: true, finished: false, foundationComplete: false });
      expect(s.steps.filter((x) => x.done).map((x) => x.id)).toEqual([
        'school-profile',
        'branches',
      ]);
      expect(step(s, 'school-profile')).toMatchObject({
        description: 'Name, contact and registration confirmed · no logo yet',
        to: { name: 'school-profile' },
      });
      expect(step(s, 'branches').description).toBe('1 branch · 1 active');
      expect(step(s, 'academic-session')).toMatchObject({
        description: 'Create your first session and its dates',
        to: { name: 'session-new', query: { from: 'setup' } },
      });
      expect(step(s, 'classes-arms').description).toBe('Add class levels and their arms');

      const profile = await cv.post('/api/v1/setup/steps/school-profile/complete');
      expect(profile.status).toBe(409);
      expect(profile.body.message).toBe('Save the school profile to complete this step.');
      const classesStep = await cv.post('/api/v1/setup/steps/classes-arms/complete');
      expect(classesStep.status).toBe(422);
      expect(classesStep.body.message).toBe('Finish Academic Sections first.');
      const session = await cv.post('/api/v1/setup/steps/academic-session/complete');
      expect(session.status).toBe(422);
      expect(session.body.message).toBe('Create the session first.');
    });
  });

  /* ---------------- Reads ---------------- */

  describe('reading the structure', () => {
    it('lists Greenfield’s sections with their levels and branches', async () => {
      const res = await gf.get(`${A}/sections`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Academic sections loaded.');
      expect(res.body.data.confirmed).toBe(true);
      expect(
        res.body.data.sections.map((s: { code: string; levels: number; branches: string[] }) => [
          s.code,
          s.levels,
          s.branches,
        ]),
      ).toEqual([
        ['NUR', 4, ['Main Campus', 'Lekki Campus']],
        ['PRI', 12, ['Main Campus', 'Lekki Campus']],
        ['JSS', 3, ['Main Campus']],
        ['SSS', 6, ['Main Campus', 'Lekki Campus']],
      ]);
    });

    it('lists sessions newest first with the current one and its terms', async () => {
      const res = await gf.get(`${A}/sessions`);
      expect(res.status).toBe(200);
      const v = res.body.data;
      expect(v.sessions.map((s: { name: string; status: string }) => [s.name, s.status])).toEqual([
        ['2026/2027', 'Active'],
        ['2025/2026', 'Closing'],
        ['2024/2025', 'Archived'],
      ]);
      expect(v.currentId).toBe(v.sessions[0].id);
      expect(v.confirmed).toEqual({ session: true, terms: true });
      expect(v.sessions[0]).toMatchObject({
        structure: '3 terms',
        note: 'Copied from 2025/2026',
        terms: [
          { name: 'First Term', start: '2026-09-14', end: '2026-12-18', status: 'Active' },
          { name: 'Second Term', status: 'Upcoming' },
          { name: 'Third Term', status: 'Upcoming' },
        ],
      });
      expect(v.sessions[0].terms[0].events[3]).toMatchObject({
        type: 'midterm',
        name: 'Mid-term break',
        start: '2026-10-29',
        end: '2026-11-02',
      });
      expect(v.sessions[2].closedOn).toBe('8 Aug 2025');
      expect(v.termChecklist).toMatchObject({ title: 'First Term closing checklist' });
      expect(v.copyAreas.find((a: { id: string }) => a.id === 'classes').detail).toBe('25 levels');
    });

    it('lists levels per branch in promotion order, with arms', async () => {
      const v = await classes(gf);
      expect(v.branches).toEqual([
        {
          id: mainId,
          name: 'Main Campus',
          sections: ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'],
        },
        { id: lekkiId, name: 'Lekki Campus', sections: ['Nursery', 'Primary', 'Senior Secondary'] },
      ]);
      expect(v.levels).toHaveLength(25);
      const main = v.levels.filter((l) => l.branchId === mainId);
      expect(main.map((l) => l.name).slice(7, 10)).toEqual(['Primary 6', 'JSS 1', 'JSS 2']);
      expect(main.find((l) => l.name === 'Primary 6')!.next).toBe('JSS 1');
      expect(main.at(-1)).toMatchObject({ name: 'SSS 3', next: null });
      const jss2 = main.find((l) => l.name === 'JSS 2')!;
      expect(jss2.id).toMatch(/^[0-9a-f-]{36}~[0-9a-f-]{36}$/);
      expect(jss2.arms.map((a) => a.name)).toEqual(['JSS 2A', 'JSS 2B']);
      expect(jss2.arms[1]).toMatchObject({ capacity: 35, levelId: jss2.id });
      const lekki = v.levels.filter((l) => l.branchId === lekkiId);
      expect(lekki.map((l) => l.name)).not.toContain('JSS 1');
    });

    it('opens one class', async () => {
      const jss2 = await level(gf, mainId, 'JSS 2');
      const res = await gf.get(`${A}/classes/${jss2.arms[1]!.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        // The seed's JSS 2B roster (14 students, Emmanuel Adeyemi among them).
        arm: { name: 'JSS 2B', room: 'Room J2B · Block C', branch: 'Main Campus', students: 14 },
        timetable: expect.objectContaining({ arm: 'JSS 2B', status: 'Published' }),
        // Each subject's result sheet this term (none started yet).
        results: expect.arrayContaining([
          expect.objectContaining({ code: 'MTH', status: 'Not started', average: null }),
        ]),
      });
      expect(res.body.data.students).toHaveLength(14);
      expect(res.body.data.students).toContainEqual(
        expect.objectContaining({ name: 'Emmanuel Adeyemi', admissionNo: 'STU-2025-0042' }),
      );
      expect((await gf.get(`${A}/classes/not-an-id`)).status).toBe(404);
    });

    it('answers the header’s context options from branches and sessions', async () => {
      const res = await gf.get('/api/v1/context-options');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        branches: [
          { name: 'Main Campus', status: 'Active', brandColor: null, logoUrl: null },
          { name: 'Lekki Campus', status: 'Active', brandColor: null, logoUrl: null },
          { name: 'All branches', status: 'Active', brandColor: null, logoUrl: null },
        ],
        sessions: [
          { name: '2026/2027', status: 'Active' },
          { name: '2025/2026', status: 'Closing' },
        ],
        terms: ['First Term', 'Second Term', 'Third Term'],
        defaults: { branch: 'Main Campus', session: '2026/2027', term: 'First Term' },
      });
      const fresh = await cv.get('/api/v1/context-options');
      expect(fresh.body.data).toEqual({
        branches: [{ name: 'Main Campus', status: 'Active', brandColor: null, logoUrl: null }],
        sessions: [],
        terms: [],
        defaults: { branch: 'Main Campus', session: '', term: '' },
      });
    });
  });

  /* ---------------- Sections ---------------- */

  describe('sections', () => {
    const gfSections = async () =>
      (await gf.get(`${A}/sections`)).body.data.sections as {
        id: string;
        name: string;
        code: string;
        description: string;
      }[];

    it('validates names and codes', async () => {
      const list = await gfSections();
      const send = (sections: unknown[]) => gf.put(`${A}/sections`).send({ sections });
      const empty = await send([]);
      expect(empty.status).toBe(422);
      expect(empty.body.message).toBe('Add at least one section.');
      const badCode = await send([{ name: 'Nursery', code: 'nu', description: '' }]);
      expect(badCode.body.message).toBe('Nursery: use a 2–5 letter code in capitals, e.g. JSS.');
      const dupCode = await send([
        { name: 'A', code: 'ABC', description: '' },
        { name: 'B', code: 'ABC', description: '' },
      ]);
      expect(dupCode.body.message).toBe('Two sections use the code ABC.');
      const dupName = await send([
        { name: 'Primary', code: 'PRA', description: '' },
        { name: 'primary', code: 'PRB', description: '' },
      ]);
      expect(dupName.body.message).toBe('Two sections are called “primary”.');
      const removing = await send(
        list
          .filter((s) => s.code !== 'JSS')
          .map(({ id, name, code, description }) => ({ id, name, code, description })),
      );
      expect(removing.status).toBe(422);
      expect(removing.body.error.code).toBe('SECTION_HAS_CLASSES');
      expect(removing.body.message).toBe(
        'Junior Secondary still has classes. Remove its class levels in Classes & Arms first.',
      );
    });

    it('renames, reorders and adds, keeping classes and branches attached', async () => {
      const list = await gfSections();
      const renamed = list.map((s) => (s.code === 'NUR' ? { ...s, name: 'Early Years' } : s));
      const res = await gf.put(`${A}/sections`).send({
        sections: [
          ...renamed.map(({ id, name, code, description }) => ({ id, name, code, description })),
          { name: 'Vocational', code: 'VOC', description: 'Trades' },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Academic sections saved.');
      const early = res.body.data.sections.find((s: { code: string }) => s.code === 'NUR');
      expect(early).toMatchObject({ name: 'Early Years', levels: 4 });
      expect(res.body.data.sections.at(-1)).toMatchObject({ code: 'VOC', levels: 0, branches: [] });
      // Put it back for the rest of the file.
      await gf
        .put(`${A}/sections`)
        .send({
          sections: list.map(({ id, name, code, description }) => ({
            id,
            name,
            code,
            description,
          })),
        })
        .expect(200);
      const audit = await t.prisma.auditEvent.findFirst({
        where: { schoolId: gfSchool, action: 'sections.save' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).toMatchObject({ area: 'Academic', summary: 'Academic sections saved' });
    });
  });

  /* ---------------- Sessions & terms ---------------- */

  describe('sessions and terms', () => {
    const base = {
      name: '2027/2028',
      start: '2027-09-13',
      end: '2028-07-21',
      structure: '3 terms',
      termNames: ['First Term', 'Second Term', 'Third Term'],
      copy: ['calendar'],
    };
    let newId: string;

    it('validates a new session', async () => {
      const post = (body: object) => gf.post(`${A}/sessions`).send({ ...base, ...body });
      expect((await post({ name: '2026/2027' })).body.message).toBe('2026/2027 already exists.');
      expect((await post({ start: '2027-02-30' })).body.message).toBe(
        'Choose the start and end dates.',
      );
      expect((await post({ end: '2027-09-01' })).body.message).toBe(
        'The session must end after it starts.',
      );
      expect((await post({ end: '2027-12-01' })).body.message).toBe(
        'A session runs between 5 and 15 months.',
      );
      const overlap = await post({ start: '2027-06-01' });
      expect(overlap.status).toBe(422);
      expect(overlap.body.error.code).toBe('SESSION_OVERLAP');
      expect(overlap.body.message).toBe(
        'These dates overlap 2026/2027 (14 Sept 2026 – 23 Jul 2027).',
      );
      expect((await post({ termNames: [] })).body.message).toBe('Use between 1 and 4 terms.');
      expect((await post({ termNames: ['A', 'a'] })).body.message).toBe(
        'Term names must be different.',
      );
    });

    it('creates the next session as upcoming, with the calendar pattern copied', async () => {
      const res = await gf.post(`${A}/sessions`).send(base);
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('2027/2028 created. Next: set term dates and breaks.');
      const s = res.body.data;
      newId = s.id;
      expect(s).toMatchObject({
        status: 'Upcoming',
        note: 'Configuration copied from 2026/2027',
        terms: [{ status: 'Upcoming' }, { status: 'Upcoming' }, { status: 'Upcoming' }],
      });
      expect(s.terms[0].start).toBe('2027-09-13');
      expect(s.terms[2].end).toBe('2028-07-21');
      // First Term's events, shifted by the difference in start dates (364 days).
      expect(s.terms[0].events[0]).toMatchObject({ type: 'resumption', start: '2027-09-13' });
    });

    it('checks term dates: order, overlap, the session’s range and length', async () => {
      const terms = (over: object[]) =>
        gf.put(`${A}/sessions/${newId}/terms`).send({
          terms: over.map((o, i) => ({
            name: ['First Term', 'Second Term', 'Third Term'][i],
            start: '2027-09-13',
            end: '2027-12-10',
            events: [],
            ...o,
          })),
        });
      const backwards = await terms([{ start: '2027-12-10', end: '2027-09-13' }]);
      expect(backwards.status).toBe(422);
      expect(backwards.body.message).toBe('First Term must end after it starts.');
      const outside = await terms([{ start: '2027-08-01' }]);
      expect(outside.body.message).toBe(
        'First Term must fall within the session (13 Sept 2027 – 21 Jul 2028).',
      );
      const short = await terms([{ end: '2027-09-30' }]);
      expect(short.body.message).toBe('First Term is shorter than 4 weeks.');
      const overlap = await terms([{}, { start: '2027-12-01', end: '2028-03-20' }]);
      expect(overlap.body.error.code).toBe('TERM_OVERLAP');
      expect(overlap.body.message).toBe('First Term and Second Term overlap.');
      const event = await terms([
        { events: [{ type: 'midterm', name: 'Break', start: '2028-01-01', end: '2028-01-02' }] },
      ]);
      expect(event.body.message).toBe('First Term · Break must fall within the term.');
    });

    it('saves terms and events, keeping the ids of kept terms', async () => {
      const before = (await gf.get(`${A}/sessions`)).body.data.sessions.find(
        (s: { id: string }) => s.id === newId,
      );
      const res = await gf.put(`${A}/sessions/${newId}/terms`).send({
        terms: [
          {
            id: before.terms[1].id,
            name: 'Lent Term',
            start: '2028-01-10',
            end: '2028-04-07',
            events: [],
          },
          {
            id: before.terms[0].id,
            name: 'First Term',
            start: '2027-09-13',
            end: '2027-12-17',
            events: [
              {
                id: '',
                type: 'midterm',
                name: 'Mid-term break',
                start: '2027-10-28',
                end: '2027-11-01',
              },
            ],
          },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Terms and calendar saved for 2027/2028.');
      expect(res.body.data.terms.map((x: { id: string; name: string }) => [x.id, x.name])).toEqual([
        [before.terms[0].id, 'First Term'],
        [before.terms[1].id, 'Lent Term'],
      ]);
      expect(res.body.data.terms[0].events).toEqual([
        expect.objectContaining({ type: 'midterm', name: 'Mid-term break' }),
      ]);
    });

    it('starts a session only when the active one has closed every term', async () => {
      const res = await gf.post(`${A}/sessions/${newId}/start`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SESSION_TERMS_OPEN');
      expect(res.body.message).toBe(
        'Close every term of 2026/2027 first. 2026/2027 then moves to Closing.',
      );
      const current = (await gf.get(`${A}/sessions`)).body.data.currentId;
      const again = await gf.post(`${A}/sessions/${current}/start`);
      expect(again.status).toBe(409);
      expect(again.body.message).toBe('Only an upcoming session can be started.');
    });

    it('starts it once the active session’s terms are closed', async () => {
      await t.prisma.term.updateMany({
        where: { schoolId: gfSchool, session: { name: '2026/2027' } },
        data: { status: 'CLOSED' },
      });
      const res = await gf.post(`${A}/sessions/${newId}/start`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('2027/2028 is now active.');
      expect(res.body.data.terms[0].status).toBe('Active');
      const v = (await gf.get(`${A}/sessions`)).body.data;
      expect(v.currentId).toBe(newId);
      expect(v.sessions.find((s: { name: string }) => s.name === '2026/2027').status).toBe(
        'Closing',
      );
      await t.reseed();
      gf = authed(t, (await signIn(t, GF)).token);
      cv = authed(t, (await signIn(t, CV)).token);
    });
  });

  /* ---------------- Classes & arms ---------------- */

  describe('classes and arms', () => {
    it('adds a level after another, with its arms', async () => {
      const jss3 = await level(gf, mainId, 'JSS 3');
      const res = await gf.post(`${A}/classes/levels`).send({
        branchId: mainId,
        section: 'Junior Secondary',
        name: 'JSS 2X',
        arms: ['A', 'Gold'],
        capacity: 30,
        after: (await level(gf, mainId, 'JSS 2')).id,
      });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('JSS 2X added with 2 arms.');
      const main = (res.body.data.levels as Level[]).filter((l) => l.branchId === mainId);
      const names = main.map((l) => l.name);
      expect(names.slice(names.indexOf('JSS 1'), names.indexOf('JSS 3') + 1)).toEqual([
        'JSS 1',
        'JSS 2',
        'JSS 2X',
        'JSS 3',
      ]);
      expect(main.find((l) => l.name === 'JSS 2X')!.arms.map((a) => a.name)).toEqual([
        'JSS 2X A',
        'JSS 2X Gold',
      ]);
      expect(jss3.id).toBe((await level(gf, mainId, 'JSS 3')).id);
    });

    it('refuses duplicate names, sections the branch doesn’t run and bad arms', async () => {
      const add = (body: object) =>
        gf.post(`${A}/classes/levels`).send({
          branchId: mainId,
          section: 'Junior Secondary',
          name: 'JSS 9',
          arms: ['A'],
          capacity: 35,
          ...body,
        });
      const dup = await add({ name: 'jss 1' });
      expect(dup.status).toBe(422);
      expect(dup.body.error.code).toBe('LEVEL_NAME_TAKEN');
      expect(dup.body.message).toBe('Main Campus already has jss 1.');
      const notRun = await add({ branchId: lekkiId });
      expect(notRun.body.message).toBe(
        'Lekki Campus doesn’t run Junior Secondary. Add the section to the branch first.',
      );
      expect((await add({ arms: [] })).body.message).toBe('Add at least one arm, e.g. A.');
      expect((await add({ arms: ['A', 'a'] })).body.message).toBe('Arm names must be different.');
      expect((await add({ capacity: 0 })).body.message).toBe(
        'Places per arm must be between 1 and 100.',
      );
      expect((await add({ name: '  ' })).body.message).toBe('Name the class level, e.g. JSS 1.');
      expect((await add({ branchId: 'nope' })).body.message).toBe('Choose an active branch.');
    });

    it('renames and moves a level, refusing a name in use', async () => {
      const x = await level(gf, mainId, 'JSS 2X');
      const taken = await gf.put(`${A}/classes/levels/${x.id}`).send({ name: 'JSS 1' });
      expect(taken.status).toBe(422);
      expect(taken.body.message).toBe('Main Campus already has JSS 1.');
      const res = await gf.put(`${A}/classes/levels/${x.id}`).send({ name: 'JSS 2 Plus' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe(
        'Renamed to JSS 2 Plus. Students and curriculum moved with it.',
      );
      const moved = await gf.post(`${A}/classes/levels/${x.id}/move`).send({ direction: 'up' });
      expect(moved.status).toBe(200);
      const main = (moved.body.data.levels as Level[]).filter((l) => l.branchId === mainId);
      const names = main.map((l) => l.name);
      expect(names.indexOf('JSS 2 Plus')).toBeLessThan(names.indexOf('JSS 2'));
      const top = await level(gf, mainId, 'JSS 1');
      const end = await gf.post(`${A}/classes/levels/${top.id}/move`).send({ direction: 'up' });
      expect(end.status).toBe(422);
      expect(end.body.message).toBe('It can’t move further.');
    });

    it('adds, edits and removes arms', async () => {
      const x = await level(gf, mainId, 'JSS 2 Plus');
      const added = await gf
        .post(`${A}/classes/levels/${x.id}/arms`)
        .send({ capacity: 25, classTeacherId: null, room: 'Hall 2' });
      expect(added.status).toBe(201);
      expect(added.body.message).toBe('Arm JSS 2 Plus B added.');
      const arm = (added.body.data.levels as Level[])
        .find((l) => l.id === x.id)!
        .arms.find((a) => a.arm === 'B')!;

      const teacher = await t.prisma.staff.findFirstOrThrow({
        where: { schoolId: gfSchool, email: 's.ade@greenfield.edu.ng' },
      });
      await t.prisma.staff.update({ where: { id: teacher.id }, data: { allBranches: false } });
      await t.prisma.staffBranch.deleteMany({ where: { staffId: teacher.id } });
      const elsewhere = await gf
        .put(`${A}/classes/arms/${arm.id}`)
        .send({ classTeacherId: teacher.id });
      expect(elsewhere.status).toBe(422);
      expect(elsewhere.body.message).toBe('Mr. Samuel Ade doesn’t work at Main Campus.');
      const notTeacher = await gf
        .put(`${A}/classes/arms/${arm.id}`)
        .send({ classTeacherId: '0193a1b2-7c4d-7e8f-9a0b-1c2d3e4f5a6b' });
      expect(notTeacher.body.message).toBe('Choose a teacher on your staff list.');
      await t.prisma.staffBranch.create({
        data: { schoolId: gfSchool, staffId: teacher.id, branchId: mainId },
      });
      const saved = await gf
        .put(`${A}/classes/arms/${arm.id}`)
        .send({ classTeacherId: teacher.id, capacity: 40, arm: 'Blue' });
      expect(saved.status).toBe(200);
      expect(saved.body.message).toBe('Arm saved.');
      expect(saved.body.data).toMatchObject({
        name: 'JSS 2 Plus Blue',
        capacity: 40,
        classTeacherId: teacher.id,
        classTeacher: 'Mr. Samuel Ade',
        room: 'Hall 2',
      });
      const cleared = await gf.put(`${A}/classes/arms/${arm.id}`).send({ classTeacherId: null });
      expect(cleared.body.data.classTeacher).toBeNull();

      await t.prisma.staffBranch.deleteMany({ where: { staffId: teacher.id } });
      const removed = await gf.delete(`${A}/classes/arms/${arm.id}`);
      expect(removed.status).toBe(200);
      expect(removed.body.message).toBe('JSS 2 Plus Blue removed.');
      const p6 = await level(gf, mainId, 'Primary 6');
      const only = await gf.delete(`${A}/classes/arms/${p6.arms[0]!.id}`);
      expect(only.status).toBe(409);
      expect(only.body.message).toBe(
        'Primary 6A is the only arm of Primary 6. Remove the class level instead.',
      );
    });

    it('won’t remove a level whose arms have students, and removes it with its arms otherwise', async () => {
      // JSS 3: the seed has no students there (JSS 1A has one).
      const jss1 = await level(gf, mainId, 'JSS 3');
      const session = await t.prisma.academicSession.findFirstOrThrow({
        where: { schoolId: gfSchool, status: 'ACTIVE' },
      });
      const student = await t.prisma.student.create({
        data: {
          schoolId: gfSchool,
          admissionNo: `E2E-${Date.now()}`,
          firstName: 'Ada',
          surname: 'Test',
          gender: 'FEMALE',
          admittedOn: new Date('2026-09-14'),
          branchId: mainId,
        },
      });
      const levelId = jss1.id.split('~')[0]!;
      await t.prisma.enrollment.create({
        data: {
          schoolId: gfSchool,
          studentId: student.id,
          sessionId: session.id,
          branchId: mainId,
          levelId,
          armId: jss1.arms[1]!.id,
          enrolledOn: new Date('2026-09-14'),
        },
      });
      const blocked = await gf.delete(`${A}/classes/levels/${jss1.id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('LEVEL_HAS_STUDENTS');
      expect(blocked.body.message).toBe('JSS 3B has students. Move them to another class first.');
      const armBlocked = await gf.delete(`${A}/classes/arms/${jss1.arms[1]!.id}`);
      expect(armBlocked.body.message).toBe('JSS 3B has 1 student. Move them to another arm first.');
      const lower = await gf.put(`${A}/classes/arms/${jss1.arms[1]!.id}`).send({ capacity: 0 });
      expect(lower.status).toBe(422);
      const detail = await gf.get(`${A}/classes/${jss1.arms[1]!.id}`);
      expect(detail.body.data.students).toEqual([
        expect.objectContaining({ name: 'Ada Test', gender: 'Female' }),
      ]);
      await t.prisma.enrollment.deleteMany({ where: { studentId: student.id } });
      await t.prisma.student.delete({ where: { id: student.id } });

      const x = await level(gf, mainId, 'JSS 2 Plus');
      const res = await gf.delete(`${A}/classes/levels/${x.id}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('JSS 2 Plus removed.');
      expect((res.body.data.levels as Level[]).some((l) => l.name === 'JSS 2 Plus')).toBe(false);
      expect(
        await t.prisma.classLevel.count({ where: { schoolId: gfSchool, name: 'JSS 2 Plus' } }),
      ).toBe(0);
    });

    it('needs confirmed sections before adding the default levels', async () => {
      const res = await cv.post(`${A}/classes/defaults`);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Finish Academic Sections first.');
    });
  });

  /* ---------------- Permissions ---------------- */

  describe('permissions', () => {
    it('needs academics.view to read and academics.configure to change', async () => {
      // Adaeze's own roles are swapped for the test and restored at the end.
      const email = GF;
      const api = gf;
      const membership = await t.prisma.schoolMembership.findFirstOrThrow({
        where: { schoolId: gfSchool, user: { email } },
      });
      const setRoles = async (keys: string[]) => {
        const roles = await t.prisma.schoolRole.findMany({
          where: { schoolId: gfSchool, key: { in: keys } },
        });
        await t.prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
        await t.prisma.membershipRole.createMany({
          data: roles.map((r) => ({
            schoolId: gfSchool,
            membershipId: membership.id,
            roleId: r.id,
          })),
        });
      };

      await setRoles(['bursar']);
      expect((await api.get(`${A}/sections`)).status).toBe(403);
      expect((await api.get(`${A}/classes`)).status).toBe(403);
      // Everyone in School Admin reads the Setup Center (the foundation guard needs it).
      expect((await api.get('/api/v1/setup')).status).toBe(200);
      expect((await api.post('/api/v1/setup/steps/timetable/complete')).status).toBe(403);

      await setRoles(['principal']);
      expect((await api.get(`${A}/sessions`)).status).toBe(200);
      expect((await api.put(`${A}/sections`).send({ sections: [] })).status).toBe(403);
      expect((await api.post(`${A}/classes/defaults`)).status).toBe(403);
      const lvl = await level(gf, mainId, 'JSS 1');
      expect((await api.delete(`${A}/classes/levels/${lvl.id}`)).status).toBe(403);
      expect((await api.post('/api/v1/setup/finish')).status).toBe(403);

      await setRoles(['school_admin', 'principal']);
      expect((await api.get(`${A}/classes`)).status).toBe(200);
    });
  });

  /* ---------------- Tenant isolation ---------------- */

  describe('tenant isolation', () => {
    it('never lets Crestview read or change Greenfield’s sessions, levels or arms', async () => {
      const sessions = (await gf.get(`${A}/sessions`)).body.data;
      const gfSession =
        sessions.sessions.find((s: { status: string }) => s.status === 'Upcoming')?.id ??
        sessions.currentId;
      const jss1 = await level(gf, mainId, 'JSS 1');
      const arm = jss1.arms[0]!;

      const cvSessions = (await cv.get(`${A}/sessions`)).body.data.sessions;
      expect(cvSessions.some((s: { id: string }) => s.id === gfSession)).toBe(false);
      expect((await cv.get(`${A}/classes`)).body.data.levels).toEqual([]);

      const terms = await cv.put(`${A}/sessions/${gfSession}/terms`).send({
        terms: [{ name: 'First Term', start: '2026-09-14', end: '2026-12-18', events: [] }],
      });
      expect(terms.status).toBe(404);
      expect((await cv.post(`${A}/sessions/${gfSession}/start`)).status).toBe(404);
      expect((await cv.put(`${A}/classes/levels/${jss1.id}`).send({ name: 'Hacked' })).status).toBe(
        404,
      );
      expect(
        (await cv.post(`${A}/classes/levels/${jss1.id}/move`).send({ direction: 'down' })).status,
      ).toBe(404);
      expect(
        (await cv.post(`${A}/classes/levels/${jss1.id}/arms`).send({ capacity: 30 })).status,
      ).toBe(404);
      expect((await cv.delete(`${A}/classes/levels/${jss1.id}`)).status).toBe(404);
      expect((await cv.get(`${A}/classes/${arm.id}`)).status).toBe(404);
      expect((await cv.put(`${A}/classes/arms/${arm.id}`).send({ capacity: 1 })).status).toBe(404);
      expect((await cv.delete(`${A}/classes/arms/${arm.id}`)).status).toBe(404);
      // Crestview's own branch with Greenfield's section name still can't reach Greenfield rows.
      const cvBranch = (await classes(cv)).branches[0]!;
      const sneaky = await cv.post(`${A}/classes/levels`).send({
        branchId: mainId,
        section: 'Junior Secondary',
        name: 'JSS 1',
        arms: ['A'],
        capacity: 30,
      });
      expect(sneaky.status).toBe(422);
      expect(sneaky.body.message).toBe('Choose an active branch.');

      const after = await level(gf, mainId, 'JSS 1');
      expect(after).toEqual(jss1);
      expect(cvBranch.name).toBe('Main Campus');
    });
  });

  /* ---------------- Crestview’s foundation ---------------- */

  describe('first-sign-in foundation', () => {
    it('completes once the profile, the session and the classes are done', async () => {
      // Start from an unconfirmed profile (the demo seed has it confirmed).
      await t.prisma.setupStepState.deleteMany({
        where: { schoolId: cvSchool, stepKey: 'school-profile' },
      });
      expect(step(await setup(cv), 'school-profile')).toMatchObject({
        done: false,
        description: 'Name, logo, contact and registration',
        to: { name: 'school-profile-edit', query: { from: 'setup' } },
      });

      const created = await cv.post(`${A}/sessions`).send({
        name: '2026/2027',
        start: '2026-09-14',
        end: '2027-07-23',
        structure: '3 terms',
        termNames: ['First Term', 'Second Term', 'Third Term'],
        copy: [],
      });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({
        status: 'Active',
        note: 'First session on Edutrack',
        terms: [{ status: 'Active' }, { status: 'Upcoming' }, { status: 'Upcoming' }],
      });
      let s = await setup(cv);
      expect(step(s, 'academic-session')).toMatchObject({
        done: true,
        description: '2026/2027 is active · 14 Sept 2026 – 23 Jul 2027',
      });
      expect(s.foundationComplete).toBe(false);

      const sections = (await cv.get(`${A}/sections`)).body.data.sections;
      expect(sections.map((x: { code: string }) => x.code)).toEqual(['JSS', 'SSS']);
      await cv.post('/api/v1/setup/steps/academic-sections/complete').expect(200);
      const defaults = await cv.post(`${A}/classes/defaults`);
      expect(defaults.status).toBe(200);
      expect(defaults.body.message).toBe(
        '6 class levels added with one arm each. Rename, add or remove anything.',
      );
      const done = await cv.post('/api/v1/setup/steps/classes-arms/complete');
      expect(done.status).toBe(200);
      expect(done.body.data).toMatchObject({
        done: true,
        description: '6 arms across 6 class levels',
      });

      // Profile still unconfirmed: the foundation isn't done yet.
      expect((await setup(cv)).foundationComplete).toBe(false);
      // Saving the school profile confirms its step (that route belongs to School › Profile).
      await t.prisma.setupStepState.create({
        data: { schoolId: cvSchool, stepKey: 'school-profile', confirmedAt: new Date() },
      });
      s = await setup(cv);
      expect(s.foundationComplete).toBe(true);
      expect(s.finished).toBe(false);
      expect(
        (await t.prisma.setupStepState.findMany({ where: { schoolId: cvSchool } }))
          .map((x) => x.stepKey)
          .sort(),
      ).toEqual(['academic-sections', 'branches', 'classes', 'school-profile', 'session']);
      const ctx = (await cv.get('/api/v1/context-options')).body.data;
      expect(ctx.defaults).toEqual({
        branch: 'Main Campus',
        session: '2026/2027',
        term: 'First Term',
      });
    });
  });
});
