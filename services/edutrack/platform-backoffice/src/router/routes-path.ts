/**
 * Every route name and path in one place. Navigate by name so paths can change without breaking
 * links: `router.push({ name: routesPath.schools.detail.name, params: { id } })`.
 */
export const routesPath = {
  auth: {
    login: { name: 'login', path: '/login' },
    forgot: { name: 'forgot-password', path: '/forgot-password' },
    forgotSent: { name: 'forgot-password-sent', path: '/forgot-password/sent' },
    reset: { name: 'reset-password', path: '/reset-password' },
    resetDone: { name: 'reset-password-done', path: '/reset-password/done' },
    acceptInvitation: { name: 'accept-invitation', path: '/accept-invitation/:token' },
  },
  dashboard: { name: 'dashboard', path: '/dashboard' },
  schools: {
    list: { name: 'schools', path: '/schools' },
    provision: { name: 'provision-school', path: '/schools/provision' },
    detail: { name: 'school', path: '/schools/:id' },
    subscription: { name: 'school-subscription', path: 'subscription' },
    administrators: { name: 'school-administrators', path: 'administrators' },
    usage: { name: 'school-usage', path: 'usage' },
    billing: { name: 'school-billing', path: 'billing' },
    activity: { name: 'school-activity', path: 'activity' },
    audit: { name: 'school-audit', path: 'audit' },
  },
  plans: {
    list: { name: 'plans', path: '/plans' },
    create: { name: 'create-plan', path: '/plans/new' },
    detail: { name: 'plan', path: '/plans/:id' },
  },
  subscriptions: { name: 'subscriptions', path: '/subscriptions' },
  users: {
    list: { name: 'users', path: '/users' },
    detail: { name: 'user', path: '/users/:id' },
    access: { name: 'user-access', path: 'access' },
    activity: { name: 'user-activity', path: 'activity' },
    security: { name: 'user-security', path: 'security' },
  },
  support: {
    list: { name: 'support', path: '/support' },
    create: { name: 'create-issue', path: '/support/new' },
    detail: { name: 'issue', path: '/support/:id' },
  },
  activity: { name: 'activity', path: '/activity' },
  audit: { name: 'audit', path: '/audit/:entryId?' },
  settings: {
    profile: { name: 'settings-profile', path: '/settings' },
    access: { name: 'settings-access', path: '/settings/access/:roleId?' },
    notifications: { name: 'settings-notifications', path: '/settings/notifications' },
    security: { name: 'settings-security', path: '/settings/security' },
    createRole: { name: 'create-role', path: '/settings/access/roles/new' },
  },
} as const;
