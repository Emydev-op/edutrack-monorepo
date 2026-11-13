import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import type {
  ClassProgress,
  NavCounts,
  RegisterDay,
  RegisterHistory,
  RegisterMarkInput,
  ReportCardEntry,
  ReportCardsList,
  SaveRegisterResult,
} from '@/types';

import { setMockNow } from '../clock';
import { NOTIFICATIONS } from '../notify-db';
import {
  attendancePercent,
  attendanceSummary,
  registerOf,
  registerTakenToday,
} from '../register-db';
import { remarksProgress } from '../report-cards-db';
import { SHEETS } from '../results-db';
import { STUDENTS } from '../school-db';
import { failure, signIn } from './helpers';

const TODAY = '2026-12-08';
const byName = (name: string) => STUDENTS.find((s) => s.name === name)!;
const allPresent = (day: RegisterDay): RegisterMarkInput[] =>
  day.rows.map((r) => ({ studentId: r.studentId, status: 'Present' }));

describe('Register', { timeout: 30_000 }, () => {
  let okafor: AxiosInstance;
  let bello: AxiosInstance;
  let ade: AxiosInstance;
  beforeAll(async () => {
    okafor = await signIn('g.okafor@greenfield.edu.ng');
    bello = await signIn('i.bello@greenfield.edu.ng');
    ade = await signIn('s.ade@greenfield.edu.ng');
  });

  it('opens today’s register for my arm, not yet taken', async () => {
    const { data } = await okafor.get<RegisterDay>('/v1/class-teacher/register');
    expect(data).toMatchObject({ arm: 'JSS 2B', date: TODAY, taken: false, lock: null });
    expect(data.rows).toHaveLength(14);
    expect(data.rows.every((r) => r.status === null)).toBe(true);
    expect(data.editableDays).toEqual([
      TODAY,
      '2026-12-07',
      '2026-12-04',
      '2026-12-03',
      '2026-12-02',
      '2026-12-01',
    ]);
    expect((await bello.get<RegisterDay>('/v1/class-teacher/register')).data.arm).toBe('SSS 1A');
    expect((await okafor.get<NavCounts>('/v1/nav-counts')).data.register).toBe(1);
  });

  it('is only for class teachers', async () => {
    const res = await failure(ade.get('/v1/class-teacher/register'));
    expect(res.status).toBe(403);
    expect(res.message).toMatch(/aren’t a class teacher/);
    expect((await ade.get<NavCounts>('/v1/nav-counts')).data.register).toBeUndefined();
  });

  it('refuses weekends, holidays, the mid-term break, the staff day and future days', async () => {
    const today = (await okafor.get<RegisterDay>('/v1/class-teacher/register')).data;
    const cases: [string, RegExp][] = [
      ['2026-12-05', /Weekend/],
      ['2026-10-01', /Independence Day/],
      ['2026-10-30', /Mid-term break/],
      ['2026-11-02', /Mid-term break/],
      ['2026-11-20', /Staff development day/],
      ['2026-12-09', /hasn’t happened yet/],
    ];
    for (const [date, reason] of cases) {
      const res = await failure(
        okafor.put(`/v1/class-teacher/register/${date}`, { marks: allPresent(today) }),
      );
      expect(res.status).toBe(409);
      expect(res.message).toMatch(reason);
      const view = (
        await okafor.get<RegisterDay>('/v1/class-teacher/register', { params: { date } })
      ).data;
      expect(view.lock?.reason).toMatch(reason);
      expect(view.rows).toEqual([]);
    }
  });

  it('can change the previous 5 school days, older days are read-only', async () => {
    const dec1 = (
      await okafor.get<RegisterDay>('/v1/class-teacher/register', {
        params: { date: '2026-12-01' },
      })
    ).data;
    expect(dec1).toMatchObject({ taken: true, lock: null });
    await okafor.put('/v1/class-teacher/register/2026-12-01', { marks: allPresent(dec1) });

    const nov30 = (
      await okafor.get<RegisterDay>('/v1/class-teacher/register', {
        params: { date: '2026-11-30' },
      })
    ).data;
    expect(nov30.lock).toMatchObject({ code: 'TOO_OLD' });
    expect(nov30.rows.length).toBe(14);
    const res = await failure(
      okafor.put('/v1/class-teacher/register/2026-11-30', { marks: allPresent(nov30) }),
    );
    expect(res).toMatchObject({ status: 409, code: 'REGISTER_TOO_OLD' });
    expect(res.message).toMatch(/5 school days/);
  });

  it('shows the days not taken: one still editable, one locked', async () => {
    const dec3 = (
      await okafor.get<RegisterDay>('/v1/class-teacher/register', {
        params: { date: '2026-12-03' },
      })
    ).data;
    expect(dec3).toMatchObject({ taken: false, lock: null });
    const nov19 = (
      await okafor.get<RegisterDay>('/v1/class-teacher/register', {
        params: { date: '2026-11-19' },
      })
    ).data;
    expect(nov19).toMatchObject({ taken: false, lock: { code: 'TOO_OLD' } });
  });

  it('is read-only for a past term', async () => {
    const { data } = await okafor.get<RegisterDay>('/v1/class-teacher/register', {
      params: { term: 't-2526-3' },
    });
    expect(data).toMatchObject({ arm: 'JSS 1B', date: '2026-07-24', taken: true });
    expect(data.lock).toMatchObject({ code: 'TERM_LOCKED' });
    const res = await failure(
      okafor.put(
        '/v1/class-teacher/register/2026-07-24',
        { marks: allPresent(data) },
        {
          params: { term: 't-2526-3' },
        },
      ),
    );
    expect(res).toMatchObject({ status: 409, code: 'TERM_LOCKED' });
  });

  it('needs a mark for everyone and a reason for Excused', async () => {
    const day = (await okafor.get<RegisterDay>('/v1/class-teacher/register')).data;
    const [first, second] = day.rows;
    const marks = allPresent(day).map((m) =>
      m.studentId === first!.studentId ? { ...m, status: 'Excused' as const, reason: ' ' } : m,
    );
    const noReason = await failure(okafor.put(`/v1/class-teacher/register/${TODAY}`, { marks }));
    expect(noReason.status).toBe(422);
    const missing = await failure(
      okafor.put(`/v1/class-teacher/register/${TODAY}`, {
        marks: allPresent(day).filter((m) => m.studentId !== second!.studentId),
      }),
    );
    expect(missing.status).toBe(422);
    expect(missing.message).toMatch(/1 student needs a mark/);
    expect(registerTakenToday('mc-jss2b')).toBe(false);
  });

  it('saves today with an absence and an excused, and notifies guardians of the absence', async () => {
    const day = (await okafor.get<RegisterDay>('/v1/class-teacher/register')).data;
    const kelechi = day.rows.find((r) => r.name === 'Kelechi Obi')!;
    const grace = day.rows.find((r) => r.name === 'Grace Achebe')!;
    const marks = allPresent(day).map((m) =>
      m.studentId === kelechi.studentId
        ? { ...m, status: 'Absent' as const, reason: 'No word from home' }
        : m.studentId === grace.studentId
          ? { ...m, status: 'Excused' as const, reason: 'Hospital appointment' }
          : m,
    );
    const { data } = await okafor.put<SaveRegisterResult>(`/v1/class-teacher/register/${TODAY}`, {
      marks,
    });
    expect(data.notified).toEqual(['Kelechi Obi']);
    expect(data.register).toMatchObject({
      taken: true,
      takenBy: 'Mrs. Grace Okafor',
      counts: { present: 12, absent: 1, late: 0, excused: 1, unmarked: 0 },
    });
    expect(data.register.rows.find((r) => r.name === 'Grace Achebe')!.reason).toBe(
      'Hospital appointment',
    );
    expect(data.register.history.map((h) => h.title)).toEqual([
      'Guardians of 1 student notified',
      'Register taken by Mrs. Grace Okafor',
    ]);
    expect(registerTakenToday('mc-jss2b')).toBe(true);
    expect((await okafor.get<NavCounts>('/v1/nav-counts')).data.register).toBeUndefined();

    // Saving again doesn't notify the same guardian twice.
    const again = await okafor.put<SaveRegisterResult>(`/v1/class-teacher/register/${TODAY}`, {
      marks,
    });
    expect(again.data.notified).toEqual([]);
    expect(again.data.register.history[0]!.title).toBe('Register updated by Mrs. Grace Okafor');
  });

  it('only marks students on days they were in the class (late joiner, transferred)', async () => {
    const chinonso = byName('Chinonso Afolabi');
    const on16 = (
      await okafor.get<RegisterDay>('/v1/class-teacher/register', {
        params: { date: '2026-11-16' },
      })
    ).data;
    expect(on16.rows.some((r) => r.studentId === chinonso.id)).toBe(true);
    const on17 = (
      await okafor.get<RegisterDay>('/v1/class-teacher/register', {
        params: { date: '2026-11-17' },
      })
    ).data;
    expect(on17.rows.some((r) => r.studentId === chinonso.id)).toBe(false);
    expect(registerOf('mc-jss2b', '2026-11-16')!.marks[chinonso.id]).toBeDefined();
    expect(registerOf('mc-jss2b', '2026-11-17')!.marks[chinonso.id]).toBeUndefined();

    const oreoluwa = byName('Oreoluwa Fashola');
    expect(registerOf('mc-jss1a', '2026-10-28')?.marks[oreoluwa.id]).toBeUndefined();
    expect(registerOf('mc-jss1a', '2026-11-03')!.marks[oreoluwa.id]).toBeDefined();
    const late = attendanceSummary(oreoluwa.id, 't-2627-1');
    // 3 Nov – 8 Dec: 26 weekdays less the staff development day (today counts, not yet taken).
    expect(late.schoolDays).toBe(25);
    expect(late.present + late.absent + late.late + late.excused).toBeLessThanOrEqual(24);

    const history = (await okafor.get<RegisterHistory>('/v1/class-teacher/register/history')).data;
    const row = history.students.find((s) => s.studentId === chinonso.id)!;
    expect(row.note).toBe('Left 16 Nov (transferred)');
    expect(row.schoolDays).toBeLessThan(history.schoolDays);
  });

  it('works out attendance percentages as (present + late) ÷ marked', async () => {
    expect(attendancePercent({ present: 17, late: 1, absent: 1, excused: 1 })).toBe(90);
    expect(attendancePercent({ present: 2, late: 0, absent: 1, excused: 0 })).toBe(66.7);
    expect(attendancePercent({ present: 0, late: 0, absent: 0, excused: 0 })).toBeNull();

    const history = (await okafor.get<RegisterHistory>('/v1/class-teacher/register/history')).data;
    expect(history.days[0]).toMatchObject({ date: TODAY, taken: true, percent: 85.7 }); // 12 of 14: excused counts as marked
    expect(history.days.find((d) => d.date === '2026-12-03')).toMatchObject({ taken: false });
    expect(history.notTaken).toBe(2);
    expect(history.schoolDays).toBe(history.days.length);
    const kelechi = history.students.find((s) => s.name === 'Kelechi Obi')!;
    const summary = attendanceSummary(kelechi.studentId, 't-2627-1');
    expect(summary).toMatchObject({
      present: kelechi.present,
      absent: kelechi.absent,
      late: kelechi.late,
      excused: kelechi.excused,
      percent: kelechi.percent,
    });
    expect(summary.absent).toBeGreaterThanOrEqual(1);
    const marked = summary.present + summary.absent + summary.late + summary.excused;
    expect(summary.percent).toBe(
      Math.round(((summary.present + summary.late) / marked) * 1000) / 10,
    );
  });
});

