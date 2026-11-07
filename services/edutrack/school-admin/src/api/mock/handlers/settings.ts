import { mock, MockHttpError, type MockRequest } from '@edutrack/web-core/mock';

import { meetsPasswordPolicy } from '@edutrack/app-kit/lib/password';
import type {
  AcademicPolicy,
  AcademicSettings,
  ChangePasswordPayload,
  FinanceToggles,
  ModuleRow,
  NumberingFormat,
  NumberingKind,
  NumberingPayload,
  SchoolSettings,
  SecurityView,
  SettingsArea,
  SignInRules,
  SubscriptionView,
} from '@/types';

import { academicsData } from '../academics-db';
import { smsCreditOf } from '../comms-db';
import { passwords } from '../db';
import { addDays, daysBetween, isoToday } from '../finance-ledger';
import { schoolData } from '../school-db';
import { formatNumber, patternProblem, recordChange, settingsFor } from '../settings-db';
import { studentsData } from '../students-db';
import { currentSession } from './academics-shared';
import { financeSnapshot } from './finance-shared';
import { setupView } from './setup';
import { currentUser } from './shared';

const fail = (message: string, status = 422): never => {
  throw new MockHttpError(status, message);
};

function ctxFor(req: Pick<MockRequest, 'headers'>) {
  const user = currentUser(req);
  const schoolId = user.schoolId;
  const actor = `${user.firstName} ${user.lastName}`;
  const log = (area: SettingsArea, setting: string, from: string, to: string) =>
    recordChange(schoolId, { area, setting, from, to, by: actor });
  return { user, schoolId, actor, settings: settingsFor(schoolId), log };
}

const onOff = (v: boolean) => (v ? 'On' : 'Off');

/* ---------------- School ---------------- */

const NUMBERING_LABEL: Record<NumberingKind, string> = {
  admission: 'Admission number',
  staff: 'Staff ID',
};

/** Running numbers already used, so a new format can't hand out a number that exists. */
function existingNumbers(schoolId: string, kind: NumberingKind): string[] {
  if (kind === 'admission') return studentsData[schoolId]?.students.map((s) => s.admissionNo) ?? [];
  return schoolData[schoolId]?.staff.map((s) => s.staffNumber) ?? [];
}

function nextSeq(schoolId: string, kind: NumberingKind): number {
  if (kind === 'admission') return studentsData[schoolId]?.nextAdmission ?? 1;
  const nums = existingNumbers(schoolId, 'staff').map((n) => Number(/(\d+)$/.exec(n)?.[1] ?? 0));
  return Math.max(0, ...nums) + 1;
}

function schoolSettings(req: MockRequest): SchoolSettings {
  const { schoolId, settings } = ctxFor(req);
  const setup = setupView(req);
  const fin = financeSnapshot(schoolId).fin;
  const numbering: NumberingFormat[] = (['admission', 'staff'] as const).map((kind) => ({
    kind,
    label: NUMBERING_LABEL[kind],
    pattern: settings.numbering[kind],
    next: formatNumber(settings.numbering[kind], nextSeq(schoolId, kind)),
    nextSeq: nextSeq(schoolId, kind),
  }));
  return {
    localisation: {
      country: 'Nigeria',
      currency: 'Nigerian Naira (₦, NGN)',
      timezone: 'Africa/Lagos (WAT, UTC+1)',
      dateFormat: 'DD/MM/YYYY',
      addressFormat: 'Street → City → LGA → State',
    },
    numbering,
    invoicePrefix: fin.settings.invoicePrefix,
    receiptPrefix: fin.settings.receiptPrefix,
    setup: {
      finished: setup.finished,
      done: setup.steps.filter((s) => s.done).length,
      total: setup.steps.length,
    },
  };
}

mock.get('/v1/settings/school', (req) => schoolSettings(req));

