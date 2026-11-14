import type {
  InviteSchoolAdminPayload,
  PlanName,
  ProvisionSchoolPayload,
  School,
  SchoolStatus,
  SubscriptionAction,
  SubscriptionRow,
  UpdateSchoolPayload,
} from '@/types';
import { isNigerianState, lgasOf } from '@edutrack/app-kit/lib/nigeria-locations';

import {
  activity,
  audit,
  auditLog,
  PLAN_LIMITS,
  schoolAdmins,
  schools,
  statusBeforeSuspension,
} from '../db';
import { mock, MockHttpError, paginate } from '@edutrack/web-core/mock';
import { findSchool, requireText } from './shared';

const OVERDUE: SchoolStatus[] = ['Grace period', 'Restricted', 'Expired'];
const limit = (plan: PlanName, key: 'students' | 'branches') =>
  PLAN_LIMITS[plan][key].toLocaleString('en-NG');

/* ---------- Schools ---------- */

mock.get('/v1/platform/schools', ({ query }) => {
  const rows = schools.filter(
    (s) =>
      (!query.status || s.status === query.status) &&
      (!query.plan || s.plan === query.plan) &&
      (!query.state || s.state === query.state),
  );
  return paginate(rows, query, (s) => `${s.name} ${s.admin} ${s.state}`);
});

mock.get('/v1/platform/schools/:id', ({ params }) => findSchool(params.id!));

mock.patch('/v1/platform/schools/:id', ({ params, body }) => {
  const school = findSchool(params.id!);
  const payload = body as UpdateSchoolPayload;
  const previous = school.name;
  Object.assign(school, {
    name: requireText(payload.name, 'Enter the display name'),
    contactEmail: requireText(payload.contactEmail, 'Enter a contact email'),
    phone: payload.phone,
    state: payload.state,
  });
  audit({
    summary: `Edited school details · ${school.name}`,
    action: 'school.update',
    entity: 'School',
    entityId: school.id,
    schoolName: school.name,
    previous,
    next: school.name,
  });
  return school;
});

function suspend(school: School, reason: string) {
  statusBeforeSuspension.set(school.id, school.status);
  audit({
    summary: `School suspended · ${school.name} · "${reason}"`,
    action: 'school.suspend',
    entity: 'School',
    entityId: school.id,
    schoolName: school.name,
    previous: school.status,
    next: 'Suspended',
  });
  school.status = 'Suspended';
}

mock.post('/v1/platform/schools/:id/suspend', ({ params, body }) => {
  const school = findSchool(params.id!);
  suspend(
    school,
    requireText((body as { reason: string }).reason, 'Give a reason for the suspension'),
  );
  return school;
});

mock.post('/v1/platform/schools/bulk-suspend', ({ body }) => {
  const { ids, reason } = body as { ids: string[]; reason: string };
  const text = requireText(reason, 'Give a reason for the suspension');
  ids.map(findSchool).forEach((s) => suspend(s, text));
  return { suspended: ids.length };
});

mock.post('/v1/platform/schools/:id/reactivate', ({ params }) => {
  const school = findSchool(params.id!);
  const next = statusBeforeSuspension.get(school.id) ?? 'Active';
  audit({
    summary: `School reactivated · ${school.name}`,
    action: 'school.reactivate',
    entity: 'School',
    entityId: school.id,
    schoolName: school.name,
    previous: school.status,
    next,
  });
  school.status = next;
  return school;
});

mock.post('/v1/platform/schools/reminders', ({ body }) => ({
  queued: (body as { ids: string[] }).ids.length,
}));

mock.post('/v1/platform/schools/:id/support-sessions', ({ params, body }) => {
  const school = findSchool(params.id!);
  const reason = requireText((body as { reason: string }).reason, 'Give a reason for the session');
  audit({
    summary: `Support session started · "${reason}"`,
    action: 'support_session.start',
    entity: 'Support session',
    entityId: school.id,
    schoolName: school.name,
    next: 'Read-only · 30 min',
  });
  return { sessionId: `SS-${Date.now().toString(36)}`, expiresIn: '30 minutes' };
});

mock.get(
  '/v1/platform/schools/:id/administrators',
  ({ params }) => schoolAdmins.get(findSchool(params.id!).id) ?? [],
);

mock.post('/v1/platform/schools/:id/administrators', ({ params, body }) => {
  const school = findSchool(params.id!);
  const payload = body as InviteSchoolAdminPayload;
  const admin = {
    id: `${school.id}-${Date.now()}`,
    name: requireText(payload.name, 'Enter a name'),
    email: payload.email,
    role: payload.role,
    scope: payload.scope,
    invitedAt: 'Today',
    status: 'Invited' as const,
  };
  schoolAdmins.set(school.id, [...(schoolAdmins.get(school.id) ?? []), admin]);
  audit({
    summary: `School administrator invited · ${payload.email}`,
    action: 'school_admin.invite',
    entity: 'Invitation',
    entityId: admin.id,
    schoolName: school.name,
    next: 'Pending',
  });
  return admin;
});

