import { mock, MockHttpError, type MockRequest } from '@edutrack/web-core/mock';

import type {
  StaffAccount,
  StaffDetail,
  StaffFormOptions,
  StaffImportBatch,
  StaffImportRow,
  StaffList,
  StaffListRow,
  StaffPayload,
  TeacherRow,
} from '@/types';

import { academicsData, armLabel, branchLabel } from '../academics-db';
import { groupOf, staffRecord, type SchoolData, type StaffRow, type UserRow } from '../school-db';
import {
  allArms,
  currentTerm,
  findArm,
  subjectName,
  subjectPeriods,
  teacherLoad,
} from './academics-shared';
import { EMAIL, historyOf, isPhone, requireText, schoolDataFor } from './shared';

export const POSITIONS = [
  'Principal',
  'Vice Principal (Academics)',
  'Vice Principal (Administration)',
  'Head of Department',
  'Teacher',
  'Nursery Coordinator',
  'Head of Campus',
  'Bursar',
  'Accountant',
  'Secretary',
  'Admissions Officer',
  'ICT Officer',
  'Librarian',
  'Lab Attendant',
  'Store Keeper',
  'Nurse',
  'Security',
  'Driver',
  'Cleaner',
  'Other',
];

const DEPARTMENTS = [
  'Academics',
  'Sciences',
  'Languages',
  'Arts & Humanities',
  'Early Years',
  'Administration',
  'Finance',
  'ICT',
  'Operations',
];

/** The system role a new hire in this position usually gets. */
const ROLE_FOR: Record<string, string> = {
  Principal: 'Principal',
  'Vice Principal (Academics)': 'Academic Head',
  'Head of Department': 'HOD',
  'Nursery Coordinator': 'Academic Head',
  Teacher: 'Teacher',
  'Head of Campus': 'Branch Admin',
  Bursar: 'Bursar',
  Accountant: 'Accountant',
  'Store Keeper': 'Inventory Officer',
  'ICT Officer': 'School Admin',
};

const defaultRole = (position: string, kind: string) =>
  ROLE_FOR[position] ?? (kind === 'Teaching' ? 'Teacher' : null);

const fail = (msg: string, status = 422): never => {
  throw new MockHttpError(status, msg);
};

function ctxFor(req: Pick<MockRequest, 'headers'>) {
  const ctx = schoolDataFor(req);
  return { ...ctx, acad: academicsData[ctx.schoolId]! };
}

const userOf = (data: SchoolData, id: string) =>
  data.users.find((u) => u.staffId === id && u.status !== 'Revoked') ?? null;

const accountOf = (data: SchoolData, id: string): StaffAccount => {
  const u = userOf(data, id);
  return u ? (u.status as StaffAccount) : 'No account';
};

function loadOf(ctx: ReturnType<typeof ctxFor>, s: StaffRow) {
  if (s.kind !== 'Teaching') return null;
  const mine = ctx.acad.assignments.filter((a) => a.teacherId === s.id);
  return {
    periods: teacherLoad(ctx.acad, s.id),
    max: s.maxPeriods,
    subjects: mine.length,
    classes: new Set(mine.map((a) => a.armId)).size,
  };
}

const classTeacherOf = (ctx: ReturnType<typeof ctxFor>, id: string) =>
  allArms(ctx.acad)
    .filter(({ arm }) => arm.classTeacherId === id)
    .map(({ level, arm }) => ({ id: arm.id, name: armLabel(level.name, arm.arm) }));

function toRow(ctx: ReturnType<typeof ctxFor>, s: StaffRow): StaffListRow {
  return {
    id: s.id,
    name: s.name,
    staffNumber: s.staffNumber,
    position: s.position,
    department: s.department,
    group: s.group,
    kind: s.kind,
    branch: s.branch,
    branchIds: s.branchIds,
    employment: s.employment,
    email: s.email,
    phone: s.phone,
    account: accountOf(ctx.data, s.id),
    status: s.left ? 'Deactivated' : 'Active',
    leftOn: s.leftOn ?? null,
    load: loadOf(ctx, s),
    classTeacherOf: classTeacherOf(ctx, s.id).map((a) => a.name),
    isYou: s.id === ctx.data.adminStaffId,
  };
}

