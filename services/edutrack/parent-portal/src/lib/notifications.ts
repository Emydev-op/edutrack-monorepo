import type { RouteLocationRaw } from 'vue-router';

import { routesPath } from '@/router/routes-path';
import type { ParentNotification } from '@/types';

const BY_PATH: [RegExp, string][] = [
  [/^\/fees/, routesPath.fees.view.name],
  [/^\/results/, routesPath.results.name],
  [/^\/attendance/, routesPath.attendance.name],
  [/^\/announcements/, routesPath.announcements.name],
  [/^\/timetable/, routesPath.timetable.name],
  [/^\/materials/, routesPath.materials.name],
];

/**
 * Where a notification opens: its link inside this portal (an assignment, Fees, Results…), with
 * `?child=` when it is about one child so the switcher follows.
 */
export function notificationTarget(
  n: Pick<ParentNotification, 'to' | 'childId'>,
): RouteLocationRaw {
  const query = n.childId ? { child: n.childId } : {};
  const assignment = /^\/assignments\/([^/?#]+)/.exec(n.to);
  if (assignment)
    return {
      name: routesPath.assignments.detail.name,
      params: { assignmentId: assignment[1]! },
      query,
    };
  const found = BY_PATH.find(([re]) => re.test(n.to));
  return { name: found?.[1] ?? routesPath.home.name, query };
}
