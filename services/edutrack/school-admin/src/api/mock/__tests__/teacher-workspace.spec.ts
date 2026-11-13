/*
 * School Admin's side of the Teacher Workspace: the HOD step in the result lifecycle, read-only
 * attendance from class teachers' registers, and report-card remarks and conduct ratings.
 */
import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  AttendanceArmDetail,
  AttendanceOverview,
  LoginResponse,
  PublishCheck,
  ReportCard,
  ResultSheet,
  ResultsMatrix,
  SchoolReport,
} from '@/types';

import { installMockApi } from '..';
import { academicsData, DEPARTMENTS } from '../academics-db';
import { hodDecision, reviewCounts } from '../handlers/academics-results';
import { attendanceRate, closures, schoolDays } from '../register-db';

async function signIn(email: string): Promise<AxiosInstance> {
  const client = axios.create({ baseURL: '/api' });
  installMockApi(client);
  const { data } = await client.post<LoginResponse>('/v1/auth/login', {
    email,
    password: 'Edutrack2026!',
  });
  client.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
  return client;
}
async function failure(request: Promise<unknown>) {
  try {
    await request;
  } catch (e) {
    if (isAxiosError(e))
      return { status: e.response?.status, message: e.response?.data?.message as string };
  }
  throw new Error('Expected the request to fail');
}
const LONG = { timeout: 30000 };
const TERM = 't-2026-1';
const deptOf = (code: string) => DEPARTMENTS.greenfield!.find((d) => d.subjects.includes(code));

