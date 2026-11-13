import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AxiosInstance } from 'axios';
import {
  completionOf,
  flagOf,
  parseScore,
  scoreRow,
  statsOf,
  totalOf,
} from '@/components/results/scoring';
import type { Correction, NavCounts, ResultSheet, ResultsList, ScoreValue } from '@/types';

import { setMockNow } from '../clock';
import { NOTIFICATIONS } from '../notify-db';
import { sheetCountsFor, sheetsForArm, studentTermResults } from '../results-db';
import { SCHEMES } from '../school-db';
import { failure, signIn } from './helpers';

const JSS = SCHEMES.JSS;
const SSS = SCHEMES.SSS;

const JSS2B_MTH = 'rs-t-2627-1-mc-jss2b-MTH';
const JSS1A_MTH = 'rs-t-2627-1-mc-jss1a-MTH';
const SSS1A_MTH = 'rs-t-2627-1-mc-sss1a-MTH';
const LEKKI_FMT = 'rs-t-2627-1-lk-sss1a-FMT';
const PAST_JSS1B_MTH = 'rs-t-2526-3-p-mc-jss1b-MTH';

const rowOf = (sheet: ResultSheet, name: string) => sheet.rows.find((r) => r.name === name)!;
const payload = (sheet: ResultSheet, changes: Record<string, ScoreValue[]> = {}) => ({
  rows: sheet.rows.map((r) => ({
    studentId: r.studentId,
    scores: changes[r.name] ?? r.scores,
    remark: r.teacherRemark,
  })),
});

describe('Score parsing', () => {
  it('reads blanks as missing, numbers 0–max to one decimal, and ABS / EXM in any case', () => {
    expect(parseScore('', 20)).toEqual({ value: null, error: null });
    expect(parseScore('   ', 20)).toEqual({ value: null, error: null });
    expect(parseScore('0', 20)).toEqual({ value: 0, error: null });
    expect(parseScore('20', 20)).toEqual({ value: 20, error: null });
    expect(parseScore(' 14.5 ', 20)).toEqual({ value: 14.5, error: null });
    expect(parseScore('.5', 20)).toEqual({ value: 0.5, error: null });
    for (const t of ['ABS', 'abs', 'A', 'a', 'Abs'])
      expect(parseScore(t, 20)).toEqual({ value: 'ABS', error: null });
    for (const t of ['EXM', 'exm', 'E', 'e'])
      expect(parseScore(t, 100)).toEqual({ value: 'EXM', error: null });
  });

  it('rejects everything else with a reason', () => {
    expect(parseScore('21', 20).error).toBe('Max is 20');
    expect(parseScore('14.25', 20).error).toBe('Use at most one decimal place');
    expect(parseScore('-1', 20).error).toBe('Enter 0–20, ABS or EXM');
    expect(parseScore('12a', 20).error).toBe('Enter 0–20, ABS or EXM');
    expect(parseScore('absent', 20).error).toBe('Enter 0–20, ABS or EXM');
    expect(parseScore('1,5', 20).error).toBe('Enter 0–20, ABS or EXM');
    expect(parseScore('12.', 20).value).toBeNull();
  });
});

