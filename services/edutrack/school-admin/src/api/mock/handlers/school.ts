import { mock, MockHttpError } from '@edutrack/web-core/mock';

import { isNigerianState } from '@edutrack/app-kit/lib/nigeria-locations';

import type { BranchPayload, SchoolProfilePayload } from '@/types';

import { academicsData, armStudents } from '../academics-db';
import { setupConfirmed } from '../db';
import { schoolData, type BranchRow, type SchoolData } from '../school-db';
import { EMAIL, historyOf, isPhone, requireText, schoolDataFor } from './shared';

/* ---------------- School profile ---------------- */

mock.get('/v1/school/profile', (req) => {
  const { data } = schoolDataFor(req);
  return { ...data.profile, history: historyOf(data, 'School') };
});

const PROFILE_FIELDS: (keyof SchoolProfilePayload)[] = [
  'name',
  'motto',
  'founded',
  'logo',
  'email',
  'phone',
  'website',
  'street',
  'city',
  'lga',
  'state',
  'approvingBody',
  'approvalNumber',
  'cacNumber',
  'certificate',
];
const FIELD_LABELS: Record<string, string> = {
  name: 'display name',
  motto: 'motto',
  founded: 'year founded',
  logo: 'logo',
  email: 'email',
  phone: 'phone',
  website: 'website',
  street: 'address',
  city: 'town',
  lga: 'LGA',
  state: 'state',
  approvingBody: 'approving body',
  approvalNumber: 'approval number',
  cacNumber: 'CAC number',
  certificate: 'certificate',
};

mock.put('/v1/school/profile', (req) => {
  const { data, log, schoolId } = schoolDataFor(req);
  const p = req.body as SchoolProfilePayload;
  const name = requireText(p.name, 'Enter the name parents and staff will see.');
  if (name.length < 3) throw new MockHttpError(422, 'The name must be at least 3 characters.');
  if (!EMAIL.test(p.email ?? '')) throw new MockHttpError(422, 'Enter a valid school email.');
  if (!isPhone(p.phone ?? '')) throw new MockHttpError(422, 'Enter a Nigerian phone number.');
  if (!isNigerianState(p.state ?? '')) throw new MockHttpError(422, 'Choose a Nigerian state.');
  requireText(p.approvalNumber, 'Enter the approval number.');
  const changed = PROFILE_FIELDS.filter(
    (k) => JSON.stringify(p[k] ?? null) !== JSON.stringify(data.profile[k] ?? null),
  );
  Object.assign(data.profile, Object.fromEntries(PROFILE_FIELDS.map((k) => [k, p[k]])), {
    name,
    updatedAt: 'Today',
  });
  // Saving the profile is what completes the Setup Center's School Profile step.
  setupConfirmed[schoolId]!['school-profile'] = true;
  if (changed.length)
    log(
      'School',
      'Updated school details',
      changed
        .slice(0, 4)
        .map((k) => FIELD_LABELS[k])
        .join(', ') + (changed.length > 4 ? ` +${changed.length - 4} more` : ''),
    );
  return { ...data.profile, history: historyOf(data, 'School') };
});

/* ---------------- Staff directory (pickers) ---------------- */

mock.get('/v1/staff/options', (req) => {
  const { data } = schoolDataFor(req);
  return data.staff
    .filter((s) => !s.left)
    .map((s) => {
      const user = data.users.find((u) => u.staffId === s.id);
      return {
        id: s.id,
        name: s.name,
        position: s.position,
        account: user && user.status !== 'Revoked' ? user.status : 'No account',
        hasSchoolWideAccess:
          !!user && (user.scope === 'School' || user.roles.includes('School Admin')),
        roles: user?.roles ?? [],
      };
    });
});

/* ---------------- Branches ---------------- */

const staffName = (data: SchoolData, id: string | null) =>
  (id && data.staff.find((s) => s.id === id)?.name) || null;

const codePrefix = (data: SchoolData) =>
  `${data.profile.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)}-`;

/** The branch's class levels from Academics → Classes & Arms. */
function branchLevels(data: SchoolData, b: BranchRow) {
  const schoolId = Object.keys(schoolData).find((k) => schoolData[k] === data)!;
  return academicsData[schoolId]!.levels.filter((l) => l.branchId === b.id).map((l) => ({
    level: l,
    schoolId,
  }));
}

const toBranch = (data: SchoolData, b: BranchRow) => {
  const { original, ...rest } = b;
  const classArms = branchLevels(data, b).reduce((n, { level }) => n + level.arms.length, 0);
  return {
    ...rest,
    classArms,
    headName: staffName(data, b.headId),
    canDelete: !original && !b.students && !b.staff && !classArms && data.branches.length > 1,
  };
};

