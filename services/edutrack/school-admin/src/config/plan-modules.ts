import { PLAN_MODULES } from '@edutrack/shared';
import { computed } from 'vue';

import { useAuthStore } from '@/stores/auth';

/**
 * Which plan module each School Admin page belongs to. Pages outside the school's plan stay in
 * the sidebar with a lock and open on an "upgrade your plan" screen, so schools see what exists.
 */
export const ROUTE_MODULE: Record<string, string> = Object.fromEntries(
  (
    [
      ['subjects', ['subjects', 'curriculum', 'elective-groups']],
      ['assign', ['teacher-assignments']],
      ['timetable', ['timetable', 'class-timetable']],
      ['assess', ['assessments', 'grading-scales']],
      ['results', ['results', 'result-sheet', 'report-card', 'corrections', 'class-results']],
      ['promotion', ['promotion']],
      [
        'fees',
        [
          'finance',
          'finance-report',
          'bank-accounts',
          'bank-account',
          'bank-statement',
          'fees',
          'fee-structure',
          'invoices',
          'invoices-generate',
          'invoice',
          'student-account',
          'payments',
          'payment-new',
          'payment',
          'refund',
          'student-fees',
          'branch-finance',
        ],
      ],
      ['expenses', ['expenses', 'expense', 'vendors', 'vendor']],
      ['payroll', ['payroll']],
      ['inventory', ['inventory-items', 'stock-requests', 'stock-count']],
      ['homework', ['learning-materials']],
      [
        'announce',
        [
          'announcements',
          'announcement-new',
          'announcement',
          'announcement-edit',
          'delivery-logs',
          'delivery',
          'message-template',
        ],
      ],
      ['reports', ['reports', 'report']],
      ['student', ['student-login-slips']],
    ] as const
  ).flatMap(([module, routes]) => routes.map((r) => [r, module])),
);

export const planModule = (id: string) => PLAN_MODULES.find((m) => m.id === id);

/** The signed-in school's plan modules; a session from before modules were sent locks nothing. */
export function usePlanModules() {
  const auth = useAuthStore();
  const modules = computed(() => auth.school?.modules ?? null);
  const has = (id: string | undefined) => !id || !modules.value || modules.value.includes(id);
  /** The module a page needs when the plan lacks it, else null. */
  const lockedFor = (routeName: unknown) => {
    const id = typeof routeName === 'string' ? ROUTE_MODULE[routeName] : undefined;
    return id && !has(id) ? id : null;
  };
  return { modules, has, lockedFor };
}
