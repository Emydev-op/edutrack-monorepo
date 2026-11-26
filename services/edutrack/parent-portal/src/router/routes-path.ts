/**
 * Every route name and path in the Parent Portal. Navigate by name so paths can change without
 * breaking links: `router.push({ name: routesPath.fees.pay.name })`. Child screens show the child
 * picked in the switcher; `?child=<id>` (from a notification) switches to that child first.
 */
export const routesPath = {
  auth: {
    login: { name: 'login', path: '/login' },
    forgot: { name: 'forgot-password', path: '/forgot-password' },
    forgotSent: { name: 'forgot-password-sent', path: '/forgot-password/sent' },
    reset: { name: 'reset-password', path: '/reset-password' },
    resetDone: { name: 'reset-password-done', path: '/reset-password/done' },
    passwordExpired: { name: 'password-expired', path: '/password-expired' },
    acceptInvitation: { name: 'accept-invitation', path: '/accept-invitation/:token' },
  },
  home: { name: 'home', path: '/home' },
  children: { name: 'children', path: '/children' },
  fees: {
    view: { name: 'fees', path: '/fees' },
    pay: { name: 'fees-pay', path: '/fees/pay' },
  },
  results: { name: 'results', path: '/results' },
  assignments: {
    list: { name: 'assignments', path: '/assignments' },
    detail: { name: 'assignment', path: '/assignments/:assignmentId' },
  },
  timetable: { name: 'timetable', path: '/timetable' },
  materials: { name: 'materials', path: '/materials' },
  attendance: { name: 'attendance', path: '/attendance' },
  // Boarding notifications link here: keep the path `/boarding`.
  boarding: { name: 'boarding', path: '/boarding' },
  announcements: { name: 'announcements', path: '/announcements' },
  messages: {
    list: { name: 'messages', path: '/messages' },
    create: { name: 'message-new', path: '/messages/new' },
    // Message emails link here: keep the path `/messages/:id`.
    thread: { name: 'message', path: '/messages/:id' },
  },
  notifications: { name: 'notifications', path: '/notifications' },
  profile: { name: 'profile', path: '/profile' },
  more: { name: 'more', path: '/more' },
} as const;

/** The tabs: bottom bar on a phone, top tabs on a wider screen. */
export type PortalTab = 'home' | 'fees' | 'results' | 'assignments' | 'more';

export const TABS: { key: PortalTab; label: string; route: string }[] = [
  { key: 'home', label: 'Home', route: routesPath.home.name },
  { key: 'fees', label: 'Fees', route: routesPath.fees.view.name },
  { key: 'results', label: 'Results', route: routesPath.results.name },
  { key: 'assignments', label: 'Assignments', route: routesPath.assignments.list.name },
  { key: 'more', label: 'More', route: routesPath.more.name },
];

/** Tabs that belong to a plan module: hidden when the school's plan lacks it. */
export const TAB_MODULE: Partial<Record<PortalTab, string>> = {
  fees: 'fees',
  results: 'results',
  assignments: 'homework',
};

/** The tabs the school's plan includes. */
export const tabsFor = (modules?: string[] | null) =>
  TABS.filter((t) => {
    const m = TAB_MODULE[t.key];
    return !m || !modules || modules.includes(m);
  });