const findBranch = (data: SchoolData, id: string) => {
  const b = data.branches.find((x) => x.id === id);
  if (!b) throw new MockHttpError(404, 'This branch doesn’t exist');
  return b;
};

/** Users whose access is limited to this one branch. */
const scopedOnly = (data: SchoolData, b: BranchRow) =>
  data.users.filter(
    (u) =>
      u.scope === 'Branch' &&
      u.branches.length === 1 &&
      u.branches[0] === b.name &&
      ['Active', 'Invited'].includes(u.status),
  );

mock.get('/v1/branches', (req) => {
  const { data } = schoolDataFor(req);
  return {
    branches: data.branches.map((b) => toBranch(data, b)),
    planName: data.profile.plan.name,
    branchLimit: data.profile.plan.branchLimit,
    offering: data.profile.sections,
    codePrefix: codePrefix(data),
  };
});

const FINANCE: Record<
  string,
  { billed: string; collected: string; outstanding: string; expenses: string }
> = {
  mc: { billed: '₦142.6M', collected: '₦96.4M', outstanding: '₦46.2M', expenses: '₦21.8M' },
  lk: { billed: '₦62.1M', collected: '₦44.1M', outstanding: '₦18.0M', expenses: '₦9.4M' },
};

mock.get('/v1/branches/:id', (req) => {
  const { data } = schoolDataFor(req);
  const b = findBranch(data, req.params.id!);
  return {
    ...toBranch(data, b),
    scopedUsers: scopedOnly(data, b).map((u) => ({ name: u.name, roles: u.roles })),
    classes: branchLevels(data, b).map(({ level, schoolId }) => ({
      section: level.section,
      level: level.name,
      arms: level.arms.map((a) => a.arm).join(', '),
      students: level.arms.reduce((n, a) => n + armStudents(schoolId, level, a).count, 0),
    })),
    staffList: b.staff
      ? data.staff
          .filter((s) => !s.left && (s.branch.includes(b.name) || s.branch === 'All branches'))
          .map((s) => ({
            id: s.id,
            name: s.name,
            position: s.position,
            scope: s.branch,
            account: data.users.find((u) => u.staffId === s.id)?.status ?? 'No account',
          }))
      : [],
    finance: FINANCE[b.id] ?? null,
    history: historyOf(data, `Branch:${b.id}`),
  };
});

const CODE = /^[A-Z0-9]{2,5}-[A-Z0-9]{2,4}$/;

function validateBranch(data: SchoolData, p: BranchPayload, current?: BranchRow) {
  const name = requireText(p.name, 'Enter a branch name.');
  if (name.length < 3) throw new MockHttpError(422, 'Use at least 3 characters for the name.');
  if (data.branches.some((x) => x !== current && x.name.toLowerCase() === name.toLowerCase()))
    throw new MockHttpError(422, 'A branch with this name already exists.');
  if (!CODE.test(p.code ?? ''))
    throw new MockHttpError(422, `Use a short code like ${codePrefix(data)}IK.`);
  const sameCode = data.branches.find((x) => x !== current && x.code === p.code);
  if (sameCode) throw new MockHttpError(422, `This code is already used by ${sameCode.name}.`);
  requireText(p.street, 'Enter the street address.');
  requireText(p.city, 'Enter the town or city.');
  if (p.phone && !isPhone(p.phone)) throw new MockHttpError(422, 'Enter a Nigerian phone number.');
  if (p.email && !EMAIL.test(p.email)) throw new MockHttpError(422, 'Enter a valid email.');
  if (!p.sections?.length) throw new MockHttpError(422, 'Choose at least one section.');
  if (p.sections.some((s) => !data.profile.sections.includes(s)))
    throw new MockHttpError(422, 'Only sections your school offers can be chosen.');
  if (current) {
    const withClasses = new Set(branchLevels(data, current).map(({ level }) => level.section));
    const lost = current.sections.filter((s) => !p.sections.includes(s) && withClasses.has(s));
    if (lost.length)
      throw new MockHttpError(
        409,
        `${lost.join(', ')} has classes at ${current.name}. Remove those class levels in Classes & Arms before removing the section.`,
      );
  }
  if (p.headId && !data.staff.some((s) => s.id === p.headId && !s.left))
    throw new MockHttpError(422, 'Choose a current member of staff as head of campus.');
  return name;
}