const findStaff = (data: SchoolData, id: string) =>
  data.staff.find((s) => s.id === id) ?? fail('This staff member doesn’t exist', 404);

/* ---------------- Directory ---------------- */

mock.get('/v1/staff', (req): StaffList => {
  const ctx = ctxFor(req);
  const { data } = ctx;
  const q = req.query;
  const rows = data.staff.map((s) => toRow(ctx, s));
  const current = rows.filter((r) => r.status === 'Active');
  const search = (q.search ?? '').trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (q.status ? r.status === q.status : true) &&
      (!q.group || q.group === 'All'
        ? true
        : q.group === 'No access'
          ? r.account === 'No account'
          : r.group === q.group) &&
      (!q.branch ||
        q.branch === 'All branches' ||
        r.branch === 'All branches' ||
        r.branch.includes(q.branch)) &&
      (!q.account || r.account === q.account) &&
      (!search ||
        `${r.name} ${r.staffNumber} ${r.position} ${r.email} ${r.phone} ${r.department}`
          .toLowerCase()
          .includes(search)),
  );
  const teachers = current.filter((r) => r.kind === 'Teaching');
  const active = data.branches.filter((b) => b.status === 'Active');
  return {
    rows: filtered.sort((a, b) =>
      a.status === b.status
        ? a.name.replace(/^\S+\s/, '').localeCompare(b.name.replace(/^\S+\s/, ''))
        : a.status === 'Active'
          ? -1
          : 1,
    ),
    counts: {
      All: current.length,
      Teaching: teachers.length,
      Administrative: current.filter((r) => r.group === 'Administrative').length,
      Finance: current.filter((r) => r.group === 'Finance').length,
      Operations: current.filter((r) => r.group === 'Operations').length,
      'No access': current.filter((r) => r.account === 'No account').length,
    },
    total: current.length,
    withAccounts: current.filter((r) => ['Active', 'Invited', 'Suspended'].includes(r.account))
      .length,
    pendingInvites: current.filter((r) => r.account === 'Invited').length,
    deactivated: rows.length - current.length,
    unassignedTeachers: teachers
      .filter((r) => !r.load?.subjects && !r.classTeacherOf.length)
      .map((r) => ({ id: r.id, name: r.name })),
    branchesWithoutTeachers: active
      .filter((b) => !teachers.some((t) => t.branchIds.includes(b.id)))
      .map((b) => b.name),
  };
});

mock.get('/v1/staff/form-options', (req): StaffFormOptions => {
  const { data, acad } = ctxFor(req);
  return {
    branches: data.branches
      .filter((b) => b.status === 'Active')
      .map((b) => ({ id: b.id, name: b.name })),
    positions: POSITIONS,
    departments: DEPARTMENTS,
    roles: data.roles
      .filter((r) => r.name !== 'Owner')
      .map((r) => ({ name: r.name, description: r.description })),
    subjects: acad.subjects
      .filter((s) => s.status === 'Active')
      .map((s) => ({ code: s.code, name: s.name })),
    roleForPosition: ROLE_FOR,
  };
});

mock.get('/v1/staff/teachers', (req): TeacherRow[] => {
  const ctx = ctxFor(req);
  return ctx.data.staff
    .filter((s) => s.kind === 'Teaching' && !s.left)
    .map((s) => {
      const mine = ctx.acad.assignments.filter((a) => a.teacherId === s.id);
      const bySubject = new Map<string, string[]>();
      for (const a of mine) {
        const { level, arm } = findArm(ctx.acad, a.armId);
        bySubject.set(a.subject, [
          ...(bySubject.get(a.subject) ?? []),
          armLabel(level.name, arm.arm),
        ]);
      }
      return {
        id: s.id,
        name: s.name,
        staffNumber: s.staffNumber,
        branch: s.branch,
        employment: s.employment,
        qualified: s.qualified,
        periods: teacherLoad(ctx.acad, s.id),
        max: s.maxPeriods,
        subjects: [...bySubject.entries()].map(([code, arms]) => ({
          code,
          name: subjectName(ctx.acad, code),
          arms,
        })),
        classTeacherOf: classTeacherOf(ctx, s.id).map((a) => a.name),
        account: accountOf(ctx.data, s.id),
      };
    })
    .sort((a, b) => b.periods - a.periods);
});

