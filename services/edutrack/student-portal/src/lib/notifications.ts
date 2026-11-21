import type { RouteLocationRaw } from 'vue-router';

import { routesPath } from '@/router/routes-path';
import type { StudentNotification } from '@/types';

const BY_PATH: [RegExp, string][] = [
  [/^\/results/, routesPath.results.name],
  [/^\/attendance/, routesPath.attendance.name],
  [/^\/announcements/, routesPath.announcements.name],
  [/^\/timetable/, routesPath.timetable.name],
  [/^\/materials/, routesPath.materials.name],
  [/^\/assignments\/?$/, routesPath.assignments.list.name],
];

/** Where a notification opens: its link inside this portal (an assignment, Results…), else Home. */
export function notificationTarget(n: Pick<StudentNotification, 'to'>): RouteLocationRaw {
  const assignment = /^\/assignments\/([^/?#]+)/.exec(n.to ?? '');
  if (assignment)
    return { name: routesPath.assignments.detail.name, params: { assignmentId: assignment[1]! } };
  const found = BY_PATH.find(([re]) => re.test(n.to ?? ''));
  return { name: found?.[1] ?? routesPath.home.name };
}
