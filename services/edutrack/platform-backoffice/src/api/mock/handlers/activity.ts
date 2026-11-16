import { activity, auditLog } from '../db';
import { inDateRange, mock, MockHttpError, paginate } from '@edutrack/web-core/mock';

mock.get('/v1/platform/activity', ({ query }) => {
  const rows = activity.filter(
    (a) =>
      (!query.actor || a.actor === query.actor) &&
      (!query.entity || a.entity === query.entity) &&
      (!query.schoolName || a.schoolName === query.schoolName) &&
      inDateRange(a.when, query.dateFrom, query.dateTo),
  );
  return paginate(rows, query, (a) => `${a.summary} ${a.actor} ${a.schoolName}`);
});

mock.get('/v1/platform/activity/recent', () => activity.slice(0, 6));

mock.get('/v1/platform/audit', ({ query }) => {
  const rows = auditLog.filter(
    (e) =>
      (!query.actor || e.actor === query.actor) &&
      (!query.entity || e.entity === query.entity) &&
      inDateRange(e.timestamp, query.dateFrom, query.dateTo),
  );
  return paginate(rows, query, (e) => `${e.actor} ${e.action} ${e.entityId}`);
});

mock.get('/v1/platform/audit/actors', () =>
  [...new Set([...activity.map((a) => a.actor), ...auditLog.map((e) => e.actor)])].sort((a, b) =>
    a.localeCompare(b),
  ),
);

mock.get('/v1/platform/audit/:id', ({ params }) => {
  const entry = auditLog.find((e) => e.id === params.id);
  if (!entry) throw new MockHttpError(404, 'Audit entry not found');
  return entry;
});
