/**
 * Every TanStack Query key in the app. Keys are hierarchical so a mutation can invalidate a whole
 * area (`queryKeys.schools.all`) or a single record (`queryKeys.schools.detail(id)`).
 */
export const queryKeys = {
  me: ['me'] as const,
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => [...queryKeys.dashboard.all, 'summary'] as const,
    revenue: (range: string) => [...queryKeys.dashboard.all, 'revenue', range] as const,
    growth: (range: string) => [...queryKeys.dashboard.all, 'growth', range] as const,
    attention: () => [...queryKeys.dashboard.all, 'attention'] as const,
    health: () => [...queryKeys.dashboard.all, 'health'] as const,
    onboarding: () => [...queryKeys.dashboard.all, 'onboarding'] as const,
  },
  schools: {
    all: ['schools'] as const,
    list: (params: object) => [...queryKeys.schools.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.schools.all, 'detail', id] as const,
    section: (id: string, section: string) => [...queryKeys.schools.detail(id), section] as const,
  },
  subscriptions: {
    all: ['subscriptions'] as const,
    list: (params: object) => [...queryKeys.subscriptions.all, 'list', params] as const,
  },
  plans: {
    all: ['plans'] as const,
    list: () => [...queryKeys.plans.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.plans.all, 'detail', id] as const,
    schools: (id: string) => [...queryKeys.plans.detail(id), 'schools'] as const,
  },
  users: {
    all: ['users'] as const,
    list: (params: object) => [...queryKeys.users.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.users.all, 'detail', id] as const,
    section: (id: string, section: string) => [...queryKeys.users.detail(id), section] as const,
  },
  roles: { all: ['roles'] as const },
  support: {
    all: ['support'] as const,
    summary: () => [...queryKeys.support.all, 'summary'] as const,
    list: (params: object) => [...queryKeys.support.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.support.all, 'detail', id] as const,
  },
  activity: {
    all: ['activity'] as const,
    list: (params: object) => [...queryKeys.activity.all, 'list', params] as const,
    recent: () => [...queryKeys.activity.all, 'recent'] as const,
  },
  audit: {
    all: ['audit'] as const,
    list: (params: object) => [...queryKeys.audit.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.audit.all, 'detail', id] as const,
  },
  settings: {
    profile: ['settings', 'profile'] as const,
    notifications: ['settings', 'notifications'] as const,
    security: ['settings', 'security'] as const,
  },
  search: (q: string) => ['search', q] as const,
  notifications: ['notifications'] as const,
  invitation: (token: string) => ['invitation', token] as const,
};
