/**
 * Query keys, one family per resource. Child screens key by child and term so switching child
 * shows that child's cached data at once.
 */
export const queryKeys = {
  overview: ['overview'] as const,
  invitation: (token: string) => ['invitation', token] as const,
  child: (id: string) => ['child', id] as const,
  home: (id: string) => ['child', id, 'home'] as const,
  fees: (id: string) => ['child', id, 'fees'] as const,
  results: (id: string, term?: string) => ['child', id, 'results', term ?? 'current'] as const,
  homework: (id: string) => ['child', id, 'homework'] as const,
  materials: (id: string) => ['child', id, 'materials'] as const,
  timetable: (id: string) => ['child', id, 'timetable'] as const,
  attendance: (id: string, term?: string) =>
    ['child', id, 'attendance', term ?? 'current'] as const,
  boarding: (id: string) => ['child', id, 'boarding'] as const,
  announcements: ['announcements'] as const,
  notifications: (filter: string) => ['notifications', filter] as const,
  notificationsAll: ['notifications'] as const,
  profile: ['profile'] as const,
  preferences: ['preferences'] as const,
  messages: ['messages', 'list'] as const,
  messageContacts: ['messages', 'contacts'] as const,
  thread: (id: string) => ['messages', 'thread', id] as const,
};
