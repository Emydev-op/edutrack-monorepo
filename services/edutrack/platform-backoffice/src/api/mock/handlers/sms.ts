/** A school's SMS in the back office: prepaid units (ledger, top-ups) and sender ID approval. */
import { mock, MockHttpError } from '@edutrack/web-core/mock';

import type { SchoolSms, SenderIdRequest, SmsTopUpPayload } from '@/types';

import { audit, ME } from '../db';
import { findSchool, requireText } from './shared';

const ALLOWANCE: Record<string, number> = { Starter: 1_000, Growth: 5_000, Enterprise: 20_000 };
const stamp = 'Today · just now';

const state = new Map<string, SchoolSms>();

function smsOf(id: string): SchoolSms {
  const school = findSchool(id);
  let s = state.get(id);
  if (!s) {
    const allowance = ALLOWANCE[school.plan] ?? 0;
    const fresh = school.status === 'Onboarding';
    const used = fresh ? 0 : Math.round(allowance * 0.38);
    const requests: SenderIdRequest[] =
      school.id === 'greenfield'
        ? [
            {
              id: 'sid1',
              name: 'GREENFIELD',
              status: 'Pending approval',
              requestedAt: '28 Oct 2026 · 09:12',
              requestedBy: 'Adaeze Okonkwo',
              decidedAt: null,
              note: '',
            },
          ]
        : [];
    s = {
      school: school.name,
      plan: school.plan,
      allowancePerTerm: allowance,
      balance: fresh ? 0 : allowance - used,
      usedThisTerm: used,
      sender: 'EDUTRACK',
      senderId: requests[0]
        ? { name: requests[0].name, status: requests[0].status }
        : { name: '', status: 'Not requested' },
      requests,
      ledger: fresh
        ? []
        : [
            {
              id: 'l2',
              at: '18 Nov 2026 · 08:40',
              kind: 'Used',
              units: -used,
              detail: 'Announcements and automatic messages this term',
              by: 'EduTrack',
            },
            {
              id: 'l1',
              at: '14 Sep 2026 · 07:00',
              kind: 'Plan allowance',
              units: allowance,
              detail: `${school.plan} plan · SMS units for the term`,
              by: 'EduTrack',
            },
          ],
    };
    state.set(id, s);
  }
  return s;
}

mock.get('/v1/platform/schools/:id/sms', ({ params }) => smsOf(params.id!));

mock.post('/v1/platform/schools/:id/sms/top-ups', ({ params, body }) => {
  const s = smsOf(params.id!);
  const p = (body ?? {}) as Partial<SmsTopUpPayload>;
  const units = Number(p.units);
  if (!Number.isInteger(units) || units < 1 || units > 1_000_000)
    throw new MockHttpError(422, 'Enter between 1 and 1,000,000 units.');
  const note = requireText(p.note, 'Add a note about the top-up.');
  const before = s.balance;
  s.balance += units;
  s.ledger.unshift({
    id: `l${Date.now()}`,
    at: stamp,
    kind: 'Top-up',
    units,
    detail: [note, p.reference].filter(Boolean).join(' · '),
    by: ME.name,
  });
  audit({
    summary: `Added ${units.toLocaleString('en-NG')} SMS units to ${s.school}`,
    action: 'sms.top_up',
    entity: 'School',
    entityId: params.id!,
    schoolName: s.school,
    previous: String(before),
    next: String(s.balance),
  });
  return s;
});

function decide(id: string, approve: boolean, note: string) {
  const s = smsOf(id);
  const r = s.requests.find((x) => x.status === 'Pending approval');
  if (!r) throw new MockHttpError(409, `${s.school} has no sender ID waiting for approval.`);
  if (!approve && !note)
    throw new MockHttpError(422, 'Say why, so the school knows what to change.');
  Object.assign(r, {
    status: approve ? 'Approved' : 'Rejected',
    decidedAt: stamp,
    note: note || (approve ? 'Approved by EduTrack.' : ''),
  });
  s.senderId = { name: r.name, status: r.status };
  if (approve) s.sender = r.name;
  audit({
    summary: `${approve ? 'Approved' : 'Rejected'} sender ID “${r.name}” for ${s.school}`,
    action: approve ? 'sender_id.approve' : 'sender_id.reject',
    entity: 'School',
    entityId: id,
    schoolName: s.school,
    next: r.name,
  });
  return s;
}

const noteOf = (body: unknown) => ((body as { note?: string } | undefined)?.note ?? '').trim();

mock.post('/v1/platform/schools/:id/sender-id/approve', ({ params, body }) =>
  decide(params.id!, true, noteOf(body)),
);
mock.post('/v1/platform/schools/:id/sender-id/reject', ({ params, body }) =>
  decide(params.id!, false, noteOf(body)),
);
