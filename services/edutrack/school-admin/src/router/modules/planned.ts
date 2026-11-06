import type { RouteRecordRaw } from 'vue-router';

import { navigation } from '@/config/navigation';

import { routesPath } from '../routes-path';

/** Screens already built; every other sidebar item opens the "later phase" page. */
const BUILT = new Set<string>([
  routesPath.dashboard.name,
  routesPath.setup.name,
  routesPath.school.profile.name,
  routesPath.school.branches.name,
  routesPath.school.organogram.name,
  routesPath.school.users.name,
  routesPath.academics.sessions.name,
  routesPath.academics.calendar.name,
  routesPath.academics.classes.name,
  routesPath.academics.subjects.name,
  routesPath.academics.assignments.name,
  routesPath.academics.timetable.name,
  routesPath.academics.assessments.name,
  routesPath.academics.results.name,
  routesPath.academics.promotion.name,
  routesPath.students.list.name,
  routesPath.students.admissions.name,
  routesPath.students.enrollment.name,
  routesPath.students.parents.name,
]);

/** Paths for every route name in routesPath, so planned screens keep their final URLs. */
function pathsByName(node: unknown, out = new Map<string, string>()) {
  if (node && typeof node === 'object') {
    const { name, path } = node as { name?: unknown; path?: unknown };
    if (typeof name === 'string' && typeof path === 'string') out.set(name, path);
    else Object.values(node).forEach((child) => pathsByName(child, out));
  }
  return out;
}
const PATHS = pathsByName(routesPath);

/** Placeholder routes for sidebar screens that later phases of the conversion will build. */
export const plannedRoutes: RouteRecordRaw[] = navigation
  .flatMap((group) =>
    group.items
      .filter((i) => !BUILT.has(i.route))
      .map((i) => ({ ...i, section: group.label || i.label })),
  )
  .map(({ label, route, section }) => ({
    name: route,
    path: PATHS.get(route)!,
    component: () => import('@/views/PlannedView.vue'),
    meta: {
      title: label,
      breadcrumb: section === label ? [{ label }] : [{ label: section }, { label }],
    },
  }));
