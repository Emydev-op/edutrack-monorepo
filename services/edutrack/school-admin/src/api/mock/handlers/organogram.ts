import { mock, MockHttpError } from '@edutrack/web-core/mock';

import type { PositionPayload } from '@/types';

import type { PositionRow, SchoolData } from '../school-db';
import { historyOf, requireText, schoolDataFor } from './shared';

const toPosition = (data: SchoolData) => (p: PositionRow) => ({
  ...p,
  holderNames: p.holderIds.map((id) => data.staff.find((s) => s.id === id)?.name ?? id),
});

const chart = (data: SchoolData) => ({
  positions: data.positions.map(toPosition(data)),
  history: historyOf(data, 'Org'),
});

mock.get('/v1/organogram', (req) => chart(schoolDataFor(req).data));

/** Every position under `id`, so a position can't report to its own report. */
function descendants(data: SchoolData, id: string, out = new Set<string>()) {
  for (const p of data.positions)
    if (p.parentId === id && !out.has(p.id)) {
      out.add(p.id);
      descendants(data, p.id, out);
    }
  return out;
}

function validate(data: SchoolData, p: PositionPayload, currentId?: string) {
  const title = requireText(p.title, 'Enter the position title.');
  if (
    data.positions.some((x) => x.id !== currentId && x.title.toLowerCase() === title.toLowerCase())
  )
    throw new MockHttpError(422, 'This position already exists.');
  if (!p.parentId && data.positions.some((x) => !x.parentId && x.id !== currentId))
    throw new MockHttpError(
      422,
      'Only one position can be at the top. Choose who this reports to.',
    );
  if (p.parentId) {
    if (!data.positions.some((x) => x.id === p.parentId))
      throw new MockHttpError(422, 'Choose who this position reports to.');
    if (currentId && (p.parentId === currentId || descendants(data, currentId).has(p.parentId)))
      throw new MockHttpError(
        422,
        'A position can’t report to itself or to one of its own reports.',
      );
  }
  if (p.holderIds?.some((id) => !data.staff.some((s) => s.id === id && !s.left)))
    throw new MockHttpError(422, 'Holders must be current staff.');
  return title;
}

const record = (p: PositionPayload, title: string) => ({
  title,
  parentId: p.parentId || null,
  holderIds: p.holderIds ?? [],
  suggestedRoles: p.suggestedRoles ?? [],
  responsibilities: (p.responsibilities ?? '').trim(),
  approvals: p.approvals ?? [],
});

mock.post('/v1/organogram/positions', (req) => {
  const { data, log } = schoolDataFor(req);
  const p = req.body as PositionPayload;
  const row = { id: `p${Date.now().toString(36)}`, ...record(p, validate(data, p)) };
  data.positions.push(row);
  const parent = data.positions.find((x) => x.id === row.parentId)?.title ?? 'top';
  log('Org', `Added position · ${row.title}`, `reports to ${parent}`);
  return toPosition(data)(row);
});

mock.patch('/v1/organogram/positions/:id', (req) => {
  const { data, log } = schoolDataFor(req);
  const row = data.positions.find((x) => x.id === req.params.id);
  if (!row) throw new MockHttpError(404, 'This position doesn’t exist');
  const p = req.body as PositionPayload;
  Object.assign(row, record(p, validate(data, p, row.id)));
  log('Org', `Updated position · ${row.title}`);
  return toPosition(data)(row);
});

mock.delete('/v1/organogram/positions/:id', (req) => {
  const { data, log } = schoolDataFor(req);
  const row = data.positions.find((x) => x.id === req.params.id);
  if (!row) throw new MockHttpError(404, 'This position doesn’t exist');
  if (!row.parentId) throw new MockHttpError(409, 'The top position can’t be removed.');
  const reports = data.positions.filter((x) => x.parentId === row.id);
  if (reports.length)
    throw new MockHttpError(
      409,
      `${reports.map((x) => x.title).join(', ')} report${reports.length === 1 ? 's' : ''} to ${row.title}. Move them first.`,
    );
  data.positions = data.positions.filter((x) => x !== row);
  log('Org', `Removed position · ${row.title}`);
  return { ok: true };
});