mock.put('/v1/settings/numbering', (req) => {
  const { schoolId, settings, log } = ctxFor(req);
  const p = (req.body ?? {}) as Partial<NumberingPayload>;
  const next: Record<NumberingKind, string> = { ...settings.numbering };
  for (const kind of ['admission', 'staff'] as const) {
    const raw = p[kind];
    if (raw === undefined) continue;
    const pattern = String(raw).trim().toUpperCase();
    const problem = patternProblem(pattern);
    if (problem) fail(`${NUMBERING_LABEL[kind]}: ${problem}`);
    const upcoming = formatNumber(pattern, nextSeq(schoolId, kind));
    if (existingNumbers(schoolId, kind).includes(upcoming))
      fail(
        `${NUMBERING_LABEL[kind]}: ${upcoming} is already in use, so this format would repeat numbers. Add a prefix or a year to make it unique.`,
        409,
      );
    next[kind] = pattern;
  }
  if (next.admission.replace(/\[[^\]]*\]/g, '') === next.staff.replace(/\[[^\]]*\]/g, ''))
    fail('Admission numbers and staff IDs need different prefixes so they can’t be confused.');
  for (const kind of ['admission', 'staff'] as const) {
    log('School', `${NUMBERING_LABEL[kind]} format`, settings.numbering[kind], next[kind]);
  }
  settings.numbering = next;
  return schoolSettings(req);
});

/* ---------------- Academic ---------------- */

const ACADEMIC_LABEL: Record<keyof AcademicPolicy, string> = {
  showPosition: 'Show class position on report cards',
  reweightExempt: 'Re-weight exempt components',
  promotionSuggestions: 'Suggest promotion decisions',
  blockPromotionOnFees: 'Block promotion when fees are outstanding',
};

function academicSettings(schoolId: string): AcademicSettings {
  const acad = academicsData[schoolId]!;
  const policy = settingsFor(schoolId).policy;
  const session = currentSession(acad);
  const schemes = Object.entries(acad.assessment.schemes)
    .filter(([key, s]) => s && (acad.assessment.same ? key === '*' : key !== '*'))
    .map(([key, s]) => ({
      section: key === '*' ? 'All sections' : key,
      summary:
        s!.mode === 'descriptive'
          ? `Descriptive · ${s!.ratings.map((r) => r.name).join(', ') || 'no ratings yet'}`
          : s!.components.map((c) => `${c.name} ${c.weight}%`).join(' · ') || 'No components yet',
    }));
  return {
    showPosition: acad.assessment.showPosition,
    ...policy,
    termsPerSession: session ? session.terms.length : null,
    session: session?.name ?? null,
    passMark: acad.assessment.passMark,
    schemes,
    promotionRule: acad.promotion?.rule ?? null,
  };
}

mock.get('/v1/settings/academic', (req) => academicSettings(currentUser(req).schoolId));

mock.put('/v1/settings/academic', (req) => {
  const { schoolId, settings, log } = ctxFor(req);
  const acad = academicsData[schoolId]!;
  const p = (req.body ?? {}) as Partial<AcademicPolicy>;
  for (const key of Object.keys(ACADEMIC_LABEL) as (keyof AcademicPolicy)[]) {
    const v = p[key];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') fail(`${ACADEMIC_LABEL[key]} must be on or off.`);
    const before = key === 'showPosition' ? acad.assessment.showPosition : settings.policy[key];
    if (key === 'showPosition') acad.assessment.showPosition = v;
    else settings.policy[key] = v;
    log('Academic', ACADEMIC_LABEL[key], onOff(before), onOff(v));
  }
  return academicSettings(schoolId);
});

/* ---------------- Finance ---------------- */

const FINANCE_LABEL: Record<keyof FinanceToggles, string> = {
  verifyTransfers: 'Verify bank transfers before confirming',
  allowPartial: 'Allow part payments',
  autoSibling: 'Apply the sibling discount automatically',
};

const financeToggles = (schoolId: string): FinanceToggles => {
  const s = financeSnapshot(schoolId).fin.settings;
  return {
    allowPartial: s.allowPartial,
    autoSibling: s.autoSibling,
    verifyTransfers: s.verifyTransfers,
  };
};

mock.get('/v1/settings/finance', (req) => financeToggles(currentUser(req).schoolId));

mock.put('/v1/settings/finance', (req) => {
  const { schoolId, log } = ctxFor(req);
  const fin = financeSnapshot(schoolId).fin;
  const p = (req.body ?? {}) as Partial<FinanceToggles>;
  for (const key of Object.keys(FINANCE_LABEL) as (keyof FinanceToggles)[]) {
    const v = p[key];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') fail(`${FINANCE_LABEL[key]} must be on or off.`);
    log('Finance', FINANCE_LABEL[key], onOff(fin.settings[key]), onOff(v));
    fin.settings[key] = v;
  }
  return financeToggles(schoolId);
});

/* ---------------- Subscription & modules ---------------- */

