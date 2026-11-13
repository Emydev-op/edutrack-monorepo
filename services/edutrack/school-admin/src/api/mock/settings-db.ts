/**
 * School settings that don't belong to another module's data: numbering formats, academic policy
 * switches, staff sign-in rules, signed-in sessions and the change history.
 *
 * Other modules read these through the exported helpers:
 * - academicPolicy(acad): result and promotion switches (academics-results / academics).
 * - nextNumberFor(schoolId, kind, seq): the next admission number or staff ID in the school's format.
 * - signInRulesFor(schoolId): lockout and password expiry rules for sign-in.
 */
import type {
  AcademicPolicy,
  NumberingKind,
  SessionRow,
  SettingsArea,
  SettingsChange,
  SignInRules,
} from '@/types';

import { formatNumber } from '@/lib/numbering';

import { academicsData, type AcademicsData } from './academics-db';
import { users } from './db';
import { schoolData } from './school-db';

export interface SettingsData {
  numbering: Record<NumberingKind, string>;
  /** showPosition lives on the assessment config; the rest are here. */
  policy: Omit<AcademicPolicy, 'showPosition'>;
  rules: SignInRules;
  sessions: Record<string, SessionRow[]>;
  passwordChangedOn: Record<string, string>;
  history: SettingsChange[];
  seq: number;
}

const staffPrefix = (schoolId: string) =>
  schoolData[schoolId]?.staff[0]?.staffNumber.split('-ST-')[0] ??
  (schoolId === 'greenfield' ? 'GFA' : 'CC');

function seedSessions(schoolId: string): Record<string, SessionRow[]> {
  const out: Record<string, SessionRow[]> = {};
  for (const u of users.filter((x) => x.schoolId === schoolId)) {
    out[u.id] = [
      {
        id: `cur-${u.id}`,
        device: 'This browser',
        location: 'Lagos, NG',
        lastActive: new Date().toISOString(),
        current: true,
      },
    ];
  }
  const admin = users.find((u) => u.schoolId === schoolId && u.position === 'Principal');
  if (schoolId === 'greenfield' && admin)
    out[admin.id]!.push(
      {
        id: 'ses-iphone',
        device: 'Safari on iPhone',
        location: 'Lagos, NG',
        lastActive: '2026-11-06T21:14:00',
        current: false,
      },
      {
        id: 'ses-office',
        device: 'Edge on Windows · Bursary office',
        location: 'Ikeja, NG',
        lastActive: '2026-11-03T08:52:00',
        current: false,
      },
    );
  return out;
}

function seed(schoolId: string): SettingsData {
  const greenfield = schoolId === 'greenfield';
  const changed: Record<string, string> = {};
  for (const u of users.filter((x) => x.schoolId === schoolId))
    changed[u.id] = greenfield ? '2026-09-12' : '2026-11-05';
  return {
    numbering: {
      admission: 'STU-[YYYY]-[####]',
      staff: `${staffPrefix(schoolId)}-ST-[####]`,
    },
    policy: { reweightExempt: true, promotionSuggestions: true, blockPromotionOnFees: false },
    rules: {
      idleTimeoutMinutes: 30,
      lockoutAttempts: 5,
      lockoutMinutes: 15,
      passwordExpiryDays: 90,
    },
    sessions: seedSessions(schoolId),
    passwordChangedOn: changed,
    history: greenfield
      ? [
          {
            id: 'h2',
            area: 'Security',
            setting: 'Password expiry',
            from: 'Every 60 days',
            to: 'Every 90 days',
            by: 'Adaeze Okonkwo',
            at: '2026-10-02T11:20:00',
          },
          {
            id: 'h1',
            area: 'Academic',
            setting: 'Show class position on report cards',
            from: 'Off',
            to: 'On',
            by: 'Adaeze Okonkwo',
            at: '2026-09-12T09:05:00',
          },
        ]
      : [],
    seq: 2,
  };
}

export const settingsData: Record<string, SettingsData> = {
  greenfield: seed('greenfield'),
  crestview: seed('crestview'),
};

export const settingsFor = (schoolId: string) => (settingsData[schoolId] ??= seed(schoolId));

export function recordChange(
  schoolId: string,
  change: { area: SettingsArea; setting: string; from: string; to: string; by: string },
) {
  if (change.from === change.to) return;
  const s = settingsFor(schoolId);
  s.history.unshift({ ...change, id: `h${++s.seq}`, at: new Date().toISOString() });
}

/* ---------------- Numbering ---------------- */

export { formatNumber, patternProblem } from '@/lib/numbering';

/** The admission number or staff ID for running number `seq`, in the school's saved format. */
export const nextNumberFor = (schoolId: string, kind: NumberingKind, seq: number) =>
  formatNumber(settingsFor(schoolId).numbering[kind], seq);

/* ---------------- Academic policy ---------------- */

const DEFAULT_POLICY: Omit<AcademicPolicy, 'showPosition'> = {
  reweightExempt: true,
  promotionSuggestions: true,
  blockPromotionOnFees: false,
};

/** Result and promotion switches for the school that owns this academics data. */
export function academicPolicy(acad: AcademicsData): Omit<AcademicPolicy, 'showPosition'> {
  const schoolId = Object.keys(academicsData).find((id) => academicsData[id] === acad);
  return schoolId ? settingsFor(schoolId).policy : DEFAULT_POLICY;
}

/* ---------------- Sign-in rules ---------------- */

export const signInRulesFor = (schoolId: string) => settingsFor(schoolId).rules;
