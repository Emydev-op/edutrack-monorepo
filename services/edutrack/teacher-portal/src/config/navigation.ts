import { routesPath as r } from '@/router/routes-path';
import type { Me } from '@/types';

/**
 * Who sees a group, item or page: class teachers, reviewers, teaching staff, or boarding staff
 * with the matching `me.boarding` flag.
 */
export type NavRequirement =
  | 'classTeacher'
  | 'reviewer'
  | 'sheetReviewer'
  | 'noteReviewer'
  /** Teaching staff: false for boarding-only staff (house staff, matrons, nurses, gate). */
  | 'teaches'
  /** Any boarding access (`boarding.view`). */
  | 'boarding'
  | 'houseStaff'
  | 'rollcall'
  | 'exeats'
  | 'gate'
  | 'health';

export interface NavItem {
  label: string;
  route: string;
  requires?: NavRequirement;
  /** The plan module the screen belongs to: hidden when the school's plan lacks it. */
  module?: string;
  /** Only for house staff (the my-hostel query returns at least one hostel). */
  houseStaff?: boolean;
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

/** The workspace sidebar, per the spec (§3), plus Boarding for boarding staff. */
export const navigation: NavGroup[] = [
  { label: '', requires: 'teaches', items: [item('Dashboard', r.dashboard)] },
  {
    label: 'Teaching',
    requires: 'teaches',
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
    requires: 'teaches',
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
    label: 'Boarding',
    items: [
      item('Overview', r.boarding.overview, 'boarding'),
      { ...item('My hostel', r.boarding.myHostel), houseStaff: true },
      item('Roll call', r.boarding.rollCalls, 'rollcall'),
      item('Exeats', r.boarding.exeats, 'exeats'),
      item('Gate', r.boarding.gate, 'gate'),
      item('Sick bay', r.boarding.sickBay, 'health'),
      item('Incidents', r.boarding.incidents, 'rollcall'),
    ],
  },
  {
    label: '',
    items: [
      item('Messages', r.messages.list),
      item('Announcements', r.announcements.list),
      item('Notifications', r.notifications.list),
      item('Profile', r.profile.view),
    ],
  },
];

/** Teaching applies unless `/v1/me` says otherwise (older responses and the mock teach). */
export const teaches = (me: Me | null | undefined) => me?.teaches !== false;

/** Whether the signed-in staff member meets a requirement. */
export function meets(me: Me | null | undefined, requires: NavRequirement | undefined) {
  if (!requires) return true;
  if (!me) return false;
  const b = me.boarding;
  switch (requires) {
    case 'classTeacher':
      return me.isClassTeacher;
    case 'reviewer':
      return me.isReviewer;
    case 'sheetReviewer':
      return me.reviews.resultSheets;
    case 'noteReviewer':
      return me.reviews.lessonNotes;
    case 'teaches':
      return teaches(me);
    case 'boarding':
      return Boolean(b?.view || b?.houseStaff);
    case 'houseStaff':
      return Boolean(b?.houseStaff);
    case 'rollcall':
      return Boolean(b?.rollcall);
    // House staff decide their own hostel’s exeats without the Exeats permission.
    case 'exeats':
      return Boolean(b?.exeats || b?.houseStaff);
    case 'gate':
      return Boolean(b?.gate);
    case 'health':
      return Boolean(b?.health);
  }
}

/**
 * The sidebar for this staff member: teaching groups only for teaching staff, My class only for
 * class teachers, Reviews only for reviewers, and the Boarding items their boarding flags allow
 * (My hostel also shows when the my-hostel query finds a hostel).
 */
export const navigationFor = (
  me: Me | null | undefined,
  modules?: string[] | null,
  houseStaff = false,
): NavGroup[] =>
  navigation
    .filter((g) => meets(me, g.requires))
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          meets(me, i.requires) &&
          (!i.houseStaff || houseStaff || Boolean(me?.boarding?.houseStaff)) &&
          (!i.module || !modules || modules.includes(i.module)),
      ),
    }))
    .filter((g) => g.items.length);

/** Pages that highlight another sidebar item (detail pages set `meta.nav` instead). */
export const navKeyAliases: Record<string, string> = {};