mock.post('/v1/platform/schools/:id/administrators/:adminId/resend', ({ params }) => {
  const school = findSchool(params.id!);
  const admin = schoolAdmins.get(school.id)?.find((a) => a.id === params.adminId);
  if (!admin) throw new MockHttpError(404, 'Administrator not found');
  admin.note = 'Resent today · expires in 7 days';
  audit({
    summary: `Administrator invitation resent · ${admin.name}`,
    action: 'school_admin.resend',
    entity: 'Invitation',
    entityId: admin.id,
    schoolName: school.name,
    previous: 'Pending',
    next: 'Resent',
  });
  return admin;
});

mock.get('/v1/platform/schools/:id/usage', ({ params }) => {
  const school = findSchool(params.id!);
  const fresh = school.status === 'Onboarding' && school.students === 0;
  return {
    activeStaff: fresh ? 0 : 88,
    parentSignIns: fresh ? 0 : 9412,
    smsSent: school.id === 'kings' ? 14200 : fresh ? 0 : 6180,
    smsNote: school.id === 'kings' ? 'This week · 3× usual volume' : undefined,
    storageUsedGb: fresh ? 0 : 18.4,
    storageLimitGb: 50,
  };
});

mock.get('/v1/platform/schools/:id/billing', ({ params }) => {
  const school = findSchool(params.id!);
  const price = PLAN_LIMITS[school.plan].price;
  return [
    {
      id: 'PLT-2026-0418',
      period: 'Sep 2026 – Aug 2027',
      amount: price,
      status: OVERDUE.includes(school.status) ? 'Overdue' : 'Paid',
    },
    { id: 'PLT-2025-0302', period: 'Sep 2025 – Aug 2026', amount: price, status: 'Paid' },
  ];
});

mock.get('/v1/platform/schools/:id/activity', ({ params }) => {
  const school = findSchool(params.id!);
  const own = activity
    .filter((a) => a.schoolName === school.name)
    .map((a) => ({ id: a.id, title: a.summary, detail: a.actor, when: a.when, tone: 'info' }));
  return own.concat([
    {
      id: 'renewed',
      title: 'Subscription renewed',
      detail: 'by Ada Eze',
      when: '1 Aug 2026',
      tone: 'success',
    },
    {
      id: 'invited',
      title: `Administrator invited · ${school.admin}`,
      detail: 'by Femi Lawson',
      when: school.createdAt,
      tone: 'neutral',
    },
    {
      id: 'created',
      title: 'School provisioned',
      detail: 'by Femi Lawson',
      when: school.createdAt,
      tone: 'neutral',
    },
  ]);
});

mock.get('/v1/platform/schools/:id/audit', ({ params }) => {
  const school = findSchool(params.id!);
  return auditLog
    .filter((e) => e.entityId === school.id)
    .concat([
      {
        id: `${school.id}-renew`,
        timestamp: '1 Aug 2026',
        actor: 'Ada Eze',
        action: 'subscription.renew',
        entity: 'Subscription',
        entityId: school.id,
        previousValue: 'Expiring',
        newValue: 'Active',
        ipDevice: '—',
        requestId: '—',
      },
      {
        id: `${school.id}-create`,
        timestamp: school.createdAt,
        actor: 'Femi Lawson',
        action: 'tenant.create',
        entity: 'School',
        entityId: school.id,
        previousValue: '—',
        newValue: 'Onboarding',
        ipDevice: '—',
        requestId: '—',
      },
    ]);
});

/* ---------- Provisioning ---------- */

