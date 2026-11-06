import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  AdmissionApplication,
  AdmissionMatches,
  AdmitPayload,
  AdmitResult,
  EnrollmentOptions,
  GuardianRow,
  ImportBatch,
  LoginResponse,
  StudentDetail,
  StudentRow,
} from '@/types';

import { installMockApi } from '..';

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

const kamsi = (over: Partial<AdmitPayload> = {}): AdmitPayload => ({
  applicationId: 'app-kamsi',
  surname: 'Nwosu',
  firstName: 'Kamsi',
  otherNames: 'Chidinma',
  gender: 'Female',
  dateOfBirth: '2014-05-12',
  stateOfOrigin: 'Anambra',
  previousSchool: 'Little Angels School, Ikeja',
  guardian: { mode: 'link', guardianId: 'obinna' },
  relationship: 'Father',
  paysFees: true,
  invite: true,
  branch: 'Main Campus',
  level: 'JSS 1',
  arm: 'A',
  admissionType: 'Transfer in',
  admissionDate: '2026-12-08',
  religious: 'CRS',
  elective: 'Computer Studies',
  documents: { birth: 'birth.pdf', photo: null, report: 'report.pdf' },
  billing: 'full',
  siblingDiscount: true,
  ...over,
});

describe('Students mock API', () => {
  let api: AxiosInstance;
  let crest: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
    crest = await signIn('e.udo@crestviewcollege.ng');
  });

  it('lists, filters and scopes students to the school', async () => {
    const list = (params: object) =>
      api.get<{ data: StudentRow[]; meta: { total: number } }>('/v1/students', {
        params: { pageSize: 100, ...params },
      });
    expect((await list({ className: 'JSS 2B' })).data.meta.total).toBe(14);
    expect((await list({ search: 'Funke' })).data.data.map((s) => s.name)).toEqual([
      'Emmanuel Adeyemi',
      'Michael Adeyemi',
    ]);
    expect((await list({ status: 'Incomplete profile' })).data.data[0]).toMatchObject({
      name: 'Aisha Lawal',
      guardianName: null,
    });
    expect((await crest.get('/v1/students')).data.meta.total).toBe(0);
    const { data: e } = await api.get<StudentDetail>('/v1/students/emmanuel');
    expect(e).toMatchObject({ className: 'JSS 2B', balance: 95000, age: 13 });
    expect(e.guardians.map((g) => g.name)).toEqual(['Mrs. Funke Adeyemi', 'Mr. Tayo Adeyemi']);
  });

  it(
    'needs a destination and letter for a transfer, and keeps the record',
    { timeout: 15_000 },
    async () => {
      const body = {
        kind: 'Transfer',
        date: '2026-12-18',
        reason: 'Family relocation',
        destination: '',
        notes: '',
        document: null,
      };
      expect((await failure(api.post('/v1/students/kelechi/transfer', body))).message).toContain(
        'destination',
      );
      expect(
        (
          await failure(
            api.post('/v1/students/kelechi/transfer', {
              ...body,
              destination: 'Loyola Jesuit College',
            }),
          )
        ).message,
      ).toContain('transfer letter');
      const { data } = await api.post<StudentRow>('/v1/students/kelechi/transfer', {
        ...body,
        destination: 'Loyola Jesuit College',
        document: 'letter.pdf',
      });
      expect(data.status).toBe('Transferred');
      expect(
        (await failure(api.post('/v1/students/kelechi/transfer', { ...body, kind: 'Withdrawal' })))
          .status,
      ).toBe(409);
    },
  );

  it('admits with capacity, document and sibling rules', { timeout: 20_000 }, async () => {
    const { data: m } = await api.get<AdmissionMatches>('/v1/admissions/matches', {
      params: { firstName: 'Kamsi', surname: 'Nwosu' },
    });
    expect(m.sibling).toMatchObject({ studentName: 'David Nwosu', guardianId: 'obinna' });
    expect(
      (
        await api.get<AdmissionMatches>('/v1/admissions/matches', {
          params: { firstName: 'Favour', surname: 'Okeke' },
        })
      ).data.duplicate?.admissionNo,
    ).toBe('STU-2025-0047');

    expect((await failure(api.post('/v1/admissions', kamsi({ arm: 'B' })))).message).toContain(
      'JSS 1B is at capacity',
    );
    expect(
      (
        await failure(
          api.post(
            '/v1/admissions',
            kamsi({ documents: { birth: 'b.pdf', photo: null, report: null } }),
          ),
        )
      ).message,
    ).toContain('previous school report');

    const { data: r } = await api.post<AdmitResult>('/v1/admissions', kamsi());
    expect(r).toMatchObject({
      className: 'JSS 1A',
      guardianName: 'Mr. Obinna Nwosu',
      invoiceTotal: 200000,
      admissionNo: 'STU-2026-1249',
    });
    const apps = (await api.get<AdmissionApplication[]>('/v1/admissions')).data;
    expect(apps.find((a) => a.id === 'app-kamsi')).toMatchObject({
      stage: 'Admitted',
      studentId: r.studentId,
    });
    const guardian = (await api.get<GuardianRow>('/v1/guardians/obinna')).data;
    expect(guardian.children.map((c) => c.name)).toContain('Kamsi Nwosu');
  });

  it('enrolls admitted students into an arm with room', { timeout: 15_000 }, async () => {
    const { data: o } = await api.get<EnrollmentOptions>('/v1/enrollment/options');
    const ids = o.awaiting.map((s) => s.id);
    expect(ids).toHaveLength(4);
    expect(
      (await failure(api.post('/v1/enrollments', { level: 'JSS 1', arm: 'B', studentIds: ids })))
        .message,
    ).toContain('over capacity');
    expect(
      (await api.post('/v1/enrollments', { level: 'JSS 1', arm: 'C', studentIds: ids })).data,
    ).toEqual({ enrolled: 4, className: 'JSS 1C' });
    expect((await api.get<EnrollmentOptions>('/v1/enrollment/options')).data.awaiting).toEqual([]);
  });

  it('flags duplicate guardians and merges them', { timeout: 15_000 }, async () => {
    const { data } = await api.get<{ duplicates: { keepId: string; mergeId: string }[] }>(
      '/v1/guardians',
    );
    expect(data.duplicates).toEqual([
      expect.objectContaining({ keepId: 'ngozi-eze', mergeId: 'ngozi-eze-2' }),
    ]);
    expect(
      (
        await failure(
          api.post('/v1/guardians', {
            name: 'Ngozi',
            phone: '0803 555 0172',
            email: '',
            relationship: 'Mother',
            studentIds: ['aisha'],
            paysFees: true,
            invite: false,
          }),
        )
      ).status,
    ).toBe(409);
    await api.post('/v1/guardians/merge', { keepId: 'ngozi-eze', mergeId: 'ngozi-eze-2' });
    expect((await api.get<{ duplicates: unknown[] }>('/v1/guardians')).data.duplicates).toEqual([]);
    await api.post('/v1/guardians', {
      name: 'Mr. Bayo Lawal',
      phone: '0809 555 0144',
      email: '',
      relationship: 'Father',
      studentIds: ['aisha'],
      paysFees: true,
      invite: true,
    });
    expect((await api.get<StudentDetail>('/v1/students/aisha')).data.status).toBe('Active');
  });

  it('blocks an import until errors are fixed or excluded', { timeout: 15_000 }, async () => {
    expect((await failure(api.post('/v1/imports', { fileName: 'list.pdf' }))).status).toBe(422);
    const { data: b } = await api.post<ImportBatch>('/v1/imports', {
      fileName: 'jss1-intake-2026.xlsx',
    });
    expect(b.issues.filter((i) => i.kind === 'error')).toHaveLength(2);
    expect(
      (
        await failure(
          api.post(`/v1/imports/${b.id}/commit`, { resolutions: {}, excludeErrors: false }),
        )
      ).status,
    ).toBe(422);
    const { data: r } = await api.post(`/v1/imports/${b.id}/commit`, {
      resolutions: { 12: 'JSS 1C', 31: '28/02/2014', 7: 'skip' },
      excludeErrors: false,
    });
    expect(r).toMatchObject({ imported: 47, batchId: b.id });
  });
});
