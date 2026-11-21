/**
 * Every route name and path in the Student Portal. Navigate by name so paths can change without
 * breaking links: `router.push({ name: routesPath.results.name })`.
 */
export const routesPath = {
  auth: {
    login: { name: 'login', path: '/login' },
    passwordExpired: { name: 'password-expired', path: '/password-expired' },
  },
  home: { name: 'home', path: '/home' },
  timetable: { name: 'timetable', path: '/timetable' },
  assignments: {
    list: { name: 'assignments', path: '/assignments' },
    detail: { name: 'assignment', path: '/assignments/:assignmentId' },
  },
  results: { name: 'results', path: '/results' },
  materials: { name: 'materials', path: '/materials' },
  attendance: { name: 'attendance', path: '/attendance' },
  announcements: { name: 'announcements', path: '/announcements' },
  notifications: { name: 'notifications', path: '/notifications' },
  profile: { name: 'profile', path: '/profile' },
  more: { name: 'more', path: '/more' },
} as const;

/** The tabs: bottom bar on a phone, top tabs on a wider screen. */
export type PortalTab = 'home' | 'timetable' | 'assignments' | 'results' | 'more';

export const TABS: { key: PortalTab; label: string; route: string }[] = [
  { key: 'home', label: 'Home', route: routesPath.home.name },
  { key: 'timetable', label: 'Timetable', route: routesPath.timetable.name },
  { key: 'assignments', label: 'Assignments', route: routesPath.assignments.list.name },
  { key: 'results', label: 'Results', route: routesPath.results.name },
  { key: 'more', label: 'More', route: routesPath.more.name },
];
