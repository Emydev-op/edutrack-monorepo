import { mock } from '@edutrack/web-core/mock';

import type { AnnouncementDetail, AnnouncementSummary } from '@/types';

import { whenLabel } from '../clock';
import { ANNOUNCEMENTS, BRANCHES, type AnnouncementRecord } from '../school-db';
import { activeTerm, assignmentsOf, currentTeacher, notFound } from '../scope';

const summary = (a: AnnouncementRecord): AnnouncementSummary => ({
  id: a.id,
  title: a.title,
  summary: a.body.split('\n')[0]!.slice(0, 180),
  audience: a.audience,
  campuses: a.branchIds
    ? a.branchIds.map((id) => BRANCHES.find((b) => b.id === id)!.name).join(', ')
    : 'All campuses',
  author: a.author,
  authorRole: a.authorRole,
  publishedAt: a.publishedAt,
  when: whenLabel(a.publishedAt),
  pinned: a.pinned,
});

/** Announcements for teachers or the whole school, on the campuses the teacher works on. */
function visibleTo(teacherId: string, branchIds: string[]) {
  const campuses = new Set([
    ...branchIds,
    ...assignmentsOf(teacherId, activeTerm().id).map((a) => a.branchId),
  ]);
  return ANNOUNCEMENTS.filter((a) => !a.branchIds || a.branchIds.some((b) => campuses.has(b)));
}

mock.get('/v1/announcements', (req) => {
  const t = currentTeacher(req);
  const q = (req.query.search ?? '').trim().toLowerCase();
  return visibleTo(t.id, t.branchIds)
    .filter((a) => !q || `${a.title} ${a.body} ${a.author}`.toLowerCase().includes(q))
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt),
    )
    .map(summary);
});

mock.get('/v1/announcements/:id', (req): AnnouncementDetail => {
  const t = currentTeacher(req);
  const a =
    visibleTo(t.id, t.branchIds).find((x) => x.id === req.params.id) ??
    notFound('That announcement');
  return { ...summary(a), body: a.body };
});
