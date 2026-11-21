import 'vue-router';

import type { PortalTab } from './routes-path';

declare module 'vue-router' {
  interface RouteMeta {
    /** Requires a signed-in student. */
    requiresAuth?: boolean;
    /** Browser tab title. */
    title?: string;
    /** The tab to highlight (screens reached from More highlight More). */
    tab?: PortalTab;
  }
}