describe('Totals and grades (School Admin’s rules)', () => {
  // Expected values are what School Admin's `totalOf` / `gradeOf` give for the same inputs
  // (CA 1 /20 × 20%, CA 2 /20 × 20%, Exam /100 × 60%, one decimal place, re-weighted EXM).
  it('weights components and grades by section', () => {
    expect(totalOf(JSS.components, [15, 18, 60])).toBe(69);
    expect(scoreRow(JSS.components, JSS.scale, [15, 18, 60]).grade).toBe('B');
    expect(scoreRow(SSS.components, SSS.scale, [15, 18, 60]).grade).toBe('B3');
    expect(scoreRow(JSS.components, JSS.scale, [20, 20, 100])).toMatchObject({
      total: 100,
      grade: 'A',
      remark: 'Excellent',
    });
    expect(scoreRow(JSS.components, JSS.scale, [0, 0, 0])).toMatchObject({ total: 0, grade: 'F' });
    expect(totalOf(JSS.components, [12.5, 13, 47])).toBe(53.7);
    // Bands include the decimals above their max: 69.5 is still a B.
    expect(totalOf(JSS.components, [14, 14, 69.2])).toBe(69.5);
    expect(scoreRow(JSS.components, JSS.scale, [14, 14, 69.2]).grade).toBe('B');
  });

  it('re-spreads weights for EXM and leaves ABS and missing rows without a total', () => {
    // (15/20·20 + 60/100·60) / 80 · 100 = 63.75, which floating point rounds to 63.7 — as School
    // Admin's identical formula does.
    expect(totalOf(JSS.components, [15, 'EXM', 60])).toBe(63.7);
    // (14/20·20 + 60/100·60) / 80 · 100 = 62.5
    expect(totalOf(JSS.components, [14, 'EXM', 60])).toBe(62.5);
    expect(totalOf(JSS.components, ['EXM', 'EXM', 50])).toBe(50);
    expect(totalOf(JSS.components, ['EXM', 'EXM', 'EXM'])).toBeNull();
    expect(totalOf(JSS.components, [15, 18, 'ABS'])).toBeNull();
    expect(totalOf(JSS.components, [15, null, 60])).toBeNull();
    expect(flagOf(JSS.components, [15, 18, 'ABS'])).toBe('Absent (Examination) · make-up needed');
    expect(flagOf(JSS.components, ['EXM', 18, 60])).toBe('Exempt from CA 1');
    expect(flagOf(JSS.components, [15, null, 60])).toBe('Missing score');
    expect(flagOf(JSS.components, [15, 18, 60])).toBe('');
  });

  it('keeps ABS out of the class average and counts complete / missing students', () => {
    const rows: { scores: ScoreValue[] }[] = [
      { scores: [20, 20, 100] },
      { scores: [10, 10, 50] },
      { scores: [15, 18, 'ABS'] },
      { scores: [15, null, 60] },
      { scores: ['EXM', 18, 60] },
    ];
    const stats = statsOf(JSS.components, JSS.scale, rows, 40);
    // Totals: 100, 50, —, —, (18/20·20 + 36)/80·100 = 67.5 → average (100 + 50 + 67.5) / 3
    expect(stats).toMatchObject({
      average: 72.5,
      highest: 100,
      lowest: 50,
      passed: 3,
      count: 5,
      complete: 4,
      missing: 1,
      absent: 1,
      exempt: 1,
    });
    expect(stats.distribution.find((d) => d.grade === 'A')!.count).toBe(1);
    expect(completionOf(3, rows)).toEqual({ scored: 14, total: 15, missing: 1 });
  });
});