mock.get('/v1/staff/:id', (req): StaffDetail => {
  const ctx = ctxFor(req);
  const s = findStaff(ctx.data, req.params.id!);
  const u = userOf(ctx.data, s.id);
  const term = currentTerm(ctx.acad);
  return {
    ...toRow(ctx, s),
    title: s.title,
    firstName: s.firstName,
    lastName: s.lastName,
    gender: s.gender,
    address: s.address,
    emergencyContact: s.emergencyContact,
    since: s.since,
    qualified: s.qualified,
    qualifiedNames: s.qualified.map((c) => subjectName(ctx.acad, c)),
    maxPeriods: s.maxPeriods,
    documents: s.documents,
    user: u
      ? {
          id: u.id,
          email: u.email,
          status: u.status as StaffAccount,
          roles: u.roles,
          scope: u.scope === 'School' ? 'Whole school' : u.branches.join(', '),
          lastActive: u.lastActive,
          invited: u.invited,
        }
      : null,
    teaching:
      s.kind === 'Teaching'
        ? {
            term: term?.name ?? '',
            assignments: ctx.acad.assignments
              .filter((a) => a.teacherId === s.id)
              .map((a) => {
                const { level, arm } = findArm(ctx.acad, a.armId);
                return {
                  id: a.id,
                  subject: a.subject,
                  subjectName: subjectName(ctx.acad, a.subject),
                  armId: a.armId,
                  arm: armLabel(level.name, arm.arm),
                  branch: ctx.data.branches.find((b) => b.id === level.branchId)?.name ?? '',
                  type: a.type,
                  periods: subjectPeriods(ctx.acad, a.subject),
                };
              }),
            classTeacherOf: classTeacherOf(ctx, s.id),
          }
        : null,
    history: [
      ...historyOf(ctx.data, `Staff:${s.id}`),
      ...(s.since
        ? [{ id: 'joined', title: `Joined as ${s.position}`, detail: s.staffNumber, when: s.since }]
        : []),
    ],
  };
});

/* ---------------- Add & edit ---------------- */

function validate(data: SchoolData, p: StaffPayload, current?: StaffRow) {
  const first = requireText(p.firstName, 'Enter a first name.');
  const last = requireText(p.lastName, 'Enter a last name.');
  const phone = (p.phone ?? '').replace(/[\s-]/g, '');
  if (phone && !isPhone(phone)) fail('Use a Nigerian mobile number, e.g. 0803 555 0161.');
  const others = data.staff.filter((s) => s !== current && !s.left);
  const samePhone =
    phone &&
    others.find(
      (s) => s.phone.replace(/[\s-]/g, '').replace(/^\+234/, '0') === phone.replace(/^\+234/, '0'),
    );
  if (samePhone) fail(`This phone number is already used by ${samePhone.name}.`);
  const email = (p.email ?? '').trim().toLowerCase();
  if (p.access && !email) fail('An email is needed to send the invitation.');
  if (email && !EMAIL.test(email)) fail('Enter a valid email, e.g. name@school.ng.');
  const sameEmail = email && others.find((s) => s.email.toLowerCase() === email);
  if (sameEmail) fail(`This email is already used by ${sameEmail.name}.`);
  if (!p.position) fail('Choose a position.');
  const active = data.branches.filter((b) => b.status === 'Active').map((b) => b.id);
  if (!p.branchIds?.length) fail('Choose at least one branch.');
  if (p.branchIds.some((id) => !active.includes(id))) fail('Choose active branches only.');
  if (p.since && !/^\d{4}-\d{2}-\d{2}$/.test(p.since)) fail('Enter the start date as a date.');
  if (p.since && p.since > new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10))
    fail('The start date is more than a year away. Check the date.');
  if (p.kind === 'Teaching' && !(p.maxPeriods >= 1 && p.maxPeriods <= 40))
    fail('Maximum periods per week is between 1 and 40.');
  if (p.access && !data.roles.some((r) => r.name === p.role && r.name !== 'Owner'))
    fail('Choose what they can do in Edutrack.');
  return { first, last, email, phone: p.phone.trim() };
}

