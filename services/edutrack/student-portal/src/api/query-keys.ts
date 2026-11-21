/** Query keys, one family per resource (all the signed-in student's own). */
export const queryKeys = {
  overview: ['overview'] as const,
  home: ['home'] as const,
  results: (term?: string) => ['results', term ?? 'current'] as const,
  homework: ['homework'] as const,
  materials: ['materials'] as const,
  timetable: ['timetable'] as const,
  attendance: (term?: string) => ['attendance', term ?? 'current'] as const,
  announcements: ['announcements'] as const,
  notifications: (filter: string) => ['notifications', filter] as const,
  notificationsAll: ['notifications'] as const,
  profile: ['profile'] as const,
};