describe('Results · the HOD step', () => {
  let api: AxiosInstance;
  const sheet = async (armId: string, subject: string) =>
    (await api.get<ResultSheet>(`/v1/academics/results/sheets/${armId}/${subject}`)).data;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
  });

  it('keeps a Sciences sheet with the HOD; the office can only view it', async () => {
    const s = await sheet('arm-mc-jss2b', 'MTH');
    expect(s).toMatchObject({
      status: 'Submitted',
      department: 'Sciences',
      hod: 'Mr. Ibrahim Bello (HOD Sciences)',
      withHod: true,
      canDecide: false,
    });
    expect(s.history[0]!.title).toBe(
      'Submitted by Mr. Samuel Ade to Mr. Ibrahim Bello (HOD Sciences)',
    );
    for (const action of ['approve', 'return']) {
      const err = await failure(
        api.post(`/v1/academics/results/sheets/arm-mc-jss2b/MTH/${action}`, {
          note: 'Please check CA 2.',
        }),
      );
      expect(err.status).toBe(409);
      expect(err.message).toMatch(/with Mr\. Ibrahim Bello \(HOD Sciences\) for review/);
    }
    // The publish check names the HOD step.
    const check = (await api.get<PublishCheck>('/v1/academics/results/publish/arm-mc-jss2b')).data;
    expect(check.notApproved).toContain('Mathematics (with HOD)');
  });

  it('sends sheets from departments with no HOD straight to the office', async () => {
    const all: ResultsMatrix[] = [];
    for (const section of ['Primary', 'Junior Secondary', 'Senior Secondary'])
      all.push(
        (await api.get<ResultsMatrix>('/v1/academics/results', { params: { section } })).data,
      );
    const cells = all.flatMap((m) => m.rows.flatMap((r) => Object.entries(r.cells)));
    // Only a department with an HOD can hold a sheet at Submitted.
    const submitted = cells.filter(([, st]) => st === 'Submitted').map(([code]) => code);
    expect(submitted.length).toBeGreaterThan(0);
    expect(submitted.filter((code) => !deptOf(code)?.hodId)).toEqual([]);
    expect(
      cells.filter(([code, st]) => st === 'Under review' && deptOf(code)?.name === 'Languages')
        .length,
    ).toBeGreaterThan(0);
    const lang = all
      .flatMap((m) => m.rows.flatMap((r) => Object.entries(r.cells).map(([c, s]) => [r, c, s])))
      .find(([, c, s]) => s === 'Under review' && deptOf(c as string)?.name === 'Languages')!;
    const s = await sheet((lang[0] as ResultsMatrix['rows'][number]).armId, lang[1] as string);
    expect(s).toMatchObject({
      department: 'Languages',
      hod: null,
      withHod: false,
      canDecide: true,
    });
    expect(s.history.find((h) => h.id === 'sub')!.title).toMatch(
      /straight to the academic office \(Languages has no HOD\)/,
    );
    await api.post(`/v1/academics/results/sheets/${s.armId}/${s.subject}/approve`);
    expect((await sheet(s.armId, s.subject)).status).toBe('Approved');
  });

  it('skips the HOD for his own sheets', () => {
    const acad = academicsData.greenfield!;
    const own = acad.sheets.filter(
      (x) =>
        x.termId === TERM &&
        acad.assignments.some(
          (a) => a.armId === x.armId && a.subject === x.subject && a.teacherId === 'bello',
        ),
    );
    expect(own.length).toBeGreaterThan(0);
    expect(own.some((x) => x.status === 'Submitted')).toBe(false);
  });

  it('records the HOD forwarding and returning sheets in the history', LONG, async () => {
    const acad = academicsData.greenfield!;
    const waiting = acad.sheets.filter(
      (x) =>
        x.termId === TERM &&
        x.status === 'Submitted' &&
        x.armId !== 'arm-mc-jss2b' &&
        !!deptOf(x.subject)?.hodId,
    );
    expect(waiting.length).toBeGreaterThanOrEqual(2);
    const before = reviewCounts('greenfield');
    const nav = async () => (await api.get('/v1/nav-counts')).data.results as number;
    expect(await nav()).toBe(before.office);

    const [a, b] = waiting;
    const hodA = (await sheet(a!.armId, a!.subject)).hod!;
    const fwd = hodDecision('greenfield', a!, 'forward');
    expect(fwd).toMatchObject({ status: 'Under review', withHod: false, canDecide: true });
    expect(fwd.history[0]!.title).toBe(`Forwarded by HOD ${hodA.split(' (')[0]}`);
    expect(reviewCounts('greenfield')).toEqual({ office: before.office + 1, hod: before.hod - 1 });
    expect(await nav()).toBe(before.office + 1);

    const hodB = (await sheet(b!.armId, b!.subject)).hod!;
    expect(() => hodDecision('greenfield', b!, 'return', 'Fix it')).toThrow(/10 characters/);
    const note = 'CA 2 is above the maximum for two students.';
    const ret = hodDecision('greenfield', b!, 'return', note);
    expect(ret).toMatchObject({ status: 'Returned', returnedBy: hodB, returnNote: note });
    expect(ret.history[0]!.title).toBe(`Returned by HOD ${hodB.split(' (')[0]}`);
    expect(() => hodDecision('greenfield', b!, 'forward')).toThrow(/isn’t waiting on an HOD/);

    // The seeded JSS 1C Agricultural Science sheet was returned by the HOD.
    const seeded = await sheet('arm-mc-jss1c', 'AGR');
    expect(seeded).toMatchObject({
      status: 'Returned',
      returnedBy: 'Mr. Ibrahim Bello (HOD Sciences)',
    });
    expect(seeded.history[0]!.title).toBe('Returned by HOD Mr. Ibrahim Bello');
    // Approved Sciences sheets show the HOD's forward before the office.
    const approved = acad.sheets.find(
      (x) =>
        x.termId === TERM &&
        x.status === 'Approved' &&
        deptOf(x.subject)?.name === 'Sciences' &&
        x.history.some((h) => h.id === 'hod'),
    )!;
    expect((await sheet(approved.armId, approved.subject)).history[0]!.title).toBe(
      'Forwarded by HOD Mr. Ibrahim Bello',
    );
  });

  it('counts only office sheets as awaiting review in reports', LONG, async () => {
    const r = (
      await api.get<SchoolReport>('/v1/reports/result-completion', {
        params: { branch: 'All branches' },
      })
    ).data;
    const m = r.metrics.find((x) => x.label === 'Awaiting your review')!;
    expect(Number(m.value)).toBe(r.totals!['Under review']);
    expect(r.columns.find((c) => c.key === 'Submitted')?.label).toBe('With HOD');
  });
});

