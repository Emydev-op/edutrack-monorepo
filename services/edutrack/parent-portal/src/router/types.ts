import 'vue-router';

import type { PortalTab } from './routes-path';

declare module 'vue-router' {
  interface RouteMeta {
    /** Requires a signed-in parent. */
    requiresAuth?: boolean;
    /** Browser tab title. */
    title?: string;
    /** The tab to highlight (screens reached from More highlight More). */
    tab?: PortalTab;
    /** The screen is about one child (the switcher shows under the header). */
    perChild?: boolean;
  }
}