const displayName = (title: string, first: string, last: string) =>
  [title, first, last].filter(Boolean).join(' ');

function inviteUser(data: SchoolData, s: StaffRow, role: string): UserRow {
  const user: UserRow = {
    id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    staffId: s.id,
    name: s.name,
    email: s.email,
    position: s.position,
    roles: [role],
    scope: s.branch === 'All branches' ? 'School' : 'Branch',
    branches: s.branch === 'All branches' ? [] : s.branch.split(' + '),
    status: 'Invited',
    lastActive: '—',
    created: 'Today',
    invited: 'Today',
  };
  data.users.push(user);
  return user;
}

/** Teaching changes ripple into Academics: clears assignments a teacher can no longer hold. */
function stripTeaching(ctx: ReturnType<typeof ctxFor>, s: StaffRow, keepBranches: string[] | null) {
  let removed = 0;
  ctx.acad.assignments = ctx.acad.assignments.filter((a) => {
    if (a.teacherId !== s.id) return true;
    const keep =
      keepBranches !== null && keepBranches.includes(findArm(ctx.acad, a.armId).level.branchId);
    if (!keep) removed++;
    return keep;
  });
  let classes = 0;
  for (const { level, arm } of allArms(ctx.acad))
    if (
      arm.classTeacherId === s.id &&
      (keepBranches === null || !keepBranches.includes(level.branchId))
    ) {
      arm.classTeacherId = null;
      classes++;
    }
  return { removed, classes };
}

mock.post('/v1/staff', (req) => {
  const ctx = ctxFor(req);
  const { data, log, schoolId } = ctx;
  const p = req.body as StaffPayload;
  const { first, last, email, phone } = validate(data, p);
  const prefix = data.staff[0]?.staffNumber.split('-ST-')[0] ?? 'ST';
  const next =
    Math.max(0, ...data.staff.map((s) => Number(s.staffNumber.split('-ST-')[1]) || 0)) + 1;
  const name = displayName(p.title, first, last);
  const s: StaffRow = staffRecord({
    id: `st${Date.now().toString(36)}`,
    name,
    position: p.position,
    staffNumber: `${prefix}-ST-${String(next).padStart(4, '0')}`,
    branch: branchLabel(schoolId, p.branchIds),
    branchIds: p.branchIds,
    branches: [],
    title: p.title,
    firstName: first,
    lastName: last,
    gender: p.gender,
    phone,
    email,
    address: (p.address ?? '').trim(),
    emergencyContact: (p.emergencyContact ?? '').trim(),
    kind: p.kind,
    group: groupOf(p.kind, p.position),
    department: p.department || (p.kind === 'Teaching' ? 'Academics' : groupOf(p.kind, p.position)),
    employment: p.employment,
    since: p.since,
    qualified: p.kind === 'Teaching' ? p.qualified : [],
    maxPeriods: p.kind === 'Teaching' ? p.maxPeriods : 0,
    documents: [],
  });
  data.staff.push(s);
  if (p.access) inviteUser(data, s, p.role);
  log(
    `Staff:${s.id}`,
    `Added as ${s.position}`,
    p.access ? `Invitation sent to ${email}` : 'No portal access',
  );
  log('Staff', `Added ${s.name}`, s.position);
  return toRow(ctx, s);
});

