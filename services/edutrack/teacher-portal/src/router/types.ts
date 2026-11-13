import 'vue-router';

import type { NavRequirement } from '@/config/navigation';

export interface Crumb {
  label: string;
  /** Route name to link to. The last crumb is never a link. */
  to?: string;
}

declare module 'vue-router' {
  interface RouteMeta {
    /** Requires a signed-in teacher. */
    requiresAuth?: boolean;
    /** Only class teachers / reviewers may open it (see `guards.ts`). */
    requires?: NavRequirement;
    /** Browser tab title. */
    title?: string;
    /** Breadcrumb trail after "Workspace". A record view appends its own label. */
    breadcrumb?: Crumb[];
    /** Sidebar item to highlight, for nested pages. */
    nav?: string;
    /** The feature area a screen belongs to (informational). */
    owner?: string;
  }
}