describe('Result sheets', () => {
  let ade: AxiosInstance;
  let okafor: AxiosInstance;
  let bello: AxiosInstance;
  beforeAll(async () => {
    ade = await signIn('s.ade@greenfield.edu.ng');
    okafor = await signIn('g.okafor@greenfield.edu.ng');
    bello = await signIn('i.bello@greenfield.edu.ng');
  });
  afterEach(() => setMockNow());

  it('counts sheets that need the teacher in the sidebar', async () => {
    // Ade: SSS 1A returned + JSS 2B draft with a missing score.
    expect((await ade.get<NavCounts>('/v1/nav-counts')).data.results).toBe(2);
    // Okafor: JSS 2A not started (JSS 2B English is complete).
    expect((await okafor.get<NavCounts>('/v1/nav-counts')).data.results).toBe(1);
    expect(sheetCountsFor('ade', 't-2627-1')).toMatchObject({
      total: 4,
      submitted: 2,
      returned: 1,
      missingScores: 1,
    });
  });

  it('lists my sheets for the term with every lifecycle state, filterable by class', async () => {
    const { data } = await ade.get<ResultsList>('/v1/results');
    expect(data.entryOpen).toBe(true);
    expect(data.deadline).toBe('2026-12-11T23:59');
    const by = Object.fromEntries(data.sheets.map((s) => [s.id, s]));
    expect(by[JSS2B_MTH]).toMatchObject({ status: 'Draft', editable: true });
    expect(by[JSS2B_MTH]!.completion).toMatchObject({ missing: 1, total: 42, scored: 41 });
    expect(by[JSS1A_MTH]).toMatchObject({
      status: 'Submitted',
      withHod: true,
      withLabel: 'With Mr. Ibrahim Bello (HOD Sciences)',
      editable: false,
    });
    expect(by[SSS1A_MTH]).toMatchObject({ status: 'Returned', editable: true });
    expect(by[SSS1A_MTH]!.returnNote).toMatch(/mark book/);
    expect(by[LEKKI_FMT]).toMatchObject({
      status: 'Under review',
      withLabel: 'With the academic office',
      branchName: 'Lekki Campus',
    });
    const filtered = await ade.get<ResultsList>('/v1/results', {
      params: { class: 'mc-jss2b', subject: 'MTH' },
    });
    expect(filtered.data.sheets.map((s) => s.id)).toEqual([JSS2B_MTH]);
    const past = await ade.get<ResultsList>('/v1/results', { params: { term: 't-2526-3' } });
    expect(past.data.entryOpen).toBe(false);
    expect(past.data.sheets.every((s) => s.status === 'Published' && !s.editable)).toBe(true);
  });

  it('shows the JSS 2B draft with its missing, absent and exempt students', async () => {
    const { data } = await ade.get<ResultSheet>(`/v1/results/${JSS2B_MTH}`);
    expect(data.rows).toHaveLength(14); // Chinonso Afolabi left in November
    expect(data.stats).toMatchObject({ count: 14, missing: 1, absent: 1, exempt: 1, complete: 13 });
    expect(rowOf(data, 'Blessing Etim')).toMatchObject({ total: null, flag: 'Missing score' });
    expect(rowOf(data, 'Daniel Musa')).toMatchObject({
      total: null,
      flag: 'Absent (Examination) · make-up needed',
    });
    expect(rowOf(data, 'Tolulope Bankole').flag).toBe('Exempt from CA 1');
    expect(rowOf(data, 'Tolulope Bankole').total).not.toBeNull();
    expect(data).toMatchObject({
      submitTo: 'Mr. Ibrahim Bello (HOD Sciences)',
      submitToHod: true,
      lock: null,
    });
  });

  it('only opens my own sheets', async () => {
    const res = await failure(ade.get(`/v1/results/rs-t-2627-1-mc-jss2b-ENG`));
    expect(res.status).toBe(403);
    expect(res.message).toMatch(/You teach/);
    expect((await failure(ade.get('/v1/results/rs-nope'))).status).toBe(404);
  });

  it('refuses invalid scores with field errors', async () => {
    const { data } = await ade.get<ResultSheet>(`/v1/results/${JSS2B_MTH}`);
    const blessing = rowOf(data, 'Blessing Etim');
    const res = await ade
      .put(`/v1/results/${JSS2B_MTH}/scores`, payload(data, { 'Blessing Etim': [12, 25, 50] }))
      .catch((e) => e.response);
    expect(res.status).toBe(422);
    expect(res.data.fields).toHaveProperty(`${blessing.studentId}.CA2`);
    const decimals = await ade
      .put(`/v1/results/${JSS2B_MTH}/scores`, payload(data, { 'Blessing Etim': [12, 1.25, 50] }))
      .catch((e) => e.response);
    expect(decimals.status).toBe(422);
  });

  it('blocks submitting while any score is missing', async () => {
    const res = await ade.post(`/v1/results/${JSS2B_MTH}/submit`).catch((e) => e.response);
    expect(res.status).toBe(422);
    expect(res.data.message).toMatch(/1 student has missing scores \(Blessing Etim\)/);
    const { data } = await ade.get<ResultSheet>(`/v1/results/${JSS2B_MTH}`);
    expect(res.data.fields[rowOf(data, 'Blessing Etim').studentId]).toBe('CA 2 missing');
  });

  it('saves the missing score, then submits to the HOD and notifies him', async () => {
    const { data } = await ade.get<ResultSheet>(`/v1/results/${JSS2B_MTH}`);
    const blessing = rowOf(data, 'Blessing Etim');
    const saved = await ade.put<ResultSheet>(
      `/v1/results/${JSS2B_MTH}/scores`,
      payload(data, { 'Blessing Etim': [blessing.scores[0]!, 14, blessing.scores[2]!] }),
    );
    expect(saved.data.savedAt).toBe('2026-12-08T08:15');
    expect(saved.data.stats.missing).toBe(0);
    const before = NOTIFICATIONS.filter((n) => n.teacherId === 'bello').length;
    const { data: sent } = await ade.post<ResultSheet>(`/v1/results/${JSS2B_MTH}/submit`);
    expect(sent).toMatchObject({
      status: 'Submitted',
      withHod: true,
      withLabel: 'With Mr. Ibrahim Bello (HOD Sciences)',
    });
    expect(sent.lock).toMatchObject({ code: 'SHEET_LOCKED' });
    expect(sent.history[0]!.title).toBe(
      'Submitted by Mr. Samuel Ade to Mr. Ibrahim Bello (HOD Sciences)',
    );
    const toBello = NOTIFICATIONS.filter((n) => n.teacherId === 'bello');
    expect(toBello.length).toBe(before + 1);
    expect(toBello.slice(-1)[0]!.title).toBe('Mr. Samuel Ade submitted a result sheet');
    // Locked now: saving or submitting again is refused.
    const again = await failure(ade.put(`/v1/results/${JSS2B_MTH}/scores`, payload(sent)));
    expect(again).toMatchObject({ status: 409, code: 'SHEET_LOCKED' });
    expect((await failure(ade.post(`/v1/results/${JSS2B_MTH}/submit`))).status).toBe(409);
  });

  it('sends Languages sheets straight to the academic office', async () => {
    const id = 'rs-t-2627-1-mc-jss2b-ENG';
    const { data } = await okafor.get<ResultSheet>(`/v1/results/${id}`);
    expect(data.submitTo).toBe('the academic office (Languages has no HOD)');
    expect(data.submitToHod).toBe(false);
    const { data: sent } = await okafor.post<ResultSheet>(`/v1/results/${id}/submit`);
    expect(sent).toMatchObject({
      status: 'Under review',
      withHod: false,
      withLabel: 'With the academic office',
    });
  });

  it('makes a Not started sheet a Draft on its first save', async () => {
    const id = 'rs-t-2627-1-mc-jss2a-ENG';
    const { data } = await okafor.get<ResultSheet>(`/v1/results/${id}`);
    expect(data.status).toBe('Not started');
    const first = data.rows[0]!;
    const { data: saved } = await okafor.put<ResultSheet>(`/v1/results/${id}/scores`, {
      rows: [{ studentId: first.studentId, scores: [12, null, null], remark: 'Good start' }],
    });
    expect(saved.status).toBe('Draft');
    expect(saved.rows[0]!.teacherRemark).toBe('Good start');
    expect(saved.history.some((h) => h.title === 'Draft started')).toBe(true);
  });

  it('sends an HOD’s own sheet straight to the academic office', async () => {
    const id = 'rs-t-2627-1-mc-sss1a-PHY';
    const { data } = await bello.get<ResultSheet>(`/v1/results/${id}`);
    expect(data.submitTo).toMatch(/^the academic office \(your own Sciences sheet/);
    const { data: sent } = await bello.post<ResultSheet>(`/v1/results/${id}/submit`);
    expect(sent.status).toBe('Under review');
  });

  it('shows the returned comment and resubmits to the same reviewer', async () => {
    const { data } = await ade.get<ResultSheet>(`/v1/results/${SSS1A_MTH}`);
    expect(data.returned).toMatchObject({
      by: 'Mr. Ibrahim Bello (HOD Sciences)',
      at: '2026-12-07T15:20',
    });
    expect(data.returned!.note).toMatch(/mark book/);
    expect(data.lock).toBeNull();
    expect(data.submitTo).toBe('Mr. Ibrahim Bello (HOD Sciences)');
    const { data: sent } = await ade.post<ResultSheet>(`/v1/results/${SSS1A_MTH}/submit`);
    expect(sent).toMatchObject({ status: 'Submitted', withHod: true, returned: null });
    expect(sent.history[0]!.title).toMatch(/^Resubmitted by Mr. Samuel Ade to Mr. Ibrahim Bello/);
  });

  it('locks drafts after result entry closes, with the reason', async () => {
    setMockNow('2026-12-12T09:00:00+01:00');
    const id = 'rs-t-2627-1-mc-jss2a-ENG';
    const { data } = await okafor.get<ResultSheet>(`/v1/results/${id}`);
    const message =
      'Result entry closed on Fri 11 Dec at 23:59. Ask the academic office to reopen it.';
    expect(data.lock).toEqual({
      code: 'TERM_LOCKED',
      title: 'Result entry closed',
      reason: message,
    });
    expect(data.editable).toBe(false);
    const res = await failure(okafor.put(`/v1/results/${id}/scores`, payload(data)));
    expect(res).toEqual({ status: 409, code: 'TERM_LOCKED', message });
    expect((await failure(okafor.post(`/v1/results/${id}/submit`))).code).toBe('TERM_LOCKED');
    // Not counted as "due" in the sidebar any more.
    expect((await okafor.get<NavCounts>('/v1/nav-counts')).data.results).toBeUndefined();
    // Still open at 23:59 on the day.
    setMockNow('2026-12-11T23:59:00+01:00');
    expect((await okafor.get<ResultSheet>(`/v1/results/${id}`)).data.lock).toBeNull();
  });

  it('keeps past terms read-only', async () => {
    const { data } = await ade.get<ResultSheet>(`/v1/results/${PAST_JSS1B_MTH}`);
    expect(data.status).toBe('Published');
    expect(data.lock).toMatchObject({ code: 'TERM_LOCKED' });
    expect(data.lock!.reason).toMatch(/2025\/2026 Third Term is closed/);
    expect(data.canRequestCorrection).toBe(true);
    const res = await failure(ade.put(`/v1/results/${PAST_JSS1B_MTH}/scores`, payload(data)));
    expect(res).toMatchObject({ status: 409, code: 'TERM_LOCKED' });
  });

  it('exports sheet helpers for class progress and student pages', () => {
    const arm = sheetsForArm('mc-jss2b', 't-2627-1');
    expect(arm).toHaveLength(15);
    const bsc = arm.find((s) => s.subject === 'BSC')!;
    expect(bsc).toMatchObject({ status: 'Approved', teacherName: 'Mr. Ibrahim Bello' });
    expect(bsc.completion.missing).toBe(0);
    expect(arm.find((s) => s.subject === 'AGR')).toMatchObject({
      status: 'Submitted',
      withHod: true,
    });
  });
});

describe('Student results helper', () => {
  it('only gives totals for approved or published sheets', async () => {
    const ade = await signIn('s.ade@greenfield.edu.ng');
    const { data } = await ade.get<ResultSheet>(`/v1/results/${JSS2B_MTH}`);
    const id = rowOf(data, 'Favour Okeke').studentId;
    const results = studentTermResults(id, 't-2627-1');
    expect(results).toHaveLength(14); // JSS subjects, one of CRS / IRS
    const bsc = results.find((r) => r.subject === 'BSC')!;
    expect(bsc.status).toBe('Approved');
    expect(typeof bsc.total).toBe('number');
    expect(results.find((r) => r.subject === 'YOR')).toMatchObject({
      status: 'Draft',
      total: null,
      grade: null,
    });
  });
});

describe('Correction requests', () => {
  let ade: AxiosInstance;
  let sheet: ResultSheet;
  beforeAll(async () => {
    ade = await signIn('s.ade@greenfield.edu.ng');
    sheet = (await ade.get<ResultSheet>(`/v1/results/${PAST_JSS1B_MTH}`)).data;
  });

  it('validates the proposed score, the reason and the evidence', async () => {
    const row = sheet.rows[0]!;
    const current = row.scores[1] as number;
    const base = {
      sheetId: sheet.id,
      studentId: row.studentId,
      componentKey: 'CA2',
      reason: 'Script re-marked: question 4 was not added.',
    };
    const check = async (body: object) =>
      (await ade.post('/v1/corrections', body).catch((e) => e.response)).data.fields;
    expect(await check({ ...base, proposed: current })).toHaveProperty('proposed');
    expect(await check({ ...base, proposed: 21 })).toHaveProperty('proposed');
    expect(await check({ ...base, proposed: 12.25 })).toHaveProperty('proposed');
    expect(
      await check({ ...base, proposed: current === 20 ? 19 : current + 1, reason: 'Re-mark' }),
    ).toHaveProperty('reason');
    expect(
      await check({
        ...base,
        proposed: current === 20 ? 19 : current + 1,
        evidence: { name: 'scan.pdf', size: 11 * 1024 * 1024, type: 'application/pdf' },
      }),
    ).toHaveProperty('evidence');
  });

  it('creates an Under review request on the sheet’s history, and refuses a duplicate', async () => {
    const row = sheet.rows[0]!;
    const current = row.scores[1] as number;
    const proposed = current >= 18 ? current - 2 : current + 2;
    const body = {
      sheetId: sheet.id,
      studentId: row.studentId,
      componentKey: 'CA2',
      proposed,
      reason: 'Script re-marked: question 4 was not added.',
      evidence: { name: 'ca2-script.jpg', size: 2_000_000, type: 'image/jpeg' },
    };
    const { data } = await ade.post<Correction>('/v1/corrections', body);
    expect(data).toMatchObject({
      status: 'Under review',
      original: current,
      proposed,
      component: 'CA 2 (max 20)',
      evidence: 'ca2-script.jpg',
      requestedBy: 'Mr. Samuel Ade · Teacher',
    });
    expect(data.proposedTotal).not.toBe(data.originalTotal);
    const list = await ade.get<ResultsList>('/v1/results', { params: { term: 't-2526-3' } });
    expect(list.data.corrections.map((c) => c.id)).toContain(data.id);
    const after = await ade.get<ResultSheet>(`/v1/results/${sheet.id}`);
    expect(after.data.history[0]!.title).toBe('Correction requested by Mr. Samuel Ade');
    expect(after.data.corrections.map((c) => c.id)).toContain(data.id);
    const dup = await failure(ade.post('/v1/corrections', body));
    expect(dup).toMatchObject({ status: 409, code: 'DUPLICATE' });
  });

  it('only accepts corrections on my published sheets', async () => {
    const draft = await ade.get<ResultSheet>(`/v1/results/${LEKKI_FMT}`);
    const res = await failure(
      ade.post('/v1/corrections', {
        sheetId: LEKKI_FMT,
        studentId: draft.data.rows[0]!.studentId,
        componentKey: 'CA1',
        proposed: 10,
        reason: 'A long enough reason for the test.',
      }),
    );
    expect(res.status).toBe(409);
    const okafor = await signIn('g.okafor@greenfield.edu.ng');
    expect(
      (await failure(okafor.post('/v1/corrections', { sheetId: PAST_JSS1B_MTH, studentId: 'x' })))
        .status,
    ).toBe(403);
  });
});