mock.put('/v1/staff/:id', (req) => {
  const ctx = ctxFor(req);
  const { data, log, schoolId } = ctx;
  const s = findStaff(data, req.params.id!);
  if (s.left) fail('Reactivate this staff member before editing.', 409);
  const p = req.body as StaffPayload;
  const { first, last, email, phone } = validate(data, p, s);
  const isYou = s.id === data.adminStaffId;
  if (isYou && !p.branchIds.length) fail('You must work at a branch.');
  const changes: string[] = [];
  // Becoming non-teaching, or leaving a branch, clears assignments there.
  const cleared =
    s.kind === 'Teaching' && p.kind === 'Non-teaching'
      ? stripTeaching(ctx, s, null)
      : s.kind === 'Teaching'
        ? stripTeaching(ctx, s, p.branchIds)
        : { removed: 0, classes: 0 };
  if (cleared.removed || cleared.classes)
    changes.push(
      `${cleared.removed} assignment${cleared.removed === 1 ? '' : 's'} and ${cleared.classes} class-teacher role${cleared.classes === 1 ? '' : 's'} cleared`,
    );
  if (s.position !== p.position) changes.push(`Position: ${s.position} → ${p.position}`);
  Object.assign(s, {
    title: p.title,
    firstName: first,
    lastName: last,
    name: displayName(p.title, first, last),
    gender: p.gender,
    phone,
    email,
    address: (p.address ?? '').trim(),
    emergencyContact: (p.emergencyContact ?? '').trim(),
    kind: p.kind,
    position: p.position,
    group: groupOf(p.kind, p.position),
    department: p.department || s.department,
    employment: p.employment,
    since: p.since || s.since,
    branchIds: p.branchIds,
    branch: branchLabel(schoolId, p.branchIds),
    qualified: p.kind === 'Teaching' ? p.qualified : [],
    maxPeriods: p.kind === 'Teaching' ? p.maxPeriods : 0,
  });
  const u = userOf(data, s.id);
  if (u) Object.assign(u, { name: s.name, position: s.position });
  if (u && u.status === 'Invited' && email && u.email !== email) {
    u.email = email;
    u.invited = 'Today';
    changes.push(`New invitation sent to ${email}`);
  }
  if (p.access && !u && !isYou) {
    inviteUser(data, s, p.role);
    changes.push(`Invitation sent to ${email}`);
  }
  if (!p.access && u?.status === 'Invited') {
    u.status = 'Revoked';
    changes.push('Invitation cancelled');
  }
  log(`Staff:${s.id}`, 'Details updated', changes.join(' · '));
  return { ...toRow(ctx, s), cleared };
});

/* ---------------- Deactivate & reactivate ---------------- */

mock.post('/v1/staff/:id/deactivate', (req) => {
  const ctx = ctxFor(req);
  const { data, log } = ctx;
  const s = findStaff(data, req.params.id!);
  if (s.left) fail('Already deactivated.', 409);
  if (s.id === data.adminStaffId) fail('You can’t deactivate yourself.', 409);
  const held = data.positions.filter((p) => p.holderIds.includes(s.id));
  const top = held.find((p) => !p.parentId && p.holderIds.length === 1);
  if (top)
    fail(`${s.name} is the only ${top.title}. Assign someone else in the Organogram first.`, 409);
  const head = data.branches.find((b) => b.headId === s.id);
  // Check before changing anything: a refused request leaves their classes as they were.
  const teaches = ctx.acad.assignments.some((a) => a.teacherId === s.id);
  if (teaches && !(req.body as { coverArranged?: boolean })?.coverArranged)
    fail('Confirm that you have arranged cover for their classes.');
  const cleared = stripTeaching(ctx, s, null);
  s.left = true;
  s.leftOn = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  held.forEach((p) => (p.holderIds = p.holderIds.filter((id) => id !== s.id)));
  if (head) head.headId = null;
  const u = userOf(data, s.id);
  if (u) u.status = u.status === 'Invited' ? 'Revoked' : 'Deactivated';
  log(
    `Staff:${s.id}`,
    'Deactivated',
    [
      cleared.removed && `${cleared.removed} assignments need a replacement`,
      cleared.classes && `${cleared.classes} class-teacher roles cleared`,
      u && 'sign-in removed',
      head && `no longer head of ${head.name}`,
    ]
      .filter(Boolean)
      .join(' · '),
  );
  return { ...toRow(ctx, s), cleared };
});