describe('Attendance · school days and percentages', () => {
  const acad = () => academicsData.greenfield!;
  const term = () => acad().sessions[0]!.terms[0]!;

  it('leaves out weekends, holidays, the mid-term break and no-class days', () => {
    const days = schoolDays(acad(), term(), '2026-11-30');
    // 14 Sep – 30 Nov is 56 weekdays; minus 1 Oct, 29–30 Oct, 2 Nov and 20 Nov.
    expect(days).toHaveLength(51);
    for (const d of ['2026-10-01', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-20'])
      expect(days).not.toContain(d);
    expect(days).not.toContain('2026-09-19'); // Saturday
    expect(days[0]).toBe('2026-09-14');
    expect(days[days.length - 1]).toBe('2026-11-30');
    const c = closures(acad(), term());
    expect(c.get('2026-10-01')).toBe('Independence Day');
    expect(c.get('2026-10-30')).toBe('Mid-term break');
    expect(c.get('2026-11-20')).toBe('Staff development day');
    // Never past the end of the term, nothing before it starts.
    const whole = schoolDays(acad(), term(), '2027-06-01');
    expect(whole[whole.length - 1]).toBe('2026-12-18');
    expect(schoolDays(acad(), term(), '2026-09-01')).toEqual([]);
  });

  it('counts present and late as attended', () => {
    expect(attendanceRate({ present: 45, late: 2, absent: 2, excused: 1 })).toBe(94);
    expect(attendanceRate({ present: 2, late: 0, absent: 1, excused: 0 })).toBe(66.7);
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 0 })).toBeNull();
  });
});

describe('Attendance · Greenfield', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
  });

  it('summarises each arm’s registers for the working branch', LONG, async () => {
    const all = (
      await api.get<AttendanceOverview>('/v1/academics/attendance', {
        params: { branch: 'All branches' },
      })
    ).data;
    const main = (
      await api.get<AttendanceOverview>('/v1/academics/attendance', {
        params: { branch: 'Main Campus' },
      })
    ).data;
    expect(main.rows.length).toBeLessThan(all.rows.length);
    expect(main.rows.every((r) => r.branch === 'Main Campus')).toBe(true);
    expect(all.empty).toBeNull();
    for (const r of all.rows) {
      // An arm with no students has no register, so no day counts as missed.
      expect(r.daysTaken + r.notTaken).toBe(r.students ? all.schoolDays : 0);
      expect(r.rate).toBe(attendanceRate(r));
    }
    expect(all.rows.some((r) => !r.students)).toBe(true);
    // SSS 1C has no class teacher, so nobody takes its register.
    const sss1c = all.rows.find((r) => r.armId === 'arm-mc-sss1c')!;
    expect(sss1c).toMatchObject({ classTeacher: null, daysTaken: 0, rate: null });
    // About 94% present; a few arms missed recent days.
    expect(all.totals!.rate).toBeGreaterThan(90);
    expect(all.totals!.rate).toBeLessThan(97);
    expect(all.rows.filter((r) => r.classTeacher && r.notTaken > 0).length).toBeGreaterThan(0);
  });

  it('shows an arm’s days and every student’s percentage', LONG, async () => {
    const d = (await api.get<AttendanceArmDetail>('/v1/academics/attendance/arm-mc-jss2b')).data;
    expect(d.classTeacher).toBe('Mrs. Grace Okafor');
    expect(d.students.length).toBe(14);
    const closed = d.days.filter((x) => x.kind === 'closed').map((x) => x.note);
    expect(closed).toEqual(
      expect.arrayContaining(['Independence Day', 'Mid-term break', 'Staff development day']),
    );
    expect(d.days.some((x) => x.kind === 'closed' && x.taken)).toBe(false);
    for (const s of d.students) {
      expect(s.marked).toBe(s.present + s.late + s.absent + s.excused);
      expect(s.marked).toBe(Object.keys(s.marks).length);
      expect(s.rate).toBe(
        s.marked ? Math.round(((s.present + s.late) / s.marked) * 1000) / 10 : null,
      );
      const excused = Object.values(s.marks).filter((m) => m!.status === 'Excused');
      expect(excused.filter((m) => !m!.reason)).toEqual([]);
    }
    const taken = d.days.filter((x) => x.taken).length;
    expect(taken).toBe(d.summary.daysTaken);
    expect((await failure(api.get('/v1/academics/attendance/nope'))).status).toBe(404);
  });

  it('offers an attendance report in the Students group', LONG, async () => {
    const cat = (await api.get('/v1/reports')).data as {
      groups: { name: string; reports: { id: string }[] }[];
    };
    expect(cat.groups.find((g) => g.name === 'Students')!.reports.map((r) => r.id)).toContain(
      'attendance',
    );
    const r = (
      await api.get<SchoolReport>('/v1/reports/attendance', { params: { branch: 'Main Campus' } })
    ).data;
    const overview = (
      await api.get<AttendanceOverview>('/v1/academics/attendance', {
        params: { branch: 'Main Campus' },
      })
    ).data;
    expect(r.rows).toHaveLength(overview.rows.length);
    expect(r.totals!.notTaken).toBe(overview.rows.reduce((n, x) => n + x.notTaken, 0));
  });
});

