import 'vue-router';

export interface Crumb {
  label: string;
  /** Route name to link to. The last crumb is never a link. */
  to?: string;
}

declare module 'vue-router' {
  interface RouteMeta {
    /** Requires a signed-in school administrator. */
    requiresAuth?: boolean;
    /** Browser tab title. */
    title?: string;
    /** Breadcrumb trail after "School". A record view appends its own label. */
    breadcrumb?: Crumb[];
    /** Sidebar item to highlight, for nested pages. */
    nav?: string;
  }
}
