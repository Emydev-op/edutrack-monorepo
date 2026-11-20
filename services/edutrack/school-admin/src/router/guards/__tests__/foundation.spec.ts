import { describe, expect, it, vi } from 'vitest';

import { isRealRoute } from '@/api/real-routes';
import { routesPath } from '@/router/routes-path';

import { foundationRedirect } from '../foundation';

const route = (name: string, requiresAuth = true) =>
  ({ name, matched: [{ meta: { requiresAuth } }] }) as unknown as Parameters<
    typeof foundationRedirect
  >[0];
type Load = () => Promise<{ foundationComplete: boolean }>;
const setup = (foundationComplete: boolean) => vi.fn<Load>(async () => ({ foundationComplete }));
const toSetup = { name: routesPath.setup.name };

describe('foundation guard', () => {
  it('sends a school without its foundation to the Setup Center', async () => {
    for (const name of [
      routesPath.dashboard.name,
      routesPath.students.list.name,
      routesPath.finance.overview.name,
      routesPath.academics.subjects.name,
      routesPath.settings.name,
    ])
      expect(await foundationRedirect(route(name), setup(false))).toEqual(toSetup);
  });

  it('keeps the Setup Center and the screens its foundation steps open', async () => {
    const load = setup(false);
    for (const name of [
      routesPath.setup.name,
      routesPath.school.profileEdit.name,
      routesPath.school.profile.name,
      routesPath.academics.sections.name,
      routesPath.academics.sessions.name,
      routesPath.academics.sessionNew.name,
      routesPath.academics.terms.name,
      routesPath.academics.classes.name,
    ])
      expect(await foundationRedirect(route(name), load)).toBeUndefined();
    // Allowed screens don't even ask.
    expect(load).not.toHaveBeenCalled();
  });

  it('never touches pages without a session (sign-in, password reset)', async () => {
    const load = setup(false);
    expect(
      await foundationRedirect(route(routesPath.auth.login.name, false), load),
    ).toBeUndefined();
    expect(
      await foundationRedirect(route(routesPath.auth.reset.name, false), load),
    ).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('lets everyone through once the foundation is complete', async () => {
    expect(await foundationRedirect(route(routesPath.dashboard.name), setup(true))).toBeUndefined();
  });

  it('doesn’t lock people out when setup can’t be checked', async () => {
    const failing = vi.fn<Load>(async () => {
      throw new Error('offline');
    });
    expect(await foundationRedirect(route(routesPath.dashboard.name), failing)).toBeUndefined();
  });
});

describe('real routes for Phase 1 academics and setup', () => {
  it('sends the built routes to the backend and keeps later phases on the mock', () => {
    expect(isRealRoute('get', '/v1/setup')).toBe(true);
    expect(isRealRoute('post', '/v1/setup/steps/classes-arms/complete')).toBe(true);
    expect(isRealRoute('get', '/v1/context-options')).toBe(true);
    expect(isRealRoute('put', '/v1/academics/sessions/abc/terms')).toBe(true);
    expect(isRealRoute('delete', '/v1/academics/classes/levels/a~b')).toBe(true);
    expect(isRealRoute('get', '/v1/academics/classes/abc')).toBe(true);
    expect(isRealRoute('post', '/v1/academics/sessions/abc/close')).toBe(true);
    expect(isRealRoute('get', '/v1/academics/sessions/abc/close')).toBe(true);
    expect(isRealRoute('post', '/v1/academics/terms/abc/close')).toBe(true);
    expect(isRealRoute('get', '/v1/academics/calendar')).toBe(true);
    expect(isRealRoute('delete', '/v1/academics/calendar/events/abc')).toBe(true);
    // Phase 3a: curriculum, assignments, timetable, assessment and attendance are real.
    expect(isRealRoute('get', '/v1/academics/curriculum')).toBe(true);
    expect(isRealRoute('post', '/v1/academics/timetable/suggest')).toBe(true);
    expect(isRealRoute('get', '/v1/academics/attendance/abc')).toBe(true);
    // Phase 3b: results (matrix, sheets, publishing, report cards, corrections) and promotion
    // are real.
    expect(isRealRoute('get', '/v1/academics/results')).toBe(true);
    expect(isRealRoute('post', '/v1/academics/results/sheets/abc/MTH/approve')).toBe(true);
    expect(isRealRoute('post', '/v1/academics/results/publish/abc')).toBe(true);
    expect(isRealRoute('post', '/v1/academics/results/report-card/abc/hold')).toBe(true);
    expect(isRealRoute('post', '/v1/academics/results/corrections/abc/reject')).toBe(true);
    expect(isRealRoute('get', '/v1/academics/promotion')).toBe(true);
    expect(isRealRoute('put', '/v1/academics/promotion/abc~def')).toBe(true);
    expect(isRealRoute('post', '/v1/academics/promotion/abc~def/apply')).toBe(true);
    // Support, the bell, the inbox and the sidebar counts are on the API.
    expect(isRealRoute('get', '/v1/nav-counts')).toBe(true);
    expect(isRealRoute('post', '/v1/support/tickets/SUP-1042/replies')).toBe(true);
    expect(isRealRoute('post', '/v1/notifications/abc/read')).toBe(true);
    // Every Settings tab is on the API.
    expect(isRealRoute('get', '/v1/settings/school')).toBe(true);
    expect(isRealRoute('put', '/v1/settings/security/rules')).toBe(true);
    expect(isRealRoute('delete', '/v1/settings/security/sessions/abc')).toBe(true);
  });
});
