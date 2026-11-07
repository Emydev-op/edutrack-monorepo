import {
  BookCheckIcon,
  FileSpreadsheetIcon,
  HandCoinsIcon,
  MegaphoneIcon,
  PackageIcon,
  ReceiptIcon,
  UserPlusIcon,
  UsersIcon,
} from '@lucide/vue';

import { routesPath as r } from '@/router/routes-path';

/** The design's eight shortcuts for a school administrator's day. */
export const QUICK_ACTIONS = [
  { label: 'Admit student', icon: UserPlusIcon, to: { name: r.students.admissions.name } },
  { label: 'Import students', icon: FileSpreadsheetIcon, to: { name: r.students.import.name } },
  { label: 'Add staff', icon: UsersIcon, to: { name: r.staff.directory.name } },
  { label: 'Create invoice', icon: ReceiptIcon, to: { name: r.finance.invoiceGenerate.name } },
  { label: 'Record payment', icon: HandCoinsIcon, to: { name: r.finance.paymentNew.name } },
  { label: 'Review results', icon: BookCheckIcon, to: { name: r.academics.results.name } },
  {
    label: 'New announcement',
    icon: MegaphoneIcon,
    to: { name: r.communication.announcementNew.name },
  },
  { label: 'Raise stock request', icon: PackageIcon, to: { name: r.inventory.requests.name } },
];

/** First steps for a school with no data yet. */
export const FIRST_STEPS = [
  {
    title: 'Create your academic session',
    text: 'Session dates, terms and breaks',
    to: { name: r.academics.sessions.name },
  },
  {
    title: 'Set up classes & arms',
    text: 'Sections, class levels and arms',
    to: { name: r.academics.classes.name },
  },
  { title: 'Add staff', text: 'Teachers and office staff', to: { name: r.staff.directory.name } },
  {
    title: 'Import students',
    text: 'Upload a CSV or Excel file',
    to: { name: r.students.import.name },
  },
];