mock.post('/v1/staff/:id/reactivate', (req) => {
  const ctx = ctxFor(req);
  const s = findStaff(ctx.data, req.params.id!);
  if (!s.left) fail('This staff member is active.', 409);
  s.left = false;
  delete s.leftOn;
  ctx.log(`Staff:${s.id}`, 'Reactivated', 'Access must be granted again from Users & Roles');
  return toRow(ctx, s);
});

/* ---------------- Invitations & documents ---------------- */

mock.post('/v1/staff/invite', (req) => {
  const ctx = ctxFor(req);
  const { data, log } = ctx;
  const ids = (req.body as { ids: string[] }).ids ?? [];
  const invited: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const s = data.staff.find((x) => x.id === id);
    if (!s || s.left) continue;
    const u = userOf(data, s.id);
    if (u?.status === 'Invited') {
      u.invited = 'Today';
      invited.push(s.name);
    } else {
      const role = defaultRole(s.position, s.kind);
      // No email, already has an account, or no obvious role: invite them from their profile.
      if (u || !s.email || !role) skipped.push(s.name);
      else {
        inviteUser(data, s, role);
        invited.push(s.name);
      }
    }
  }
  if (invited.length)
    log(
      'Staff',
      `${invited.length} invitation${invited.length === 1 ? '' : 's'} sent`,
      invited.join(', '),
    );
  return { invited: invited.length, skipped };
});

mock.post('/v1/staff/:id/documents', (req) => {
  const ctx = ctxFor(req);
  const s = findStaff(ctx.data, req.params.id!);
  const p = req.body as { kind: string; name: string };
  const kind = requireText(p.kind, 'Choose the document type.');
  const name = requireText(p.name, 'Choose a file.');
  const existing = s.documents.find((d) => d.kind === kind);
  const doc = {
    id: existing?.id ?? `d${Date.now()}`,
    kind,
    name,
    uploaded: 'Today',
    status: 'Pending' as const,
  };
  s.documents = existing
    ? s.documents.map((d) => (d === existing ? doc : d))
    : [...s.documents, doc];
  ctx.log(`Staff:${s.id}`, `${kind} uploaded`, name);
  return s.documents;
});

mock.post('/v1/staff/:id/documents/:docId/verify', (req) => {
  const ctx = ctxFor(req);
  const s = findStaff(ctx.data, req.params.id!);
  const d = s.documents.find((x) => x.id === req.params.docId) ?? fail('Document not found', 404);
  if (d.status !== 'Pending') fail('Only a pending document can be verified.', 409);
  d.status = 'Verified';
  ctx.log(`Staff:${s.id}`, `${d.kind} verified`, d.name);
  return s.documents;
});

/* ---------------- Import ---------------- */

const batches = new Map<string, StaffImportBatch>();

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

