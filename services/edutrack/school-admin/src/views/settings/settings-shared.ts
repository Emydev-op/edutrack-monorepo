import { onBeforeRouteUpdate, type RouteLocationRaw } from 'vue-router';
import { toValue, type MaybeRefOrGetter } from 'vue';

import { useConfirm } from '@edutrack/app-kit/composables/useConfirm';
import { useUnsavedChanges } from '@edutrack/app-kit/composables/useUnsavedChanges';

import { routesPath } from '@/router/routes-path';

/** Support categories, as the Support form lists them. */
export type SupportCategory =
  | 'Results & report cards'
  | 'Fees & payments'
  | 'Communication'
  | 'Students & admissions'
  | 'Account & billing'
  | 'Something else';

/** Opens a new support ticket with the category, subject and description filled in. */
export const supportLink = (
  category: SupportCategory,
  subject: string,
  description = '',
): RouteLocationRaw => ({
  name: routesPath.supportNew.name,
  query: { category, subject, ...(description && { description }) },
});

/**
 * Settings tabs share one route, so switching tab is a route update, not a leave. This asks
 * before either while a tab has unsaved edits.
 */
export function useSettingsDirtyGuard(dirty: MaybeRefOrGetter<boolean>) {
  useUnsavedChanges(dirty);
  const confirm = useConfirm();
  onBeforeRouteUpdate(async (to, from) => {
    if (!toValue(dirty) || to.query.tab === from.query.tab) return true;
    return confirm({
      title: 'Leave without saving?',
      description:
        'Your changes on this tab haven’t been saved. If you switch now they’ll be lost.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      tone: 'destructive',
    });
  });
}

/** "12 Sep 2026, 09:05" from an ISO date-time. */
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
