import { mock, MockHttpError, type MockRequest } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type { SetupProgress, SetupStep } from '@/types';

import { setup, setupConfirmed, type AutoStep } from '../db';
import { schoolData } from '../school-db';
import { academicSteps, completeAcademicStep, isAcademicStep } from './academics-shared';
import { currentUser } from './shared';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Branches missing what parents need to find the campus. */
export const branchIssues = (b: { street: string; city: string; sections: string[] }) => [
  ...(!b.street.trim() || !b.city.trim() ? ['Address incomplete'] : []),
  ...(!b.sections.length ? ['No sections'] : []),
];

/**
 * The Setup Center as the school sees it. Steps backed by built screens (School Profile, Branches,
 * Organogram & Roles, and the Academics steps) complete from those screens and describe the
 * school's real data; the rest keep their stored state until their modules exist.
 */
export function setupView(req: Pick<MockRequest, 'headers'>): SetupProgress {
  const schoolId = currentUser(req).schoolId;
  const base = setup[schoolId]!;
  const confirmed = setupConfirmed[schoolId]!;
  const { profile, branches, positions, roles } = schoolData[schoolId]!;
  const active = branches.filter((b) => b.status === 'Active');
  const live: Record<AutoStep, Pick<SetupStep, 'description' | 'to'>> = {
    'school-profile': {
      description: confirmed['school-profile']
        ? `Name, contact and registration confirmed${profile.logo ? ' · logo added' : ' · no logo yet'}`
        : 'Name, logo, contact and registration',
      to: confirmed['school-profile']
        ? { name: routesPath.school.profile.name }
        : { name: routesPath.school.profileEdit.name, query: { from: 'setup' } },
    },
    branches: {
      description: `${branches.length} branch${branches.length === 1 ? '' : 'es'} · ${active.length} active${
        confirmed.branches ? '' : ' · confirm addresses and sections'
      }`,
      to: { name: routesPath.setupBranches.name },
    },
    staff: (() => {
      const current = schoolData[schoolId]!.staff.filter((s) => !s.left);
      const teachers = current.filter((s) => s.kind === 'Teaching').length;
      const accounts = schoolData[schoolId]!.users.filter(
        (u) => u.staffId && ['Active', 'Invited', 'Suspended'].includes(u.status),
      ).length;
      return {
        description: `${plural(current.length, 'staff member')} · ${plural(teachers, 'teacher')} · ${accounts} with system accounts`,
        to: confirmed.staff
          ? { name: routesPath.staff.directory.name }
          : { name: routesPath.staff.directory.name, query: { from: 'setup' } },
      };
    })(),
    'organogram-roles': {
      description: `${plural(positions.length, 'position')} · ${positions.filter((p) => !p.holderIds.length).length} vacant · ${plural(roles.length, 'role')}`,
      to: { name: routesPath.school.organogram.name, query: { from: 'setup' } },
    },
  };
  const academic = academicSteps(schoolId);
  return {
    ...base,
    steps: base.steps.map((s) => {
      const id = s.id as AutoStep;
      if (isAcademicStep(s.id)) return { ...s, ...academic[s.id], auto: true };
      return id in live
        ? { ...s, ...live[id], done: confirmed[id], auto: true }
        : { ...s, auto: false };
    }),
  };
}

mock.get('/v1/setup', (req) => setupView(req));

mock.post('/v1/setup/steps/:id/complete', (req) => {
  const schoolId = currentUser(req).schoolId;
  const id = req.params.id!;
  const confirmed = setupConfirmed[schoolId]!;
  const data = schoolData[schoolId]!;
  if (isAcademicStep(id)) {
    completeAcademicStep(schoolId, id);
    return setupView(req).steps.find((s) => s.id === id);
  }
  if (id === 'school-profile')
    throw new MockHttpError(409, 'Save the school profile to complete this step.');
  if (id === 'branches') {
    const active = data.branches.filter((b) => b.status === 'Active');
    if (!active.length) throw new MockHttpError(422, 'Add at least one active branch first.');
    const bad = active.filter((b) => branchIssues(b).length);
    if (bad.length)
      throw new MockHttpError(
        422,
        `Complete these first: ${bad.map((b) => `${b.name} (${branchIssues(b).join(', ').toLowerCase()})`).join('; ')}.`,
      );
    confirmed.branches = true;
  } else if (id === 'staff') {
    if (!data.staff.some((s) => s.kind === 'Teaching' && !s.left))
      throw new MockHttpError(422, 'Add at least one teacher so classes can be assigned.');
    confirmed.staff = true;
  } else if (id === 'organogram-roles') {
    if (data.positions.length < 2)
      throw new MockHttpError(
        422,
        'Add at least one position under the top of your organogram first.',
      );
    const top = data.positions.find((p) => !p.parentId);
    if (!top?.holderIds.length)
      throw new MockHttpError(422, `Assign someone to ${top?.title ?? 'the top position'} first.`);
    confirmed['organogram-roles'] = true;
  } else {
    const step = setup[schoolId]!.steps.find((s) => s.id === id);
    if (!step) throw new MockHttpError(404, 'Setup step not found');
    step.done = true;
  }
  return setupView(req).steps.find((s) => s.id === id);
});

mock.post('/v1/setup/finish', (req) => {
  const view = setupView(req);
  const left = view.steps.filter((x) => x.required && !x.done);
  if (left.length)
    throw new MockHttpError(
      409,
      `Finish the required steps first: ${left.map((x) => x.name).join(', ')}.`,
    );
  setup[currentUser(req).schoolId]!.finished = true;
  return { ...view, finished: true };
});
