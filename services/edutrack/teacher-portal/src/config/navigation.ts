import { routesPath as r } from '@/router/routes-path';
import type { Me } from '@/types';

/** Who sees a group or item: class teachers, any reviewer, or reviewers of sheets / notes. */
export type NavRequirement = 'classTeacher' | 'reviewer' | 'sheetReviewer' | 'noteReviewer';

export interface NavItem {
  label: string;
  route: string;
  requires?: NavRequirement;
  /** The plan module the screen belongs to: hidden when the school's plan lacks it. */
  module?: string;
}
export interface NavGroup {
  /** Groups without a label always show their items. */
  label: string;
  requires?: NavRequirement;
  items: NavItem[];
}

const item = (
  label: string,
  route: { name: string },
  requires?: NavRequirement,
  module?: string,
): NavItem => ({ label, route: route.name, requires, module });

/** The Teacher Workspace sidebar, per the spec (§3). */
export const navigation: NavGroup[] = [
  { label: '', items: [item('Dashboard', r.dashboard)] },
  {
    label: 'Teaching',
    items: [
      item('My classes', r.teaching.classes),
      item('My subjects', r.teaching.subjects),
      item('Timetable', r.teaching.timetable, undefined, 'timetable'),
      item('Students', r.teaching.students),
    ],
  },
  {
    label: 'My class',
    requires: 'classTeacher',
    items: [
      item('Register', r.classTeacher.register),
      item('Class progress', r.classTeacher.progress, undefined, 'results'),
      item('Report cards', r.classTeacher.reportCards, undefined, 'results'),
    ],
  },
  {
    label: 'Work',
    items: [
      item('Assignments', r.assignments.list, undefined, 'homework'),
      item('Assessments', r.assessments.list),
      item('Results', r.results.list, undefined, 'results'),
      item('Materials', r.materials.list, undefined, 'homework'),
      item('Lesson notes', r.lessonNotes.list),
    ],
  },
  {
    label: 'Reviews',
    requires: 'reviewer',
    items: [
      item('Result sheets', r.reviews.results, 'sheetReviewer', 'results'),
      item('Lesson notes', r.reviews.lessonNotes, 'noteReviewer'),
    ],
  },
  {
    label: '',
    items: [
      item('Announcements', r.announcements.list),
      item('Notifications', r.notifications.list),
      item('Profile', r.profile.view),
    ],
  },
];

/** Whether the signed-in teacher meets a requirement. */
export function meets(me: Me | null | undefined, requires: NavRequirement | undefined) {
  if (!requires) return true;
  if (!me) return false;
  switch (requires) {
    case 'classTeacher':
      return me.isClassTeacher;
    case 'reviewer':
      return me.isReviewer;
    case 'sheetReviewer':
      return me.reviews.resultSheets;
    case 'noteReviewer':
      return me.reviews.lessonNotes;
  }
}

/** The sidebar for this teacher: My class only for class teachers, Reviews only for reviewers. */
export const navigationFor = (me: Me | null | undefined, modules?: string[] | null): NavGroup[] =>
  navigation
    .filter((g) => meets(me, g.requires))
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => meets(me, i.requires) && (!i.module || !modules || modules.includes(i.module)),
      ),
    }))
    .filter((g) => g.items.length);

/** Pages that highlight another sidebar item (detail pages set `meta.nav` instead). */
export const navKeyAliases: Record<string, string> = {};