type PlanName = 'Starter' | 'Growth' | 'Premium';
const PRICES: Record<PlanName, number> = {
  Starter: 650_000,
  Growth: 1_850_000,
  Premium: 3_400_000,
};

const MODULES: [string, string, PlanName[] | 'soon'][] = [
  [
    'Academics & Results',
    'Sessions, classes, timetable, assessments, report cards',
    ['Starter', 'Growth', 'Premium'],
  ],
  [
    'Students & Admissions',
    'Admissions, enrollment, transfers, parents and guardians',
    ['Starter', 'Growth', 'Premium'],
  ],
  ['Finance', 'Fees, invoices, payments, expenses, vendors', ['Starter', 'Growth', 'Premium']],
  ['Payroll', 'Salary structures, payslips and payroll approval', ['Growth', 'Premium']],
  ['Inventory', 'Stores, stock ledger, requests, counts', ['Growth', 'Premium']],
  [
    'Communication',
    'Announcements, notifications, email and SMS',
    ['Starter', 'Growth', 'Premium'],
  ],
  [
    'Learning materials',
    'Teachers share notes and files with their classes',
    ['Growth', 'Premium'],
  ],
  ['Attendance', 'Daily and lesson attendance', 'soon'],
  ['Transport', 'Routes, buses and transport fees', 'soon'],
  ['Library', 'Catalogue and lending', 'soon'],
  ['ID cards', 'Card design and printing', 'soon'],
  ['Online examinations', 'Computer-based tests', 'soon'],
];

const BILLING: Record<string, { startedOn: string; renewsOn: string; contact: string }> = {
  greenfield: { startedOn: '2026-09-01', renewsOn: '2027-08-31', contact: 'Dr. Folasade Ogunbiyi' },
  crestview: { startedOn: '2026-11-05', renewsOn: '2027-11-04', contact: 'Mr. Emmanuel Udo' },
};

const planOf = (schoolId: string): PlanName => {
  const name = schoolData[schoolId]!.profile.plan.name;
  return name === 'Starter' || name === 'Premium' ? name : 'Growth';
};

export function subscriptionStatus(daysToRenewal: number): SubscriptionView['status'] {
  if (daysToRenewal > 30) return 'Active';
  if (daysToRenewal >= 0) return 'Renewal due';
  if (daysToRenewal >= -14) return 'Overdue';
  return 'Restricted';
}

mock.get('/v1/settings/subscription', (req): SubscriptionView => {
  const { schoolId } = ctxFor(req);
  const data = schoolData[schoolId]!;
  const plan = planOf(schoolId);
  const billing = BILLING[schoolId] ?? {
    startedOn: isoToday(),
    renewsOn: addDays(isoToday(), 364),
    contact: '',
  };
  const days = daysBetween(isoToday(), billing.renewsOn);
  const sms = smsCreditOf(schoolId);
  const students = [...financeSnapshot(schoolId).students.values()].filter((s) => s.active).length;
  return {
    plan,
    cycle: 'Annual',
    price: PRICES[plan],
    startedOn: billing.startedOn,
    renewsOn: billing.renewsOn,
    daysToRenewal: days,
    status: subscriptionStatus(days),
    billingContact: billing.contact,
    usage: {
      students,
      studentLimit: data.profile.plan.studentLimit,
      branches: data.branches.length,
      branchLimit: data.profile.plan.branchLimit,
      staffAccounts: data.users.filter((u) => u.status !== 'Revoked').length,
      smsUnits: sms.units,
      smsUsedThisTerm: sms.usedThisTerm,
      senderId: sms.senderId.name,
      senderIdStatus: sms.senderId.status,
    },
    modules: MODULES.filter(([, , on]) => on !== 'soon').map(([name, , on]) => ({
      name,
      included: (on as PlanName[]).includes(plan),
    })),
  };
});

mock.get('/v1/settings/modules', (req): ModuleRow[] => {
  const plan = planOf(currentUser(req).schoolId);
  return MODULES.map(([name, covers, on]) => ({
    name,
    covers,
    status: on === 'soon' ? 'Coming soon' : on.includes(plan) ? 'Active' : 'Not on plan',
  }));
});

/* ---------------- Security ---------------- */

const RULE_LIMITS: Record<keyof SignInRules, [number, number, string, string]> = {
  idleTimeoutMinutes: [5, 240, 'Sign out after idle', 'minutes'],
  lockoutAttempts: [3, 10, 'Failed attempts before lockout', 'attempts'],
  lockoutMinutes: [5, 1440, 'Lockout length', 'minutes'],
  passwordExpiryDays: [30, 365, 'Password expiry', 'days'],
};