mock.post('/v1/staff/import', (req) => {
  const { data } = ctxFor(req);
  const p = req.body as { fileName: string; text: string };
  const rows = parseCsv(p.text ?? '');
  if (rows.length < 2) fail('The file has no staff rows. Use the template’s columns.');
  const head = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (r: string[], k: string) => (r[head.indexOf(k)] ?? '').trim();
  const need = ['first_name', 'last_name', 'type', 'position', 'branch'];
  const missing = need.filter((k) => !head.includes(k));
  if (missing.length) fail(`Missing columns: ${missing.join(', ')}. Download the template.`);
  const seenEmail = new Set<string>();
  const out: StaffImportRow[] = rows.slice(1).map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const first = col(r, 'first_name');
    const last = col(r, 'last_name');
    const email = col(r, 'email').toLowerCase();
    const phone = col(r, 'phone');
    const type = col(r, 'type');
    const kind = /^teaching$/i.test(type)
      ? 'Teaching'
      : /^non-?teaching$/i.test(type)
        ? 'Non-teaching'
        : '';
    const position = col(r, 'position');
    const branch = col(r, 'branch');
    const access = /^(yes|y|true|1)$/i.test(col(r, 'portal_access'));
    const role = col(r, 'role');
    if (!first || !last) errors.push('first and last name are required');
    if (!kind) errors.push('type must be Teaching or Non-teaching');
    if (!position) errors.push('position is required');
    if (
      !data.branches.some(
        (b) => b.status === 'Active' && b.name.toLowerCase() === branch.toLowerCase(),
      )
    )
      errors.push(`unknown branch “${branch}”`);
    if (email && !EMAIL.test(email)) errors.push('email is not valid');
    if (email && (seenEmail.has(email) || data.staff.some((s) => s.email.toLowerCase() === email)))
      errors.push('email already used');
    if (email) seenEmail.add(email);
    if (phone && !isPhone(phone)) errors.push('phone is not a Nigerian mobile number');
    if (access && !email) errors.push('portal access needs an email');
    if (access && role && !data.roles.some((x) => x.name.toLowerCase() === role.toLowerCase()))
      errors.push(`unknown role “${role}”`);
    if (access && !role && !defaultRole(position, kind))
      errors.push('portal access needs a role for this position');
    if (!access) warnings.push('no portal access');
    if (position && !POSITIONS.includes(position))
      warnings.push('position not in the standard list');
    return {
      line: i + 2,
      name: `${first} ${last}`.trim(),
      email,
      phone,
      kind,
      position,
      branch,
      access,
      role,
      errors,
      warnings,
    };
  });
  const batch = { id: `imp${Date.now()}`, fileName: p.fileName, rows: out };
  batches.set(batch.id, batch);
  return batch;
});

mock.post('/v1/staff/import/:id/commit', (req) => {
  const ctx = ctxFor(req);
  const { data, log, schoolId } = ctx;
  const batch =
    batches.get(req.params.id!) ?? fail('This import has expired. Upload the file again.', 404);
  const ok = batch.rows.filter((r) => !r.errors.length);
  if (!ok.length) fail('Every row has an error. Fix the file and upload it again.');
  const prefix = data.staff[0]?.staffNumber.split('-ST-')[0] ?? 'ST';
  let next = Math.max(0, ...data.staff.map((s) => Number(s.staffNumber.split('-ST-')[1]) || 0));
  let invites = 0;
  for (const r of ok) {
    const branch = data.branches.find((b) => b.name.toLowerCase() === r.branch.toLowerCase())!;
    const [firstName = '', ...rest] = r.name.split(' ');
    const s = staffRecord({
      id: `st${Date.now().toString(36)}${next}`,
      name: r.name,
      position: r.position,
      staffNumber: `${prefix}-ST-${String(++next).padStart(4, '0')}`,
      branch: branchLabel(schoolId, [branch.id]),
      branchIds: [branch.id],
      branches: [],
      firstName,
      lastName: rest.join(' '),
      email: r.email,
      phone: r.phone,
      kind: r.kind as StaffRow['kind'],
      group: groupOf(r.kind as StaffRow['kind'], r.position),
      since: new Date().toISOString().slice(0, 10),
    });
    data.staff.push(s);
    if (r.access) {
      const role =
        data.roles.find((x) => x.name.toLowerCase() === r.role.toLowerCase())?.name ??
        defaultRole(r.position, s.kind)!;
      inviteUser(data, s, role);
      invites++;
    }
  }
  batches.delete(batch.id);
  log('Staff', `Imported ${ok.length} staff from ${batch.fileName}`, `${invites} invitations sent`);
  return { imported: ok.length, invites, skipped: batch.rows.length - ok.length };
});
