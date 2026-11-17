import { mock, MockHttpError } from '@edutrack/web-core/mock';

import type {
  InviteGuardiansPayload,
  StudentLoginsPayload,
  StudentLoginState,
  StudentRow,
} from '@/types';

import { academicsData } from '../academics-db';
import { studentsData, type GuardianRecord, type StudentRecord } from '../students-db';
import { currentUser, schoolOf } from './shared';

/*
 * Parent Portal invitations and Student Portal logins, as the real API answers them
 * (`/v1/guardians/:id/invite`, `/v1/guardians/invite`, `/v1/students/logins`).
 */

const CURRENT: StudentRow['status'][] = ['Active', 'Incomplete profile'];
const name = (s: StudentRecord) => `${s.firstName} ${s.surname}`.trim();
const className = (s: StudentRecord) =>
  s.arm ? `${s.level}${/\d$/.test(s.level) ? '' : ' '}${s.arm}` : '';
const sectionOf = (level: string) =>
  level.startsWith('JSS')
    ? 'Junior Secondary'
    : level.startsWith('SSS')
      ? 'Senior Secondary'
      : level.startsWith('Primary')
        ? 'Primary'
        : 'Nursery';

function context(req: Parameters<typeof currentUser>[0]) {
  const user = currentUser(req);
  return { user, data: studentsData[user.schoolId]!, acad: academicsData[user.schoolId] };
}

/** Student logins made in this browser session (the mock keeps no passwords). */
const logins = new Map<string, StudentLoginState>();

const loginsOn = (acad: ReturnType<typeof context>['acad'], section: string) => {
  const s = acad?.sections.find((x) => x.name === section);
  return s ? (s.studentLogins ?? ['JSS', 'SSS'].includes(s.code)) : false;
};

function rowOf(data: ReturnType<typeof context>['data'], g: GuardianRecord) {
  return {
    id: g.id,
    name: g.name,
    phone: g.phone,
    email: g.email,
    children: Object.keys(g.children)
      .map((id) => data.students.find((s) => s.id === id))
      .filter((s): s is StudentRecord => !!s)
      .map((s) => ({ id: s.id, name: name(s), className: className(s) })),
    relationship: Object.values(g.children)[0]?.relationship ?? 'Guardian',
    paysFees: Object.values(g.children).some((c) => c.paysFees),
    portal: g.portal,
    balance: 0,
  };
}

function invite(g: GuardianRecord) {
  if (g.portal === 'Active')
    throw new MockHttpError(409, `${g.name} already has a Parent Portal account.`);
  if (!g.phone && !g.email)
    throw new MockHttpError(422, 'No phone number or email to send the invitation to.');
  const resent = g.portal === 'Invited';
  g.portal = 'Invited';
  return resent;
}

mock.post('/v1/guardians/invite', (req) => {
  const { data } = context(req);
  const p = (req.body ?? {}) as InviteGuardiansPayload;
  const list = p.ids
    ? data.guardians.filter((g) => p.ids!.includes(g.id))
    : data.guardians.filter(
        (g) =>
          g.portal === 'No account' &&
          (!p.className ||
            Object.keys(g.children).some((id) => {
              const s = data.students.find((x) => x.id === id);
              return s && (className(s) === p.className || s.level === p.className);
            })),
      );
  let invited = 0;
  const skipped: { id: string; name: string; reason: string }[] = [];
  for (const g of list)
    try {
      invite(g);
      invited += 1;
    } catch (e) {
      skipped.push({ id: g.id, name: g.name, reason: (e as Error).message });
    }
  return { invited, skipped };
});

mock.post('/v1/guardians/:id/invite', (req) => {
  const { data } = context(req);
  const g = data.guardians.find((x) => x.id === req.params.id);
  if (!g) throw new MockHttpError(404, 'This guardian doesn’t exist');
  invite(g);
  return rowOf(data, g);
});

mock.delete('/v1/guardians/:id/invite', (req) => {
  const { data } = context(req);
  const g = data.guardians.find((x) => x.id === req.params.id);
  if (!g) throw new MockHttpError(404, 'This guardian doesn’t exist');
  if (g.portal !== 'Invited') throw new MockHttpError(409, `${g.name} has no pending invitation.`);
  g.portal = 'No account';
  return rowOf(data, g);
});

mock.get('/v1/students/logins', (req) => {
  const { data, acad } = context(req);
  const filter = (req.query.className as string | undefined) ?? '';
  const students = data.students
    .filter((s) => CURRENT.includes(s.status))
    .filter((s) => !filter || className(s) === filter || s.level === filter)
    .map((s) => ({
      id: s.id,
      name: name(s),
      admissionNo: s.admissionNo,
      className: className(s),
      section: sectionOf(s.level),
      enabled: loginsOn(acad, sectionOf(s.level)),
      login: logins.get(s.id) ?? ('No login' as StudentLoginState),
    }));
  const eligible = students.filter((s) => s.enabled);
  const withLogin = eligible.filter((s) => s.login !== 'No login').length;
  return {
    sections: (acad?.sections ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      studentLogins: s.studentLogins ?? ['JSS', 'SSS'].includes(s.code),
    })),
    students,
    counts: { eligible: eligible.length, withLogin, withoutLogin: eligible.length - withLogin },
  };
});

mock.post('/v1/students/logins', (req) => {
  const { user, data, acad } = context(req);
  const p = (req.body ?? {}) as StudentLoginsPayload;
  const targeted = !!p.studentIds || !!p.className;
  const chosen = data.students.filter(
    (s) =>
      CURRENT.includes(s.status) &&
      (!p.studentIds || p.studentIds.includes(s.id)) &&
      (!p.className || className(s) === p.className || s.level === p.className),
  );
  if (targeted && !chosen.length) throw new MockHttpError(422, 'No current students match.');
  const school = schoolOf(user);
  const skipped: { id: string; name: string; reason: string }[] = [];
  const slips = [];
  let created = 0;
  let reissued = 0;
  for (const s of chosen) {
    const section = sectionOf(s.level);
    if (!loginsOn(acad, section)) {
      if (targeted)
        skipped.push({ id: s.id, name: name(s), reason: `Student logins are off for ${section}.` });
      continue;
    }
    if (logins.has(s.id) && !p.reissue) {
      skipped.push({ id: s.id, name: name(s), reason: 'Already has a login.' });
      continue;
    }
    if (logins.has(s.id)) reissued += 1;
    else created += 1;
    logins.set(s.id, 'Not signed in yet');
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const pick = () => letters[Math.floor(Math.random() * letters.length)];
    slips.push({
      studentId: s.id,
      name: name(s),
      className: className(s) || s.level,
      admissionNo: s.admissionNo,
      schoolName: school.name,
      signInAddress: `https://${school.id}.edutrack.ng/student`,
      oneTimePassword: `${pick()}${pick()}${pick()}${pick()}-${String(Math.floor(2000 + Math.random() * 7000))}`,
    });
  }
  return {
    created,
    reissued,
    skipped,
    issuedOn: new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date()),
    slips,
  };
});
