import { routesPath as r } from '@/router/routes-path';

export interface NavItem {
  label: string;
  route: string;
}
export interface NavGroup {
  /** Groups without a label always show their items. */
  label: string;
  items: NavItem[];
}

const item = (label: string, route: { name: string }): NavItem => ({ label, route: route.name });

/** The School Admin sidebar, in the design's order. */
export const navigation: NavGroup[] = [
  { label: '', items: [item('Dashboard', r.dashboard), item('Setup Center', r.setup)] },
  {
    label: 'School',
    items: [
      item('School Profile', r.school.profile),
      item('Branches', r.school.branches),
      item('Organogram', r.school.organogram),
      item('Users & Roles', r.school.users),
    ],
  },
  {
    label: 'Academics',
    items: [
      item('Sessions & Terms', r.academics.sessions),
      item('Academic Calendar', r.academics.calendar),
      item('Classes & Arms', r.academics.classes),
      item('Subjects & Curriculum', r.academics.subjects),
      item('Teacher Assignments', r.academics.assignments),
      item('Timetable', r.academics.timetable),
      item('Assessments & Grading', r.academics.assessments),
      item('Results', r.academics.results),
      item('Promotion', r.academics.promotion),
    ],
  },
  {
    label: 'Students',
    items: [
      item('Students', r.students.list),
      item('Admissions', r.students.admissions),
      item('Enrollment', r.students.enrollment),
      item('Parents / Guardians', r.students.parents),
    ],
  },
  {
    label: 'Staff',
    items: [item('Staff Directory', r.staff.directory), item('Teachers', r.staff.teachers)],
  },
  {
    label: 'Finance',
    items: [
      item('Overview', r.finance.overview),
      item('Bank & Cash Accounts', r.finance.accounts),
      item('Fees', r.finance.fees),
      item('Invoices', r.finance.invoices),
      item('Payments', r.finance.payments),
      item('Expenses', r.finance.expenses),
      item('Vendors', r.finance.vendors),
      item('Payroll', r.finance.payroll),
    ],
  },
  {
    label: 'Inventory',
    items: [
      item('Items & Stock', r.inventory.items),
      item('Requests & Transfers', r.inventory.requests),
      item('Stock Count', r.inventory.count),
    ],
  },
  { label: 'Resources', items: [item('Learning Materials', r.materials)] },
  {
    label: 'Communication',
    items: [
      item('Announcements', r.communication.announcements),
      item('Notifications', r.communication.notifications),
      item('Delivery Logs', r.communication.delivery),
    ],
  },
  {
    label: '',
    items: [item('Reports', r.reports), item('Settings', r.settings), item('Support', r.support)],
  },
];

/** Pages that highlight another sidebar item (e.g. Import students → Students). */
export const navKeyAliases: Record<string, string> = {
  [r.students.import.name]: r.students.list.name,
  [r.students.admit.name]: r.students.admissions.name,
};
