import { useEventListener } from '@vueuse/core';
import { toValue, type MaybeRefOrGetter } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { useConfirm } from './useConfirm';

let shouldAsk = () => true;
/**
 * Lets the app turn the prompt off, e.g. once the user has signed out (signing out already
 * warned about unsaved changes, so it must never be blocked here). Call once at startup.
 */
export function configureUnsavedChanges(options: { shouldAsk: () => boolean }) {
  shouldAsk = options.shouldAsk;
}

/** Asks before leaving a page (in-app or by closing the tab) while it has unsaved changes. */
export function useUnsavedChanges(isDirty: MaybeRefOrGetter<boolean>) {
  const confirm = useConfirm();

  onBeforeRouteLeave(() => {
    if (!toValue(isDirty) || !shouldAsk()) return true;
    return confirm({
      title: 'You have unsaved changes',
      description: 'Your changes will be lost if you leave this page.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Stay',
      tone: 'destructive',
    });
  });

  useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
    if (toValue(isDirty)) event.preventDefault();
  });
}