mock.post('/v1/platform/schools', ({ body }) => {
  const p = body as ProvisionSchoolPayload;
  const name = requireText(p.name, 'Enter the display name');
  if (schools.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    throw new MockHttpError(409, 'A school with this name already exists', 'SCHOOL_EXISTS');
  }
  if (!isNigerianState(p.state ?? '')) throw new MockHttpError(422, 'Select a Nigerian state');
  if (!lgasOf(p.state).includes(p.lga ?? ''))
    throw new MockHttpError(422, `${p.lga || 'That LGA'} isn’t an LGA in ${p.state}`);
  // Test hook kept from the design: an administrator email containing "fail" shows the error state.
  const admins = p.admins ?? [];
  if (!admins.length) throw new MockHttpError(422, 'Add at least one administrator');
  const emails = admins.map((a) => a.email.trim().toLowerCase());
  if (new Set(emails).size !== emails.length)
    throw new MockHttpError(422, 'Each administrator needs a different email');
  if (!admins.some((a) => a.scope === 'All branches')) {
    throw new MockHttpError(422, 'At least one administrator must manage all branches');
  }
  if (admins.some((a) => /fail/i.test(a.email))) {
    throw new MockHttpError(
      502,
      "Unable to provision school. We couldn't reserve the address for the administrator's invitation. Check the administrator email and try again.",
    );
  }
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const school: School = {
    id,
    name,
    legalName: p.legalName || name,
    type: `${p.ownership} · ${p.sections.length > 2 ? 'Combined' : p.sections.join(', ')}`,
    state: p.state,
    plan: p.plan,
    status: 'Onboarding',
    students: 0,
    branches: p.branches.length,
    renews: '3 Jan 2028',
    setupProgress: 0,
    currentStep: 'Accept invitation',
    admin: `${admins[0]!.name} (invited)${admins.length > 1 ? ` +${admins.length - 1}` : ''}`,
    contactEmail: p.email,
    phone: p.phone,
    subdomain: `${id}.edutrack.ng`,
    createdAt: 'Today',
    brandColor: p.brandColor,
  };
  schools.unshift(school);
  schoolAdmins.set(
    id,
    admins.map((a, i) => ({
      id: `${id}-${i + 1}`,
      name: a.name,
      email: a.email,
      role: 'School Admin' as const,
      scope: a.scope,
      invitedAt: 'Today',
      status: 'Invited' as const,
    })),
  );
  audit({
    summary: `School provisioned · ${name} on ${p.plan}`,
    action: 'tenant.create',
    entity: 'School',
    entityId: id,
    schoolName: name,
    next: 'Onboarding',
  });
  return school;
});

/* ---------- Subscriptions ---------- */

mock.get('/v1/platform/subscriptions', ({ query }) => {
  const rows: SubscriptionRow[] = schools
    .filter((s) => s.status !== 'Suspended')
    .map((s) => {
      const status = (s.status === 'Onboarding' ? 'Active' : s.status) as SubscriptionRow['status'];
      return {
        schoolId: s.id,
        schoolName: s.name,
        plan: s.plan,
        studentUsage: `${s.students.toLocaleString('en-NG')} / ${limit(s.plan, 'students')}`,
        branchUsage: `${s.branches} / ${limit(s.plan, 'branches')}`,
        renews: s.renews,
        billing: OVERDUE.includes(status) ? ('Overdue' as const) : ('Paid' as const),
        status,
      };
    })
    .filter((row) => !query.status || row.status === query.status);
  return paginate(rows, query, (r) => r.schoolName);
});

mock.get('/v1/platform/schools/:id/subscription', ({ params }) => {
  const school = findSchool(params.id!);
  return {
    plan: school.plan,
    price: PLAN_LIMITS[school.plan].price + (school.plan === 'Enterprise' ? '' : ' / year'),
    studentLimit: limit(school.plan, 'students'),
    branchLimit: limit(school.plan, 'branches'),
    renews: school.renews,
    payment: ['Grace period', 'Restricted'].includes(school.status) ? 'Overdue' : 'Paid',
    status: school.status === 'Onboarding' ? 'Active' : school.status,
  };
});

const ACTION_LABEL: Record<SubscriptionAction['action'], string> = {
  change_plan: 'Plan changed',
  extend: 'Subscription extended',
  enter_grace: 'Grace period started',
  restrict: 'School restricted',
  cancel: 'Subscription cancelled',
  reactivate: 'Subscription reactivated',
};

mock.post('/v1/platform/schools/:id/subscription/actions', ({ params, body }) => {
  const school = findSchool(params.id!);
  const action = body as SubscriptionAction;
  const before = `${school.plan} · ${school.status}`;
  switch (action.action) {
    case 'change_plan':
      school.plan = action.plan;
      break;
    case 'extend':
      requireText(action.reason, 'Give a reason for the extension');
      school.renews = `Extended ${action.period}`;
      if (['Grace period', 'Restricted', 'Expiring', 'Expired'].includes(school.status))
        school.status = 'Active';
      break;
    case 'enter_grace':
      school.status = 'Grace period';
      break;
    case 'restrict':
      requireText(action.reason, 'Give a reason for restricting the school');
      school.status = 'Restricted';
      break;
    case 'cancel':
      requireText(action.reason, 'Give a reason for the cancellation');
      school.status = 'Cancelled';
      break;
    case 'reactivate':
      school.status = 'Active';
      school.renews = 'Renewed today';
      break;
  }
  const reason = 'reason' in action ? ` · "${action.reason}"` : '';
  audit({
    summary: `${ACTION_LABEL[action.action]} · ${school.name}${reason}`,
    action: `subscription.${action.action}`,
    entity: 'Subscription',
    entityId: school.id,
    schoolName: school.name,
    previous: before,
    next: `${school.plan} · ${school.status}`,
  });
  return school;
});