/** Gives the new head Branch Admin access for the branch when asked and they lack it. */
function grantHeadAccess(
  data: SchoolData,
  p: BranchPayload,
  branchName: string,
  log: (e: string, t: string, d?: string) => void,
) {
  if (!p.grantBranchAdmin || !p.headId) return;
  const user = data.users.find((u) => u.staffId === p.headId);
  if (
    !user ||
    user.scope === 'School' ||
    user.roles.includes('School Admin') ||
    user.roles.includes('Branch Admin')
  )
    return;
  user.roles.push('Branch Admin');
  if (!user.branches.includes(branchName)) user.branches.push(branchName);
  log(`User:${user.id}`, 'Access changed', `+Branch Admin · ${branchName}`);
}

mock.post('/v1/branches', (req) => {
  const { data, log } = schoolDataFor(req);
  if (data.branches.length >= data.profile.plan.branchLimit)
    throw new MockHttpError(
      409,
      `Your ${data.profile.plan.name} plan allows ${data.profile.plan.branchLimit} branches, including inactive ones.`,
    );
  const p = req.body as BranchPayload;
  const name = validateBranch(data, p);
  const row: BranchRow = {
    id: `b${Date.now().toString(36)}`,
    name,
    code: p.code,
    street: p.street.trim(),
    city: p.city.trim(),
    lga: p.lga ?? '',
    state: p.state,
    phone: p.phone ?? '',
    email: p.email ?? '',
    headId: p.headId || null,
    sections: p.sections,
    hasStore: !!p.hasStore,
    status: 'Active',
    students: 0,
    staff: 0,
    classArms: 0,
    original: false,
  };
  data.branches.push(row);
  log(
    `Branch:${row.id}`,
    'Created branch',
    `${row.code} · ${row.sections.join(', ')}${row.hasStore ? ' · store created' : ''}`,
  );
  grantHeadAccess(data, p, name, log);
  return toBranch(data, row);
});

mock.patch('/v1/branches/:id', (req) => {
  const { data, log } = schoolDataFor(req);
  const b = findBranch(data, req.params.id!);
  const p = req.body as BranchPayload;
  const name = validateBranch(data, p, b);
  const before = { ...b };
  Object.assign(b, {
    name,
    code: p.code,
    street: p.street.trim(),
    city: p.city.trim(),
    lga: p.lga ?? '',
    state: p.state,
    phone: p.phone ?? '',
    email: p.email ?? '',
    headId: p.headId || null,
    sections: p.sections,
    hasStore: !!p.hasStore,
  });
  if (before.name !== name)
    for (const u of data.users) u.branches = u.branches.map((x) => (x === before.name ? name : x));
  const changed = (
    [
      'name',
      'code',
      'street',
      'city',
      'lga',
      'state',
      'phone',
      'email',
      'headId',
      'sections',
      'hasStore',
    ] as const
  ).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(b[k]));
  log(`Branch:${b.id}`, 'Updated branch details', changed.join(', ') || 'no changes');
  grantHeadAccess(data, p, name, log);
  return toBranch(data, b);
});

mock.post('/v1/branches/:id/deactivate', (req) => {
  const { data, log } = schoolDataFor(req);
  const b = findBranch(data, req.params.id!);
  if (b.status !== 'Active') throw new MockHttpError(409, `${b.name} is already inactive.`);
  if (data.branches.filter((x) => x.status === 'Active').length === 1)
    throw new MockHttpError(
      409,
      'A school needs at least one active branch. Add or reactivate another branch first.',
    );
  if (b.students)
    throw new MockHttpError(
      409,
      `${b.students} students are enrolled at ${b.name}. Transfer them or end their enrollments first.`,
    );
  const reason = requireText(
    (req.body as { reason?: string })?.reason,
    'Give a reason for deactivating.',
  );
  b.status = 'Inactive';
  log(`Branch:${b.id}`, 'Deactivated branch', reason);
  return toBranch(data, b);
});

mock.post('/v1/branches/:id/reactivate', (req) => {
  const { data, log } = schoolDataFor(req);
  const b = findBranch(data, req.params.id!);
  b.status = 'Active';
  log(`Branch:${b.id}`, 'Reactivated branch');
  return toBranch(data, b);
});

mock.delete('/v1/branches/:id', (req) => {
  const { data, log } = schoolDataFor(req);
  const b = findBranch(data, req.params.id!);
  if (!toBranch(data, b).canDelete)
    throw new MockHttpError(
      409,
      'Branches with records, or created when your school was set up, can’t be deleted. Deactivate it instead.',
    );
  data.branches = data.branches.filter((x) => x !== b);
  log('School', `Deleted branch ${b.name}`, b.code);
  return { ok: true };
});
