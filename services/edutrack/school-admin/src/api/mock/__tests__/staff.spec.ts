import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  AssignmentsView,
  LoginResponse,
  SetupProgress,
  StaffDetail,
  StaffImportBatch,
  StaffList,
  StaffListRow,
  StaffPayload,
  TeacherRow,
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
const LONG = { timeout: 30000 };

const teacher = (over: Partial<StaffPayload> = {}): StaffPayload => ({
  title: 'Mrs.',
  firstName: 'Ngozi',
  lastName: 'Okafor',
  gender: 'Female',
  phone: '0803 555 0199',
  email: 'n.okafor@crestviewcollege.ng',
  address: '',
  emergencyContact: '',
  kind: 'Teaching',
  position: 'Teacher',
  department: 'Sciences',
  employment: 'Full-time',
  since: '',
  branchIds: ['cmc'],
  qualified: ['MTH'],
  maxPeriods: 28,
  access: true,
  role: 'Teacher',
  ...over,
});

describe('Staff · Greenfield', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('adaeze.okonkwo@greenfield.edu.ng');
  });

  it('lists staff with groups, accounts and teaching load', async () => {
    const { data } = await api.get<StaffList>('/v1/staff');
    expect(data.counts.Teaching).toBeGreaterThan(15);
    expect(data.deactivated).toBe(1);
    const ade = data.rows.find((r) => r.id === 'ade')!;
    expect(ade).toMatchObject({ kind: 'Teaching', account: 'Active' });
    expect(ade.load!.periods).toBeGreaterThan(0);
    const driver = data.rows.find((r) => r.id === 'adamu')!;
    expect(driver).toMatchObject({ group: 'Operations', account: 'No account', load: null });
    const fin = await api.get<StaffList>('/v1/staff', { params: { group: 'Finance' } });
    expect(fin.data.rows.map((r) => r.id)).toEqual(expect.arrayContaining(['bakare', 'lawal']));
  });

  it('shows a teacher’s assignments on their profile', async () => {
    const { data } = await api.get<StaffDetail>('/v1/staff/okafor');
    expect(data.teaching!.classTeacherOf.map((a) => a.name)).toContain('JSS 2B');
    expect(data.teaching!.assignments.some((a) => a.arm === 'JSS 2B' && a.subject === 'ENG')).toBe(
      true,
    );
    expect(data.user?.status).toBe('Active');
  });

  it('needs cover before deactivating a teacher, then clears their classes', LONG, async () => {
    const err = await failure(api.post('/v1/staff/okafor/deactivate', {}));
    expect(err.message).toMatch(/cover/);
    // The failed attempt changed nothing.
    expect(
      (await api.get<StaffDetail>('/v1/staff/okafor')).data.teaching!.assignments.length,
    ).toBeGreaterThan(0);
    const { data } = await api.post<StaffListRow & { cleared: { removed: number } }>(
      '/v1/staff/okafor/deactivate',
      { coverArranged: true },
    );
    expect(data.status).toBe('Deactivated');
    expect(data.cleared.removed).toBeGreaterThan(0);
    const as = await api.get<AssignmentsView>('/v1/academics/assignments');
    expect(as.data.teachers.some((t) => t.id === 'okafor')).toBe(false);
    expect(as.data.armsWithoutClassTeacher.map((a) => a.name)).toContain('JSS 2B');
    await api.post('/v1/staff/okafor/reactivate');
  });

  it('protects the signed-in admin and the only principal', async () => {
    expect((await failure(api.post('/v1/staff/okonkwo/deactivate', {}))).message).toMatch(
      /yourself/,
    );
  });

  it('previews and imports a CSV', LONG, async () => {
    const text = [
      'first_name,last_name,email,phone,type,position,branch,portal_access,role',
      'Grace,Adebayo,g.adebayo@greenfieldacademy.ng,08035550161,Teaching,Teacher,Main Campus,yes,Teacher',
      'Samuel,Eke,,08025550199,Non-teaching,Driver,Main Campus,no,',
      'Bad,Row,not-an-email,,Teaching,Teacher,Nowhere,yes,',
    ].join('\n');
    const { data } = await api.post<StaffImportBatch>('/v1/staff/import', {
      fileName: 'staff.csv',
      text,
    });
    expect(data.rows.map((r) => r.errors.length > 0)).toEqual([false, false, true]);
    const done = await api.post(`/v1/staff/import/${data.id}/commit`);
    expect(done.data).toMatchObject({ imported: 2, invites: 1, skipped: 1 });
  });

  it('lists teachers by workload', async () => {
    const { data } = await api.get<TeacherRow[]>('/v1/staff/teachers');
    expect(data[0]!.periods).toBeGreaterThanOrEqual(data[data.length - 1]!.periods);
    expect(data.find((t) => t.id === 'ade')!.subjects.some((s) => s.code === 'MTH')).toBe(true);
  });
});

describe('Staff · Crestview onboarding', () => {
  let api: AxiosInstance;
  beforeAll(async () => {
    api = await signIn('e.udo@crestviewcollege.ng');
  });

  it(
    'needs a teacher before the Staff step completes; a new teacher is assignable',
    LONG,
    async () => {
      expect((await failure(api.post('/v1/setup/steps/staff/complete'))).message).toMatch(
        /teacher/,
      );
      expect(
        (await failure(api.post('/v1/staff', teacher({ email: 'not-an-email' })))).message,
      ).toMatch(/valid email/);
      const { data: added } = await api.post<StaffListRow>('/v1/staff', teacher());
      expect(added).toMatchObject({ kind: 'Teaching', account: 'Invited', branch: 'Main Campus' });
      expect(
        (await failure(api.post('/v1/staff', teacher({ firstName: 'Other', phone: '' })))).message,
      ).toMatch(/already used/);

      await api.post('/v1/setup/steps/staff/complete');
      const setup = await api.get<SetupProgress>('/v1/setup');
      expect(setup.data.steps.find((s) => s.id === 'staff')).toMatchObject({
        auto: true,
        done: true,
      });

      const as = await api.get<AssignmentsView>('/v1/academics/assignments');
      expect(as.data.teachers.map((t) => t.name)).toEqual(['Mrs. Ngozi Okafor']);

      // Becoming non-teaching takes them out of Academics.
      await api.put(
        `/v1/staff/${added.id}`,
        teacher({ kind: 'Non-teaching', position: 'Secretary' }),
      );
      const after = await api.get<AssignmentsView>('/v1/academics/assignments');
      expect(after.data.teachers).toEqual([]);
    },
  );
});
