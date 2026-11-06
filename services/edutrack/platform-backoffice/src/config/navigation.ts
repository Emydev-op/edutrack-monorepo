import { routesPath } from '@/router/routes-path';

export interface NavItem {
  label: string;
  /** Route name to open, and the key matched against `route.meta.nav ?? route.name`. */
  route: string;
  /** Shows the number of open support issues beside the item. */
  badge?: 'openIssues';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  { label: '', items: [{ label: 'Dashboard', route: routesPath.dashboard.name }] },
  {
    label: 'Schools',
    items: [
      { label: 'All Schools', route: routesPath.schools.list.name },
      { label: 'Provision School', route: routesPath.schools.provision.name },
    ],
  },
  {
    label: 'Subscriptions',
    items: [
      { label: 'Plans', route: routesPath.plans.list.name },
      { label: 'Subscriptions', route: routesPath.subscriptions.name },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Users', route: routesPath.users.list.name },
      { label: 'Support', route: routesPath.support.list.name, badge: 'openIssues' },
      { label: 'Activity', route: routesPath.activity.name },
      { label: 'Audit', route: routesPath.audit.name },
      { label: 'Settings', route: routesPath.settings.profile.name },
    ],
  },
];

/** Settings tabs all highlight the one Settings item. */
export const navKeyAliases: Record<string, string> = { settings: routesPath.settings.profile.name };