describe('Class progress', { timeout: 30_000 }, () => {
  let okafor: AxiosInstance;
  let ade: AxiosInstance;
  beforeAll(async () => {
    okafor = await signIn('g.okafor@greenfield.edu.ng');
    ade = await signIn('s.ade@greenfield.edu.ng');
  });
  afterEach(() => setMockNow());

  const MTH = 'rs-t-2627-1-mc-jss2b-MTH';

  it('lists every subject for the arm with teacher, status and completion', async () => {
    const { data } = await okafor.get<ClassProgress>('/v1/class-teacher/progress');
    expect(data.arm).toBe('JSS 2B');
    expect(data.subjects).toHaveLength(15);
    const total = Object.values(data.summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(15);
    expect(data.subjects.find((s) => s.subject === 'ENG')).toMatchObject({
      isMine: true,
      canRemind: false,
    });
    expect(data.subjects.find((s) => s.subject === 'MTH')).toMatchObject({
      teacherName: 'Mr. Samuel Ade',
      status: 'Draft',
      canRemind: true,
    });
    expect(data.subjects.find((s) => s.subject === 'BSC')).toMatchObject({
      status: 'Approved',
      canRemind: false,
    });
  });

  it('reminds a teacher once per sheet per day, never yourself', async () => {
    const before = NOTIFICATIONS.filter((n) => n.teacherId === 'ade').length;
    await okafor.post(`/v1/class-teacher/progress/${MTH}/remind`);
    const toAde = NOTIFICATIONS.filter((n) => n.teacherId === 'ade');
    expect(toAde.length).toBe(before + 1);
    expect(toAde.slice(-1)[0]!.title).toBe(
      'Mrs. Grace Okafor reminded you about JSS 2B · Mathematics',
    );

    const again = await failure(okafor.post(`/v1/class-teacher/progress/${MTH}/remind`));
    expect(again).toMatchObject({ status: 409, code: 'ALREADY_REMINDED' });
    expect(again.message).toMatch(/You already reminded Mr. Samuel Ade about Mathematics today/);
    const view = (await okafor.get<ClassProgress>('/v1/class-teacher/progress')).data;
    expect(view.subjects.find((s) => s.subject === 'MTH')).toMatchObject({ canRemind: false });
    expect(view.subjects.find((s) => s.subject === 'MTH')!.remindedAt).toBeTruthy();

    const own = await failure(
      okafor.post('/v1/class-teacher/progress/rs-t-2627-1-mc-jss2b-ENG/remind'),
    );
    expect(own).toMatchObject({ status: 409, code: 'OWN_SHEET' });
    const approved = await failure(
      okafor.post('/v1/class-teacher/progress/rs-t-2627-1-mc-jss2b-BSC/remind'),
    );
    expect(approved).toMatchObject({ status: 409, code: 'NOT_REMINDABLE' });
    const otherArm = await failure(
      okafor.post('/v1/class-teacher/progress/rs-t-2627-1-mc-jss1a-MTH/remind'),
    );
    expect(otherArm.status).toBe(403);
    expect((await failure(ade.post(`/v1/class-teacher/progress/${MTH}/remind`))).status).toBe(403);

    setMockNow('2026-12-09T08:00:00+01:00');
    await okafor.post(`/v1/class-teacher/progress/${MTH}/remind`);
  });
});

describe('Report cards', { timeout: 30_000 }, () => {
  let okafor: AxiosInstance;
  beforeAll(async () => {
    okafor = await signIn('g.okafor@greenfield.edu.ng');
  });

  it('lists progress, totals so far (Pending until approved) and attendance', async () => {
    const { data } = await okafor.get<ReportCardsList>('/v1/class-teacher/report-cards');
    expect(data).toMatchObject({ arm: 'JSS 2B', editable: true, progress: { done: 9, total: 14 } });
    expect(data.students.some((s) => s.name === 'Chinonso Afolabi')).toBe(false);
    const first = data.students[0]!;
    expect(first.results.find((r) => r.subject === 'MTH')).toMatchObject({ total: null });
    expect(first.results.find((r) => r.subject === 'BSC')!.total).toEqual(expect.any(Number));
    expect(first.attendance.schoolDays).toBeGreaterThan(50);
    expect((await okafor.get<NavCounts>('/v1/nav-counts')).data['report-cards']).toBe(5);
  });

  it('validates the remark (20–400) and all five ratings', async () => {
    const list = (await okafor.get<ReportCardsList>('/v1/class-teacher/report-cards')).data;
    const missing = list.students.find((s) => !s.done)!;
    const url = `/v1/class-teacher/report-cards/${missing.studentId}`;
    const short = await failure(okafor.put(url, { remark: 'Good boy.', ratings: {} }));
    expect(short.status).toBe(422);
    const res = await okafor
      .put(url, { remark: 'x'.repeat(401), ratings: { Punctuality: 6 } })
      .catch((e) => e.response);
    expect(res.status).toBe(422);
    expect(Object.keys(res.data.fields).sort()).toEqual([
      'ratings.Attentiveness',
      'ratings.Leadership',
      'ratings.Neatness',
      'ratings.Punctuality',
      'ratings.Relationship with others',
      'remark',
    ]);
    const ok = await okafor.put<ReportCardEntry>(url, {
      remark: 'A steady, polite student who works well with others.',
      ratings: {
        Punctuality: 4,
        Neatness: 5,
        Attentiveness: 4,
        'Relationship with others': 5,
        Leadership: 3,
      },
    });
    expect(ok.data).toMatchObject({ done: true, updatedBy: 'Mrs. Grace Okafor' });
    expect(ok.data.history[0]!.title).toBe('Remark and ratings added by Mrs. Grace Okafor');
    expect(remarksProgress('mc-jss2b', 't-2627-1')).toEqual({ done: 10, total: 14 });
  });

  it('has prev / next and refuses students outside my class', async () => {
    const list = (await okafor.get<ReportCardsList>('/v1/class-teacher/report-cards')).data;
    const second = (
      await okafor.get<ReportCardEntry>(
        `/v1/class-teacher/report-cards/${list.students[1]!.studentId}`,
      )
    ).data;
    expect(second).toMatchObject({
      index: 2,
      total: 14,
      prevId: list.students[0]!.studentId,
      nextId: list.students[2]!.studentId,
    });
    const outsider = STUDENTS.find((s) => s.armId === 'mc-jss1a')!;
    expect(
      (await failure(okafor.get(`/v1/class-teacher/report-cards/${outsider.id}`))).status,
    ).toBe(403);
  });

  it('locks once the class’s results are published, and for a past term', async () => {
    const list = (await okafor.get<ReportCardsList>('/v1/class-teacher/report-cards')).data;
    const sheets = SHEETS.filter((s) => s.armId === 'mc-jss2b' && s.termId === 't-2627-1');
    const saved = sheets.map((s) => s.status);
    sheets.forEach((s) => (s.status = 'Published'));
    try {
      const body = {
        remark: 'A steady, polite student who works well with others.',
        ratings: {
          Punctuality: 4,
          Neatness: 4,
          Attentiveness: 4,
          'Relationship with others': 4,
          Leadership: 4,
        },
      };
      const res = await failure(
        okafor.put(`/v1/class-teacher/report-cards/${list.students[0]!.studentId}`, body),
      );
      expect(res).toMatchObject({ status: 409, code: 'RESULTS_PUBLISHED' });
      const view = (await okafor.get<ReportCardsList>('/v1/class-teacher/report-cards')).data;
      expect(view.editable).toBe(false);
      expect(view.lockReason).toMatch(/published/);
    } finally {
      sheets.forEach((s, i) => (s.status = saved[i]!));
    }
    const past = (
      await okafor.get<ReportCardsList>('/v1/class-teacher/report-cards', {
        params: { term: 't-2526-3' },
      })
    ).data;
    expect(past).toMatchObject({ arm: 'JSS 1B', editable: false });
    expect(past.progress.done).toBe(past.progress.total);
    const res = await failure(
      okafor.put(
        `/v1/class-teacher/report-cards/${past.students[0]!.studentId}`,
        { remark: 'x'.repeat(30), ratings: {} },
        { params: { term: 't-2526-3' } },
      ),
    );
    expect(res).toMatchObject({ status: 409, code: 'TERM_LOCKED' });
  });
});