const ruleText = (key: keyof SignInRules, v: number) =>
  key === 'passwordExpiryDays'
    ? v === 0
      ? 'Never'
      : `Every ${v} days`
    : `${v} ${RULE_LIMITS[key][3]}`;

function securityView(req: MockRequest): SecurityView {
  const { user, settings } = ctxFor(req);
  const changed = settings.passwordChangedOn[user.id] ?? isoToday();
  const expiry = settings.rules.passwordExpiryDays;
  const sessions = (settings.sessions[user.id] ??= [
    {
      id: `cur-${user.id}`,
      device: 'This browser',
      location: 'Lagos, NG',
      lastActive: new Date().toISOString(),
      current: true,
    },
  ]);
  const current = sessions.find((s) => s.current);
  if (current) current.lastActive = new Date().toISOString();
  return {
    account: {
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      position: user.position,
      role: user.roleName,
      passwordChangedOn: changed,
      passwordExpiresOn: expiry ? addDays(changed, expiry) : null,
    },
    sessions: [...sessions].sort(
      (a, b) => Number(b.current) - Number(a.current) || b.lastActive.localeCompare(a.lastActive),
    ),
    rules: { ...settings.rules },
  };
}

mock.get('/v1/settings/security', (req) => securityView(req));

mock.post('/v1/settings/security/password', (req) => {
  const { user, settings } = ctxFor(req);
  const p = (req.body ?? {}) as Partial<ChangePasswordPayload>;
  if (!p.current) fail('Enter your current password.');
  if (passwords.get(user.email) !== p.current) fail('That isn’t your current password.');
  const next = typeof p.next === 'string' ? p.next : '';
  if (!meetsPasswordPolicy(next))
    fail(
      'Use at least 10 characters with an uppercase and a lowercase letter, a number and a symbol.',
    );
  if (next === p.current) fail('Choose a password you haven’t just used.');
  passwords.set(user.email, next);
  user.passwordExpired = false;
  settings.passwordChangedOn[user.id] = isoToday();
  const all = settings.sessions[user.id] ?? [];
  const signedOut = all.filter((s) => !s.current).length;
  settings.sessions[user.id] = all.filter((s) => s.current);
  return { signedOut, view: securityView(req) };
});

mock.delete('/v1/settings/security/sessions/:id', (req) => {
  const { user, settings } = ctxFor(req);
  const all = settings.sessions[user.id] ?? [];
  const s = all.find((x) => x.id === req.params.id) ?? fail('That session has already ended.', 404);
  if (s.current) fail('Use Sign out in the account menu to end this session.', 409);
  settings.sessions[user.id] = all.filter((x) => x.id !== s.id);
  return securityView(req);
});

mock.post('/v1/settings/security/sessions/sign-out-others', (req) => {
  const { user, settings } = ctxFor(req);
  settings.sessions[user.id] = (settings.sessions[user.id] ?? []).filter((s) => s.current);
  return securityView(req);
});

mock.put('/v1/settings/security/rules', (req) => {
  const { settings, log } = ctxFor(req);
  const p = (req.body ?? {}) as Partial<Record<keyof SignInRules, unknown>>;
  const next = { ...settings.rules };
  for (const key of Object.keys(RULE_LIMITS) as (keyof SignInRules)[]) {
    if (p[key] === undefined) continue;
    const v = Number(p[key]);
    const [min, max, label, unit] = RULE_LIMITS[key];
    if (key === 'passwordExpiryDays' && v === 0) {
      next[key] = 0;
      continue;
    }
    if (!Number.isInteger(v) || v < min || v > max)
      fail(
        `${label} must be a whole number from ${min} to ${max} ${unit}${key === 'passwordExpiryDays' ? ', or 0 for never' : ''}.`,
      );
    next[key] = v;
  }
  for (const key of Object.keys(RULE_LIMITS) as (keyof SignInRules)[])
    log(
      'Security',
      RULE_LIMITS[key][2],
      ruleText(key, settings.rules[key]),
      ruleText(key, next[key]),
    );
  settings.rules = next;
  return securityView(req);
});

/* ---------------- Change history ---------------- */

mock.get('/v1/settings/history', (req) => {
  const { settings } = ctxFor(req);
  const area = req.query.area;
  return settings.history.filter((h) => !area || h.area === area);
});
