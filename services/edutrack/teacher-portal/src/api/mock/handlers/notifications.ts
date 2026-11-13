import { mock, MockHttpError, paginate } from '@edutrack/web-core/mock';

import type { EmailPreference, NotificationItem } from '@/types';

import { whenLabel } from '../clock';
import {
  EMAIL_EVENTS,
  NOTIFICATIONS,
  emailPreferencesOf,
  notificationsOf,
  setEmailPreferences,
  type NotificationRecord,
} from '../notify-db';
import { currentTeacher } from '../scope';

const item = ({ teacherId: _teacherId, ...n }: NotificationRecord): NotificationItem => ({
  ...n,
  when: whenLabel(n.createdAt),
});

/** `?filter=unread|all&page&pageSize` */
mock.get('/v1/notifications', (req) => {
  const t = currentTeacher(req);
  const all = notificationsOf(t.id);
  const rows = req.query.filter === 'unread' ? all.filter((n) => !n.read) : all;
  const { data, meta } = paginate(
    rows,
    { pageSize: '20', ...req.query, search: '' },
    (n) => n.title,
  );
  return {
    rows: data.map(item),
    meta,
    unread: all.filter((n) => !n.read).length,
    total: all.length,
  };
});

mock.post('/v1/notifications/read-all', (req) => {
  const t = currentTeacher(req);
  let marked = 0;
  for (const n of NOTIFICATIONS)
    if (n.teacherId === t.id && !n.read) {
      n.read = true;
      marked++;
    }
  return { marked };
});

mock.post('/v1/notifications/:id/read', (req) => {
  const t = currentTeacher(req);
  const n = NOTIFICATIONS.find((x) => x.id === req.params.id && x.teacherId === t.id);
  if (!n) throw new MockHttpError(404, 'That notification wasn’t found.', 'NOT_FOUND');
  n.read = true;
  return item(n);
});

const preferenceRows = (teacherId: string): EmailPreference[] => {
  const prefs = emailPreferencesOf(teacherId);
  return EMAIL_EVENTS.map((e) => ({
    key: e.key,
    label: e.label,
    description: e.description,
    enabled: prefs[e.key],
  }));
};

mock.get('/v1/notifications/preferences', (req) => preferenceRows(currentTeacher(req).id));

/** Body: `{ [eventKey]: boolean }`. In-app notifications are always on. */
mock.put('/v1/notifications/preferences', (req) => {
  const t = currentTeacher(req);
  setEmailPreferences(t.id, (req.body ?? {}) as Record<string, boolean>);
  return preferenceRows(t.id);
});