describe('Report cards · remarks, conduct and attendance', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
  });

  it('carries the class teacher’s remark, conduct ratings and attendance', LONG, async () => {
    const card = (await api.get<ReportCard>('/v1/academics/results/report-card/emmanuel')).data;
    expect(card.classTeacherRemark).toMatch(/^Emmanuel /);
    expect(card.conduct.map((c) => c.trait)).toEqual([
      'Punctuality',
      'Neatness',
      'Attentiveness',
      'Relationship with others',
      'Leadership',
    ]);
    for (const c of card.conduct) {
      expect(c.rating).toBeGreaterThanOrEqual(1);
      expect(c.rating).toBeLessThanOrEqual(5);
    }
    const att = card.attendance!;
    const detail = (await api.get<AttendanceArmDetail>('/v1/academics/attendance/arm-mc-jss2b'))
      .data;
    const mine = detail.students.find((s) => s.id === 'emmanuel')!;
    expect(att.present).toBe(mine.present + mine.late);
    expect(att.schoolDays).toBe(detail.summary.schoolDays);
    expect(att.present + att.absent + att.excused).toBeLessThanOrEqual(att.schoolDays);

    const aisha = (await api.get<ReportCard>('/v1/academics/results/report-card/aisha')).data;
    expect(aisha.classTeacherRemark).toBeNull();
    expect(aisha.conduct.every((c) => c.rating === null)).toBe(true);
  });

  it('warns, without blocking, when remarks are missing', LONG, async () => {
    const check = (await api.get<PublishCheck>('/v1/academics/results/publish/arm-mc-jss2b')).data;
    expect(check.missingRemarks).toBe(3);
    expect(check.warnings).toEqual([
      'JSS 2B: 3 report cards have no class teacher’s remark yet (Mrs. Grace Okafor).',
    ]);
    // Get Mathematics through the HOD and the office, then publish anyway.
    hodDecision('greenfield', { armId: 'arm-mc-jss2b', subject: 'MTH', termId: TERM }, 'forward');
    await api.post('/v1/academics/results/sheets/arm-mc-jss2b/MTH/approve');
    const published = await api.post<PublishCheck>('/v1/academics/results/publish/arm-mc-jss2b', {
      acknowledged: true,
    });
    expect(published.data.missingRemarks).toBe(3);
    // JSS 1A was published with every remark written.
    const jss1a = (await api.get<PublishCheck>('/v1/academics/results/publish/arm-mc-jss1a')).data;
    expect(jss1a).toMatchObject({ missingRemarks: 0, warnings: [] });
  });
});

describe('Attendance · a new school (Crestview)', () => {
  it('shows an empty state instead of failing', async () => {
    const api = await signIn('e.udo@crestviewcollege.ng');
    const d = (await api.get<AttendanceOverview>('/v1/academics/attendance')).data;
    expect(d).toMatchObject({ empty: 'no-session', rows: [], totals: null });
  });
});
