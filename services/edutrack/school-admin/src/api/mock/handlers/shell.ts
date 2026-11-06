import { mock } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';

import { academicsData } from '../academics-db';
import { contextOptions, notifications, searchIndex } from '../db';
import { currentSession, currentTerm } from './academics-shared';
import { schoolData } from '../school-db';
import { setupView } from './setup';
import { currentUser } from './shared';

/** Branch, session and term choices. Branches come from School → Branches, so they stay current. */
mock.get('/v1/context-options', (req) => {
  const schoolId = currentUser(req).schoolId;
  const base = contextOptions[schoolId]!;
  const active = schoolData[schoolId]!.branches.filter((b) => b.status === 'Active');
  const branches = [
    ...active.map((b) => ({ name: b.name, status: 'Active' as const })),
    ...(active.length > 1 ? [{ name: 'All branches', status: 'Active' as const }] : []),
  ];
  const fallback = branches[0]?.name ?? base.defaults.branch;
  // Sessions and terms come from Academics → Sessions & Terms once the school has created one.
  const acad = academicsData[schoolId]!;
  const session = currentSession(acad);
  const sessions = acad.sessions.length
    ? [...acad.sessions]
        .filter((s) => s.status !== 'Archived')
        .sort((a, b) => b.start.localeCompare(a.start))
        .map((s) => ({ name: s.name, status: s.status }))
    : base.sessions;
  return {
    ...base,
    branches,
    sessions,
    terms: session?.terms.map((t) => t.name) ?? base.terms,
    defaults: {
      ...base.defaults,
      ...(session && {
        session: session.name,
        term: currentTerm(acad)?.name ?? base.defaults.term,
      }),
      branch: branches.some((b) => b.name === base.defaults.branch)
        ? base.defaults.branch
        : fallback,
    },
  };
});

/** Counts beside sidebar items: required setup steps left, results to review, and so on. */
mock.get('/v1/nav-counts', (req) => {
  const school = currentUser(req).schoolId;
  const s = setupView(req);
  const setupLeft = s.finished ? 0 : s.steps.filter((x) => x.required && !x.done).length;
  return {
    [routesPath.setup.name]: setupLeft,
    ...(school === 'greenfield' && {
      [routesPath.finance.payments.name]: 2,
      [routesPath.inventory.requests.name]: 1,
    }),
  };
});

mock.get('/v1/notifications', (req) => notifications[currentUser(req).schoolId] ?? []);

mock.post('/v1/notifications/read-all', (req) => {
  for (const n of notifications[currentUser(req).schoolId] ?? []) n.unread = false;
  return { ok: true };
});

mock.get('/v1/search', (req) => {
  const q = (req.query.q ?? '').trim().toLowerCase();
  return (searchIndex[currentUser(req).schoolId] ?? [])
    .filter((r) => !q || `${r.title} ${r.type} ${r.meta}`.toLowerCase().includes(q))
    .slice(0, 9);
});
