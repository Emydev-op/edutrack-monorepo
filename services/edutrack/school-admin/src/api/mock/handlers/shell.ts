import { mock } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type { SearchResult } from '@/types';

import { academicsData } from '../academics-db';
import { contextOptions, notifications, searchIndex } from '../db';
import { currentSession, currentTerm } from './academics-shared';
import { schoolData } from '../school-db';
import { setupView } from './setup';
import { financeSnapshot } from './finance-shared';
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
    [routesPath.finance.payments.name]: financeSnapshot(school).fin.payments.filter(
      (p) => p.status === 'Pending verification',
    ).length,
    ...(school === 'greenfield' && { [routesPath.inventory.requests.name]: 1 }),
  };
});

mock.get('/v1/notifications', (req) => notifications[currentUser(req).schoolId] ?? []);

mock.post('/v1/notifications/read-all', (req) => {
  for (const n of notifications[currentUser(req).schoolId] ?? []) n.unread = false;
  return { ok: true };
});

mock.get('/v1/search', (req) => {
  const q = (req.query.q ?? '').trim().toLowerCase();
  const school = currentUser(req).schoolId;
  const fixed = (searchIndex[school] ?? []).filter(
    (r) => !q || `${r.title} ${r.type} ${r.meta}`.toLowerCase().includes(q),
  );
  return [...fixed, ...(q.length >= 3 ? financeSearch(school, q) : [])].slice(0, 9);
});

/** Invoices, receipts and vendors matching a search, straight from Finance. */
function financeSearch(schoolId: string, q: string): SearchResult[] {
  const snap = financeSnapshot(schoolId);
  const out: SearchResult[] = [];
  for (const inv of snap.fin.invoices) {
    if (out.length >= 4) break;
    const s = snap.students.get(inv.studentKey);
    if (!`${inv.no} ${s?.name ?? ''}`.toLowerCase().includes(q) || !inv.no) continue;
    const st = snap.ledger.invoice(inv.id);
    out.push({
      id: `inv-${inv.id}`,
      type: 'Invoice',
      title: inv.no,
      meta: `${s?.name ?? ''} · ₦${st.total.toLocaleString('en-NG')} · ${st.status}`,
      to: { name: routesPath.finance.invoiceDetail.name, params: { id: inv.id } },
    });
  }
  for (const p of snap.fin.payments) {
    if (out.length >= 6) break;
    if (!p.no.toLowerCase().includes(q) && !p.reference.toLowerCase().includes(q)) continue;
    out.push({
      id: `pay-${p.id}`,
      type: 'Payment',
      title: p.no,
      meta: `${snap.students.get(p.studentKey)?.name ?? ''} · ₦${p.amount.toLocaleString('en-NG')} · ${p.status}`,
      to: { name: routesPath.finance.paymentDetail.name, params: { id: p.id } },
    });
  }
  for (const v of snap.fin.vendors) {
    if (out.length >= 8) break;
    if (!v.name.toLowerCase().includes(q)) continue;
    out.push({
      id: `ven-${v.id}`,
      type: 'Vendor',
      title: v.name,
      meta: v.category,
      to: { name: routesPath.finance.vendorDetail.name, params: { id: v.id } },
    });
  }
  return out;
}
